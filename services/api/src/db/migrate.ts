import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { isPostgresEnabled, withTransaction } from './pool';
import {
  INITIAL_STUDENT,
  INITIAL_USERS,
  INITIAL_SECTIONS,
  INITIAL_STAGED_IDS,
  INITIAL_EXCEPTIONS,
  INITIAL_BYPASS_RULES,
  INITIAL_AUDIT_LOG,
  INITIAL_METRICS,
  INITIAL_ESCALATIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_WAITLIST
} from '../seedData';

const MIGRATION_LOCK_ID = 327001;

export function resolveSchemaPath(): string {
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../../src/db/schema.sql'),
    path.resolve(process.cwd(), 'src/db/schema.sql')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate schema.sql. Checked: ${candidates.join(', ')}`);
}

export async function seedDatabase(client: PoolClient, force = false): Promise<boolean> {
  if (!force) {
    const [studentCount, userCount] = await Promise.all([
      client.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM students'),
      client.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users')
    ]);

    if ((studentCount.rows[0]?.cnt ?? 0) > 0 && (userCount.rows[0]?.cnt ?? 0) > 0) {
      return false;
    }
  }

  // 1. Seed users
  for (const user of INITIAL_USERS) {
    await client.query(
      `INSERT INTO users (id, name, email, role, password_hash, instructor_name, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.passwordHash,
        user.instructorName,
        user.department
      ]
    );
  }

  // 2. Seed primary and secondary students (required for exception_cases & waitlist_entries FKs)
  const extraStudents = [
    INITIAL_STUDENT,
    {
      id: '2321450042',
      name: 'Fariha Tasnim',
      email: 'fariha.tasnim@northsouth.edu',
      program: 'B.Sc in Computer Science and Engineering',
      standing: 'Junior Standing',
      creditsCompleted: 68,
      creditsTotal: 130,
      cgpa: 3.42,
      cartToken: '#NSU-232145-0042',
      clearedCourses: [
        { code: 'CSE 115', grade: 'A-' },
        { code: 'CSE 215', grade: 'B+' }
      ],
      advisingClearedBy: 'Dr. Nova Ahmed',
      slotClosesAt: INITIAL_STUDENT.slotClosesAt,
      maxCredits: 15.0
    },
    {
      id: '2211290042',
      name: 'Tanveer Hasan',
      email: 'tanveer.hasan@northsouth.edu',
      program: 'B.Sc in Computer Science and Engineering',
      standing: 'Senior Standing',
      creditsCompleted: 112,
      creditsTotal: 130,
      cgpa: 3.81,
      cartToken: '#NSU-221129-0042',
      clearedCourses: [
        { code: 'CSE 115', grade: 'A' },
        { code: 'CSE 215', grade: 'A' },
        { code: 'CSE 311', grade: 'A' }
      ],
      advisingClearedBy: 'Dr. Nova Ahmed',
      slotClosesAt: INITIAL_STUDENT.slotClosesAt,
      maxCredits: 15.0
    }
  ];

  for (const stu of extraStudents) {
    await client.query(
      `INSERT INTO students (
        id, name, email, program, standing, credits_completed, credits_total,
        cgpa, cart_token, cleared_courses, advising_cleared_by, slot_closes_at, max_credits
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
      ON CONFLICT (id) DO NOTHING`,
      [
        stu.id,
        stu.name,
        stu.email,
        stu.program,
        stu.standing,
        stu.creditsCompleted,
        stu.creditsTotal,
        stu.cgpa,
        stu.cartToken,
        JSON.stringify(stu.clearedCourses),
        stu.advisingClearedBy,
        stu.slotClosesAt,
        stu.maxCredits ?? 15.0
      ]
    );
  }

  // 3. Seed course_sections
  for (const sec of INITIAL_SECTIONS) {
    await client.query(
      `INSERT INTO course_sections (
        id, course_code, course_title, department, credits, section_number,
        faculty, days, time_slot, room, capacity, enrolled, waitlisted,
        min_credits_required, prerequisites, is_lab, instructor_id, room_capacity, exam_slot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)
      ON CONFLICT (id) DO NOTHING`,
      [
        sec.id,
        sec.courseCode,
        sec.courseTitle,
        sec.department,
        sec.credits,
        sec.sectionNumber,
        sec.faculty,
        sec.days,
        sec.timeSlot,
        sec.room,
        sec.capacity,
        sec.enrolled,
        sec.waitlisted,
        sec.minCreditsRequired ?? null,
        JSON.stringify(sec.prerequisites),
        Boolean(sec.isLab),
        sec.instructorId ?? null,
        sec.roomCap ?? 55,
        sec.examSlot ?? null
      ]
    );
  }

  // 4. Seed staged_sections for primary student
  const nowMs = Date.now();
  for (let i = 0; i < INITIAL_STAGED_IDS.length; i++) {
    const secId = INITIAL_STAGED_IDS[i];
    const sec = INITIAL_SECTIONS.find((s) => s.id === secId);
    if (!sec) continue;
    await client.query(
      `INSERT INTO staged_sections (student_id, section_id, course_code, added_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, section_id) DO NOTHING`,
      [INITIAL_STUDENT.id, secId, sec.courseCode, nowMs + i]
    );
  }

  // 5. Seed exception_cases
  for (const ex of INITIAL_EXCEPTIONS) {
    await client.query(
      `INSERT INTO exception_cases (
        id, student_id, student_name, program, standing, cgpa, credits_completed,
        course_code, course_title, section_number, category, submitted_at, status,
        statement, audit_checks, faculty_decision_by, faculty_decision_at, section_id, rule_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)
      ON CONFLICT (id) DO NOTHING`,
      [
        ex.id,
        ex.studentId,
        ex.studentName,
        ex.program,
        ex.standing,
        ex.cgpa,
        ex.creditsCompleted,
        ex.courseCode,
        ex.courseTitle,
        ex.sectionNumber,
        ex.category,
        ex.submittedAt,
        ex.status,
        ex.statement,
        JSON.stringify(ex.auditChecks),
        ex.facultyDecisionBy ?? null,
        ex.facultyDecisionAt ?? null,
        ex.sectionId ?? null,
        ex.ruleCode ?? null
      ]
    );
  }

  // 6. Seed bypass_rules
  for (const rule of INITIAL_BYPASS_RULES) {
    await client.query(
      `INSERT INTO bypass_rules (id, code, title, description, category, enabled, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [rule.id, rule.code, rule.title, rule.description, rule.category, rule.enabled, rule.lastUpdated]
    );
  }

  // 7. Seed audit_logs
  for (const log of INITIAL_AUDIT_LOG) {
    await client.query(
      `INSERT INTO audit_logs (id, timestamp, actor, action, details, badge_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [log.id, log.timestamp, log.actor, log.action, log.details, log.badgeType]
    );
  }

  // 8. Seed admin_metrics (only if empty)
  const metricsCnt = await client.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM admin_metrics');
  if ((metricsCnt.rows[0]?.cnt ?? 0) === 0) {
    await client.query(
      `INSERT INTO admin_metrics (
        requests_per_sec, p95_latency_ms, sla_ceiling_ms, error_rate,
        pool_used, pool_total, api_nodes, surge_spike_active, last_scaling_event
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        INITIAL_METRICS.requestsPerSec,
        INITIAL_METRICS.p95LatencyMs,
        INITIAL_METRICS.slaCeilingMs,
        INITIAL_METRICS.errorRate,
        INITIAL_METRICS.poolUsed,
        INITIAL_METRICS.poolTotal,
        INITIAL_METRICS.apiNodes,
        INITIAL_METRICS.surgeSpikeActive,
        INITIAL_METRICS.lastScalingEvent ?? null
      ]
    );
  }

  // 9. Seed escalations
  for (const esc of INITIAL_ESCALATIONS) {
    await client.query(
      `INSERT INTO escalations (
        id, course_code, course_title, enrolled, total_capacity, waitlisted,
        deficit, severity, status, demand_surge, breakdown, auto_generated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
      ON CONFLICT (id) DO NOTHING`,
      [
        esc.id,
        esc.courseCode,
        esc.courseTitle,
        esc.enrolled,
        esc.totalCapacity,
        esc.waitlisted,
        esc.deficit,
        esc.severity,
        esc.status,
        JSON.stringify(esc.demandSurge),
        JSON.stringify(esc.breakdown),
        Boolean(esc.autoGenerated)
      ]
    );
  }

  // 10. Seed notifications
  for (const notif of INITIAL_NOTIFICATIONS) {
    await client.query(
      `INSERT INTO notifications (
        id, student_id, section_id, course_code, channel, event_type,
        title, message, status, error, read, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      ON CONFLICT (id) DO NOTHING`,
      [
        notif.id,
        notif.studentId,
        notif.sectionId ?? null,
        notif.courseCode ?? null,
        notif.channel,
        notif.eventType,
        notif.title,
        notif.message,
        notif.status,
        notif.error ?? null,
        Boolean(notif.read),
        JSON.stringify(notif.metadata ?? {}),
        notif.createdAt
      ]
    );
  }

  // 11. Seed waitlist_entries
  for (const wl of INITIAL_WAITLIST) {
    await client.query(
      `INSERT INTO waitlist_entries (
        id, student_id, section_id, course_code, position, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [wl.id, wl.studentId, wl.sectionId, wl.courseCode, wl.position, wl.status, wl.createdAt]
    );
  }

  return true;
}

export async function runMigrations(): Promise<{
  mode: 'postgres' | 'memory';
  migrated: boolean;
  seeded: boolean;
}> {
  if (!isPostgresEnabled()) {
    return { mode: 'memory', migrated: false, seeded: false };
  }

  const schemaSql = fs.readFileSync(resolveSchemaPath(), 'utf8');

  const seeded = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(schemaSql);
    return seedDatabase(client, false);
  });

  return { mode: 'postgres', migrated: true, seeded };
}

export async function resetDatabaseToSeed(): Promise<void> {
  if (!isPostgresEnabled()) {
    return;
  }

  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(
      `TRUNCATE TABLE
        rds_fallback_prompts,
        enrollments,
        notifications,
        waitlist_entries,
        revoked_tokens,
        schedule_receipts,
        staged_sections,
        exception_cases,
        bypass_rules,
        audit_logs,
        admin_metrics,
        escalations,
        course_sections,
        students,
        users
       RESTART IDENTITY CASCADE`
    );
    await seedDatabase(client, true);
  });
}
