import crypto from 'crypto';
import { Job, Worker } from 'bullmq';
import Redis, { RedisOptions } from 'ioredis';
import { Pool } from 'pg';
import {
  computeDagCompliantAlternatives,
  normalizeRdsPayload,
  pushEnrollmentToRds,
  RdsEnrollmentPayload,
  RdsFallbackPrompt,
  WorkerBypassRule,
  WorkerCourseSection,
  WorkerExceptionCase
} from './rdsClient';

export type { RdsEnrollmentPayload, RdsFallbackPrompt };

export interface RdsEnrollmentResult {
  success: boolean;
  studentId: string;
  courseCode: string;
  enrolledAt: string;
  message: string;
  transactionId: string;
  digitalSignature: string;
  handshakeMs: number;
  fallbackTriggered?: boolean;
  fallbackPrompt?: RdsFallbackPrompt;
}

export interface WorkerSyncEvent {
  type: 'SYNC_UPDATE' | 'RDS_FALLBACK';
  studentId: string;
  source: 'rds-worker';
  payload: unknown;
  timestamp: number;
}

export const RDS_QUEUE_NAME = 'rds-enrollment-queue';
export const SYNC_CHANNEL = 'smartadvisor-sync';

let workerPool: Pool | null = null;
let sharedPubClient: Redis | null = null;

export function isRedisEnabled(): boolean {
  const hasUrl = Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0);
  const hasHost = Boolean(process.env.REDIS_HOST && process.env.REDIS_HOST.trim().length > 0);
  if (!hasUrl && !hasHost) {
    return false;
  }

  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const forceRedisInTest = process.env.USE_REDIS_IN_TEST === 'true';
  return !isTestEnv || forceRedisInTest;
}

export function getRedisConnectionOptions(override?: { host: string; port: number }): RedisOptions {
  if (override) {
    return {
      host: override.host,
      port: override.port,
      maxRetriesPerRequest: null
    };
  }

  if (process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0) {
    const parsed = new URL(process.env.REDIS_URL.trim());
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null
    };
  }

  return {
    host: process.env.REDIS_HOST?.trim() || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
  };
}

export function isWorkerPostgresEnabled(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    return false;
  }

  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const forcePgInTest = process.env.USE_PG_IN_TEST === 'true';
  return !isTestEnv || forcePgInTest;
}

export function getWorkerPool(): Pool | null {
  if (!isWorkerPostgresEnabled()) {
    return null;
  }
  if (!workerPool) {
    workerPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000
    });
    workerPool.on('error', (err) => {
      console.error('[RDS Worker PG Pool]', err.message);
    });
  }
  return workerPool;
}

export async function closeWorkerPool(): Promise<void> {
  if (workerPool) {
    const current = workerPool;
    workerPool = null;
    await current.end();
  }
}

export async function getWorkerPubClient(): Promise<Redis | null> {
  if (!isRedisEnabled()) {
    return null;
  }
  if (!sharedPubClient) {
    sharedPubClient = new Redis({
      ...getRedisConnectionOptions(),
      lazyConnect: true,
      connectTimeout: 2000,
      retryStrategy: (times: number) => Math.min(times * 200, 2000)
    });
    sharedPubClient.on('error', (err) => {
      console.error('[RDS Worker Redis Pub]', err.message);
    });
    await sharedPubClient.connect();
  }
  return sharedPubClient;
}

export async function closeWorkerPubClient(): Promise<void> {
  if (sharedPubClient) {
    const current = sharedPubClient;
    sharedPubClient = null;
    try {
      await Promise.race([
        current.quit(),
        new Promise<void>((resolve) => setTimeout(resolve, 1000))
      ]);
    } catch {
      // Ignore
    } finally {
      try {
        current.disconnect();
      } catch {
        // Ignore
      }
    }
  }
}

async function defaultPublishSyncEvent(event: WorkerSyncEvent): Promise<void> {
  const pub = await getWorkerPubClient();
  if (pub && pub.status === 'ready') {
    await pub.publish(SYNC_CHANNEL, JSON.stringify(event));
  }
}

function nowTimeStr(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function mapPgSection(row: Record<string, unknown>): WorkerCourseSection {
  return {
    id: String(row.id),
    courseCode: String(row.course_code),
    courseTitle: String(row.course_title),
    department: row.department as WorkerCourseSection['department'],
    credits: Number(row.credits),
    sectionNumber: String(row.section_number),
    faculty: String(row.faculty),
    days: row.days as WorkerCourseSection['days'],
    timeSlot: String(row.time_slot),
    room: String(row.room),
    capacity: Number(row.capacity),
    enrolled: Number(row.enrolled),
    waitlisted: Number(row.waitlisted),
    minCreditsRequired:
      row.min_credits_required === null || row.min_credits_required === undefined
        ? undefined
        : Number(row.min_credits_required),
    prerequisites: Array.isArray(row.prerequisites) ? (row.prerequisites as string[]) : [],
    isLab: Boolean(row.is_lab),
    instructorId: row.instructor_id ? String(row.instructor_id) : undefined,
    roomCap: row.room_capacity !== undefined ? Number(row.room_capacity) : undefined,
    examSlot: row.exam_slot ? String(row.exam_slot) : undefined
  };
}

async function persistSuccessToPg(
  pool: Pool,
  input: {
    studentId: string;
    cartToken: string;
    transactionId: string;
    digitalSignature: string;
    stagedSections: WorkerCourseSection[];
    sectionIds: string[];
  }
): Promise<void> {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    let sectionsToRecord = input.stagedSections;
    if (sectionsToRecord.length === 0 && input.sectionIds.length > 0) {
      const secRes = await client.query(
        'SELECT * FROM course_sections WHERE id = ANY($1) ORDER BY id ASC',
        [input.sectionIds]
      );
      sectionsToRecord = secRes.rows.map((r) => mapPgSection(r));
    }

    const totalCredits = sectionsToRecord.reduce((sum, s) => sum + s.credits, 0);
    await client.query(
      `INSERT INTO schedule_receipts (
        transaction_id, student_id, cart_token, timestamp, total_credits, sections, digital_signature, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'confirmed', 'rds-worker')
      ON CONFLICT (transaction_id) DO UPDATE SET
        status = 'confirmed',
        source = 'rds-worker',
        digital_signature = EXCLUDED.digital_signature`,
      [
        input.transactionId,
        input.studentId,
        input.cartToken,
        new Date().toLocaleString(),
        totalCredits,
        JSON.stringify(sectionsToRecord),
        input.digitalSignature
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (id, timestamp, actor, action, details, badge_type)
       VALUES ($1, $2, 'RDS Headless Worker', 'RDS Worker Confirmed', $3, 'emerald')`,
      [
        `log-wrk-${crypto.randomUUID().slice(0, 8)}`,
        nowTimeStr(),
        `Headless RDS handshake & push succeeded for ${input.studentId} (${input.transactionId}).`
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore secondary rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

async function persistFailureToPg(
  pool: Pool,
  input: {
    studentId: string;
    cartToken: string;
    transactionId: string;
    digitalSignature: string;
    stagedSections: WorkerCourseSection[];
    sectionIds: string[];
    enrolledProvisionally: boolean;
    fallbackPrompt: RdsFallbackPrompt;
  }
): Promise<RdsFallbackPrompt> {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const allSecRes = await client.query('SELECT * FROM course_sections ORDER BY id ASC');
    const dbSections = allSecRes.rows.map((r) => mapPgSection(r));
    const stuRes = await client.query('SELECT * FROM students WHERE id = $1', [input.studentId]);
    const rulesRes = await client.query('SELECT * FROM bypass_rules');
    const exRes = await client.query(
      "SELECT * FROM exception_cases WHERE student_id = $1 AND status = 'approved'",
      [input.studentId]
    );

    const dbStagedSections =
      input.stagedSections.length > 0
        ? input.stagedSections
        : dbSections.filter((s) => input.sectionIds.includes(s.id));

    if (input.enrolledProvisionally) {
      const delRes = await client.query(
        'DELETE FROM enrollments WHERE student_id = $1 AND section_id = $2 RETURNING section_id',
        [input.studentId, input.fallbackPrompt.failedSectionId]
      );
      if (delRes.rowCount && delRes.rowCount > 0) {
        await client.query(
          'UPDATE course_sections SET enrolled = GREATEST(0, enrolled - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [input.fallbackPrompt.failedSectionId]
        );
      }
    }

    const failedSection =
      dbSections.find((s) => s.id === input.fallbackPrompt.failedSectionId) ??
      dbStagedSections[0];

    const finalPrompt =
      dbSections.length > 0 && failedSection
        ? computeDagCompliantAlternatives({
            studentId: input.studentId,
            failedSection,
            remainingStagedSections: dbStagedSections.filter((s) => s.id !== failedSection.id),
            allSections: dbSections,
            clearedCourses: Array.isArray(stuRes.rows[0]?.cleared_courses)
              ? (stuRes.rows[0].cleared_courses as Array<{ code: string; grade: string }>)
              : [],
            creditsCompleted: stuRes.rows[0] ? Number(stuRes.rows[0].credits_completed) : 96,
            bypassRules: rulesRes.rows.map((r) => ({
              id: String(r.id),
              code: String(r.code),
              title: String(r.title),
              description: String(r.description),
              category: r.category as WorkerBypassRule['category'],
              enabled: Boolean(r.enabled),
              lastUpdated: String(r.last_updated)
            })),
            approvedExceptions: exRes.rows.map((e) => ({
              id: String(e.id),
              studentId: String(e.student_id),
              courseCode: String(e.course_code),
              status: e.status as WorkerExceptionCase['status'],
              ruleCode: e.rule_code ? String(e.rule_code) : undefined,
              category: e.category as WorkerExceptionCase['category']
            })),
            reason: input.fallbackPrompt.reason
          })
        : input.fallbackPrompt;

    const existingPrompt = await client.query(
      'SELECT id FROM rds_fallback_prompts WHERE student_id = $1 AND failed_section_id = $2 AND resolved = FALSE LIMIT 1',
      [input.studentId, finalPrompt.failedSectionId]
    );

    if (existingPrompt.rows.length > 0) {
      await client.query(
        `UPDATE rds_fallback_prompts
         SET reason = $2, alternatives = $3::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existingPrompt.rows[0].id, finalPrompt.reason, JSON.stringify(finalPrompt.alternatives)]
      );
      finalPrompt.id = String(existingPrompt.rows[0].id);
    } else {
      await client.query(
        `INSERT INTO rds_fallback_prompts (
          id, student_id, failed_section_id, failed_course_code, reason, alternatives, resolved, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, $7)`,
        [
          finalPrompt.id,
          input.studentId,
          finalPrompt.failedSectionId,
          finalPrompt.failedCourseCode,
          finalPrompt.reason,
          JSON.stringify(finalPrompt.alternatives),
          finalPrompt.createdAt
        ]
      );
    }

    const totalCredits = dbStagedSections.reduce((sum, s) => sum + s.credits, 0);
    await client.query(
      `INSERT INTO schedule_receipts (
        transaction_id, student_id, cart_token, timestamp, total_credits, sections, digital_signature, status, source
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'fallback_required', 'rds-worker')
      ON CONFLICT (transaction_id) DO UPDATE SET
        status = 'fallback_required',
        source = 'rds-worker'`,
      [
        input.transactionId,
        input.studentId,
        input.cartToken,
        new Date().toLocaleString(),
        totalCredits,
        JSON.stringify(dbStagedSections),
        input.digitalSignature
      ]
    );

    await client.query(
      `INSERT INTO notifications (
        id, student_id, section_id, course_code, channel, event_type, title, message, status
      ) VALUES ($1, $2, $3, $4, 'IN_APP', 'RDS_FALLBACK', $5, $6, 'sent')`,
      [
        `notif-${crypto.randomUUID().slice(0, 8)}`,
        input.studentId,
        finalPrompt.failedSectionId,
        finalPrompt.failedCourseCode,
        `RDS Fallback Ready: ${finalPrompt.failedCourseCode}`,
        `RDS worker detected failure on ${finalPrompt.failedSectionId}. ${finalPrompt.alternatives.length} DAG-compliant alternative(s) ready.`
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (id, timestamp, actor, action, details, badge_type)
       VALUES ($1, $2, 'RDS Headless Worker', 'RDS Fallback Intercepted', $3, 'amber')`,
      [
        `log-wrk-${crypto.randomUUID().slice(0, 8)}`,
        nowTimeStr(),
        `RDS worker intercepted failure on ${finalPrompt.failedSectionId}; prepared ${finalPrompt.alternatives.length} DAG fallback(s).`
      ]
    );

    await client.query('COMMIT');
    return finalPrompt;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore secondary rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface ProcessRdsDependencies {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  publishSyncEvent?: (event: WorkerSyncEvent) => Promise<void> | void;
}

export async function processRdsEnrollment(
  jobData: RdsEnrollmentPayload,
  deps?: ProcessRdsDependencies
): Promise<RdsEnrollmentResult> {
  const normalized = normalizeRdsPayload(jobData);
  const pushResult = await pushEnrollmentToRds(jobData, {
    baseUrl: deps?.baseUrl,
    fetchFn: deps?.fetchFn
  });

  const publish = deps?.publishSyncEvent ?? defaultPublishSyncEvent;
  const primaryCourseCode = normalized.courses[0]?.courseCode || normalized.sectionIds[0];
  const primarySectionNum = normalized.courses[0]?.section ?? 1;
  const pool = getWorkerPool();

  if (!pushResult.ok && pushResult.fallbackPrompt) {
    let finalPrompt = pushResult.fallbackPrompt;

    if (pool) {
      finalPrompt = await persistFailureToPg(pool, {
        studentId: normalized.studentId,
        cartToken: normalized.cartToken,
        transactionId: pushResult.transactionId,
        digitalSignature: pushResult.digitalSignature,
        stagedSections: normalized.stagedSections,
        sectionIds: normalized.sectionIds,
        enrolledProvisionally: normalized.enrolledProvisionally,
        fallbackPrompt: pushResult.fallbackPrompt
      });
    }

    await publish({
      type: 'RDS_FALLBACK',
      studentId: normalized.studentId,
      source: 'rds-worker',
      payload: finalPrompt,
      timestamp: Date.now()
    });

    return {
      success: false,
      studentId: normalized.studentId,
      courseCode: primaryCourseCode,
      enrolledAt: new Date().toISOString(),
      message: pushResult.reason || `RDS enrollment failed for ${finalPrompt.failedSectionId}`,
      transactionId: pushResult.transactionId,
      digitalSignature: pushResult.digitalSignature,
      handshakeMs: pushResult.handshakeMs,
      fallbackTriggered: true,
      fallbackPrompt: finalPrompt
    };
  }

  if (pool) {
    await persistSuccessToPg(pool, {
      studentId: normalized.studentId,
      cartToken: normalized.cartToken,
      transactionId: pushResult.transactionId,
      digitalSignature: pushResult.digitalSignature,
      stagedSections: normalized.stagedSections,
      sectionIds: normalized.sectionIds
    });
  }

  const result: RdsEnrollmentResult = {
    success: true,
    studentId: normalized.studentId,
    courseCode: primaryCourseCode,
    enrolledAt: new Date().toISOString(),
    message: `Successfully processed enrollment for ${normalized.studentId} in ${primaryCourseCode} Sec ${primarySectionNum}`,
    transactionId: pushResult.transactionId,
    digitalSignature: pushResult.digitalSignature,
    handshakeMs: pushResult.handshakeMs
  };

  await publish({
    type: 'SYNC_UPDATE',
    studentId: normalized.studentId,
    source: 'rds-worker',
    payload: {
      receipt: {
        transactionId: result.transactionId,
        studentId: result.studentId,
        cartToken: normalized.cartToken,
        digitalSignature: result.digitalSignature,
        status: 'confirmed',
        source: 'rds-worker'
      }
    },
    timestamp: Date.now()
  });

  return result;
}

export interface CreateRdsWorkerOptions {
  redisConnection?: { host: string; port: number };
  publishSyncEvent?: (event: WorkerSyncEvent) => Promise<void> | void;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

function isRedisConn(
  arg?: { host: string; port: number } | CreateRdsWorkerOptions
): arg is { host: string; port: number } {
  return Boolean(arg && 'host' in arg && 'port' in arg);
}

export function createRdsWorker(
  optionsOrConn?: { host: string; port: number } | CreateRdsWorkerOptions
): Worker<RdsEnrollmentPayload, RdsEnrollmentResult> {
  const options: CreateRdsWorkerOptions = isRedisConn(optionsOrConn)
    ? { redisConnection: optionsOrConn }
    : (optionsOrConn ?? {});

  const connection = getRedisConnectionOptions(options.redisConnection);

  return new Worker<RdsEnrollmentPayload, RdsEnrollmentResult>(
    RDS_QUEUE_NAME,
    async (job: Job<RdsEnrollmentPayload, RdsEnrollmentResult>) => {
      return processRdsEnrollment(job.data, {
        baseUrl: options.baseUrl,
        fetchFn: options.fetchFn,
        publishSyncEvent: options.publishSyncEvent
      });
    },
    { connection, autorun: false }
  );
}
