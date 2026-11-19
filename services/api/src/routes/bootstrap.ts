import { Router, Request, Response } from 'express';
import { optionalAuth } from '../middleware/auth';
import { INITIAL_STUDENT } from '../seedData';
import { CurriculumGraph } from '../services/curriculumGraph';
import { detectScheduleClashes } from '../services/ruleValidator';
import { backendStore } from '../store/backendStore';
import { CourseSection } from '../types';

export const bootstrapRouter = Router();

bootstrapRouter.get('/bootstrap', optionalAuth, async (req: Request, res: Response) => {
  const studentId = req.user?.role === 'student' ? req.user.id : INITIAL_STUDENT.id;
  const state = await backendStore.getStateAsync(studentId);

  const stagedSections: CourseSection[] = state.stagedSectionIds
    .map((id) => state.sections.find((s) => s.id === id))
    .filter((s): s is CourseSection => Boolean(s));

  const totalCredits = stagedSections.reduce((acc, curr) => acc + curr.credits, 0);
  const clashes = detectScheduleClashes(stagedSections);

  const notifications = state.notifications ?? [];
  const waitlistSectionIds = state.waitlistSectionIds ?? [];
  const waitlistEntries = state.waitlistEntries ?? [];
  const dagSummary =
    state.dagSummary ?? CurriculumGraph.getInstance().getDagSummary(state.student.clearedCourses);
  const rdsFallbackPrompt = state.rdsFallbackPrompt ?? null;

  return res.status(200).json({
    ...state,
    stagedSections,
    totalCredits,
    clashes,
    notifications,
    waitlistSectionIds,
    waitlistEntries,
    dagSummary,
    rdsFallbackPrompt
  });
});
