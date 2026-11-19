import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { signAuthToken, requireAuth, optionalAuth } from './middleware/auth';
import { requireRole, canManageSection } from './middleware/rbac';
import {
  validateBody,
  petitionSchema,
  expandCapacitySchema,
  loginSchema,
  enrollConfirmSchema,
  rds4SyncSchema,
  createBypassRuleSchema
} from './middleware/validate';
import { createAuthRateLimiter } from './middleware/rateLimit';
import { securityHeaders, csrfOriginGuard } from './middleware/security';
import { backendStore } from './store/backendStore';
import { INITIAL_SECTIONS } from './seedData';
import { AuthUser } from './types';

const studentUser: AuthUser = {
  id: '2412159042',
  name: 'Rahim Ahmed',
  role: 'student',
  email: 'rahim.ahmed01@northsouth.edu'
};

const facultyUser: AuthUser = {
  id: 'nova.ahmed',
  name: 'Dr. Nova Ahmed',
  role: 'faculty',
  email: 'nova.ahmed@northsouth.edu',
  instructorName: 'Dr. Nova Ahmed'
};

const adminUser: AuthUser = {
  id: 'admin.itops',
  name: 'IT Operations Admin',
  role: 'admin',
  email: 'itops@northsouth.edu'
};

describe('Security, Auth, RBAC, Validation & Rate-Limit Middleware', () => {
  beforeEach(() => {
    backendStore.resetState();
    delete process.env.CSRF_ENFORCE;
  });

  it('requireAuth enforces valid HS256 JWTs, rejects expired/tampered/alg:none, and honors jti revocation', async () => {
    const app = express();
    app.use(express.json());
    app.get('/protected', requireAuth, (req, res) => {
      res.status(200).json({ ok: true, user: req.user, jti: req.authTokenJti });
    });
    app.get('/optional', optionalAuth, (req, res) => {
      res.status(200).json({ ok: true, user: req.user ?? null });
    });

    // Missing header -> 401
    expect((await request(app).get('/protected')).status).toBe(401);

    // Optional without header -> 200 null user
    const optNoAuth = await request(app).get('/optional');
    expect(optNoAuth.status).toBe(200);
    expect(optNoAuth.body.user).toBeNull();

    // Valid token -> 200
    const { token, jti, expiresAt } = signAuthToken(studentUser);
    const okRes = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(okRes.status).toBe(200);
    expect(okRes.body.user.id).toBe('2412159042');
    expect(okRes.body.jti).toBe(jti);

    // Tampered token -> 401
    const tampered = `${token.slice(0, -4)}XXXX`;
    expect(
      (await request(app).get('/protected').set('Authorization', `Bearer ${tampered}`)).status
    ).toBe(401);

    // alg: none token -> 401
    const algNoneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url'
    );
    const algNonePayload = Buffer.from(JSON.stringify({ ...studentUser, jti: 'fake' })).toString(
      'base64url'
    );
    expect(
      (
        await request(app)
          .get('/protected')
          .set('Authorization', `Bearer ${algNoneHeader}.${algNonePayload}.`)
      ).status
    ).toBe(401);

    // Expired token -> 401
    const expiredToken = jwt.sign(
      { ...studentUser, jti: 'expired-jti' },
      'smartadvisor-dev-jwt-secret-change-in-prod',
      { algorithm: 'HS256', expiresIn: -10 }
    );
    expect(
      (
        await request(app)
          .get('/protected')
          .set('Authorization', `Bearer ${expiredToken}`)
      ).status
    ).toBe(401);

    // Revoked token -> 401
    await backendStore.revokeToken(jti, studentUser.id, expiresAt);
    expect(
      (await request(app).get('/protected').set('Authorization', `Bearer ${token}`)).status
    ).toBe(401);
  });

  it('requireRole and canManageSection enforce RBAC boundaries (401/403/owner)', async () => {
    const app = express();
    app.get('/no-auth-rbac', requireRole('student'), (_req, res) => res.json({ ok: true }));
    app.get('/faculty-only', requireAuth, requireRole('faculty', 'admin'), (_req, res) =>
      res.json({ ok: true })
    );
    app.get('/admin-only', requireAuth, requireRole('admin'), (_req, res) =>
      res.json({ ok: true })
    );

    expect((await request(app).get('/no-auth-rbac')).status).toBe(401);

    const stuToken = signAuthToken(studentUser).token;
    const facToken = signAuthToken(facultyUser).token;
    const admToken = signAuthToken(adminUser).token;

    expect(
      (await request(app).get('/faculty-only').set('Authorization', `Bearer ${stuToken}`)).status
    ).toBe(403);
    expect(
      (await request(app).get('/faculty-only').set('Authorization', `Bearer ${facToken}`)).status
    ).toBe(200);
    expect(
      (await request(app).get('/admin-only').set('Authorization', `Bearer ${facToken}`)).status
    ).toBe(403);
    expect(
      (await request(app).get('/admin-only').set('Authorization', `Bearer ${admToken}`)).status
    ).toBe(200);

    const cse327 = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-01')!; // Dr. Nabeel Mohammed
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!; // Dr. Nova Ahmed
    expect(canManageSection(facultyUser, cse425)).toBe(true);
    expect(canManageSection(facultyUser, cse327)).toBe(false);
    expect(canManageSection(adminUser, cse327)).toBe(true);
    expect(canManageSection(studentUser, cse425)).toBe(false);

    // Imposter whose id !== section.instructorId must be rejected even if display name matches
    const imposterFaculty: AuthUser = {
      id: 'evil.imposter',
      name: 'Dr. Nabeel Mohammed',
      role: 'faculty',
      email: 'evil@northsouth.edu',
      instructorName: 'Dr. Nabeel Mohammed'
    };
    expect(canManageSection(imposterFaculty, cse327)).toBe(false);
  });

  it('validateBody enforces Zod schemas and rejects SQLi and XSS payloads with 400 while allowing complex passwords', async () => {
    const app = express();
    app.use(express.json());
    app.post('/petition', validateBody(petitionSchema), (req, res) =>
      res.status(201).json({ ok: true, body: req.body })
    );
    app.post('/expand', validateBody(expandCapacitySchema), (req, res) =>
      res.status(200).json({ ok: true, body: req.body })
    );
    app.post('/login', validateBody(loginSchema), (req, res) =>
      res.status(200).json({ ok: true, body: req.body })
    );

    // Valid petition
    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: 'Need course for graduating capstone track.'
        })
      ).status
    ).toBe(201);

    // Negative delta rejected by Zod
    expect(
      (await request(app).post('/expand').send({ sectionId: 'CSE327-01', delta: -5 })).status
    ).toBe(400);

    // SQLi rejected with 400
    const sqliRes = await request(app).post('/petition').send({
      courseCode: 'CSE 425',
      ruleCode: 'RULE-4.2',
      reason: "test'; DROP TABLE users; --"
    });
    expect(sqliRes.status).toBe(400);
    expect(sqliRes.body.code).toBe('SECURITY_INPUT_REJECTED');

    // UNION SELECT SQLi rejected
    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: "' OR '1'='1 UNION SELECT password_hash FROM users"
        })
      ).status
    ).toBe(400);

    // XSS rejected
    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: '<script>alert(1)</script> urgent'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: '<img src=x onerror=alert(1)>'
        })
      ).status
    ).toBe(400);

    // Complex password containing '--', quotes, or '<...>' should NOT false-positive SQLi/XSS
    expect(
      (
        await request(app)
          .post('/login')
          .send({ id: '2412159042', password: "Smart--Advisor'2025!" })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/login')
          .send({ id: '2412159042', password: "P@ss<w0rd>'--!" })
      ).status
    ).toBe(200);

    // Petition prose with '--' should be allowed, while SQLi payloads must still fail with 400
    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: 'Need CSE 425 -- graduating Fall 2025'
        })
      ).status
    ).toBe(201);

    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: "' OR ''='"
        })
      ).status
    ).toBe(400);

    expect(
      (
        await request(app).post('/petition').send({
          courseCode: 'CSE 425',
          ruleCode: 'RULE-4.2',
          reason: '; DROP TABLE users;--'
        })
      ).status
    ).toBe(400);
  });

  it('validateBody accepts bodyless POST for optional().default({}) schemas and defaults bypass rule category', async () => {
    const app = express();
    app.use(express.json());
    app.post('/enroll/confirm', validateBody(enrollConfirmSchema), (req, res) =>
      res.status(200).json({ ok: true, body: req.body })
    );
    app.post('/rds4/sync', validateBody(rds4SyncSchema), (req, res) =>
      res.status(200).json({ ok: true, body: req.body })
    );
    app.post('/rules', validateBody(createBypassRuleSchema), (req, res) =>
      res.status(201).json({ ok: true, body: req.body })
    );

    const confirmRes = await request(app).post('/enroll/confirm');
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.body).toEqual({});

    const syncRes = await request(app).post('/rds4/sync');
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.body).toEqual({});

    const ruleRes = await request(app).post('/rules').send({
      code: 'RULE-9.1',
      title: 'Graduating Senior Override',
      description: 'Allow final semester overload with chair approval.',
      enabled: true
    });
    expect(ruleRes.status).toBe(201);
    expect(ruleRes.body.body.category).toBe('Standing');
  });

  it('securityHeaders, csrfOriginGuard, and authRateLimiter return expected headers, 403, and 429', async () => {
    process.env.CSRF_ENFORCE = 'true';
    const app = express();
    app.use(securityHeaders);
    app.use(csrfOriginGuard(['http://localhost:3000']));
    app.post('/auth/login', createAuthRateLimiter({ max: 2, windowMs: 60_000 }), (_req, res) =>
      res.status(200).json({ ok: true })
    );

    const r1 = await request(app)
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('x-enable-rate-limit', 'true');
    expect(r1.status).toBe(200);
    expect(r1.headers['x-content-type-options']).toBe('nosniff');
    expect(r1.headers['x-frame-options']).toBe('DENY');

    const r2 = await request(app)
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('x-enable-rate-limit', 'true');
    expect(r2.status).toBe(200);

    const r3 = await request(app)
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('x-enable-rate-limit', 'true');
    expect(r3.status).toBe(429);

    const csrfBlocked = await request(app)
      .post('/auth/login')
      .set('Origin', 'https://evil.example.com');
    expect(csrfBlocked.status).toBe(403);
  });
});
