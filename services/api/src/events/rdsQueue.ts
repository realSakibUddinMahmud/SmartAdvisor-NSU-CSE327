import { Queue } from 'bullmq';
import { BypassRule, CourseSection, ExceptionCase } from '../types';
import { getRedisConnectionOptions, isRedisEnabled } from './redisBus';

export const RDS_QUEUE_NAME = 'rds-enrollment-queue';

export interface RdsQueueJobPayload {
  studentId: string;
  cartToken: string;
  semester: string;
  transactionId?: string;
  sectionIds: string[];
  courses: Array<{ courseCode: string; section: number }>;
  stagedSections?: CourseSection[];
  allSections?: CourseSection[];
  clearedCourses?: Array<{ code: string; grade: string }>;
  creditsCompleted?: number;
  bypassRules?: BypassRule[];
  approvedExceptions?: ExceptionCase[];
  simulateFailure?: boolean;
  enrolledProvisionally?: boolean;
}

let rdsQueue: Queue<RdsQueueJobPayload> | null = null;

function getOrCreateRdsQueue(): Queue<RdsQueueJobPayload> | null {
  if (!isRedisEnabled()) {
    return null;
  }

  if (!rdsQueue) {
    rdsQueue = new Queue<RdsQueueJobPayload>(RDS_QUEUE_NAME, {
      connection: {
        ...getRedisConnectionOptions(),
        maxRetriesPerRequest: null
      }
    });
    rdsQueue.on('error', (err) => {
      console.error('[RDS Queue]', err.message);
    });
  }

  return rdsQueue;
}

export async function enqueueRdsEnrollment(
  payload: RdsQueueJobPayload
): Promise<{ queued: boolean; jobId?: string; mode: 'redis' | 'memory' }> {
  const queue = getOrCreateRdsQueue();
  if (!queue) {
    return { queued: false, mode: 'memory' };
  }

  try {
    const job = await queue.add('rds-enroll', payload, {
      removeOnComplete: 100,
      removeOnFail: 100
    });
    return { queued: true, jobId: job.id, mode: 'redis' };
  } catch (err) {
    console.error('[RDS Queue] Enqueue warning:', err instanceof Error ? err.message : err);
    return { queued: false, mode: 'redis' };
  }
}

export async function closeRdsQueue(): Promise<void> {
  if (rdsQueue) {
    const current = rdsQueue;
    rdsQueue = null;
    try {
      await current.close();
    } catch {
      // Ignore close errors during shutdown
    }
  }
}
