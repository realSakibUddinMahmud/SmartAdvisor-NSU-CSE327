import crypto from 'crypto';
import { PoolClient } from 'pg';
import {
  AdminMetrics,
  AuditLogItem,
  BackendState,
  BypassRule,
  CourseSection,
  EscalationItem,
  ExceptionCase,
  NotificationItem,
  RdsFallbackPrompt,
  ScheduleReceipt,
  StudentProfile,
  UserRole,
  WaitlistEntry
} from '../types';
import {
  INITIAL_AUDIT_LOG,
  INITIAL_BYPASS_RULES,
  INITIAL_ESCALATIONS,
  INITIAL_EXCEPTIONS,
  INITIAL_METRICS,
  INITIAL_NOTIFICATIONS,
  INITIAL_SECTIONS,
  INITIAL_STAGED_IDS,
  INITIAL_STUDENT,
  INITIAL_USERS,
  INITIAL_WAITLIST,
  ROOM_FIRE_CODE_CAPS,
  SeedUserAccount
} from '../seedData';
import { isPostgresEnabled, query, withTransaction } from '../db/pool';
import { resetDatabaseToSeed } from '../db/migrate';
import { CurriculumGraph, normalizeCourseCode } from '../services/curriculumGraph';
import {
  checkCreditFloor,
  checkFinalExamLoad,
  checkPrerequisites,
  checkRoomCapacity,
  detectScheduleClashes
} from '../services/ruleValidator';
import { notifierService } from '../services/notifier';
import { canManageSection } from '../middleware/rbac';

class FallbackRollbackSignal {
  constructor(
    public readonly outcome: {
      ok: false;
      status: number;
      receipt: null;
      message: string;
    }
  ) {}
}

export type { BackendState };
export type StoreSubscriber = (state: BackendState) => void;

export type StageSectionOutcome =
  | { ok: true; status: 200; state: BackendState }
  | { ok: false; status: 404; message: string }
  | { ok: false; status: 422; modal: 'rule_alert'; payload: Record<string, unknown> }
  | {
      ok: false;
      status: 409;
      modal: 'section_full';
      payload: { fullSection: CourseSection; alternatives: CourseSection[] };
    };

export type ConfirmEnrollmentOutcome =
  | {
      ok: true;
      status: 200;
      receipt: ScheduleReceipt;
      state: BackendState;
      fallbackPrompt?: RdsFallbackPrompt;
    }
  | {
      ok: false;
      status: 400 | 409;
      message: string;
      state: BackendState;
      fallbackPrompt?: RdsFallbackPrompt;
    };

function deepClone<T>(data: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

function nowTimeStr(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function generateReceiptTokens(studentId: string, cartToken: string, sectionIds: string[]) {
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  const transactionId = `#RDS-TXN-${randomHex}`;
  const hashHex = crypto
    .createHash('sha256')
    .update(`${studentId}:${cartToken}:${sectionIds.join(',')}:${transactionId}`)
    .digest('hex');
  return {
    transactionId,
    digitalSignature: `SHA256:${hashHex}`
  };
}

function ruleMatchesException(rule: BypassRule, ex: ExceptionCase): boolean {
  if (ex.ruleCode && ex.ruleCode === rule.code) return true;
  if (rule.category === 'Standing' && ex.category === 'Credit Standing') return true;
  if (rule.category === 'Prerequisite' && ex.category === 'Prereqs') return true;
  if (rule.category === 'Capacity' && ex.category === 'Capacity') return true;
  return false;
}

export class BackendStore {
  private state: BackendState;
  private users: SeedUserAccount[];
  private revokedTokens: Map<string, number> = new Map();
  private enrollments: Map<string, Set<string>> = new Map();
  private subscribers: Set<StoreSubscriber> = new Set();
  private sectionLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.users = deepClone(INITIAL_USERS);
    this.state = this.createInitialState();
  }

  private createInitialState(): BackendState {
    const graph = CurriculumGraph.getInstance();
    return {
      student: deepClone(INITIAL_STUDENT),
      sections: deepClone(INITIAL_SECTIONS),
      stagedSectionIds: deepClone(INITIAL_STAGED_IDS),
      exceptions: deepClone(INITIAL_EXCEPTIONS),
      bypassRules: deepClone(INITIAL_BYPASS_RULES),
      auditLog: deepClone(INITIAL_AUDIT_LOG),
      metrics: deepClone(INITIAL_METRICS),
      escalations: deepClone(INITIAL_ESCALATIONS),
      receipt: null,
      notifications: deepClone(INITIAL_NOTIFICATIONS),
      waitlistSectionIds: [],
      waitlistEntries: deepClone(INITIAL_WAITLIST),
      dagSummary: graph.getDagSummary(INITIAL_STUDENT.clearedCourses),
      rdsFallbackPrompt: null
    };
  }

  // ================= SYNCHRONOUS BACKWARD-COMPATIBLE API =================

  public getState(): BackendState {
    return deepClone(this.state);
  }

  public resetState(): void {
    this.users = deepClone(INITIAL_USERS);
    this.revokedTokens.clear();
    this.enrollments.clear();
    this.state = this.createInitialState();
    this.notifySubscribers();
  }

  public updateState(updater: (state: BackendState) => void): BackendState {
    updater(this.state);
    this.notifySubscribers();
    return this.getState();
  }

  public addAuditLog(
    actor: string,
    action: string,
    details: string,
    badgeType: AuditLogItem['badgeType']
  ): AuditLogItem {
    const newLog: AuditLogItem = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowTimeStr(),
      actor,
      action,
      details,
      badgeType
    };

    this.updateState((s) => {
      s.auditLog = [newLog, ...s.auditLog];
    });

    return newLog;
  }

  public subscribe(cb: StoreSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.unsubscribe(cb);
    };
  }

  public unsubscribe(cb: StoreSubscriber): void {
    this.subscribers.delete(cb);
  }

  private notifySubscribers(overrideState?: BackendState): void {
    const snapshot = overrideState ? deepClone(overrideState) : this.getState();
    for (const subscriber of this.subscribers) {
      try {
        subscriber(snapshot);
      } catch (err) {
        console.error('Error in store subscriber:', err);
      }
    }
  }

  /**
   * Row-level locking emulation (SELECT ... FOR UPDATE) for section concurrency
   */
  public async withSectionLock<T>(sectionId: string, fn: () => Promise<T> | T): Promise<T> {
    while (this.sectionLocks.has(sectionId)) {
      await this.sectionLocks.get(sectionId);
    }

    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.sectionLocks.set(sectionId, lockPromise);

    try {
      return await fn();
    } finally {
      this.sectionLocks.delete(sectionId);
      releaseLock();
    }
  }

  /**
   * Deadlock-free multi-section lock acquisition using lexicographically sorted IDs.
   */
  public async withSectionLocks<T>(
    sectionIds: string[],
    fn: () => Promise<T> | T
  ): Promise<T> {
    const uniqueSorted = [...new Set(sectionIds)].sort();
    const acquireNext = async (index: number): Promise<T> => {
      if (index >= uniqueSorted.length) {
        return fn();
      }
      return this.withSectionLock(uniqueSorted[index], () => acquireNext(index + 1));
    };
    return acquireNext(0);
  }

  /**
   * Captures a deep-cloned snapshot in memory mode and rolls back on failure.
   */
  private async withMemoryTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
    const stateSnapshot = deepClone(this.state);
    const enrollmentsSnapshot = new Map<string, Set<string>>();
    for (const [k, v] of this.enrollments.entries()) {
      enrollmentsSnapshot.set(k, new Set(v));
    }

    try {
      return await fn();
    } catch (err) {
      this.state = stateSnapshot;
      this.enrollments = enrollmentsSnapshot;
      throw err;
    }
  }

  // ================= PG ROW MAPPING HELPERS =================

  private mapStudentRow(row: Record<string, unknown>): StudentProfile {
    return {
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      program: String(row.program),
      standing: String(row.standing),
      creditsCompleted: Number(row.credits_completed),
      creditsTotal: Number(row.credits_total),
      cgpa: Number(row.cgpa),
      cartToken: String(row.cart_token),
      clearedCourses: (row.cleared_courses as { code: string; grade: string }[]) ?? [],
      advisingClearedBy: String(row.advising_cleared_by),
      slotClosesAt:
        row.slot_closes_at instanceof Date
          ? row.slot_closes_at.toISOString()
          : String(row.slot_closes_at),
      maxCredits: row.max_credits !== undefined ? Number(row.max_credits) : 15.0
    };
  }

  private mapSectionRow(row: Record<string, unknown>): CourseSection {
    return {
      id: String(row.id),
      courseCode: String(row.course_code),
      courseTitle: String(row.course_title),
      department: row.department as CourseSection['department'],
      credits: Number(row.credits),
      sectionNumber: String(row.section_number),
      faculty: String(row.faculty),
      days: row.days as CourseSection['days'],
      timeSlot: String(row.time_slot),
      room: String(row.room),
      capacity: Number(row.capacity),
      enrolled: Number(row.enrolled),
      waitlisted: Number(row.waitlisted),
      minCreditsRequired:
        row.min_credits_required !== null && row.min_credits_required !== undefined
          ? Number(row.min_credits_required)
          : undefined,
      prerequisites: (row.prerequisites as string[]) ?? [],
      isLab: Boolean(row.is_lab),
      instructorId: row.instructor_id ? String(row.instructor_id) : undefined,
      roomCap:
        row.room_capacity !== null && row.room_capacity !== undefined
          ? Number(row.room_capacity)
          : undefined,
      examSlot: row.exam_slot ? String(row.exam_slot) : undefined
    };
  }

  private mapExceptionRow(row: Record<string, unknown>): ExceptionCase {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      studentName: String(row.student_name),
      program: String(row.program),
      standing: String(row.standing),
      cgpa: Number(row.cgpa),
      creditsCompleted: Number(row.credits_completed),
      courseCode: String(row.course_code),
      courseTitle: String(row.course_title),
      sectionNumber: String(row.section_number),
      category: row.category as ExceptionCase['category'],
      submittedAt: String(row.submitted_at),
      status: row.status as ExceptionCase['status'],
      statement: String(row.statement),
      auditChecks: (row.audit_checks as ExceptionCase['auditChecks']) ?? [],
      facultyDecisionBy: row.faculty_decision_by ? String(row.faculty_decision_by) : undefined,
      facultyDecisionAt: row.faculty_decision_at ? String(row.faculty_decision_at) : undefined,
      sectionId: row.section_id ? String(row.section_id) : undefined,
      ruleCode: row.rule_code ? String(row.rule_code) : undefined
    };
  }

  private mapNotificationRow(row: Record<string, unknown>): NotificationItem {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      sectionId: row.section_id ? String(row.section_id) : undefined,
      courseCode: row.course_code ? String(row.course_code) : undefined,
      channel: row.channel as NotificationItem['channel'],
      eventType: row.event_type as NotificationItem['eventType'],
      title: String(row.title),
      message: String(row.message),
      status: row.status as NotificationItem['status'],
      error: row.error ? String(row.error) : undefined,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      read: Boolean(row.read),
      metadata: (row.metadata as Record<string, unknown>) ?? undefined
    };
  }

  private async loadStateFromClient(
    client: PoolClient,
    studentId = INITIAL_STUDENT.id
  ): Promise<BackendState> {
    const [
      stuRes,
      secRes,
      stagedRes,
      exRes,
      ruleRes,
      logRes,
      metricsRes,
      escRes,
      receiptRes,
      notifRes,
      wlRes,
      fallbackRes
    ] = await Promise.all([
      client.query('SELECT * FROM students WHERE id = $1', [studentId]),
      client.query('SELECT * FROM course_sections ORDER BY id ASC'),
      client.query('SELECT section_id FROM staged_sections WHERE student_id = $1 ORDER BY added_at ASC', [
        studentId
      ]),
      client.query('SELECT * FROM exception_cases ORDER BY created_at DESC'),
      client.query('SELECT * FROM bypass_rules ORDER BY id ASC'),
      client.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100'),
      client.query('SELECT * FROM admin_metrics ORDER BY id DESC LIMIT 1'),
      client.query('SELECT * FROM escalations ORDER BY id ASC'),
      client.query(
        'SELECT * FROM schedule_receipts WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
        [studentId]
      ),
      client.query(
        'SELECT * FROM notifications WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100',
        [studentId]
      ),
      client.query(
        "SELECT * FROM waitlist_entries WHERE status IN ('waiting', 'notified') ORDER BY created_at ASC"
      ),
      client.query(
        'SELECT * FROM rds_fallback_prompts WHERE student_id = $1 AND resolved = FALSE ORDER BY created_at DESC LIMIT 1',
        [studentId]
      )
    ]);

    const student =
      stuRes.rows[0] ? this.mapStudentRow(stuRes.rows[0]) : deepClone(INITIAL_STUDENT);
    const sections = secRes.rows.map((r) => this.mapSectionRow(r));
    const stagedSectionIds = stagedRes.rows.map((r) => String(r.section_id));
    const exceptions = exRes.rows.map((r) => this.mapExceptionRow(r));
    const bypassRules: BypassRule[] = ruleRes.rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      title: String(r.title),
      description: String(r.description),
      category: r.category as BypassRule['category'],
      enabled: Boolean(r.enabled),
      lastUpdated: String(r.last_updated)
    }));
    const auditLog: AuditLogItem[] = logRes.rows.map((r) => ({
      id: String(r.id),
      timestamp: String(r.timestamp),
      actor: String(r.actor),
      action: String(r.action),
      details: String(r.details),
      badgeType: r.badge_type as AuditLogItem['badgeType']
    }));

    const m = metricsRes.rows[0];
    const metrics: AdminMetrics = m
      ? {
          requestsPerSec: Number(m.requests_per_sec),
          p95LatencyMs: Number(m.p95_latency_ms),
          slaCeilingMs: Number(m.sla_ceiling_ms),
          errorRate: Number(m.error_rate),
          poolUsed: Number(m.pool_used),
          poolTotal: Number(m.pool_total),
          apiNodes: Number(m.api_nodes),
          surgeSpikeActive: Boolean(m.surge_spike_active),
          lastScalingEvent: m.last_scaling_event ? String(m.last_scaling_event) : undefined
        }
      : deepClone(INITIAL_METRICS);

    const escalations: EscalationItem[] = escRes.rows.map((r) => ({
      id: String(r.id),
      courseCode: String(r.course_code),
      courseTitle: String(r.course_title),
      enrolled: Number(r.enrolled),
      totalCapacity: Number(r.total_capacity),
      waitlisted: Number(r.waitlisted),
      deficit: Number(r.deficit),
      severity: r.severity as EscalationItem['severity'],
      status: r.status as EscalationItem['status'],
      demandSurge: (r.demand_surge as EscalationItem['demandSurge']) ?? [],
      breakdown: (r.breakdown as EscalationItem['breakdown']) ?? [],
      autoGenerated: Boolean(r.auto_generated)
    }));

    const rec = receiptRes.rows[0];
    const receipt: ScheduleReceipt | null = rec
      ? {
          transactionId: String(rec.transaction_id),
          studentId: String(rec.student_id),
          cartToken: String(rec.cart_token),
          timestamp: String(rec.timestamp),
          totalCredits: Number(rec.total_credits),
          sections: (rec.sections as CourseSection[]) ?? [],
          digitalSignature: String(rec.digital_signature),
          status: rec.status as ScheduleReceipt['status'],
          source: rec.source as ScheduleReceipt['source']
        }
      : null;

    const notifications = notifRes.rows.map((r) => this.mapNotificationRow(r));
    const waitlistEntries: WaitlistEntry[] = wlRes.rows.map((r) => ({
      id: String(r.id),
      studentId: String(r.student_id),
      sectionId: String(r.section_id),
      courseCode: String(r.course_code),
      position: Number(r.position),
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      status: r.status as WaitlistEntry['status']
    }));
    const waitlistSectionIds = waitlistEntries
      .filter((w) => w.studentId === studentId)
      .map((w) => w.sectionId);

    const fb = fallbackRes.rows[0];
    const rdsFallbackPrompt: RdsFallbackPrompt | null = fb
      ? {
          id: String(fb.id),
          failedSectionId: String(fb.failed_section_id),
          failedCourseCode: String(fb.failed_course_code),
          reason: String(fb.reason),
          alternatives: (fb.alternatives as CourseSection[]) ?? [],
          createdAt:
            fb.created_at instanceof Date ? fb.created_at.toISOString() : String(fb.created_at),
          resolved: Boolean(fb.resolved),
          resolvedSectionId: fb.resolved_section_id ? String(fb.resolved_section_id) : undefined
        }
      : null;

    const dagSummary = CurriculumGraph.getInstance().getDagSummary(student.clearedCourses);

    return {
      student,
      sections,
      stagedSectionIds,
      exceptions,
      bypassRules,
      auditLog,
      metrics,
      escalations,
      receipt,
      notifications,
      waitlistSectionIds,
      waitlistEntries,
      dagSummary,
      rdsFallbackPrompt
    };
  }

  private async insertAuditLogPg(
    client: PoolClient,
    actor: string,
    action: string,
    details: string,
    badgeType: AuditLogItem['badgeType']
  ): Promise<void> {
    const id = `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    await client.query(
      `INSERT INTO audit_logs (id, timestamp, actor, action, details, badge_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, nowTimeStr(), actor, action, details, badgeType]
    );
  }

  private async insertNotificationPg(
    client: PoolClient,
    item: NotificationItem
  ): Promise<void> {
    await client.query(
      `INSERT INTO notifications (
        id, student_id, section_id, course_code, channel, event_type,
        title, message, status, error, read, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      ON CONFLICT (id) DO NOTHING`,
      [
        item.id,
        item.studentId,
        item.sectionId ?? null,
        item.courseCode ?? null,
        item.channel,
        item.eventType,
        item.title,
        item.message,
        item.status,
        item.error ?? null,
        Boolean(item.read),
        JSON.stringify(item.metadata ?? {}),
        item.createdAt
      ]
    );
  }

  private syncZeroSeatEscalationsInMemory(): void {
    const byCourse = new Map<string, CourseSection[]>();
    for (const sec of this.state.sections) {
      const list = byCourse.get(sec.courseCode) ?? [];
      list.push(sec);
      byCourse.set(sec.courseCode, list);
    }

    for (const [courseCode, secs] of byCourse.entries()) {
      const totalCapacity = secs.reduce((sum, s) => sum + s.capacity, 0);
      const totalEnrolled = secs.reduce((sum, s) => sum + s.enrolled, 0);
      const totalWaitlisted = secs.reduce((sum, s) => sum + s.waitlisted, 0);
      const available = totalCapacity - totalEnrolled;

      const existing = this.state.escalations.find((e) => e.courseCode === courseCode);
      if (available <= 0) {
        if (!existing) {
          this.state.escalations.push({
            id: `#ESC-${Math.floor(1000 + Math.random() * 9000)}`,
            courseCode,
            courseTitle: secs[0].courseTitle,
            enrolled: totalEnrolled,
            totalCapacity,
            waitlisted: totalWaitlisted,
            deficit: Math.max(1, totalWaitlisted),
            severity: 'SEV-1',
            status: 'Open',
            demandSurge: [
              { time: '09:30', requests: 1842 },
              { time: '10:00', requests: 2180 }
            ],
            breakdown: [{ major: 'B.Sc CSE', count: Math.max(1, totalWaitlisted), percentage: 100 }],
            autoGenerated: true
          });
        } else if (existing.status === 'Resolved') {
          existing.status = 'Open';
          existing.enrolled = totalEnrolled;
          existing.totalCapacity = totalCapacity;
        }
      } else if (existing && existing.autoGenerated && existing.status !== 'Resolved') {
        existing.status = 'Resolved';
        existing.enrolled = totalEnrolled;
        existing.totalCapacity = totalCapacity;
        existing.deficit = 0;
      }
    }
  }

  private async syncZeroSeatEscalationsPg(client: PoolClient): Promise<void> {
    const secRes = await client.query('SELECT * FROM course_sections');
    const sections = secRes.rows.map((r) => this.mapSectionRow(r));
    const byCourse = new Map<string, CourseSection[]>();
    for (const sec of sections) {
      const list = byCourse.get(sec.courseCode) ?? [];
      list.push(sec);
      byCourse.set(sec.courseCode, list);
    }

    for (const [courseCode, secs] of byCourse.entries()) {
      const totalCapacity = secs.reduce((sum, s) => sum + s.capacity, 0);
      const totalEnrolled = secs.reduce((sum, s) => sum + s.enrolled, 0);
      const totalWaitlisted = secs.reduce((sum, s) => sum + s.waitlisted, 0);
      const available = totalCapacity - totalEnrolled;

      const existingRes = await client.query(
        'SELECT id, status, auto_generated FROM escalations WHERE course_code = $1 LIMIT 1',
        [courseCode]
      );
      const existing = existingRes.rows[0];

      if (available <= 0) {
        if (!existing) {
          const escId = `#ESC-${Math.floor(1000 + Math.random() * 9000)}`;
          await client.query(
            `INSERT INTO escalations (
              id, course_code, course_title, enrolled, total_capacity, waitlisted,
              deficit, severity, status, demand_surge, breakdown, auto_generated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SEV-1', 'Open', $8::jsonb, $9::jsonb, TRUE)`,
            [
              escId,
              courseCode,
              secs[0].courseTitle,
              totalEnrolled,
              totalCapacity,
              totalWaitlisted,
              Math.max(1, totalWaitlisted),
              JSON.stringify([
                { time: '09:30', requests: 1842 },
                { time: '10:00', requests: 2180 }
              ]),
              JSON.stringify([
                { major: 'B.Sc CSE', count: Math.max(1, totalWaitlisted), percentage: 100 }
              ])
            ]
          );
        } else if (existing.status === 'Resolved') {
          await client.query(
            `UPDATE escalations SET status = 'Open', enrolled = $2, total_capacity = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [existing.id, totalEnrolled, totalCapacity]
          );
        }
      } else if (existing && existing.auto_generated && existing.status !== 'Resolved') {
        await client.query(
          `UPDATE escalations SET status = 'Resolved', enrolled = $2, total_capacity = $3, deficit = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [existing.id, totalEnrolled, totalCapacity]
        );
      }
    }
  }

  // ================= DUAL-MODE ASYNC METHODS =================

  public async getStateAsync(studentId = INITIAL_STUDENT.id): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      const snapshot = this.getState();
      snapshot.dagSummary = CurriculumGraph.getInstance().getDagSummary(
        snapshot.student.clearedCourses
      );
      return snapshot;
    }

    return withTransaction((client) => this.loadStateFromClient(client, studentId));
  }

  public async resetStateAsync(): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      this.resetState();
      return this.getState();
    }

    await resetDatabaseToSeed();
    const state = await this.getStateAsync();
    this.notifySubscribers(state);
    return state;
  }

  public async findUserById(id: string): Promise<SeedUserAccount | null> {
    if (!isPostgresEnabled()) {
      const user = this.users.find((u) => u.id === id);
      return user ? deepClone(user) : null;
    }

    const res = await query(
      `SELECT id, name, email, role, password_hash, instructor_name, department
       FROM users WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      role: row.role as UserRole,
      passwordHash: String(row.password_hash),
      instructorName: row.instructor_name ? String(row.instructor_name) : null,
      department: row.department ? String(row.department) : ''
    };
  }

  public async revokeToken(jti: string, userId: string, expiresAtMs: number): Promise<void> {
    const now = Date.now();
    // Prune expired in-memory entries
    for (const [key, exp] of this.revokedTokens.entries()) {
      if (exp < now) {
        this.revokedTokens.delete(key);
      }
    }

    if (!isPostgresEnabled()) {
      this.revokedTokens.set(jti, expiresAtMs);
      return;
    }

    await query(
      `INSERT INTO revoked_tokens (jti, user_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, userId, new Date(expiresAtMs).toISOString()]
    );
  }

  public async isTokenRevoked(jti: string): Promise<boolean> {
    const now = Date.now();
    for (const [key, exp] of this.revokedTokens.entries()) {
      if (exp < now) {
        this.revokedTokens.delete(key);
      }
    }

    if (!isPostgresEnabled()) {
      return this.revokedTokens.has(jti);
    }

    const res = await query<{ cnt: number }>(
      'SELECT COUNT(*)::int AS cnt FROM revoked_tokens WHERE jti = $1 AND expires_at > CURRENT_TIMESTAMP',
      [jti]
    );
    return (res.rows[0]?.cnt ?? 0) > 0;
  }

  private resolveMemoryStudentMeta(studentId: string): {
    id: string;
    name: string;
    cartToken: string;
  } {
    const primary = this.state.student;
    const effectiveId = studentId || primary.id;
    if (effectiveId === primary.id) {
      return {
        id: primary.id,
        name: primary.name,
        cartToken: primary.cartToken
      };
    }
    const knownUser = this.users.find((u) => u.id === effectiveId);
    return {
      id: effectiveId,
      name: knownUser?.name ?? effectiveId,
      cartToken: `#NSU-${effectiveId}`
    };
  }

  public async stageSectionTx(
    studentId: string,
    sectionId: string
  ): Promise<StageSectionOutcome> {
    if (!isPostgresEnabled()) {
      return this.withSectionLock(`cart:${studentId}`, () =>
        this.withSectionLock(sectionId, async () => {
          const target = this.state.sections.find((s) => s.id === sectionId);
          if (!target) {
            return { ok: false, status: 404, message: 'Section not found' };
          }

          if (this.state.stagedSectionIds.includes(sectionId)) {
            return { ok: true, status: 200, state: this.getState() };
          }

          const creditCheck = checkCreditFloor(
            target,
            this.state.student,
            this.state.bypassRules,
            this.state.exceptions
          );
          if (!creditCheck.passed) {
            return {
              ok: false,
              status: 422,
              modal: 'rule_alert',
              payload: {
                section: deepClone(target),
                studentCredits: creditCheck.studentCredits,
                requiredCredits: creditCheck.requiredCredits,
                ruleCode: 'RULE-4.2',
                overrideEligible: creditCheck.overrideEligible
              }
            };
          }

          const prereqCheck = checkPrerequisites(
            target,
            this.state.student,
            this.state.bypassRules,
            this.state.exceptions
          );
          if (!prereqCheck.passed) {
            return {
              ok: false,
              status: 422,
              modal: 'rule_alert',
              payload: {
                section: deepClone(target),
                ruleCode: 'RULE-2.1',
                missingPrerequisites: prereqCheck.missingPrerequisites
              }
            };
          }

          const proposedSections = [
            ...this.state.stagedSectionIds
              .map((id) => this.state.sections.find((s) => s.id === id))
              .filter((s): s is CourseSection => Boolean(s))
              .filter((s) => s.courseCode !== target.courseCode),
            target
          ];

          const examCheck = checkFinalExamLoad(proposedSections, this.state.bypassRules);
          if (!examCheck.passed) {
            return {
              ok: false,
              status: 422,
              modal: 'rule_alert',
              payload: {
                section: deepClone(target),
                ruleCode: 'RULE-6.3',
                conflictingSections: examCheck.conflictingSections
              }
            };
          }

          if (target.enrolled >= target.capacity) {
            const alternatives = this.state.sections.filter(
              (s) =>
                s.courseCode === target.courseCode &&
                s.id !== target.id &&
                s.enrolled < s.capacity
            );
            return {
              ok: false,
              status: 409,
              modal: 'section_full',
              payload: {
                fullSection: deepClone(target),
                alternatives: deepClone(alternatives)
              }
            };
          }

          const studentMeta = this.resolveMemoryStudentMeta(studentId);
          await this.withMemoryTransaction(() => {
            const filtered = this.state.stagedSectionIds.filter((id) => {
              const sec = this.state.sections.find((item) => item.id === id);
              return sec?.courseCode !== target.courseCode;
            });
            this.state.stagedSectionIds = [...filtered, sectionId];
            this.addAuditLog(
              studentMeta.name,
              'Section Staged',
              `Staged ${target.courseCode} Sec ${target.sectionNumber} (${target.timeSlot})`,
              'teal'
            );
          });

          return { ok: true, status: 200, state: this.getState() };
        })
      );
    }

    const outcome = await withTransaction<StageSectionOutcome>(async (client) => {
      await client.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [studentId]);
      const secRes = await client.query(
        'SELECT * FROM course_sections WHERE id = $1 FOR UPDATE',
        [sectionId]
      );
      if (secRes.rows.length === 0) {
        return { ok: false, status: 404, message: 'Section not found' };
      }

      const target = this.mapSectionRow(secRes.rows[0]);
      const fullState = await this.loadStateFromClient(client, studentId);

      if (fullState.stagedSectionIds.includes(sectionId)) {
        return { ok: true, status: 200, state: fullState };
      }

      const creditCheck = checkCreditFloor(
        target,
        fullState.student,
        fullState.bypassRules,
        fullState.exceptions
      );
      if (!creditCheck.passed) {
        return {
          ok: false,
          status: 422,
          modal: 'rule_alert',
          payload: {
            section: target,
            studentCredits: creditCheck.studentCredits,
            requiredCredits: creditCheck.requiredCredits,
            ruleCode: 'RULE-4.2',
            overrideEligible: creditCheck.overrideEligible
          }
        };
      }

      const prereqCheck = checkPrerequisites(
        target,
        fullState.student,
        fullState.bypassRules,
        fullState.exceptions
      );
      if (!prereqCheck.passed) {
        return {
          ok: false,
          status: 422,
          modal: 'rule_alert',
          payload: {
            section: target,
            ruleCode: 'RULE-2.1',
            missingPrerequisites: prereqCheck.missingPrerequisites
          }
        };
      }

      const proposedSections = [
        ...fullState.stagedSectionIds
          .map((id) => fullState.sections.find((s) => s.id === id))
          .filter((s): s is CourseSection => Boolean(s))
          .filter((s) => s.courseCode !== target.courseCode),
        target
      ];

      const examCheck = checkFinalExamLoad(proposedSections, fullState.bypassRules);
      if (!examCheck.passed) {
        return {
          ok: false,
          status: 422,
          modal: 'rule_alert',
          payload: {
            section: target,
            ruleCode: 'RULE-6.3',
            conflictingSections: examCheck.conflictingSections
          }
        };
      }

      if (target.enrolled >= target.capacity) {
        const alternatives = fullState.sections.filter(
          (s) =>
            s.courseCode === target.courseCode &&
            s.id !== target.id &&
            s.enrolled < s.capacity
        );
        return {
          ok: false,
          status: 409,
          modal: 'section_full',
          payload: {
            fullSection: target,
            alternatives
          }
        };
      }

      await client.query(
        'DELETE FROM staged_sections WHERE student_id = $1 AND course_code = $2',
        [studentId, target.courseCode]
      );
      await client.query(
        'INSERT INTO staged_sections (student_id, section_id, course_code, added_at) VALUES ($1, $2, $3, $4)',
        [studentId, sectionId, target.courseCode, Date.now()]
      );
      await this.insertAuditLogPg(
        client,
        fullState.student.name,
        'Section Staged',
        `Staged ${target.courseCode} Sec ${target.sectionNumber} (${target.timeSlot})`,
        'teal'
      );

      const nextState = await this.loadStateFromClient(client, studentId);
      return { ok: true, status: 200, state: nextState };
    });

    if (outcome.ok) {
      this.notifySubscribers(outcome.state);
    }
    return outcome;
  }

  public async unstageSectionTx(
    studentId: string,
    sectionId: string
  ): Promise<{ ok: boolean; status: number; state: BackendState; message?: string }> {
    if (!isPostgresEnabled()) {
      return this.withSectionLock(`cart:${studentId}`, () =>
        this.withSectionLock(sectionId, async () => {
          const target = this.state.sections.find((s) => s.id === sectionId);
          const studentMeta = this.resolveMemoryStudentMeta(studentId);
          this.updateState((s) => {
            s.stagedSectionIds = s.stagedSectionIds.filter((id) => id !== sectionId);
          });
          this.addAuditLog(
            studentMeta.name,
            'Section Removed',
            `Removed ${target?.courseCode || sectionId} from draft plan.`,
            'amber'
          );
          return { ok: true, status: 200, state: this.getState() };
        })
      );
    }

    const nextState = await withTransaction(async (client) => {
      await client.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [studentId]);
      const secRes = await client.query('SELECT course_code FROM course_sections WHERE id = $1', [
        sectionId
      ]);
      const stuRes = await client.query('SELECT name FROM students WHERE id = $1', [studentId]);
      const courseCode = secRes.rows[0]?.course_code ?? sectionId;
      const studentName = stuRes.rows[0]?.name ?? studentId;

      await client.query(
        'DELETE FROM staged_sections WHERE student_id = $1 AND section_id = $2',
        [studentId, sectionId]
      );
      await this.insertAuditLogPg(
        client,
        String(studentName),
        'Section Removed',
        `Removed ${courseCode} from draft plan.`,
        'amber'
      );
      return this.loadStateFromClient(client, studentId);
    });

    this.notifySubscribers(nextState);
    return { ok: true, status: 200, state: nextState };
  }

  /**
   * Internal memory-mode enrollment confirmation helper.
   * Caller MUST already hold `cart:${studentId}` and sorted locks for all stagedSectionIds.
   */
  private async confirmEnrollmentInMemoryLocked(
    studentId: string,
    options?: { simulateRdsFailure?: boolean }
  ): Promise<ConfirmEnrollmentOutcome> {
    const stagedIds = [...this.state.stagedSectionIds];
    if (stagedIds.length === 0) {
      return {
        ok: false,
        status: 400,
        message: 'No staged sections in cart to confirm.',
        state: this.getState()
      };
    }

    const student = this.state.student;
    const studentMeta = this.resolveMemoryStudentMeta(studentId);
    const stagedSections = stagedIds
      .map((id) => this.state.sections.find((s) => s.id === id))
      .filter((s): s is CourseSection => Boolean(s));

    const clashes = detectScheduleClashes(stagedSections);
    if (clashes.length > 0) {
      return {
        ok: false,
        status: 409,
        message: `Schedule clash detected between ${clashes[0].sectionA.id} and ${clashes[0].sectionB.id}.`,
        state: this.getState()
      };
    }

    const totalCredits = stagedSections.reduce((sum, s) => sum + s.credits, 0);
    const maxCredits = student.maxCredits ?? 15.0;
    if (totalCredits > maxCredits) {
      return {
        ok: false,
        status: 409,
        message: `Total credits (${totalCredits}) exceeds allowed maximum (${maxCredits}).`,
        state: this.getState()
      };
    }

    const studentEnrollments = this.enrollments.get(studentMeta.id) ?? new Set<string>();

    if (options?.simulateRdsFailure) {
      const failedSec = stagedSections[0];
      const alternatives = this.state.sections.filter(
        (s) =>
          s.courseCode === failedSec.courseCode &&
          s.id !== failedSec.id &&
          s.enrolled < s.capacity
      );
      const prompt: RdsFallbackPrompt = {
        id: `fb-${crypto.randomUUID().slice(0, 8)}`,
        failedSectionId: failedSec.id,
        failedCourseCode: failedSec.courseCode,
        reason: `RDS remote lock collision on ${failedSec.id}. Select a DAG-compliant alternative.`,
        alternatives: deepClone(alternatives),
        createdAt: new Date().toISOString(),
        resolved: false
      };

      const { transactionId, digitalSignature } = generateReceiptTokens(
        studentMeta.id,
        studentMeta.cartToken,
        stagedIds
      );
      const receipt: ScheduleReceipt = {
        transactionId,
        studentId: studentMeta.id,
        cartToken: studentMeta.cartToken,
        timestamp: new Date().toLocaleString(),
        totalCredits,
        sections: deepClone(stagedSections),
        digitalSignature,
        status: 'fallback_required',
        source: 'api'
      };

      this.state.rdsFallbackPrompt = prompt;
      this.state.receipt = receipt;
      this.addAuditLog(
        'RDS Sync Engine',
        'RDS Fallback Triggered',
        `RDS push failed for ${failedSec.id}; generated 1-click fallback prompt with ${alternatives.length} alternative(s).`,
        'amber'
      );

      const notifs = await notifierService.notifyRdsFallback(
        studentMeta.id,
        failedSec.id,
        failedSec.courseCode,
        alternatives.length
      );
      this.state.notifications = [...notifs, ...(this.state.notifications ?? [])];
      this.notifySubscribers();

      return {
        ok: true,
        status: 200,
        receipt: deepClone(receipt),
        fallbackPrompt: deepClone(prompt),
        state: this.getState()
      };
    }

    // Strict ACID capacity guard — NO silent Math.min clamping!
    for (const sec of stagedSections) {
      if (!studentEnrollments.has(sec.id) && sec.enrolled >= sec.capacity) {
        return {
          ok: false,
          status: 409,
          message: `Section ${sec.id} (${sec.courseCode}) is full (${sec.enrolled}/${sec.capacity}). Transaction rolled back.`,
          state: this.getState()
        };
      }
    }

    let receipt!: ScheduleReceipt;
    await this.withMemoryTransaction(() => {
      for (const sec of this.state.sections) {
        if (stagedIds.includes(sec.id) && !studentEnrollments.has(sec.id)) {
          sec.enrolled += 1;
          studentEnrollments.add(sec.id);
        }
      }
      this.enrollments.set(studentMeta.id, studentEnrollments);

      const updatedSections = stagedIds
        .map((id) => this.state.sections.find((s) => s.id === id))
        .filter((s): s is CourseSection => Boolean(s));

      const { transactionId, digitalSignature } = generateReceiptTokens(
        studentMeta.id,
        studentMeta.cartToken,
        stagedIds
      );

      receipt = {
        transactionId,
        studentId: studentMeta.id,
        cartToken: studentMeta.cartToken,
        timestamp: new Date().toLocaleString(),
        totalCredits,
        sections: deepClone(updatedSections),
        digitalSignature,
        status: 'confirmed',
        source: 'api'
      };

      this.state.receipt = receipt;
      this.state.rdsFallbackPrompt = null;
      this.syncZeroSeatEscalationsInMemory();
    });

    const notifs = await notifierService.notifyEnrollmentConfirmed(
      studentMeta.id,
      receipt.transactionId,
      totalCredits
    );
    this.state.notifications = [...notifs, ...(this.state.notifications ?? [])];
    this.addAuditLog(
      studentMeta.name,
      'RDS Enrollment Locked',
      `Schedule locked with ${totalCredits} Cr. Generated ${receipt.transactionId}`,
      'emerald'
    );

    return {
      ok: true,
      status: 200,
      receipt: deepClone(receipt),
      state: this.getState()
    };
  }

  /**
   * Internal PostgreSQL enrollment confirmation helper.
   * Executes inside caller's active PoolClient transaction.
   */
  private async confirmEnrollmentWithClient(
    client: PoolClient,
    studentId: string,
    options?: { simulateRdsFailure?: boolean }
  ): Promise<ConfirmEnrollmentOutcome> {
    const stuRes = await client.query('SELECT * FROM students WHERE id = $1 FOR UPDATE', [
      studentId
    ]);
    const student = this.mapStudentRow(stuRes.rows[0]);

    const stagedRes = await client.query(
      'SELECT section_id FROM staged_sections WHERE student_id = $1 ORDER BY section_id ASC',
      [studentId]
    );
    const stagedIds = stagedRes.rows.map((r) => String(r.section_id));
    if (stagedIds.length === 0) {
      const state = await this.loadStateFromClient(client, studentId);
      return {
        ok: false,
        status: 400,
        message: 'No staged sections in cart to confirm.',
        state
      };
    }

    // Deterministic sorted row-level lock
    const secRes = await client.query(
      'SELECT * FROM course_sections WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE',
      [stagedIds]
    );
    const stagedSections = secRes.rows.map((r) => this.mapSectionRow(r));

    const clashes = detectScheduleClashes(stagedSections);
    if (clashes.length > 0) {
      const state = await this.loadStateFromClient(client, studentId);
      return {
        ok: false,
        status: 409,
        message: `Schedule clash detected between ${clashes[0].sectionA.id} and ${clashes[0].sectionB.id}.`,
        state
      };
    }

    const totalCredits = stagedSections.reduce((sum, s) => sum + s.credits, 0);
    const maxCredits = student.maxCredits ?? 15.0;
    if (totalCredits > maxCredits) {
      const state = await this.loadStateFromClient(client, studentId);
      return {
        ok: false,
        status: 409,
        message: `Total credits (${totalCredits}) exceeds allowed maximum (${maxCredits}).`,
        state
      };
    }

    const existingEnrollRes = await client.query(
      'SELECT section_id FROM enrollments WHERE student_id = $1',
      [studentId]
    );
    const alreadyEnrolled = new Set(existingEnrollRes.rows.map((r) => String(r.section_id)));

    if (options?.simulateRdsFailure) {
      const failedSec = stagedSections[0];
      const altRes = await client.query(
        'SELECT * FROM course_sections WHERE course_code = $1 AND id <> $2 AND enrolled < capacity ORDER BY id ASC',
        [failedSec.courseCode, failedSec.id]
      );
      const alternatives = altRes.rows.map((r) => this.mapSectionRow(r));
      const promptId = `fb-${crypto.randomUUID().slice(0, 8)}`;
      const createdAt = new Date().toISOString();

      await client.query(
        `INSERT INTO rds_fallback_prompts (
          id, student_id, failed_section_id, failed_course_code, reason, alternatives, resolved, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, $7)`,
        [
          promptId,
          studentId,
          failedSec.id,
          failedSec.courseCode,
          `RDS remote lock collision on ${failedSec.id}. Select a DAG-compliant alternative.`,
          JSON.stringify(alternatives),
          createdAt
        ]
      );

      const { transactionId, digitalSignature } = generateReceiptTokens(
        student.id,
        student.cartToken,
        stagedIds
      );
      const ts = new Date().toLocaleString();
      await client.query(
        `INSERT INTO schedule_receipts (
          transaction_id, student_id, cart_token, timestamp, total_credits, sections, digital_signature, status, source
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'fallback_required', 'api')`,
        [
          transactionId,
          student.id,
          student.cartToken,
          ts,
          totalCredits,
          JSON.stringify(stagedSections),
          digitalSignature
        ]
      );

      await this.insertAuditLogPg(
        client,
        'RDS Sync Engine',
        'RDS Fallback Triggered',
        `RDS push failed for ${failedSec.id}; generated 1-click fallback prompt.`,
        'amber'
      );

      const notifs = await notifierService.notifyRdsFallback(
        student.id,
        failedSec.id,
        failedSec.courseCode,
        alternatives.length
      );
      for (const n of notifs) {
        await this.insertNotificationPg(client, n);
      }

      const state = await this.loadStateFromClient(client, studentId);
      return {
        ok: true,
        status: 200,
        receipt: state.receipt!,
        fallbackPrompt: state.rdsFallbackPrompt ?? undefined,
        state
      };
    }

    for (const sec of stagedSections) {
      if (!alreadyEnrolled.has(sec.id) && sec.enrolled >= sec.capacity) {
        const state = await this.loadStateFromClient(client, studentId);
        return {
          ok: false,
          status: 409,
          message: `Section ${sec.id} (${sec.courseCode}) is full (${sec.enrolled}/${sec.capacity}). Transaction rolled back.`,
          state
        };
      }
    }

    const { transactionId, digitalSignature } = generateReceiptTokens(
      student.id,
      student.cartToken,
      stagedIds
    );

    for (const sec of stagedSections) {
      if (!alreadyEnrolled.has(sec.id)) {
        await client.query(
          'UPDATE course_sections SET enrolled = enrolled + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [sec.id]
        );
        await client.query(
          'INSERT INTO enrollments (student_id, section_id, transaction_id) VALUES ($1, $2, $3) ON CONFLICT (student_id, section_id) DO NOTHING',
          [studentId, sec.id, transactionId]
        );
        sec.enrolled += 1;
      }
    }

    const ts = new Date().toLocaleString();
    await client.query(
      `INSERT INTO schedule_receipts (
        transaction_id, student_id, cart_token, timestamp, total_credits, sections, digital_signature, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'confirmed', 'api')`,
      [
        transactionId,
        student.id,
        student.cartToken,
        ts,
        totalCredits,
        JSON.stringify(stagedSections),
        digitalSignature
      ]
    );

    await this.syncZeroSeatEscalationsPg(client);
    await this.insertAuditLogPg(
      client,
      student.name,
      'RDS Enrollment Locked',
      `Schedule locked with ${totalCredits} Cr. Generated ${transactionId}`,
      'emerald'
    );

    const notifs = await notifierService.notifyEnrollmentConfirmed(
      student.id,
      transactionId,
      totalCredits
    );
    for (const n of notifs) {
      await this.insertNotificationPg(client, n);
    }

    const state = await this.loadStateFromClient(client, studentId);
    return {
      ok: true,
      status: 200,
      receipt: state.receipt!,
      state
    };
  }

  public async confirmEnrollmentTx(
    studentId: string,
    options?: { simulateRdsFailure?: boolean }
  ): Promise<ConfirmEnrollmentOutcome> {
    if (!isPostgresEnabled()) {
      return this.withSectionLock(`cart:${studentId}`, async () => {
        const stagedIds = [...this.state.stagedSectionIds];
        if (stagedIds.length === 0) {
          return {
            ok: false,
            status: 400,
            message: 'No staged sections in cart to confirm.',
            state: this.getState()
          };
        }

        return this.withSectionLocks(stagedIds, () =>
          this.confirmEnrollmentInMemoryLocked(studentId, options)
        );
      });
    }

    const result = await withTransaction<ConfirmEnrollmentOutcome>((client) =>
      this.confirmEnrollmentWithClient(client, studentId, options)
    );

    if (result.ok) {
      this.notifySubscribers(result.state);
    }
    return result;
  }

  public async joinWaitlistTx(
    studentId: string,
    sectionId: string
  ): Promise<{
    ok: boolean;
    status: number;
    position?: number;
    entry?: WaitlistEntry;
    state: BackendState;
    message?: string;
  }> {
    if (!isPostgresEnabled()) {
      return this.withSectionLock(sectionId, async () => {
        const target = this.state.sections.find((s) => s.id === sectionId);
        if (!target) {
          return { ok: false, status: 404, message: 'Section not found', state: this.getState() };
        }

        const existing = (this.state.waitlistEntries ?? []).find(
          (w) => w.studentId === studentId && w.sectionId === sectionId && w.status !== 'cancelled'
        );
        if (existing) {
          return {
            ok: true,
            status: 200,
            position: existing.position,
            entry: deepClone(existing),
            state: this.getState()
          };
        }

        const position = target.waitlisted + 1;
        target.waitlisted = position;
        const entry: WaitlistEntry = {
          id: `wl-${crypto.randomUUID().slice(0, 8)}`,
          studentId,
          sectionId,
          courseCode: target.courseCode,
          position,
          createdAt: new Date().toISOString(),
          status: 'waiting'
        };
        this.state.waitlistEntries = [...(this.state.waitlistEntries ?? []), entry];
        this.state.waitlistSectionIds = [
          ...new Set([...(this.state.waitlistSectionIds ?? []), sectionId])
        ];

        const notifs = await notifierService.notifyWaitlistJoined(studentId, target, position);
        this.state.notifications = [...notifs, ...(this.state.notifications ?? [])];
        const studentMeta = this.resolveMemoryStudentMeta(studentId);
        this.addAuditLog(
          studentMeta.name,
          'Waitlist Joined',
          `Joined waitlist for ${target.courseCode} Sec ${target.sectionNumber} at position #${position}.`,
          'teal'
        );

        return {
          ok: true,
          status: 200,
          position,
          entry: deepClone(entry),
          state: this.getState()
        };
      });
    }

    const res = await withTransaction(async (client) => {
      const secRes = await client.query(
        'SELECT * FROM course_sections WHERE id = $1 FOR UPDATE',
        [sectionId]
      );
      if (secRes.rows.length === 0) {
        const state = await this.loadStateFromClient(client, studentId);
        return { ok: false, status: 404, message: 'Section not found', state };
      }
      const target = this.mapSectionRow(secRes.rows[0]);

      const existingRes = await client.query(
        'SELECT * FROM waitlist_entries WHERE student_id = $1 AND section_id = $2',
        [studentId, sectionId]
      );
      if (existingRes.rows.length > 0) {
        const row = existingRes.rows[0];
        const state = await this.loadStateFromClient(client, studentId);
        return {
          ok: true,
          status: 200,
          position: Number(row.position),
          entry: {
            id: String(row.id),
            studentId: String(row.student_id),
            sectionId: String(row.section_id),
            courseCode: String(row.course_code),
            position: Number(row.position),
            createdAt: String(row.created_at),
            status: row.status as WaitlistEntry['status']
          },
          state
        };
      }

      const position = target.waitlisted + 1;
      const wlId = `wl-${crypto.randomUUID().slice(0, 8)}`;
      await client.query(
        'UPDATE course_sections SET waitlisted = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [position, sectionId]
      );
      await client.query(
        `INSERT INTO waitlist_entries (id, student_id, section_id, course_code, position, status)
         VALUES ($1, $2, $3, $4, $5, 'waiting')`,
        [wlId, studentId, sectionId, target.courseCode, position]
      );

      const notifs = await notifierService.notifyWaitlistJoined(studentId, target, position);
      for (const n of notifs) {
        await this.insertNotificationPg(client, n);
      }

      const stuRes = await client.query('SELECT name FROM students WHERE id = $1', [studentId]);
      const studentName = String(stuRes.rows[0]?.name ?? studentId);
      await this.insertAuditLogPg(
        client,
        studentName,
        'Waitlist Joined',
        `Joined waitlist for ${target.courseCode} Sec ${target.sectionNumber} at position #${position}.`,
        'teal'
      );

      const state = await this.loadStateFromClient(client, studentId);
      const entry = (state.waitlistEntries ?? []).find((w) => w.id === wlId);
      return { ok: true, status: 200, position, entry, state };
    });

    if (res.ok) {
      this.notifySubscribers(res.state);
    }
    return res;
  }

  public async submitPetitionTx(
    studentId: string,
    payload: { sectionId?: string; courseCode: string; ruleCode: string; reason: string }
  ): Promise<{ ok: boolean; status: number; exceptionCase: ExceptionCase; state: BackendState }> {
    const category: ExceptionCase['category'] =
      payload.ruleCode === 'RULE-2.1'
        ? 'Prereqs'
        : payload.ruleCode === 'RULE-8.4'
          ? 'Capacity'
          : 'Credit Standing';

    if (!isPostgresEnabled()) {
      const stu = this.state.student;
      const studentMeta = this.resolveMemoryStudentMeta(studentId);
      const sec =
        (payload.sectionId
          ? this.state.sections.find((s) => s.id === payload.sectionId)
          : undefined) ??
        this.state.sections.find(
          (s) => normalizeCourseCode(s.courseCode) === normalizeCourseCode(payload.courseCode)
        );

      const caseId = `CASE #EX-2025-${Math.floor(1000 + Math.random() * 9000)}`;
      const newCase: ExceptionCase = {
        id: caseId,
        studentId: studentMeta.id,
        studentName: studentMeta.name,
        program: 'B.Sc CSE',
        standing: stu.standing,
        cgpa: stu.cgpa,
        creditsCompleted: stu.creditsCompleted,
        courseCode: sec?.courseCode ?? payload.courseCode,
        courseTitle: sec?.courseTitle ?? payload.courseCode,
        sectionNumber: sec?.sectionNumber ?? '01',
        sectionId: sec?.id ?? payload.sectionId,
        ruleCode: payload.ruleCode,
        category,
        submittedAt: `Today, ${nowTimeStr()}`,
        status: 'pending',
        statement: payload.reason,
        auditChecks: [
          {
            rule: `${payload.ruleCode} Petition`,
            description: `Submitted for ${sec?.courseCode ?? payload.courseCode}`,
            passed: true,
            notes: 'Awaiting faculty advisor decision'
          }
        ]
      };

      this.updateState((s) => {
        s.exceptions = [newCase, ...s.exceptions];
      });
      this.addAuditLog(
        studentMeta.name,
        'Exception Petition Submitted',
        `${caseId} submitted for ${newCase.courseCode} (${payload.ruleCode}).`,
        'amber'
      );

      return { ok: true, status: 201, exceptionCase: deepClone(newCase), state: this.getState() };
    }

    const result = await withTransaction(async (client) => {
      const stuRes = await client.query('SELECT * FROM students WHERE id = $1', [studentId]);
      const stu = this.mapStudentRow(stuRes.rows[0]);
      const secRes = payload.sectionId
        ? await client.query('SELECT * FROM course_sections WHERE id = $1', [payload.sectionId])
        : await client.query('SELECT * FROM course_sections WHERE course_code = $1 LIMIT 1', [
            payload.courseCode
          ]);
      const sec = secRes.rows[0] ? this.mapSectionRow(secRes.rows[0]) : undefined;

      const caseId = `CASE #EX-2025-${Math.floor(1000 + Math.random() * 9000)}`;
      const auditChecks = [
        {
          rule: `${payload.ruleCode} Petition`,
          description: `Submitted for ${sec?.courseCode ?? payload.courseCode}`,
          passed: true,
          notes: 'Awaiting faculty advisor decision'
        }
      ];
      const submittedAt = `Today, ${nowTimeStr()}`;

      await client.query(
        `INSERT INTO exception_cases (
          id, student_id, student_name, program, standing, cgpa, credits_completed,
          course_code, course_title, section_number, category, submitted_at, status,
          statement, audit_checks, section_id, rule_code
        ) VALUES ($1, $2, $3, 'B.Sc CSE', $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13::jsonb, $14, $15)`,
        [
          caseId,
          stu.id,
          stu.name,
          stu.standing,
          stu.cgpa,
          stu.creditsCompleted,
          sec?.courseCode ?? payload.courseCode,
          sec?.courseTitle ?? payload.courseCode,
          sec?.sectionNumber ?? '01',
          category,
          submittedAt,
          payload.reason,
          JSON.stringify(auditChecks),
          sec?.id ?? payload.sectionId ?? null,
          payload.ruleCode
        ]
      );

      await this.insertAuditLogPg(
        client,
        stu.name,
        'Exception Petition Submitted',
        `${caseId} submitted for ${sec?.courseCode ?? payload.courseCode} (${payload.ruleCode}).`,
        'amber'
      );

      const state = await this.loadStateFromClient(client, studentId);
      const exceptionCase = state.exceptions.find((e) => e.id === caseId)!;
      return { ok: true, status: 201, exceptionCase, state };
    });

    this.notifySubscribers(result.state);
    return result;
  }

  public async resolveRdsFallbackTx(
    studentId: string,
    failedSectionId: string,
    fallbackSectionId: string
  ): Promise<{
    ok: boolean;
    status: number;
    receipt: ScheduleReceipt | null;
    state: BackendState;
    message?: string;
  }> {
    if (!isPostgresEnabled()) {
      return this.withSectionLock(`cart:${studentId}`, async () => {
        const lockTargets = [
          ...new Set([...this.state.stagedSectionIds, failedSectionId, fallbackSectionId])
        ];
        return this.withSectionLocks(lockTargets, async () => {
          try {
            return await this.withMemoryTransaction(async () => {
              const fallbackSec = this.state.sections.find((s) => s.id === fallbackSectionId);
              if (!fallbackSec) {
                throw new FallbackRollbackSignal({
                  ok: false,
                  status: 404,
                  receipt: null,
                  message: 'Fallback section not found'
                });
              }
              if (fallbackSec.enrolled >= fallbackSec.capacity) {
                throw new FallbackRollbackSignal({
                  ok: false,
                  status: 409,
                  receipt: null,
                  message: `Fallback section ${fallbackSectionId} is full.`
                });
              }

              const nextStaged = this.state.stagedSectionIds.filter(
                (id) => id !== failedSectionId
              );
              if (!nextStaged.includes(fallbackSectionId)) {
                nextStaged.push(fallbackSectionId);
              }
              this.state.stagedSectionIds = nextStaged;

              if (this.state.rdsFallbackPrompt) {
                this.state.rdsFallbackPrompt = {
                  ...this.state.rdsFallbackPrompt,
                  resolved: true,
                  resolvedSectionId: fallbackSectionId
                };
              }

              const confirmed = await this.confirmEnrollmentInMemoryLocked(studentId);
              if (!confirmed.ok) {
                throw new FallbackRollbackSignal({
                  ok: false,
                  status: confirmed.status,
                  receipt: null,
                  message: confirmed.message
                });
              }

              this.state.rdsFallbackPrompt = null;
              this.notifySubscribers();
              return {
                ok: true,
                status: 200,
                receipt: confirmed.receipt,
                state: this.getState()
              };
            });
          } catch (err) {
            if (err instanceof FallbackRollbackSignal) {
              return {
                ...err.outcome,
                state: this.getState()
              };
            }
            throw err;
          }
        });
      });
    }

    try {
      const txOutcome = await withTransaction(async (client) => {
        await client.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [studentId]);
        const stagedRes = await client.query(
          'SELECT section_id FROM staged_sections WHERE student_id = $1 ORDER BY section_id ASC',
          [studentId]
        );
        const lockIds = [
          ...new Set([
            ...stagedRes.rows.map((r) => String(r.section_id)),
            failedSectionId,
            fallbackSectionId
          ])
        ].sort();

        const secRes = await client.query(
          'SELECT * FROM course_sections WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE',
          [lockIds]
        );
        const fallbackRow = secRes.rows.find((r) => String(r.id) === fallbackSectionId);
        if (!fallbackRow) {
          throw new FallbackRollbackSignal({
            ok: false,
            status: 404,
            receipt: null,
            message: 'Fallback section not found'
          });
        }

        const fallbackSec = this.mapSectionRow(fallbackRow);
        if (fallbackSec.enrolled >= fallbackSec.capacity) {
          throw new FallbackRollbackSignal({
            ok: false,
            status: 409,
            receipt: null,
            message: `Fallback section ${fallbackSectionId} is full.`
          });
        }

        await client.query(
          'DELETE FROM staged_sections WHERE student_id = $1 AND section_id = $2',
          [studentId, failedSectionId]
        );
        await client.query(
          `INSERT INTO staged_sections (student_id, section_id, course_code, added_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_id, section_id) DO NOTHING`,
          [studentId, fallbackSectionId, fallbackSec.courseCode, Date.now()]
        );
        await client.query(
          `UPDATE rds_fallback_prompts
           SET resolved = TRUE, resolved_section_id = $2, updated_at = CURRENT_TIMESTAMP
           WHERE student_id = $1 AND failed_section_id = $3 AND resolved = FALSE`,
          [studentId, fallbackSectionId, failedSectionId]
        );

        const confirmed = await this.confirmEnrollmentWithClient(client, studentId);
        if (!confirmed.ok) {
          throw new FallbackRollbackSignal({
            ok: false,
            status: confirmed.status,
            receipt: null,
            message: confirmed.message
          });
        }

        return {
          ok: true,
          status: 200,
          receipt: confirmed.receipt,
          state: confirmed.state
        };
      });

      this.notifySubscribers(txOutcome.state);
      return txOutcome;
    } catch (err) {
      if (err instanceof FallbackRollbackSignal) {
        const cleanState = await this.getStateAsync(studentId);
        return {
          ...err.outcome,
          state: cleanState
        };
      }
      throw err;
    }
  }

  public async decideExceptionTx(
    caseId: string,
    action: 'approve' | 'reject' | 'flag',
    actor: { id: string; name: string; role: UserRole }
  ): Promise<{ ok: boolean; status: number; state: BackendState; message?: string }> {
    if (!isPostgresEnabled()) {
      return this.withSectionLock(`case:${caseId}`, async () => {
        const targetCase = this.state.exceptions.find((e) => e.id === caseId);
        if (!targetCase) {
          return {
            ok: false,
            status: 404,
            message: 'Exception case not found',
            state: this.getState()
          };
        }

        if (targetCase.status === 'approved' || targetCase.status === 'rejected') {
          return {
            ok: false,
            status: 409,
            message: `Exception case ${caseId} has already been finalized (${targetCase.status}).`,
            state: this.getState()
          };
        }

        const targetSection = this.state.sections.find(
          (s) =>
            (targetCase.sectionId && s.id === targetCase.sectionId) ||
            (s.courseCode === targetCase.courseCode &&
              s.sectionNumber === targetCase.sectionNumber)
        );

        const execFn = async () => {
          const freshCase = this.state.exceptions.find((e) => e.id === caseId);
          if (!freshCase) {
            return {
              ok: false,
              status: 404,
              message: 'Exception case not found',
              state: this.getState()
            };
          }
          if (freshCase.status === 'approved' || freshCase.status === 'rejected') {
            return {
              ok: false,
              status: 409,
              message: `Exception case ${caseId} has already been finalized (${freshCase.status}).`,
              state: this.getState()
            };
          }

          if (action === 'approve' && targetSection) {
            const roomCap =
              targetSection.roomCap ?? ROOM_FIRE_CODE_CAPS[targetSection.room] ?? 55;
            if (targetSection.capacity + 1 > roomCap) {
              return {
                ok: false,
                status: 422,
                message: `Room ${targetSection.room} fire-code limit (${roomCap}) reached.`,
                state: this.getState()
              };
            }
          }

          const newStatus: ExceptionCase['status'] =
            action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged';
          const decisionTime = nowTimeStr();

          let updatedCase!: ExceptionCase;
          await this.withMemoryTransaction(() => {
            this.state.exceptions = this.state.exceptions.map((c) => {
              if (c.id === caseId) {
                updatedCase = {
                  ...c,
                  status: newStatus,
                  facultyDecisionBy: actor.name,
                  facultyDecisionAt: decisionTime
                };
                return updatedCase;
              }
              return c;
            });

            if (action === 'approve' && targetSection) {
              targetSection.capacity += 1;
              targetSection.enrolled += 1;
              const set = this.enrollments.get(freshCase.studentId) ?? new Set<string>();
              set.add(targetSection.id);
              this.enrollments.set(freshCase.studentId, set);
            }
          });

          const notifs = await notifierService.notifyPetitionDecision(updatedCase);
          this.state.notifications = [...notifs, ...(this.state.notifications ?? [])];

          if (action === 'approve') {
            this.addAuditLog(
              `${actor.name} (${actor.role})`,
              'Exception Approved & Enrolled',
              `${caseId} for ${freshCase.studentName} (${freshCase.courseCode} Sec ${freshCase.sectionNumber}) approved.`,
              'emerald'
            );
          } else if (action === 'reject') {
            this.addAuditLog(
              `${actor.name} (${actor.role})`,
              'Exception Rejected',
              `${caseId} declined due to curriculum track guidelines.`,
              'crimson'
            );
          } else {
            this.addAuditLog(
              `${actor.name} (${actor.role})`,
              'Flagged for In-Person Advising',
              `${caseId} routed to Faculty Consultation.`,
              'amber'
            );
          }

          return { ok: true, status: 200, state: this.getState() };
        };

        return targetSection ? this.withSectionLock(targetSection.id, execFn) : execFn();
      });
    }

    const res = await withTransaction(async (client) => {
      const caseRes = await client.query(
        'SELECT * FROM exception_cases WHERE id = $1 FOR UPDATE',
        [caseId]
      );
      if (caseRes.rows.length === 0) {
        const state = await this.loadStateFromClient(client);
        return { ok: false, status: 404, message: 'Exception case not found', state };
      }
      const targetCase = this.mapExceptionRow(caseRes.rows[0]);
      if (targetCase.status === 'approved' || targetCase.status === 'rejected') {
        const state = await this.loadStateFromClient(client);
        return {
          ok: false,
          status: 409,
          message: `Exception case ${caseId} has already been finalized (${targetCase.status}).`,
          state
        };
      }

      const secRes = targetCase.sectionId
        ? await client.query('SELECT * FROM course_sections WHERE id = $1 FOR UPDATE', [
            targetCase.sectionId
          ])
        : await client.query(
            'SELECT * FROM course_sections WHERE course_code = $1 AND section_number = $2 FOR UPDATE',
            [targetCase.courseCode, targetCase.sectionNumber]
          );
      const targetSection = secRes.rows[0] ? this.mapSectionRow(secRes.rows[0]) : undefined;

      if (action === 'approve' && targetSection) {
        const roomCap = targetSection.roomCap ?? ROOM_FIRE_CODE_CAPS[targetSection.room] ?? 55;
        if (targetSection.capacity + 1 > roomCap) {
          const state = await this.loadStateFromClient(client);
          return {
            ok: false,
            status: 422,
            message: `Room ${targetSection.room} fire-code limit (${roomCap}) reached.`,
            state
          };
        }
      }

      const newStatus: ExceptionCase['status'] =
        action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged';
      const decisionTime = nowTimeStr();

      await client.query(
        `UPDATE exception_cases
         SET status = $2, faculty_decision_by = $3, faculty_decision_at = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [caseId, newStatus, actor.name, decisionTime]
      );

      if (action === 'approve' && targetSection) {
        await client.query(
          `UPDATE course_sections
           SET capacity = capacity + 1, enrolled = enrolled + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [targetSection.id]
        );
        await client.query(
          `INSERT INTO enrollments (student_id, section_id, transaction_id)
           VALUES ($1, $2, $3) ON CONFLICT (student_id, section_id) DO NOTHING`,
          [targetCase.studentId, targetSection.id, `EXC-${caseId}`]
        );
      }

      const updatedCase: ExceptionCase = {
        ...targetCase,
        status: newStatus,
        facultyDecisionBy: actor.name,
        facultyDecisionAt: decisionTime
      };
      const notifs = await notifierService.notifyPetitionDecision(updatedCase);
      for (const n of notifs) {
        await this.insertNotificationPg(client, n);
      }

      await this.insertAuditLogPg(
        client,
        `${actor.name} (${actor.role})`,
        action === 'approve'
          ? 'Exception Approved & Enrolled'
          : action === 'reject'
            ? 'Exception Rejected'
            : 'Flagged for In-Person Advising',
        `${caseId} (${targetCase.courseCode} Sec ${targetCase.sectionNumber}) marked ${newStatus}.`,
        action === 'approve' ? 'emerald' : action === 'reject' ? 'crimson' : 'amber'
      );

      const state = await this.loadStateFromClient(client);
      return { ok: true, status: 200, state };
    });

    if (res.ok) {
      this.notifySubscribers(res.state);
    }
    return res;
  }

  public async expandSectionCapacityTx(
    sectionId: string,
    delta: number,
    actor: {
      id: string;
      name: string;
      role: UserRole;
      email?: string;
      instructorName?: string | null;
    }
  ): Promise<{ ok: boolean; status: number; state: BackendState; message?: string }> {
    const authActor = {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      email: actor.email ?? '',
      instructorName: actor.instructorName ?? undefined
    };

    if (!isPostgresEnabled()) {
      return this.withSectionLock(sectionId, async () => {
        const target = this.state.sections.find((s) => s.id === sectionId);
        if (!target) {
          return { ok: false, status: 404, message: 'Section not found', state: this.getState() };
        }

        if (!canManageSection(authActor, target)) {
          return {
            ok: false,
            status: 403,
            message: `Forbidden: ${actor.name} does not own section ${sectionId}.`,
            state: this.getState()
          };
        }

        const roomCheck = checkRoomCapacity(target, delta, this.state.bypassRules, true);
        if (!roomCheck.passed) {
          return {
            ok: false,
            status: 422,
            message: roomCheck.reason ?? 'Exceeds physical room fire-code limit.',
            state: this.getState()
          };
        }

        const wasFull = target.enrolled >= target.capacity;
        target.capacity += delta;
        this.syncZeroSeatEscalationsInMemory();

        if (wasFull && target.enrolled < target.capacity) {
          const waitlistedIds = (this.state.waitlistEntries ?? [])
            .filter((w) => w.sectionId === sectionId && w.status === 'waiting')
            .map((w) => w.studentId);
          if (waitlistedIds.length > 0) {
            const notifs = await notifierService.notifySeatOpened(target, waitlistedIds);
            this.state.notifications = [...notifs, ...(this.state.notifications ?? [])];
          }
        }

        this.addAuditLog(
          `${actor.name} (${actor.role})`,
          'Capacity Expanded',
          `Expanded ${target.courseCode} Sec ${target.sectionNumber} capacity by +${delta} seats (Room cap: ${roomCheck.maxRoomCapacity}).`,
          'emerald'
        );

        return { ok: true, status: 200, state: this.getState() };
      });
    }

    const res = await withTransaction(async (client) => {
      const secRes = await client.query(
        'SELECT * FROM course_sections WHERE id = $1 FOR UPDATE',
        [sectionId]
      );
      if (secRes.rows.length === 0) {
        const state = await this.loadStateFromClient(client);
        return { ok: false, status: 404, message: 'Section not found', state };
      }

      const target = this.mapSectionRow(secRes.rows[0]);
      if (!canManageSection(authActor, target)) {
        const state = await this.loadStateFromClient(client);
        return {
          ok: false,
          status: 403,
          message: `Forbidden: ${actor.name} does not own section ${sectionId}.`,
          state
        };
      }

      const rulesRes = await client.query('SELECT * FROM bypass_rules');
      const bypassRules: BypassRule[] = rulesRes.rows.map((r) => ({
        id: String(r.id),
        code: String(r.code),
        title: String(r.title),
        description: String(r.description),
        category: r.category as BypassRule['category'],
        enabled: Boolean(r.enabled),
        lastUpdated: String(r.last_updated)
      }));

      const roomCheck = checkRoomCapacity(target, delta, bypassRules, true);
      if (!roomCheck.passed) {
        const state = await this.loadStateFromClient(client);
        return {
          ok: false,
          status: 422,
          message: roomCheck.reason ?? 'Exceeds physical room fire-code limit.',
          state
        };
      }

      const wasFull = target.enrolled >= target.capacity;
      await client.query(
        'UPDATE course_sections SET capacity = capacity + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [sectionId, delta]
      );
      target.capacity += delta;

      await this.syncZeroSeatEscalationsPg(client);

      if (wasFull && target.enrolled < target.capacity) {
        const wlRes = await client.query(
          "SELECT student_id FROM waitlist_entries WHERE section_id = $1 AND status = 'waiting'",
          [sectionId]
        );
        const waitlistedIds = wlRes.rows.map((r) => String(r.student_id));
        if (waitlistedIds.length > 0) {
          const notifs = await notifierService.notifySeatOpened(target, waitlistedIds);
          for (const n of notifs) {
            await this.insertNotificationPg(client, n);
          }
        }
      }

      await this.insertAuditLogPg(
        client,
        `${actor.name} (${actor.role})`,
        'Capacity Expanded',
        `Expanded ${target.courseCode} Sec ${target.sectionNumber} capacity by +${delta} seats (Room cap: ${roomCheck.maxRoomCapacity}).`,
        'emerald'
      );

      const state = await this.loadStateFromClient(client);
      return { ok: true, status: 200, state };
    });

    if (res.ok) {
      this.notifySubscribers(res.state);
    }
    return res;
  }

  private async autoApproveMatchingExceptionsInMemory(
    rule: BypassRule,
    actorName: string
  ): Promise<number> {
    if (!rule.enabled) return 0;
    let count = 0;
    const now = nowTimeStr();

    for (const ex of this.state.exceptions) {
      if (ex.status === 'pending' && ruleMatchesException(rule, ex)) {
        ex.status = 'approved';
        ex.facultyDecisionBy = `${actorName} (${rule.code} Auto-Approve)`;
        ex.facultyDecisionAt = now;
        count += 1;
        const notifs = await notifierService.notifyPetitionDecision(ex);
        this.state.notifications = [...notifs, ...(this.state.notifications ?? [])];
      }
    }

    return count;
  }

  public async createBypassRuleTx(
    ruleInput: Omit<BypassRule, 'id' | 'lastUpdated'>,
    actorName: string
  ): Promise<{
    ok: boolean;
    status: number;
    rule: BypassRule;
    autoApprovedCount: number;
    state: BackendState;
  }> {
    const newRule: BypassRule = {
      id: ruleInput.code.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      code: ruleInput.code,
      title: ruleInput.title,
      description: ruleInput.description,
      category: ruleInput.category,
      enabled: ruleInput.enabled,
      lastUpdated: `${actorName} • ${nowTimeStr()}`
    };

    if (!isPostgresEnabled()) {
      const existingIdx = this.state.bypassRules.findIndex(
        (r) => r.id === newRule.id || r.code.toUpperCase() === newRule.code.toUpperCase()
      );
      if (existingIdx >= 0) {
        const existingRule = this.state.bypassRules[existingIdx];
        newRule.id = existingRule.id;
        this.state.bypassRules = this.state.bypassRules.map((r, idx) =>
          idx === existingIdx ? newRule : r
        );
      } else {
        this.state.bypassRules = [...this.state.bypassRules, newRule];
      }
      const autoApprovedCount = await this.autoApproveMatchingExceptionsInMemory(
        newRule,
        actorName
      );
      this.addAuditLog(
        actorName,
        existingIdx >= 0 ? 'Bypass Rule Updated' : 'Bypass Rule Created',
        `${existingIdx >= 0 ? 'Updated' : 'Created'} ${newRule.code} (${newRule.title}). Auto-approved ${autoApprovedCount} matching petition(s).`,
        'emerald'
      );
      return {
        ok: true,
        status: 201,
        rule: deepClone(newRule),
        autoApprovedCount,
        state: this.getState()
      };
    }

    const res = await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO bypass_rules (id, code, title, description, category, enabled, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           enabled = EXCLUDED.enabled,
           last_updated = EXCLUDED.last_updated`,
        [
          newRule.id,
          newRule.code,
          newRule.title,
          newRule.description,
          newRule.category,
          newRule.enabled,
          newRule.lastUpdated
        ]
      );

      let autoApprovedCount = 0;
      if (newRule.enabled) {
        const pendingRes = await client.query(
          "SELECT * FROM exception_cases WHERE status = 'pending' FOR UPDATE"
        );
        for (const row of pendingRes.rows) {
          const ex = this.mapExceptionRow(row);
          if (ruleMatchesException(newRule, ex)) {
            await client.query(
              `UPDATE exception_cases
               SET status = 'approved', faculty_decision_by = $2, faculty_decision_at = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [ex.id, `${actorName} (${newRule.code} Auto-Approve)`, nowTimeStr()]
            );
            ex.status = 'approved';
            const notifs = await notifierService.notifyPetitionDecision(ex);
            for (const n of notifs) {
              await this.insertNotificationPg(client, n);
            }
            autoApprovedCount += 1;
          }
        }
      }

      await this.insertAuditLogPg(
        client,
        actorName,
        'Bypass Rule Created',
        `Created ${newRule.code} (${newRule.title}). Auto-approved ${autoApprovedCount} matching petition(s).`,
        'emerald'
      );

      const state = await this.loadStateFromClient(client);
      return { ok: true, status: 201, rule: newRule, autoApprovedCount, state };
    });

    this.notifySubscribers(res.state);
    return res;
  }

  public async toggleBypassRuleTx(
    ruleId: string,
    actorName: string
  ): Promise<{
    ok: boolean;
    status: number;
    autoApprovedCount: number;
    state: BackendState;
    message?: string;
  }> {
    if (!isPostgresEnabled()) {
      const target = this.state.bypassRules.find((r) => r.id === ruleId);
      if (!target) {
        return {
          ok: false,
          status: 404,
          autoApprovedCount: 0,
          message: 'Rule not found',
          state: this.getState()
        };
      }

      target.enabled = !target.enabled;
      target.lastUpdated = `${actorName} • ${nowTimeStr()}`;
      const autoApprovedCount = target.enabled
        ? await this.autoApproveMatchingExceptionsInMemory(target, actorName)
        : 0;

      this.addAuditLog(
        actorName,
        target.enabled ? 'Rule Activated' : 'Rule Suspended',
        `${target.title} was ${target.enabled ? 'enabled' : 'suspended'}.${
          autoApprovedCount > 0 ? ` Auto-approved ${autoApprovedCount} petition(s).` : ''
        }`,
        target.enabled ? 'emerald' : 'amber'
      );

      return { ok: true, status: 200, autoApprovedCount, state: this.getState() };
    }

    const res = await withTransaction(async (client) => {
      const ruleRes = await client.query('SELECT * FROM bypass_rules WHERE id = $1 FOR UPDATE', [
        ruleId
      ]);
      if (ruleRes.rows.length === 0) {
        const state = await this.loadStateFromClient(client);
        return {
          ok: false,
          status: 404,
          autoApprovedCount: 0,
          message: 'Rule not found',
          state
        };
      }

      const row = ruleRes.rows[0];
      const nextEnabled = !Boolean(row.enabled);
      const updatedRule: BypassRule = {
        id: String(row.id),
        code: String(row.code),
        title: String(row.title),
        description: String(row.description),
        category: row.category as BypassRule['category'],
        enabled: nextEnabled,
        lastUpdated: `${actorName} • ${nowTimeStr()}`
      };

      await client.query(
        'UPDATE bypass_rules SET enabled = $2, last_updated = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [ruleId, nextEnabled, updatedRule.lastUpdated]
      );

      let autoApprovedCount = 0;
      if (nextEnabled) {
        const pendingRes = await client.query(
          "SELECT * FROM exception_cases WHERE status = 'pending' FOR UPDATE"
        );
        for (const pRow of pendingRes.rows) {
          const ex = this.mapExceptionRow(pRow);
          if (ruleMatchesException(updatedRule, ex)) {
            await client.query(
              `UPDATE exception_cases
               SET status = 'approved', faculty_decision_by = $2, faculty_decision_at = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [ex.id, `${actorName} (${updatedRule.code} Auto-Approve)`, nowTimeStr()]
            );
            ex.status = 'approved';
            const notifs = await notifierService.notifyPetitionDecision(ex);
            for (const n of notifs) {
              await this.insertNotificationPg(client, n);
            }
            autoApprovedCount += 1;
          }
        }
      }

      await this.insertAuditLogPg(
        client,
        actorName,
        nextEnabled ? 'Rule Activated' : 'Rule Suspended',
        `${updatedRule.title} was ${nextEnabled ? 'enabled' : 'suspended'}.`,
        nextEnabled ? 'emerald' : 'amber'
      );

      const state = await this.loadStateFromClient(client);
      return { ok: true, status: 200, autoApprovedCount, state };
    });

    if (res.ok) {
      this.notifySubscribers(res.state);
    }
    return res;
  }

  public async adminScaleTx(): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      this.updateState((s) => {
        const nextNodes = s.metrics.apiNodes + 2;
        s.metrics = {
          ...s.metrics,
          apiNodes: nextNodes,
          p95LatencyMs: 138,
          requestsPerSec: Math.max(1842, s.metrics.requestsPerSec),
          lastScalingEvent: `Scaled +2 nodes (${nextNodes} active). p95 Latency stabilized to 138 ms.`
        };
      });
      this.addAuditLog(
        'IT Operations Edge Controller',
        'Cluster Auto-Scaled',
        'Provisioned 2 worker instances. P95 latency dropped from 218 ms to 138 ms (SLA <200 ms met).',
        'emerald'
      );
      return this.getState();
    }

    const state = await withTransaction(async (client) => {
      const mRes = await client.query('SELECT * FROM admin_metrics ORDER BY id DESC LIMIT 1');
      const cur = mRes.rows[0];
      const nextNodes = (cur ? Number(cur.api_nodes) : 6) + 2;
      const rps = Math.max(1842, cur ? Number(cur.requests_per_sec) : 1842);
      await client.query(
        `INSERT INTO admin_metrics (
          requests_per_sec, p95_latency_ms, sla_ceiling_ms, error_rate,
          pool_used, pool_total, api_nodes, surge_spike_active, last_scaling_event
        ) VALUES ($1, 138, 200, $2, $3, $4, $5, $6, $7)`,
        [
          rps,
          cur ? Number(cur.error_rate) : 0.08,
          cur ? Number(cur.pool_used) : 156,
          cur ? Number(cur.pool_total) : 200,
          nextNodes,
          cur ? Boolean(cur.surge_spike_active) : false,
          `Scaled +2 nodes (${nextNodes} active). p95 Latency stabilized to 138 ms.`
        ]
      );
      await this.insertAuditLogPg(
        client,
        'IT Operations Edge Controller',
        'Cluster Auto-Scaled',
        'Provisioned 2 worker instances. P95 latency dropped from 218 ms to 138 ms (SLA <200 ms met).',
        'emerald'
      );
      return this.loadStateFromClient(client);
    });
    this.notifySubscribers(state);
    return state;
  }

  public async adminAcknowledgeTx(): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      return this.updateState((s) => {
        s.metrics = {
          ...s.metrics,
          surgeSpikeActive: false,
          lastScalingEvent: 'SEV-1 incident acknowledged by on-call engineer.'
        };
      });
    }

    const state = await withTransaction(async (client) => {
      const mRes = await client.query('SELECT * FROM admin_metrics ORDER BY id DESC LIMIT 1');
      const cur = mRes.rows[0];
      await client.query(
        `INSERT INTO admin_metrics (
          requests_per_sec, p95_latency_ms, sla_ceiling_ms, error_rate,
          pool_used, pool_total, api_nodes, surge_spike_active, last_scaling_event
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)`,
        [
          cur ? Number(cur.requests_per_sec) : 1842,
          cur ? Number(cur.p95_latency_ms) : 218,
          cur ? Number(cur.sla_ceiling_ms) : 200,
          cur ? Number(cur.error_rate) : 0.08,
          cur ? Number(cur.pool_used) : 156,
          cur ? Number(cur.pool_total) : 200,
          cur ? Number(cur.api_nodes) : 6,
          'SEV-1 incident acknowledged by on-call engineer.'
        ]
      );
      return this.loadStateFromClient(client);
    });
    this.notifySubscribers(state);
    return state;
  }

  public async provisionEmergencySectionTx(
    courseCode: string,
    sectionData: Partial<CourseSection> = {}
  ): Promise<BackendState> {
    const newSectionId = `${courseCode.replace(/\s+/g, '')}-05`;
    const room = sectionData.room || 'LIB 608';
    const newSection: CourseSection = {
      id: newSectionId,
      courseCode,
      courseTitle: courseCode === 'CSE 327' ? 'Software Engineering' : 'Course',
      department: 'ECE / CSE',
      credits: 3.0,
      sectionNumber: '05',
      faculty: sectionData.faculty || 'Mr. Tanvir Rahman',
      instructorId: sectionData.instructorId || 'tanvir.rahman',
      days: sectionData.days || 'MW',
      timeSlot: sectionData.timeSlot || '04:20 PM - 05:50 PM',
      room,
      roomCap: sectionData.roomCap ?? ROOM_FIRE_CODE_CAPS[room] ?? 45,
      capacity: 40,
      enrolled: 0,
      waitlisted: 0,
      prerequisites: ['CSE 215'],
      ...sectionData
    };

    if (!isPostgresEnabled()) {
      this.updateState((s) => {
        s.sections = [...s.sections, newSection];
        s.escalations = s.escalations.map((esc) =>
          esc.courseCode === courseCode
            ? {
                ...esc,
                status: 'Mitigated',
                totalCapacity: esc.totalCapacity + newSection.capacity,
                deficit: Math.max(0, esc.deficit - newSection.capacity)
              }
            : esc
        );
      });
      this.addAuditLog(
        'IT Operations Administrator',
        'Emergency Section Provisioned',
        `Created ${courseCode} Sec 05 (${newSection.room}, ${newSection.timeSlot}) with ${newSection.capacity} seats.`,
        'emerald'
      );
      return this.getState();
    }

    const state = await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO course_sections (
          id, course_code, course_title, department, credits, section_number,
          faculty, days, time_slot, room, capacity, enrolled, waitlisted,
          min_credits_required, prerequisites, is_lab, instructor_id, room_capacity, exam_slot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)
        ON CONFLICT (id) DO NOTHING`,
        [
          newSection.id,
          newSection.courseCode,
          newSection.courseTitle,
          newSection.department,
          newSection.credits,
          newSection.sectionNumber,
          newSection.faculty,
          newSection.days,
          newSection.timeSlot,
          newSection.room,
          newSection.capacity,
          newSection.enrolled,
          newSection.waitlisted,
          newSection.minCreditsRequired ?? null,
          JSON.stringify(newSection.prerequisites),
          Boolean(newSection.isLab),
          newSection.instructorId ?? null,
          newSection.roomCap ?? 45,
          newSection.examSlot ?? null
        ]
      );

      await client.query(
        `UPDATE escalations
         SET status = 'Mitigated',
             total_capacity = total_capacity + $2,
             deficit = GREATEST(0, deficit - $2),
             updated_at = CURRENT_TIMESTAMP
         WHERE course_code = $1`,
        [courseCode, newSection.capacity]
      );

      await this.insertAuditLogPg(
        client,
        'IT Operations Administrator',
        'Emergency Section Provisioned',
        `Created ${courseCode} Sec 05 (${newSection.room}, ${newSection.timeSlot}) with ${newSection.capacity} seats.`,
        'emerald'
      );

      return this.loadStateFromClient(client);
    });

    this.notifySubscribers(state);
    return state;
  }

  public async addCourseSeatsTx(courseCode: string, count: number): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      this.updateState((s) => {
        s.sections = s.sections.map((sec) =>
          sec.courseCode === courseCode
            ? { ...sec, capacity: sec.capacity + count }
            : sec
        );
        s.escalations = s.escalations.map((esc) =>
          esc.courseCode === courseCode
            ? {
                ...esc,
                totalCapacity: esc.totalCapacity + count * 4,
                deficit: Math.max(0, esc.deficit - count * 4),
                status: 'Resolved'
              }
            : esc
        );
      });
      this.addAuditLog(
        'IT Operations Administrator',
        'Batch Capacity Added',
        `Added +${count} seats across all sections of ${courseCode}.`,
        'emerald'
      );
      return this.getState();
    }

    const state = await withTransaction(async (client) => {
      await client.query(
        'UPDATE course_sections SET capacity = capacity + $2, updated_at = CURRENT_TIMESTAMP WHERE course_code = $1',
        [courseCode, count]
      );
      await client.query(
        `UPDATE escalations
         SET total_capacity = total_capacity + $2,
             deficit = GREATEST(0, deficit - $2),
             status = 'Resolved',
             updated_at = CURRENT_TIMESTAMP
         WHERE course_code = $1`,
        [courseCode, count * 4]
      );
      await this.insertAuditLogPg(
        client,
        'IT Operations Administrator',
        'Batch Capacity Added',
        `Added +${count} seats across all sections of ${courseCode}.`,
        'emerald'
      );
      return this.loadStateFromClient(client);
    });
    this.notifySubscribers(state);
    return state;
  }

  public async syncRds4SectionsTx(
    sections: CourseSection[],
    auditMeta?: { actor: string; details: string }
  ): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      this.updateState((s) => {
        s.sections = deepClone(sections);
        this.syncZeroSeatEscalationsInMemory();
      });
      if (auditMeta) {
        this.addAuditLog(auditMeta.actor, 'RDS4 Scheduled Sync', auditMeta.details, 'teal');
      }
      return this.getState();
    }

    const state = await withTransaction(async (client) => {
      for (const sec of sections) {
        await client.query(
          `INSERT INTO course_sections (
            id, course_code, course_title, department, credits, section_number,
            faculty, days, time_slot, room, capacity, enrolled, waitlisted,
            min_credits_required, prerequisites, is_lab, instructor_id, room_capacity, exam_slot
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)
          ON CONFLICT (id) DO UPDATE SET
            capacity = EXCLUDED.capacity,
            enrolled = LEAST(EXCLUDED.capacity, EXCLUDED.enrolled),
            waitlisted = EXCLUDED.waitlisted,
            updated_at = CURRENT_TIMESTAMP`,
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
            Math.min(sec.capacity, sec.enrolled),
            sec.waitlisted,
            sec.minCreditsRequired ?? null,
            JSON.stringify(sec.prerequisites),
            Boolean(sec.isLab),
            sec.instructorId ?? null,
            sec.roomCap ?? ROOM_FIRE_CODE_CAPS[sec.room] ?? 55,
            sec.examSlot ?? null
          ]
        );
      }

      await this.syncZeroSeatEscalationsPg(client);
      if (auditMeta) {
        await this.insertAuditLogPg(
          client,
          auditMeta.actor,
          'RDS4 Scheduled Sync',
          auditMeta.details,
          'teal'
        );
      }
      return this.loadStateFromClient(client);
    });

    this.notifySubscribers(state);
    return state;
  }

  public async addNotificationTx(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>
  ): Promise<NotificationItem> {
    const item: NotificationItem = {
      ...input,
      id: `notif-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      read: false
    };

    if (!isPostgresEnabled()) {
      this.updateState((s) => {
        s.notifications = [item, ...(s.notifications ?? [])];
      });
      return deepClone(item);
    }

    await withTransaction(async (client) => {
      await this.insertNotificationPg(client, item);
    });
    const state = await this.getStateAsync(item.studentId);
    this.notifySubscribers(state);
    return item;
  }

  public async setRdsFallbackPromptTx(
    prompt: RdsFallbackPrompt | null,
    studentId = INITIAL_STUDENT.id
  ): Promise<BackendState> {
    if (!isPostgresEnabled()) {
      return this.updateState((s) => {
        s.rdsFallbackPrompt = prompt ? deepClone(prompt) : null;
      });
    }

    const state = await withTransaction(async (client) => {
      if (!prompt) {
        await client.query(
          'UPDATE rds_fallback_prompts SET resolved = TRUE, updated_at = CURRENT_TIMESTAMP WHERE student_id = $1 AND resolved = FALSE',
          [studentId]
        );
      } else {
        await client.query(
          `INSERT INTO rds_fallback_prompts (
            id, student_id, failed_section_id, failed_course_code, reason, alternatives, resolved, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            resolved = EXCLUDED.resolved,
            alternatives = EXCLUDED.alternatives,
            updated_at = CURRENT_TIMESTAMP`,
          [
            prompt.id,
            studentId,
            prompt.failedSectionId,
            prompt.failedCourseCode,
            prompt.reason,
            JSON.stringify(prompt.alternatives),
            Boolean(prompt.resolved),
            prompt.createdAt
          ]
        );
      }
      return this.loadStateFromClient(client, studentId);
    });

    this.notifySubscribers(state);
    return state;
  }
}

export const backendStore = new BackendStore();
