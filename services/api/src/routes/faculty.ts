import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createBypassRuleSchema,
  exceptionDecisionSchema,
  expandCapacitySchema,
  toggleRuleSchema,
  validateBody
} from '../middleware/validate';
import { backendStore } from '../store/backendStore';
import { BypassRule } from '../types';

export const facultyRouter = Router();

facultyRouter.use(requireAuth, requireRole('faculty', 'admin'));

/**
 * POST /api/v1/faculty/exceptions/decision
 */
facultyRouter.post(
  '/exceptions/decision',
  validateBody(exceptionDecisionSchema),
  async (req: Request, res: Response) => {
    const { caseId, action } = req.body as {
      caseId: string;
      action: 'approve' | 'reject' | 'flag';
    };

    const actor = {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role
    };

    const result = await backendStore.decideExceptionTx(caseId, action, actor);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message,
        state: result.state
      });
    }

    return res.status(200).json({
      ok: true,
      state: result.state
    });
  }
);

/**
 * POST /api/v1/faculty/sections/expand-capacity
 */
facultyRouter.post(
  '/sections/expand-capacity',
  validateBody(expandCapacitySchema),
  async (req: Request, res: Response) => {
    const { sectionId, delta } = req.body as { sectionId: string; delta: number };

    const actor = {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role,
      email: req.user!.email,
      instructorName: req.user!.instructorName ?? null
    };

    const result = await backendStore.expandSectionCapacityTx(sectionId, delta, actor);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message,
        state: result.state
      });
    }

    return res.status(200).json({
      ok: true,
      state: result.state
    });
  }
);

/**
 * POST /api/v1/faculty/rules
 */
facultyRouter.post(
  '/rules',
  validateBody(createBypassRuleSchema),
  async (req: Request, res: Response) => {
    const ruleInput = req.body as Omit<BypassRule, 'id' | 'lastUpdated'>;
    const result = await backendStore.createBypassRuleTx(ruleInput, req.user!.name);

    return res.status(201).json({
      ok: true,
      rule: result.rule,
      autoApprovedCount: result.autoApprovedCount,
      state: result.state
    });
  }
);

/**
 * POST /api/v1/faculty/rules/toggle
 */
facultyRouter.post(
  '/rules/toggle',
  validateBody(toggleRuleSchema),
  async (req: Request, res: Response) => {
    const { ruleId } = req.body as { ruleId: string };
    const result = await backendStore.toggleBypassRuleTx(ruleId, req.user!.name);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.message,
        state: result.state
      });
    }

    return res.status(200).json({
      ok: true,
      autoApprovedCount: result.autoApprovedCount,
      state: result.state
    });
  }
);
