import { CourseSection, DayCode } from '../types';
import { ROOM_FIRE_CODE_CAPS } from '../seedData';
import { backendStore } from '../store/backendStore';
import { notifierService } from './notifier';

export interface Rds4SectionSnapshot {
  id: string;
  courseCode: string;
  courseTitle: string;
  department: CourseSection['department'];
  credits: number;
  sectionNumber: string;
  faculty: string;
  days: DayCode;
  timeSlot: string;
  room: string;
  capacity: number;
  enrolled: number;
  waitlisted?: number;
  prerequisites?: string[];
  minCreditsRequired?: number;
  isLab?: boolean;
  instructorId?: string;
  roomCap?: number;
  examSlot?: string;
}

export interface Rds4SyncResult {
  syncedAt: string;
  totalProcessed: number;
  updatedSectionIds: string[];
  addedSectionIds: string[];
  reopenedSectionIds: string[];
  driftCount: number;
}

let syncTimer: NodeJS.Timeout | null = null;
let syncMutexTail: Promise<void> = Promise.resolve();

async function withSyncMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = syncMutexTail;
  let release!: () => void;
  syncMutexTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Reconciles external RDS4 section snapshots into backendStore.
 * Clamps invalid counts (0 <= enrolled <= capacity), preserves stagedSectionIds,
 * detects full -> open seat transitions, and dispatches SEAT_OPEN notifications.
 */
export async function syncFromRds4(
  snapshots?: Rds4SectionSnapshot[],
  options?: { actor?: string }
): Promise<Rds4SyncResult> {
  return withSyncMutex(async () => {
    const actor = options?.actor ?? 'RDS4 Sync Daemon';
    const currentState = await backendStore.getStateAsync();
    const existingMap = new Map(currentState.sections.map((s) => [s.id, s]));

    const feed: Rds4SectionSnapshot[] =
      snapshots ??
      currentState.sections.map((s) => ({
        ...s
      }));

    const updatedSectionIds: string[] = [];
    const addedSectionIds: string[] = [];
    const reopenedSections: CourseSection[] = [];
    let driftCount = 0;

    const nextSectionsMap = new Map<string, CourseSection>(
      currentState.sections.map((s) => [s.id, { ...s }])
    );

    for (const snap of feed) {
      const safeCapacity = Math.max(0, Math.floor(snap.capacity));
      const safeEnrolled = Math.max(0, Math.min(safeCapacity, Math.floor(snap.enrolled)));
      const safeWaitlisted = Math.max(0, Math.floor(snap.waitlisted ?? 0));

      const prev = existingMap.get(snap.id);
      const nextSection: CourseSection = {
        id: snap.id,
        courseCode: snap.courseCode,
        courseTitle: snap.courseTitle,
        department: snap.department,
        credits: snap.credits,
        sectionNumber: snap.sectionNumber,
        faculty: snap.faculty,
        days: snap.days,
        timeSlot: snap.timeSlot,
        room: snap.room,
        capacity: safeCapacity,
        enrolled: safeEnrolled,
        waitlisted: safeWaitlisted,
        prerequisites: snap.prerequisites ?? prev?.prerequisites ?? [],
        minCreditsRequired: snap.minCreditsRequired ?? prev?.minCreditsRequired,
        isLab: snap.isLab ?? prev?.isLab,
        instructorId: snap.instructorId ?? prev?.instructorId,
        roomCap: snap.roomCap ?? prev?.roomCap ?? ROOM_FIRE_CODE_CAPS[snap.room] ?? 55,
        examSlot: snap.examSlot ?? prev?.examSlot
      };

      if (!prev) {
        addedSectionIds.push(snap.id);
        driftCount += 1;
      } else {
        const changed =
          prev.capacity !== nextSection.capacity ||
          prev.enrolled !== nextSection.enrolled ||
          prev.waitlisted !== nextSection.waitlisted ||
          prev.faculty !== nextSection.faculty ||
          prev.room !== nextSection.room ||
          prev.timeSlot !== nextSection.timeSlot;

        if (changed) {
          updatedSectionIds.push(snap.id);
          driftCount += 1;
        }

        const wasFull = prev.capacity - prev.enrolled <= 0;
        const nowOpen = nextSection.capacity - nextSection.enrolled > 0;
        if (wasFull && nowOpen) {
          reopenedSections.push(nextSection);
        }
      }

      nextSectionsMap.set(snap.id, nextSection);
    }

    const mergedSections = Array.from(nextSectionsMap.values());
    const details = `Processed ${feed.length} RDS4 section(s): ${updatedSectionIds.length} updated, ${addedSectionIds.length} added, ${reopenedSections.length} reopened.`;

    await backendStore.syncRds4SectionsTx(mergedSections, { actor, details });

    for (const reopened of reopenedSections) {
      const entryStudentIds = (currentState.waitlistEntries ?? [])
        .filter((w) => w.sectionId === reopened.id && w.status === 'waiting')
        .map((w) => w.studentId);

      const stagedWaitlistIds = (currentState.waitlistSectionIds ?? []).includes(reopened.id)
        ? [currentState.student.id]
        : [];

      const recipients = [...new Set([...entryStudentIds, ...stagedWaitlistIds])];
      if (recipients.length > 0) {
        const items = await notifierService.notifySeatOpened(reopened, recipients);
        for (const item of items) {
          await backendStore.addNotificationTx({
            studentId: item.studentId,
            sectionId: item.sectionId,
            courseCode: item.courseCode,
            channel: item.channel,
            eventType: item.eventType,
            title: item.title,
            message: item.message,
            status: item.status,
            error: item.error,
            metadata: item.metadata
          });
        }
      }
    }

    return {
      syncedAt: new Date().toISOString(),
      totalProcessed: feed.length,
      updatedSectionIds,
      addedSectionIds,
      reopenedSectionIds: reopenedSections.map((s) => s.id),
      driftCount
    };
  });
}

export function startRds4SyncScheduler(intervalMs = 60_000): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }
  if (syncTimer) {
    return;
  }
  syncTimer = setInterval(() => {
    void syncFromRds4().catch((err) => {
      console.error('[RDS4 Sync Scheduler] Error:', err);
    });
  }, intervalMs);
  syncTimer.unref?.();
}

export function stopRds4SyncScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
