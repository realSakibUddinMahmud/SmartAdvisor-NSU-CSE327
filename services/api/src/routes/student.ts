import { Router, Request, Response } from 'express';
import { enqueueRdsEnrollment } from '../events/rdsQueue';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  enrollConfirmSchema,
  petitionSchema,
  rdsFallbackSchema,
  sectionIdParamSchema,
  solveScheduleSchema,
  stageCartSchema,
  validateBody,
  validateParams,
  waitlistSchema
} from '../middleware/validate';
import { CurriculumGraph, normalizeCourseCode } from '../services/curriculumGraph';
import {
  checkCreditFloor,
  checkFinalExamLoad,
  checkPrerequisites
} from '../services/ruleValidator';
import { AdvisingEngine } from '../services/scheduleSolver';
import { backendStore } from '../store/backendStore';
import { ScheduleStrategy } from '../types';

export const studentRouter = Router();

studentRouter.use(requireAuth, requireRole('student'));

/**
 * POST /api/v1/student/cart/stage
 * Body: { sectionId: string }
 */
studentRouter.post('/cart/stage', validateBody(stageCartSchema), async (req: Request, res: Response) => {
  const { sectionId } = req.body as { sectionId: string };
  const outcome = await backendStore.stageSectionTx(req.user!.id, sectionId);

  if (outcome.ok) {
    return res.status(200).json({
      ok: true,
      state: outcome.state
    });
  }

  if ('modal' in outcome) {
    return res.status(outcome.status).json({
      ok: false,
      modal: outcome.modal,
      payload: outcome.payload
    });
  }

  return res.status(outcome.status).json({
    ok: false,
    message: outcome.message
  });
});

/**
 * DELETE /api/v1/student/cart/:sectionId
 */
studentRouter.delete(
  '/cart/:sectionId',
  validateParams(sectionIdParamSchema),
  async (req: Request, res: Response) => {
    const { sectionId } = req.params;
    const current = await backendStore.getStateAsync(req.user!.id);

    const existsInSections = current.sections.some((s) => s.id === sectionId);
    const existsInCart = current.stagedSectionIds.includes(sectionId);
    if (!existsInCart) {
      return res.status(404).json({
        ok: false,
        message: existsInSections ? 'Section is not in cart' : 'Section not found'
      });
    }

    const result = await backendStore.unstageSectionTx(req.user!.id, sectionId);
    return res.status(result.status).json({
      ok: result.ok,
      state: result.state
    });
  }
);

/**
 * POST /api/v1/student/petitions
 */
studentRouter.post('/petitions', validateBody(petitionSchema), async (req: Request, res: Response) => {
  const payload = req.body as {
    sectionId?: string;
    courseCode: string;
    ruleCode: string;
    reason: string;
  };
  const result = await backendStore.submitPetitionTx(req.user!.id, payload);

  return res.status(201).json({
    ok: true,
    exceptionCase: result.exceptionCase,
    state: result.state
  });
});

/**
 * POST /api/v1/student/waitlist
 */
studentRouter.post('/waitlist', validateBody(waitlistSchema), async (req: Request, res: Response) => {
  const { sectionId } = req.body as { sectionId: string };
  const result = await backendStore.joinWaitlistTx(req.user!.id, sectionId);

  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
      state: result.state
    });
  }

  return res.status(200).json({
    ok: true,
    position: result.position,
    entry: result.entry,
    state: result.state
  });
});

/**
 * POST /api/v1/student/schedule/solve
 */
studentRouter.post(
  '/schedule/solve',
  validateBody(solveScheduleSchema),
  async (req: Request, res: Response) => {
    const { courseCodes, strategy, maxCredits } = req.body as {
      courseCodes?: string[];
      strategy: ScheduleStrategy;
      maxCredits?: number;
    };

    const state = await backendStore.getStateAsync(req.user!.id);
    const engine = new AdvisingEngine(strategy);
    const solved = engine.solve({
      courseCodes,
      sections: state.sections,
      student: state.student,
      bypassRules: state.bypassRules,
      approvedExceptions: state.exceptions,
      strategy,
      maxCredits
    });

    return res.status(200).json(solved);
  }
);

/**
 * GET /api/v1/student/dag/eligible
 */
studentRouter.get('/dag/eligible', async (req: Request, res: Response) => {
  const state = await backendStore.getStateAsync(req.user!.id);
  const summary = CurriculumGraph.getInstance().getDagSummary(state.student.clearedCourses);

  return res.status(200).json({
    ok: true,
    ...summary
  });
});

/**
 * POST /api/v1/student/enroll/confirm
 */
studentRouter.post(
  '/enroll/confirm',
  validateBody(enrollConfirmSchema),
  async (req: Request, res: Response) => {
    const { simulateRdsFailure } = (req.body || {}) as { simulateRdsFailure?: boolean };
    const outcome = await backendStore.confirmEnrollmentTx(req.user!.id, {
      simulateRdsFailure
    });

    if (!outcome.ok) {
      return res.status(outcome.status).json({
        ok: false,
        message: outcome.message,
        state: outcome.state
      });
    }

    await enqueueRdsEnrollment({
      studentId: outcome.receipt.studentId ?? outcome.state.student.id,
      cartToken: outcome.receipt.cartToken ?? outcome.state.student.cartToken,
      semester: process.env.CURRENT_SEMESTER || 'Spring 2025',
      transactionId: outcome.receipt.transactionId,
      sectionIds: outcome.receipt.sections.map((s) => s.id),
      courses: outcome.receipt.sections.map((s) => ({
        courseCode: s.courseCode,
        section: Number(s.sectionNumber) || 1
      })),
      stagedSections: outcome.receipt.sections,
      allSections: outcome.state.sections,
      clearedCourses: outcome.state.student.clearedCourses,
      creditsCompleted: outcome.state.student.creditsCompleted,
      bypassRules: outcome.state.bypassRules,
      approvedExceptions: outcome.state.exceptions,
      simulateFailure: Boolean(simulateRdsFailure),
      enrolledProvisionally: !simulateRdsFailure
    });

    return res.status(200).json({
      ok: true,
      receipt: outcome.receipt,
      state: outcome.state,
      ...(outcome.fallbackPrompt ? { fallbackPrompt: outcome.fallbackPrompt } : {})
    });
  }
);

/**
 * POST /api/v1/student/rds/fallback
 */
studentRouter.post(
  '/rds/fallback',
  validateBody(rdsFallbackSchema),
  async (req: Request, res: Response) => {
    const { failedSectionId, fallbackSectionId } = req.body as {
      failedSectionId: string;
      fallbackSectionId: string;
    };

    const current = await backendStore.getStateAsync(req.user!.id);
    if (!current.stagedSectionIds.includes(failedSectionId)) {
      return res.status(409).json({
        ok: false,
        message: `Section ${failedSectionId} is not currently staged in your cart.`,
        receipt: null,
        state: current
      });
    }

    const fallbackSec = current.sections.find((s) => s.id === fallbackSectionId);
    if (!fallbackSec) {
      return res.status(404).json({
        ok: false,
        message: 'Fallback section not found',
        receipt: null,
        state: current
      });
    }

    const remainingStaged = current.sections.filter(
      (s) => current.stagedSectionIds.includes(s.id) && s.id !== failedSectionId
    );
    const fallbackCourseKey = normalizeCourseCode(fallbackSec.courseCode);
    const duplicateCourseSec = remainingStaged.find(
      (s) => normalizeCourseCode(s.courseCode) === fallbackCourseKey
    );
    if (duplicateCourseSec) {
      return res.status(409).json({
        ok: false,
        message: `Course ${fallbackSec.courseCode} is already staged via ${duplicateCourseSec.id}.`,
        receipt: null,
        state: current
      });
    }

    const creditCheck = checkCreditFloor(
      fallbackSec,
      current.student,
      current.bypassRules,
      current.exceptions
    );
    if (!creditCheck.passed) {
      return res.status(422).json({
        ok: false,
        modal: 'rule_alert',
        payload: {
          section: fallbackSec,
          studentCredits: creditCheck.studentCredits,
          requiredCredits: creditCheck.requiredCredits,
          ruleCode: 'RULE-4.2',
          overrideEligible: creditCheck.overrideEligible
        }
      });
    }

    const prereqCheck = checkPrerequisites(
      fallbackSec,
      current.student,
      current.bypassRules,
      current.exceptions
    );
    if (!prereqCheck.passed) {
      return res.status(422).json({
        ok: false,
        modal: 'rule_alert',
        payload: {
          section: fallbackSec,
          ruleCode: 'RULE-2.1',
          missingPrerequisites: prereqCheck.missingPrerequisites
        }
      });
    }

    const examCheck = checkFinalExamLoad([...remainingStaged, fallbackSec], current.bypassRules);
    if (!examCheck.passed) {
      return res.status(422).json({
        ok: false,
        modal: 'rule_alert',
        payload: {
          section: fallbackSec,
          ruleCode: 'RULE-6.3',
          conflictingSections: examCheck.conflictingSections
        }
      });
    }

    const outcome = await backendStore.resolveRdsFallbackTx(
      req.user!.id,
      failedSectionId,
      fallbackSectionId
    );

    if (!outcome.ok) {
      return res.status(outcome.status).json({
        ok: false,
        message: outcome.message,
        receipt: outcome.receipt,
        state: outcome.state
      });
    }

    return res.status(200).json({
      ok: true,
      receipt: outcome.receipt,
      state: outcome.state
    });
  }
);
