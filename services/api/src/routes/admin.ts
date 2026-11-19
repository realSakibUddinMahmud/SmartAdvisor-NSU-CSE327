import { Router, Request, Response } from 'express';
import { isPostgresEnabled, query } from '../db/pool';
import { redisBus } from '../events/redisBus';
import { evaluateSlaBreach } from '../events/slaMonitor';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  addSeatsSchema,
  emergencySectionSchema,
  rds4SyncSchema,
  validateBody
} from '../middleware/validate';
import { formatCourseCode, normalizeCourseCode } from '../services/curriculumGraph';
import { Rds4SectionSnapshot, syncFromRds4 } from '../services/rds4Sync';
import { backendStore } from '../store/backendStore';
import { CourseSection } from '../types';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

/**
 * POST /api/v1/admin/scale
 */
adminRouter.post('/scale', async (_req: Request, res: Response) => {
  const state = await backendStore.adminScaleTx();
  await evaluateSlaBreach();

  return res.status(200).json({
    ok: true,
    state
  });
});

/**
 * POST /api/v1/admin/acknowledge
 */
adminRouter.post('/acknowledge', async (_req: Request, res: Response) => {
  const state = await backendStore.adminAcknowledgeTx();

  return res.status(200).json({
    ok: true,
    state
  });
});

/**
 * POST /api/v1/admin/sections/emergency
 */
adminRouter.post(
  '/sections/emergency',
  validateBody(emergencySectionSchema),
  async (req: Request, res: Response) => {
    const { courseCode, sectionData = {} } = req.body as {
      courseCode: string;
      sectionData?: Partial<CourseSection>;
    };

    const normalizedCourseCode = normalizeCourseCode(courseCode);
    const candidateId = `${normalizedCourseCode.replace(/\s+/g, '')}-05`;
    const current = await backendStore.getStateAsync();
    if (current.sections.some((s) => s.id.toUpperCase() === candidateId.toUpperCase())) {
      return res.status(409).json({
        ok: false,
        message: `Emergency section ${candidateId} already exists.`
      });
    }

    const existingMatch = current.sections.find(
      (s) => normalizeCourseCode(s.courseCode) === normalizedCourseCode
    );
    const canonicalCourseCode = existingMatch?.courseCode ?? formatCourseCode(courseCode);
    const state = await backendStore.provisionEmergencySectionTx(canonicalCourseCode, sectionData);
    return res.status(200).json({
      ok: true,
      state
    });
  }
);

/**
 * POST /api/v1/admin/courses/add-seats
 */
adminRouter.post(
  '/courses/add-seats',
  validateBody(addSeatsSchema),
  async (req: Request, res: Response) => {
    const { courseCode, count } = req.body as { courseCode: string; count: number };
    const current = await backendStore.getStateAsync();
    const targetNorm = normalizeCourseCode(courseCode);
    const matching = current.sections.filter(
      (s) => normalizeCourseCode(s.courseCode) === targetNorm
    );

    if (matching.length === 0) {
      return res.status(404).json({
        ok: false,
        message: `Course ${courseCode} not found`
      });
    }

    const canonicalCourseCode = matching[0].courseCode;
    let state = await backendStore.addCourseSeatsTx(canonicalCourseCode, count);

    const updatedMatching = state.sections.filter(
      (s) => normalizeCourseCode(s.courseCode) === targetNorm
    );
    const exactCapacity = updatedMatching.reduce((sum, s) => sum + s.capacity, 0);
    const exactEnrolled = updatedMatching.reduce((sum, s) => sum + s.enrolled, 0);
    const exactWaitlisted = updatedMatching.reduce((sum, s) => sum + s.waitlisted, 0);
    const available = exactCapacity - exactEnrolled;
    const nextStatus = available > 0 ? 'Resolved' : 'Open';
    const nextDeficit = available > 0 ? 0 : Math.max(1, exactWaitlisted);

    if (!isPostgresEnabled()) {
      state = backendStore.updateState((s) => {
        s.escalations = s.escalations.map((esc) =>
          normalizeCourseCode(esc.courseCode) === targetNorm
            ? {
                ...esc,
                totalCapacity: exactCapacity,
                enrolled: exactEnrolled,
                waitlisted: exactWaitlisted,
                deficit: nextDeficit,
                status: nextStatus
              }
            : esc
        );
      });
    } else {
      await query(
        `UPDATE escalations
         SET total_capacity = $2,
             enrolled = $3,
             waitlisted = $4,
             deficit = $5,
             status = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE course_code = $1`,
        [canonicalCourseCode, exactCapacity, exactEnrolled, exactWaitlisted, nextDeficit, nextStatus]
      );
      state = await backendStore.getStateAsync();
      await redisBus.publishSyncEvent({
        type: 'SYNC_UPDATE',
        studentId: state.student.id,
        state,
        timestamp: Date.now()
      });
    }

    return res.status(200).json({
      ok: true,
      state
    });
  }
);

/**
 * POST /api/v1/admin/rds4/sync
 */
adminRouter.post('/rds4/sync', validateBody(rds4SyncSchema), async (req: Request, res: Response) => {
  const { snapshots } = (req.body || {}) as { snapshots?: Rds4SectionSnapshot[] };
  const syncResult = await syncFromRds4(snapshots, {
    actor: req.user?.name ?? 'IT Operations Admin'
  });
  const state = await backendStore.getStateAsync();

  return res.status(200).json({
    ok: true,
    syncResult,
    state
  });
});
