import http from 'http';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { app } from './app';
import { redisBus } from './events/redisBus';
import { evaluateSlaBreach, resetSlaMonitor } from './events/slaMonitor';
import { closeAllSseClients } from './events/sseHub';
import { attachWebSocketServer, closeWebSocketServer } from './events/wsHub';
import { DEMO_DEFAULT_PASSWORD, INITIAL_SECTIONS, INITIAL_STUDENT } from './seedData';
import { checkCreditFloor, detectScheduleClashes } from './services/ruleValidator';
import { backendStore } from './store/backendStore';
import { BypassRule, CourseSection, EscalationItem, ExceptionCase } from './types';

async function loginAs(id: string, password = DEMO_DEFAULT_PASSWORD, role?: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send(role ? { id, password, role } : { id, password });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(typeof res.body.token).toBe('string');
  return res.body.token as string;
}

describe('SmartAdvisor API Health Check, Root & Bootstrap', () => {
  beforeEach(async () => {
    await backendStore.resetStateAsync();
    resetSlaMonitor();
  });

  it('GET /health returns 200 with dual-mode HealthCheckResult checks', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'smartadvisor-api',
      mode: 'memory',
      checks: {
        api: { status: 'up' },
        postgres: { status: 'memory' },
        redis: { status: 'memory' }
      }
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('GET /health returns 503 degraded when a configured dependency probe is down', async () => {
    const spy = vi.spyOn(redisBus, 'probeRedisHealth').mockResolvedValueOnce({
      status: 'down',
      latencyMs: 5,
      details: 'Simulated Redis outage'
    });

    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.redis.status).toBe('down');
    } finally {
      spy.mockRestore();
    }
  });

  it('GET / returns welcome message with course information', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.course).toBe('CSE 327 Sec 04');
    expect(res.body.supervisor).toBe('Intisar Tahmeed (ITN)');
  });

  it('GET /api/v1/bootstrap returns 200 with complete initial state and derived values', async () => {
    const res = await request(app).get('/api/v1/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.student.id).toBe('2412159042');
    expect(res.body.sections).toHaveLength(9);
    expect(res.body.stagedSectionIds).toHaveLength(4);
    expect(res.body.stagedSections).toHaveLength(4);
    expect(res.body.totalCredits).toBe(10);
    expect(res.body.exceptions).toHaveLength(3);
    expect(res.body.bypassRules).toHaveLength(4);
    expect(res.body.dagSummary).toBeDefined();
    expect(res.body.notifications).toBeDefined();
    expect(res.body.waitlistEntries).toBeDefined();
    expect(res.body.rdsFallbackPrompt).toBeNull();
  });

  it('GET /api/v1/bootstrap rejects malformed Authorization header with 401', async () => {
    const res = await request(app)
      .get('/api/v1/bootstrap')
      .set('Authorization', 'Bearer not-a-valid-jwt');
    expect(res.status).toBe(401);
  });

  it('checkCreditFloor blocks CSE425-01 under Rule 4.2 and passes CSE327-01', () => {
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!;
    const cse327 = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-01')!;

    const result425 = checkCreditFloor(cse425, INITIAL_STUDENT);
    expect(result425.passed).toBe(false);
    expect(result425.ruleCode).toBe('RULE-4.2');
    expect(result425.studentCredits).toBe(96);
    expect(result425.requiredCredits).toBe(100);

    const result327 = checkCreditFloor(cse327, INITIAL_STUDENT);
    expect(result327.passed).toBe(true);
    expect(result327.ruleCode).toBe('RULE-4.2');
  });

  it('detectScheduleClashes detects overlapping days and timeSlot', () => {
    const sectionA: CourseSection = {
      ...INITIAL_SECTIONS[0],
      days: 'ST',
      timeSlot: '11:20 AM - 12:50 PM'
    };
    const sectionB: CourseSection = {
      ...INITIAL_SECTIONS[1],
      days: 'Sun',
      timeSlot: '11:20 AM - 12:50 PM'
    };

    const clashes = detectScheduleClashes([sectionA, sectionB]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].sectionA.id).toBe(sectionA.id);
    expect(clashes[0].sectionB.id).toBe(sectionB.id);
    expect(clashes[0].day).toBe('ST');
    expect(clashes[0].time).toBe('11:20 AM - 12:50 PM');
  });
});

describe('Auth, Token Revocation, RBAC & Security Middleware', () => {
  beforeEach(async () => {
    await backendStore.resetStateAsync();
    resetSlaMonitor();
  });

  it('enforces 401 on unauthenticated protected routes', async () => {
    const sRes = await request(app)
      .post('/api/v1/student/cart/stage')
      .send({ sectionId: 'CSE331-01' });
    const fRes = await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .send({ ruleId: 'rule-6-3' });
    const aRes = await request(app).post('/api/v1/admin/scale');

    expect(sRes.status).toBe(401);
    expect(fRes.status).toBe(401);
    expect(aRes.status).toBe(401);
  });

  it('rejects bad password or role mismatch on login with 401 and SQLi with 400', async () => {
    const badPass = await request(app)
      .post('/api/v1/auth/login')
      .send({ id: '2412159042', password: 'wrong-password' });
    expect(badPass.status).toBe(401);

    const roleMismatch = await request(app)
      .post('/api/v1/auth/login')
      .send({ id: '2412159042', password: DEMO_DEFAULT_PASSWORD, role: 'admin' });
    expect(roleMismatch.status).toBe(401);

    const sqli = await request(app)
      .post('/api/v1/auth/login')
      .send({ id: "' OR '1'='1", password: DEMO_DEFAULT_PASSWORD });
    expect(sqli.status).toBe(400);
    expect(sqli.body.code).toBe('SECURITY_INPUT_REJECTED');
  });

  it('GET /api/v1/auth/me returns user and POST /api/v1/auth/logout revokes JWT', async () => {
    const token = await loginAs('2412159042');

    const meBefore = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meBefore.status).toBe(200);
    expect(meBefore.body.user.id).toBe('2412159042');
    expect(meBefore.body.user.role).toBe('student');

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    const meAfter = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meAfter.status).toBe(401);

    const protectedAfter = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE331-01' });
    expect(protectedAfter.status).toBe(401);
  });

  it('enforces cross-role RBAC 403 across student, faculty, and admin endpoints', async () => {
    const studentToken = await loginAs('2412159042');
    const facultyToken = await loginAs('nova.ahmed');
    const adminToken = await loginAs('admin.itops');

    expect(
      (
        await request(app)
          .post('/api/v1/faculty/rules/toggle')
          .set('Authorization', `Bearer ${studentToken}`)
          .send({ ruleId: 'rule-6-3' })
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/admin/scale')
          .set('Authorization', `Bearer ${studentToken}`)
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/student/cart/stage')
          .set('Authorization', `Bearer ${facultyToken}`)
          .send({ sectionId: 'CSE331-01' })
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/admin/scale')
          .set('Authorization', `Bearer ${facultyToken}`)
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/student/cart/stage')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ sectionId: 'CSE331-01' })
      ).status
    ).toBe(403);
  });

  it('enforces CSRF origin guard (403) when CSRF_ENFORCE=true and rejects invalid JSON (400)', async () => {
    const prevCsrf = process.env.CSRF_ENFORCE;
    process.env.CSRF_ENFORCE = 'true';
    try {
      const csrfRes = await request(app)
        .post('/api/v1/demo/surge')
        .set('Origin', 'https://evil.example.com');
      expect(csrfRes.status).toBe(403);
      expect(csrfRes.body.code).toBe('CSRF_ORIGIN_REJECTED');
    } finally {
      if (prevCsrf === undefined) delete process.env.CSRF_ENFORCE;
      else process.env.CSRF_ENFORCE = prevCsrf;
    }

    const malformedRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"id": "broken"');
    expect(malformedRes.status).toBe(400);
  });

  it('enforces auth rate limiting (429) when x-enable-rate-limit: true is set', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('x-enable-rate-limit', 'true')
        .set('X-Forwarded-For', '203.0.113.77')
        .send({ id: '2412159042', password: 'wrong' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(statuses[11]).toBe(429);
  });
});

describe('Student Portal Advising, Solver, DAG, Concurrency Race & RDS Fallback Routes', () => {
  beforeEach(async () => {
    await backendStore.resetStateAsync();
    resetSlaMonitor();
  });

  it('stages valid section (200), blocks RULE-4.2 (422), blocks full section (409), rejects unknown (404) & XSS (400)', async () => {
    const token = await loginAs('2412159042');

    const okRes = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE331-01' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.state.stagedSectionIds).toContain('CSE331-01');

    const ruleRes = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE425-01' });
    expect(ruleRes.status).toBe(422);
    expect(ruleRes.body.modal).toBe('rule_alert');
    expect(ruleRes.body.payload.ruleCode).toBe('RULE-4.2');

    const fullRes = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE327-03' });
    expect(fullRes.status).toBe(409);
    expect(fullRes.body.modal).toBe('section_full');
    expect(fullRes.body.payload.alternatives.length).toBeGreaterThan(0);

    const notFoundRes = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE999-99' });
    expect(notFoundRes.status).toBe(404);

    const xssRes = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: '<script>alert(1)</script>' });
    expect(xssRes.status).toBe(400);
    expect(xssRes.body.code).toBe('SECURITY_INPUT_REJECTED');
  });

  it('DELETE /api/v1/student/cart/:sectionId removes staged section (200) and returns 404 for unstaged or unknown without polluting auditLog', async () => {
    const token = await loginAs('2412159042');
    const delRes = await request(app)
      .delete('/api/v1/student/cart/MAT361-04')
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.state.stagedSectionIds).not.toContain('MAT361-04');

    const auditLenBefore = backendStore.getState().auditLog.length;
    const notInCartRes = await request(app)
      .delete('/api/v1/student/cart/CSE327-02')
      .set('Authorization', `Bearer ${token}`);
    expect(notInCartRes.status).toBe(404);
    expect(notInCartRes.body.message).toBe('Section is not in cart');
    expect(backendStore.getState().auditLog).toHaveLength(auditLenBefore);

    const missingRes = await request(app)
      .delete('/api/v1/student/cart/UNKNOWN-99')
      .set('Authorization', `Bearer ${token}`);
    expect(missingRes.status).toBe(404);
    expect(backendStore.getState().auditLog).toHaveLength(auditLenBefore);
  });

  it('POST /petitions (201), POST /waitlist (200), POST /schedule/solve (200), GET /dag/eligible (200)', async () => {
    const token = await loginAs('2412159042');

    const petRes = await request(app)
      .post('/api/v1/student/petitions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: 'CSE425-01',
        courseCode: 'CSE 425',
        ruleCode: 'RULE-4.2',
        reason: 'Final semester graduation requirement with 96 credits.'
      });
    expect(petRes.status).toBe(201);
    expect(petRes.body.exceptionCase.status).toBe('pending');
    expect(petRes.body.state.exceptions.length).toBe(4);

    const wlRes = await request(app)
      .post('/api/v1/student/waitlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE327-03' });
    expect(wlRes.status).toBe(200);
    expect(wlRes.body.position).toBe(15);
    expect(wlRes.body.state.waitlistSectionIds).toContain('CSE327-03');

    const wlMissing = await request(app)
      .post('/api/v1/student/waitlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'NOPE-01' });
    expect(wlMissing.status).toBe(404);

    const solveMilestone = await request(app)
      .post('/api/v1/student/schedule/solve')
      .set('Authorization', `Bearer ${token}`)
      .send({ strategy: 'MilestoneFirst', maxCredits: 15 });
    expect(solveMilestone.status).toBe(200);
    expect(solveMilestone.body.ok).toBe(true);
    expect(solveMilestone.body.clashes).toEqual([]);
    expect(solveMilestone.body.totalCredits).toBeLessThanOrEqual(15);
    expect(solveMilestone.body.recommendedSectionIds.length).toBeGreaterThan(0);

    const solveMinGaps = await request(app)
      .post('/api/v1/student/schedule/solve')
      .set('Authorization', `Bearer ${token}`)
      .send({ strategy: 'MinimizeGaps', maxCredits: 15 });
    expect(solveMinGaps.status).toBe(200);
    expect(solveMinGaps.body.strategy).toBe('MinimizeGaps');
    expect(solveMinGaps.body.clashes).toEqual([]);

    const dagRes = await request(app)
      .get('/api/v1/student/dag/eligible')
      .set('Authorization', `Bearer ${token}`);
    expect(dagRes.status).toBe(200);
    expect(dagRes.body.hasCycle).toBe(false);
    expect(dagRes.body.eligibleCourses).toContain('CSE 327');
    expect(dagRes.body.eligibleCourses).toContain('CSE 331');
    expect(dagRes.body.blockedCourses['MAT 361']).toContain('MAT 120');
  });

  it('POST /api/v1/student/enroll/confirm returns unified #RDS-TXN-<8HEX> & SHA256 receipt', async () => {
    const token = await loginAs('2412159042');
    const preState = backendStore.getState();
    const cse327Before = preState.sections.find((s) => s.id === 'CSE327-01')!;

    const res = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.receipt.transactionId).toMatch(/^#RDS-TXN-[0-9A-F]{8}$/);
    expect(res.body.receipt.digitalSignature).toMatch(/^SHA256:[0-9a-f]{64}$/);
    expect(res.body.receipt.totalCredits).toBe(10);

    const cse327After = res.body.state.sections.find((s: CourseSection) => s.id === 'CSE327-01')!;
    expect(cse327After.enrolled).toBe(cse327Before.enrolled + 1);
  });

  it('handles concurrent last-seat HTTP enrollment race with zero overbooking (exactly 1 winner)', async () => {
    const tokenStudent1 = await loginAs('2412159042');
    const tokenStudent2 = await loginAs('2321450042');

    // Stage CSE331-01 (currently 31/40) and set it to 39/40 (1 seat left)
    await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${tokenStudent1}`)
      .send({ sectionId: 'CSE331-01' });

    backendStore.updateState((s) => {
      s.sections = s.sections.map((sec) =>
        sec.id === 'CSE331-01' ? { ...sec, enrolled: 39 } : sec
      );
    });

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/student/enroll/confirm')
        .set('Authorization', `Bearer ${tokenStudent1}`),
      request(app)
        .post('/api/v1/student/enroll/confirm')
        .set('Authorization', `Bearer ${tokenStudent2}`)
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const finalSec = backendStore.getState().sections.find((s) => s.id === 'CSE331-01')!;
    expect(finalSec.enrolled).toBe(40);
    expect(finalSec.enrolled).toBeLessThanOrEqual(finalSec.capacity);
  });

  it('POST /enroll/confirm with simulateRdsFailure triggers fallbackPrompt and POST /rds/fallback resolves atomically', async () => {
    const token = await loginAs('2412159042');

    const failRes = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ simulateRdsFailure: true });

    expect(failRes.status).toBe(200);
    expect(failRes.body.receipt.status).toBe('fallback_required');
    expect(failRes.body.fallbackPrompt.failedSectionId).toBe('CSE327-01');
    expect(failRes.body.fallbackPrompt.alternatives.length).toBeGreaterThan(0);

    // Rule-violating fallback CSE425-01 must fail 422 RULE-4.2 without enrolling
    const ruleFallbackRes = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${token}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE425-01' });
    expect(ruleFallbackRes.status).toBe(422);
    expect(ruleFallbackRes.body.modal).toBe('rule_alert');
    expect(ruleFallbackRes.body.payload.ruleCode).toBe('RULE-4.2');
    expect(backendStore.getState().stagedSectionIds).not.toContain('CSE425-01');

    // Non-staged failedSectionId (CSE331-01) must fail 409 without double-enrolling two CSE 327 sections
    const nonStagedFallbackRes = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${token}`)
      .send({ failedSectionId: 'CSE331-01', fallbackSectionId: 'CSE327-04' });
    expect(nonStagedFallbackRes.status).toBe(409);
    expect(backendStore.getState().stagedSectionIds).toContain('CSE327-01');
    expect(backendStore.getState().stagedSectionIds).not.toContain('CSE327-04');

    // Full fallback section CSE327-03 must fail 409 without corrupting staged cart
    const fullFallbackRes = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${token}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE327-03' });
    expect(fullFallbackRes.status).toBe(409);
    expect(backendStore.getState().stagedSectionIds).toContain('CSE327-01');

    // Valid open fallback CSE327-04 succeeds
    const switchRes = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${token}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE327-04' });

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.receipt.status).toBe('confirmed');
    expect(switchRes.body.state.stagedSectionIds).toContain('CSE327-04');
    expect(switchRes.body.state.stagedSectionIds).not.toContain('CSE327-01');
    expect(switchRes.body.state.rdsFallbackPrompt).toBeNull();
  });

  it('POST /student/cart/stage rejects RULE-6.3 (422 with conflictingSections) and RULE-2.1 (422)', async () => {
    const studentToken = await loginAs('2412159042');
    const facultyToken = await loginAs('nova.ahmed');

    // Enable RULE-6.3 and add a 3rd open May 10 exam section so 3 courses fall within 24h
    await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ ruleId: 'rule-6-3' });

    await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sectionId: 'CSE331-01' }); // 2025-05-10T14:00:00Z (with CSE327-01 09:00Z)

    backendStore.updateState((s) => {
      s.sections.push({
        ...INITIAL_SECTIONS[0],
        id: 'CSE490-01',
        courseCode: 'CSE 490',
        courseTitle: 'Special Topics in Systems',
        sectionNumber: '01',
        days: 'RA',
        timeSlot: '08:00 AM - 09:30 AM',
        enrolled: 5,
        capacity: 40,
        minCreditsRequired: undefined,
        prerequisites: [],
        examSlot: '2025-05-10T19:00:00Z'
      });
    });

    const rule63Res = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sectionId: 'CSE490-01' });
    expect(rule63Res.status).toBe(422);
    expect(rule63Res.body.modal).toBe('rule_alert');
    expect(rule63Res.body.payload.ruleCode).toBe('RULE-6.3');
    expect(rule63Res.body.payload.conflictingSections).toHaveLength(3);

    // Disable RULE-2.1, unstage MAT361-04, and re-stage MAT361-04 -> 422 RULE-2.1
    await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ ruleId: 'rule-2-1' });
    await request(app)
      .delete('/api/v1/student/cart/MAT361-04')
      .set('Authorization', `Bearer ${studentToken}`);

    const rule21Res = await request(app)
      .post('/api/v1/student/cart/stage')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sectionId: 'MAT361-04' });
    expect(rule21Res.status).toBe(422);
    expect(rule21Res.body.modal).toBe('rule_alert');
    expect(rule21Res.body.payload.ruleCode).toBe('RULE-2.1');
    expect(rule21Res.body.payload.missingPrerequisites).toEqual(['MAT 120']);
  });

  it('POST /student/enroll/confirm handles empty cart (400), clash (409), over-credit (409), and double-confirm idempotency', async () => {
    const studentToken = await loginAs('2412159042');

    // Same-student double-confirm idempotency increments enrolled by strictly +1
    const cse327Before = backendStore.getState().sections.find((s) => s.id === 'CSE327-01')!.enrolled;
    const confirm1 = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`);
    const confirm2 = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(confirm1.status).toBe(200);
    expect(confirm2.status).toBe(200);
    expect(
      confirm2.body.state.sections.find((s: CourseSection) => s.id === 'CSE327-01')!.enrolled
    ).toBe(cse327Before + 1);

    // Over-credit 409 (10 credits staged vs maxCredits 6)
    await backendStore.resetStateAsync();
    backendStore.updateState((s) => {
      s.student.maxCredits = 6;
    });
    const overCreditRes = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(overCreditRes.status).toBe(409);
    expect(overCreditRes.body.message).toContain('exceeds allowed maximum');

    // Schedule clash 409 (CSE311-03 MW 09:40 AM + CSE327-02 MW 09:40 AM)
    await backendStore.resetStateAsync();
    backendStore.updateState((s) => {
      s.stagedSectionIds = ['CSE311-03', 'CSE327-02'];
    });
    const clashRes = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(clashRes.status).toBe(409);
    expect(clashRes.body.message).toContain('Schedule clash detected');

    // Empty cart 400
    await backendStore.resetStateAsync();
    for (const id of ['CSE327-01', 'CSE311-03', 'CSE311L-02', 'MAT361-04']) {
      await request(app)
        .delete(`/api/v1/student/cart/${id}`)
        .set('Authorization', `Bearer ${studentToken}`);
    }
    const emptyRes = await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(emptyRes.status).toBe(400);
  });

  it('POST /student/rds/fallback rejects 404 unknown, 409 duplicate course, 409 clash, 422 RULE-2.1, and 422 RULE-6.3', async () => {
    const studentToken = await loginAs('2412159042');
    const facultyToken = await loginAs('nova.ahmed');

    await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ simulateRdsFailure: true });

    // 404 unknown fallbackSectionId
    const unknownFb = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE999-01' });
    expect(unknownFb.status).toBe(404);

    // 409 duplicate course already in remainingStaged (CSE311-03)
    const dupCourseFb = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE311-03' });
    expect(dupCourseFb.status).toBe(409);
    expect(dupCourseFb.body.message).toContain('already staged');

    // 409 clashing fallback (CSE327-02 MW 09:40 AM clashes with CSE311-03 MW 09:40 AM)
    const clashFb = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE327-02' });
    expect(clashFb.status).toBe(409);

    // 422 RULE-2.1
    await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ ruleId: 'rule-2-1' });
    await request(app)
      .delete('/api/v1/student/cart/MAT361-04')
      .set('Authorization', `Bearer ${studentToken}`);

    const rule21Fb = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'MAT361-04' });
    expect(rule21Fb.status).toBe(422);
    expect(rule21Fb.body.payload.ruleCode).toBe('RULE-2.1');

    // 422 RULE-6.3 (2 remainingStaged on May 10 + fallback on May 10)
    await backendStore.resetStateAsync();
    await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ ruleId: 'rule-6-3' });
    backendStore.updateState((s) => {
      s.sections.push(
        {
          ...INITIAL_SECTIONS[0],
          id: 'CSE480-01',
          courseCode: 'CSE 480',
          courseTitle: 'Distributed Systems',
          sectionNumber: '01',
          days: 'Sun',
          timeSlot: '08:00 AM - 09:30 AM',
          enrolled: 5,
          capacity: 40,
          minCreditsRequired: undefined,
          prerequisites: [],
          examSlot: '2025-05-10T16:00:00Z'
        },
        {
          ...INITIAL_SECTIONS[0],
          id: 'CSE490-01',
          courseCode: 'CSE 490',
          courseTitle: 'Cloud Engineering',
          sectionNumber: '01',
          days: 'Tue',
          timeSlot: '08:00 AM - 09:30 AM',
          enrolled: 5,
          capacity: 40,
          minCreditsRequired: undefined,
          prerequisites: [],
          examSlot: '2025-05-10T19:00:00Z'
        }
      );
      s.stagedSectionIds = ['CSE327-01', 'CSE331-01', 'CSE480-01'];
    });
    await request(app)
      .post('/api/v1/student/enroll/confirm')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ simulateRdsFailure: true });

    const rule63Fb = await request(app)
      .post('/api/v1/student/rds/fallback')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ failedSectionId: 'CSE327-01', fallbackSectionId: 'CSE490-01' });
    expect(rule63Fb.status).toBe(422);
    expect(rule63Fb.body.modal).toBe('rule_alert');
    expect(rule63Fb.body.payload.ruleCode).toBe('RULE-6.3');
    expect(rule63Fb.body.payload.conflictingSections).toHaveLength(3);
  });

  it('POST /student/waitlist duplicate join is idempotent without incrementing waitlisted twice', async () => {
    const token = await loginAs('2412159042');

    const first = await request(app)
      .post('/api/v1/student/waitlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE327-03' });
    expect(first.status).toBe(200);
    expect(first.body.position).toBe(15);

    const second = await request(app)
      .post('/api/v1/student/waitlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ sectionId: 'CSE327-03' });
    expect(second.status).toBe(200);
    expect(second.body.position).toBe(15);
    expect(
      second.body.state.sections.find((s: CourseSection) => s.id === 'CSE327-03')!.waitlisted
    ).toBe(15);
    expect(
      second.body.state.waitlistEntries.filter(
        (w: { studentId: string; sectionId: string }) =>
          w.studentId === '2412159042' && w.sectionId === 'CSE327-03'
      )
    ).toHaveLength(1);
  });
});

describe('Faculty Portal Exception, Owner RBAC, Fire-Code Cap & Bypass Rule Routes', () => {
  beforeEach(async () => {
    await backendStore.resetStateAsync();
    resetSlaMonitor();
  });

  it('approves CASE #EX-2025-0841, rejects re-deciding finalized case (409), and rejects CASE #EX-2025-0839', async () => {
    const facultyToken = await loginAs('nova.ahmed');
    const preState = backendStore.getState();
    const cse425Before = preState.sections.find((s) => s.id === 'CSE425-01')!;

    const approveRes = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ caseId: 'CASE #EX-2025-0841', action: 'approve' });

    expect(approveRes.status).toBe(200);
    const updatedCase = approveRes.body.state.exceptions.find(
      (e: ExceptionCase) => e.id === 'CASE #EX-2025-0841'
    );
    expect(updatedCase?.status).toBe('approved');
    expect(updatedCase?.facultyDecisionBy).toBe('Dr. Nova Ahmed');

    const cse425After = approveRes.body.state.sections.find(
      (s: CourseSection) => s.id === 'CSE425-01'
    )!;
    expect(cse425After.capacity).toBe(cse425Before.capacity + 1);
    expect(cse425After.enrolled).toBe(cse425Before.enrolled + 1);

    // Re-deciding finalized case returns 409
    const reDecideRes = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ caseId: 'CASE #EX-2025-0841', action: 'reject' });
    expect(reDecideRes.status).toBe(409);

    const rejectRes = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ caseId: 'CASE #EX-2025-0839', action: 'reject' });
    expect(rejectRes.status).toBe(200);
    expect(
      rejectRes.body.state.exceptions.find((e: ExceptionCase) => e.id === 'CASE #EX-2025-0839')
        ?.status
    ).toBe('rejected');
  });

  it('enforces section owner RBAC (403), integer delta > 0 (400), room fire-code cap (422), and SEAT_OPEN on expand', async () => {
    const novaToken = await loginAs('nova.ahmed');
    const nabeelToken = await loginAs('nabeel.mohammed');
    const rajeshToken = await loginAs('rajesh.palit');

    // Non-owner faculty rejected with 403
    const forbidden = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ sectionId: 'CSE327-01', delta: 5 });
    expect(forbidden.status).toBe(403);

    // Invalid delta rejected with 400
    const negRes = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${nabeelToken}`)
      .send({ sectionId: 'CSE327-01', delta: -5 });
    expect(negRes.status).toBe(400);

    // Exceeding SAC 502 fire-code cap (55) rejected with 422
    const overCapRes = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${nabeelToken}`)
      .send({ sectionId: 'CSE327-01', delta: 20 });
    expect(overCapRes.status).toBe(422);

    // Owner valid expand 40 -> 50
    const okRes = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${nabeelToken}`)
      .send({ sectionId: 'CSE327-01', delta: 10 });
    expect(okRes.status).toBe(200);
    expect(
      okRes.body.state.sections.find((s: CourseSection) => s.id === 'CSE327-01')?.capacity
    ).toBe(50);

    // Expanding full waitlisted CSE327-03 emits SEAT_OPEN notification for waitlisted student 2321450042
    const reopenRes = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${rajeshToken}`)
      .send({ sectionId: 'CSE327-03', delta: 2 });
    expect(reopenRes.status).toBe(200);
    const seatOpenNotifs = (reopenRes.body.state.notifications || []).filter(
      (n: { eventType: string; studentId: string; sectionId?: string }) =>
        n.eventType === 'SEAT_OPEN' && n.studentId === '2321450042' && n.sectionId === 'CSE327-03'
    );
    expect(seatOpenNotifs.length).toBeGreaterThan(0);
  });

  it('POST /faculty/rules creates rule & auto-approves matching petition, and POST /rules/toggle toggles rule-6-3', async () => {
    const facultyToken = await loginAs('nova.ahmed');

    const createRes = await request(app)
      .post('/api/v1/faculty/rules')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        code: 'RULE-9.1',
        title: 'Senior Credit Standing Fast-Track',
        description: 'Auto-approves pending credit standing petitions for graduating seniors.',
        category: 'Standing',
        enabled: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.rule.code).toBe('RULE-9.1');
    expect(createRes.body.autoApprovedCount).toBeGreaterThanOrEqual(1);

    const toggleRes = await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ ruleId: 'rule-6-3' });

    expect(toggleRes.status).toBe(200);
    const ruleAfter = toggleRes.body.state.bypassRules.find(
      (r: BypassRule) => r.id === 'rule-6-3'
    )!;
    expect(ruleAfter.enabled).toBe(true);

    // Upsert parity: posting RULE-9.1 a second time updates in place without duplicate id
    const upsertRes = await request(app)
      .post('/api/v1/faculty/rules')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        code: 'RULE-9.1',
        title: 'Senior Credit Standing Fast-Track v2',
        description: 'Updated description for senior credit fast-track.',
        category: 'Standing',
        enabled: false
      });
    expect(upsertRes.status).toBe(201);
    const matchingRules = upsertRes.body.state.bypassRules.filter(
      (r: BypassRule) => r.id === 'rule-9-1'
    );
    expect(matchingRules).toHaveLength(1);
    expect(matchingRules[0].title).toBe('Senior Credit Standing Fast-Track v2');
    expect(matchingRules[0].enabled).toBe(false);
  });

  it('handles faculty exception 404, 422 fire-code cap, flag -> approve transition, and 404/422 on expand & toggle', async () => {
    const novaToken = await loginAs('nova.ahmed');

    // Unknown caseId -> 404
    const missingCase = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ caseId: 'CASE #EX-9999-9999', action: 'approve' });
    expect(missingCase.status).toBe(404);

    // Flag then approve transition
    const flagRes = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ caseId: 'CASE #EX-2025-0841', action: 'flag' });
    expect(flagRes.status).toBe(200);
    expect(
      flagRes.body.state.exceptions.find((e: ExceptionCase) => e.id === 'CASE #EX-2025-0841')?.status
    ).toBe('flagged');

    // At LIB 602 room fire-code cap (55), approve must return 422
    backendStore.updateState((s) => {
      s.sections = s.sections.map((sec) =>
        sec.id === 'CSE425-01' ? { ...sec, capacity: 55 } : sec
      );
    });
    const capBlocked = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ caseId: 'CASE #EX-2025-0841', action: 'approve' });
    expect(capBlocked.status).toBe(422);

    // Lower capacity back below cap -> flagged -> approved succeeds
    backendStore.updateState((s) => {
      s.sections = s.sections.map((sec) =>
        sec.id === 'CSE425-01' ? { ...sec, capacity: 40 } : sec
      );
    });
    const flaggedToApproved = await request(app)
      .post('/api/v1/faculty/exceptions/decision')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ caseId: 'CASE #EX-2025-0841', action: 'approve' });
    expect(flaggedToApproved.status).toBe(200);
    expect(
      flaggedToApproved.body.state.exceptions.find(
        (e: ExceptionCase) => e.id === 'CASE #EX-2025-0841'
      )?.status
    ).toBe('approved');

    // Unknown sectionId on expand-capacity -> 404
    const missingSection = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ sectionId: 'NOPE-01', delta: 5 });
    expect(missingSection.status).toBe(404);

    // Unknown ruleId on toggle -> 404
    const missingRule = await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ ruleId: 'rule-does-not-exist' });
    expect(missingRule.status).toBe(404);

    // Disabling RULE-8.4 blocks expand-capacity with 422
    await request(app)
      .post('/api/v1/faculty/rules/toggle')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ ruleId: 'rule-8-4' });
    const disabled84Res = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${novaToken}`)
      .send({ sectionId: 'CSE425-01', delta: 5 });
    expect(disabled84Res.status).toBe(422);
  });
});

describe('Admin Operations, Demo Controls, SLA Breach & Real-Time SSE/WS Sync', () => {
  beforeEach(async () => {
    await backendStore.resetStateAsync();
    resetSlaMonitor();
  });

  afterAll(async () => {
    closeAllSseClients();
    await closeWebSocketServer();
  });

  it('handles surge -> scale -> acknowledge lifecycle and 1m SLA breach alert', async () => {
    const adminToken = await loginAs('admin.itops');

    const surgeRes = await request(app).post('/api/v1/demo/surge');
    expect(surgeRes.status).toBe(200);
    expect(surgeRes.body.state.metrics.surgeSpikeActive).toBe(true);
    expect(surgeRes.body.state.metrics.p95LatencyMs).toBe(275);

    // 1-minute SLA breach evaluation: start at t=0, sustain for >= 60s
    resetSlaMonitor();
    const t0 = 1_700_000_000_000;
    const eval1 = await evaluateSlaBreach(t0);
    expect(eval1.breached).toBe(true);
    expect(eval1.alertEmitted).toBe(false);

    const eval2 = await evaluateSlaBreach(t0 + 61_000);
    expect(eval2.breached).toBe(true);
    expect(eval2.alertEmitted).toBe(true);
    expect(
      backendStore.getState().auditLog.some((l) => l.action === 'SLA Breach Alert (1m)')
    ).toBe(true);

    const scaleRes = await request(app)
      .post('/api/v1/admin/scale')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(scaleRes.status).toBe(200);
    expect(scaleRes.body.state.metrics.apiNodes).toBe(8);
    expect(scaleRes.body.state.metrics.p95LatencyMs).toBe(138);

    const ackRes = await request(app)
      .post('/api/v1/admin/acknowledge')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.state.metrics.surgeSpikeActive).toBe(false);
  });

  it('prevents duplicate emergency -05 sections (409) and computes exact add-seats escalation math', async () => {
    const adminToken = await loginAs('admin.itops');

    const firstEm = await request(app)
      .post('/api/v1/admin/sections/emergency')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCode: 'CSE 327' });
    expect(firstEm.status).toBe(200);
    expect(
      firstEm.body.state.sections.find((s: CourseSection) => s.id === 'CSE327-05')
    ).toBeDefined();
    expect(
      firstEm.body.state.escalations.find((e: EscalationItem) => e.courseCode === 'CSE 327')?.status
    ).toBe('Mitigated');

    const dupEm = await request(app)
      .post('/api/v1/admin/sections/emergency')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCode: 'CSE 327' });
    expect(dupEm.status).toBe(409);

    const dupCaseEm = await request(app)
      .post('/api/v1/admin/sections/emergency')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCode: 'cse 327' });
    expect(dupCaseEm.status).toBe(409);
    expect(
      backendStore.getState().sections.filter((s) => s.id.toUpperCase() === 'CSE327-05')
    ).toHaveLength(1);

    // Exact 1-section math for CSE 425 (initial capacity 40, +10 => totalCapacity 50, NOT 80)
    const addSeatsRes = await request(app)
      .post('/api/v1/admin/courses/add-seats')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCode: 'CSE 425', count: 10 });
    expect(addSeatsRes.status).toBe(200);
    const esc425 = addSeatsRes.body.state.escalations.find(
      (e: EscalationItem) => e.courseCode === 'CSE 425'
    )!;
    expect(esc425.totalCapacity).toBe(50);
    expect(esc425.status).toBe('Resolved');
    expect(esc425.deficit).toBe(0);

    const unknownCourseRes = await request(app)
      .post('/api/v1/admin/courses/add-seats')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCode: 'CSE 999', count: 5 });
    expect(unknownCourseRes.status).toBe(404);
  });

  it('demo section-full triggers auto zero-seat escalation, admin rds4/sync reopens seats, and demo/reset restores state', async () => {
    const adminToken = await loginAs('admin.itops');

    const fullRes = await request(app)
      .post('/api/v1/demo/section-full')
      .send({ sectionId: 'CSE311-03' });
    expect(fullRes.status).toBe(200);
    const cse311 = fullRes.body.state.sections.find((s: CourseSection) => s.id === 'CSE311-03')!;
    expect(cse311.enrolled).toBe(cse311.capacity);
    const autoEsc = fullRes.body.state.escalations.find(
      (e: EscalationItem) => e.courseCode === 'CSE 311'
    );
    expect(autoEsc).toBeDefined();
    expect(autoEsc.status).toBe('Open');

    const reopenedSnapshot = { ...INITIAL_SECTIONS.find((s) => s.id === 'CSE327-03')!, enrolled: 38 };
    const syncRes = await request(app)
      .post('/api/v1/admin/rds4/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ snapshots: [reopenedSnapshot] });
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.syncResult.reopenedSectionIds).toContain('CSE327-03');

    const resetRes = await request(app).post('/api/v1/demo/reset');
    expect(resetRes.status).toBe(200);
    const resetSec = resetRes.body.state.sections.find((s: CourseSection) => s.id === 'CSE327-01')!;
    expect(resetSec.enrolled).toBe(28);
  });

  it('delivers real-time SYNC_UPDATE & RDS_FALLBACK over WebSocket (/ws) and SSE (/api/v1/events) within < 500ms', async () => {
    const studentToken = await loginAs('2412159042');
    const server = http.createServer(app);
    attachWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as { port: number };
    const baseHttpUrl = `http://127.0.0.1:${address.port}`;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws?token=${encodeURIComponent(studentToken)}`;

    const wsMessages: Array<{ type: string; state?: { metrics?: { surgeSpikeActive?: boolean } } }> = [];
    const sseEvents: Array<{ type: string }> = [];
    const sseAbort = new AbortController();

    try {
      const ws = new WebSocket(wsUrl);
      ws.on('message', (data) => {
        wsMessages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
      });

      // Wait for initial SYNC_UPDATE snapshot on connect
      await vi.waitFor(() => {
        expect(wsMessages.some((m) => m.type === 'SYNC_UPDATE')).toBe(true);
      });

      // Test WS PING -> PONG
      ws.send(JSON.stringify({ type: 'PING' }));
      await vi.waitFor(() => {
        expect(wsMessages.some((m) => m.type === 'PONG')).toBe(true);
      });

      // Connect SSE stream
      const sseResponse = await fetch(`${baseHttpUrl}/api/v1/events`, {
        signal: sseAbort.signal
      });
      expect(sseResponse.status).toBe(200);
      expect(sseResponse.headers.get('x-accel-buffering')).toBe('no');

      const reader = sseResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readLoop = (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || '';
            for (const chunk of chunks) {
              if (chunk.startsWith('data: ')) {
                sseEvents.push(JSON.parse(chunk.slice(6)));
              }
            }
          }
        } catch {
          // Aborted cleanly on teardown
        }
      })();

      const started = Date.now();
      const confirmFail = await request(baseHttpUrl)
        .post('/api/v1/student/enroll/confirm')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ simulateRdsFailure: true });
      expect(confirmFail.status).toBe(200);

      await vi.waitFor(
        () => {
          expect(wsMessages.some((m) => m.type === 'RDS_FALLBACK')).toBe(true);
          expect(sseEvents.some((e) => e.type === 'RDS_FALLBACK')).toBe(true);
        },
        { timeout: 500 }
      );

      expect(Date.now() - started).toBeLessThan(500);

      ws.close();
      sseAbort.abort();
      await readLoop;
    } finally {
      closeAllSseClients();
      await closeWebSocketServer();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('POST /demo/section-full returns 404 for unknown section and drives Open -> Resolved -> Open auto-escalation', async () => {
    const adminToken = await loginAs('admin.itops');

    const unknownRes = await request(app)
      .post('/api/v1/demo/section-full')
      .send({ sectionId: 'CSE999-99' });
    expect(unknownRes.status).toBe(404);

    // 1. Trigger Open
    const full1 = await request(app)
      .post('/api/v1/demo/section-full')
      .send({ sectionId: 'CSE311-03' });
    expect(full1.status).toBe(200);
    expect(
      full1.body.state.escalations.find((e: EscalationItem) => e.courseCode === 'CSE 311')?.status
    ).toBe('Open');

    // 2. Expand capacity -> Resolved
    const expandRes = await request(app)
      .post('/api/v1/faculty/sections/expand-capacity')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sectionId: 'CSE311-03', delta: 5 });
    expect(expandRes.status).toBe(200);
    expect(
      expandRes.body.state.escalations.find((e: EscalationItem) => e.courseCode === 'CSE 311')
        ?.status
    ).toBe('Resolved');

    // 3. Full again -> Re-opened
    const full2 = await request(app)
      .post('/api/v1/demo/section-full')
      .send({ sectionId: 'CSE311-03' });
    expect(full2.status).toBe(200);
    expect(
      full2.body.state.escalations.find((e: EscalationItem) => e.courseCode === 'CSE 311')?.status
    ).toBe('Open');
  });

  it('slaMonitor suppresses duplicate alerts during sustained breach and re-arms after recovery', async () => {
    resetSlaMonitor();
    const t0 = 1_700_000_000_000;

    // Initial seed metrics have p95LatencyMs: 218 > slaCeilingMs: 200
    const first = await evaluateSlaBreach(t0);
    expect(first.breached).toBe(true);
    expect(first.alertEmitted).toBe(false);

    const breach1 = await evaluateSlaBreach(t0 + 61_000);
    expect(breach1.breached).toBe(true);
    expect(breach1.alertEmitted).toBe(true);

    // Duplicate alert suppressed at t0 + 120_000
    const dupEval = await evaluateSlaBreach(t0 + 120_000);
    expect(dupEval.breached).toBe(true);
    expect(dupEval.alertEmitted).toBe(false);
    expect(
      backendStore.getState().auditLog.filter((l) => l.action === 'SLA Breach Alert (1m)')
    ).toHaveLength(1);

    // Recovery resets monitor
    backendStore.updateState((s) => {
      s.metrics = { ...s.metrics, p95LatencyMs: 120, surgeSpikeActive: false };
    });
    const recovered = await evaluateSlaBreach(t0 + 130_000);
    expect(recovered.breached).toBe(false);
    expect(recovered.alertEmitted).toBe(false);

    // Subsequent sustained breach re-arms and emits a 2nd alert
    backendStore.updateState((s) => {
      s.metrics = { ...s.metrics, p95LatencyMs: 280 };
    });
    const reStart = await evaluateSlaBreach(t0 + 140_000);
    expect(reStart.breached).toBe(true);
    expect(reStart.alertEmitted).toBe(false);

    const breach2 = await evaluateSlaBreach(t0 + 205_000);
    expect(breach2.breached).toBe(true);
    expect(breach2.alertEmitted).toBe(true);
    expect(
      backendStore.getState().auditLog.filter((l) => l.action === 'SLA Breach Alert (1m)')
    ).toHaveLength(2);
  });

  it('wsHub rejects non-/ws upgrade, ignores malformed JSON, handles RESYNC, and replays RDS_FALLBACK on connect', async () => {
    const studentToken = await loginAs('2412159042');
    const server = http.createServer(app);
    attachWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as { port: number };
    const baseHttpUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 1. Non-/ws upgrade is destroyed/rejected
      await new Promise<void>((resolve) => {
        const badWs = new WebSocket(`ws://127.0.0.1:${address.port}/not-ws`);
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        badWs.on('error', done);
        badWs.on('close', done);
        badWs.on('open', () => {
          badWs.close();
          throw new Error('Expected non-/ws upgrade to be rejected');
        });
      });

      // 2. Trigger active unresolved rdsFallbackPrompt before connecting WS
      const failConfirm = await request(baseHttpUrl)
        .post('/api/v1/student/enroll/confirm')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ simulateRdsFailure: true });
      expect(failConfirm.status).toBe(200);

      // 3. Connect to /ws -> receives both SYNC_UPDATE and connect-time RDS_FALLBACK replay
      const messages: Array<{ type: string }> = [];
      const ws = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws?token=${encodeURIComponent(studentToken)}`
      );
      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
      });

      await vi.waitFor(() => {
        expect(messages.some((m) => m.type === 'SYNC_UPDATE')).toBe(true);
        expect(messages.some((m) => m.type === 'RDS_FALLBACK')).toBe(true);
      });

      // 4. Malformed JSON is ignored without closing socket, and RESYNC emits fresh SYNC_UPDATE
      messages.length = 0;
      ws.send('{not-valid-json');
      ws.send(JSON.stringify({ type: 'PING' }));
      await vi.waitFor(() => {
        expect(messages.some((m) => m.type === 'PONG')).toBe(true);
      });

      messages.length = 0;
      ws.send(JSON.stringify({ type: 'RESYNC' }));
      await vi.waitFor(() => {
        expect(messages.some((m) => m.type === 'SYNC_UPDATE')).toBe(true);
      });

      ws.close();
    } finally {
      closeAllSseClients();
      await closeWebSocketServer();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
