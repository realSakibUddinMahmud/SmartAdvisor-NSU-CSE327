import {
  BypassRule,
  CourseSection,
  ExceptionCase,
  ScheduleClash,
  ScheduleStrategy,
  SolveScheduleResult,
  StudentProfile
} from '../types';
import { CurriculumGraph, normalizeCourseCode } from './curriculumGraph';
import {
  checkCreditFloor,
  checkFinalExamLoad,
  checkPrerequisites,
  detectScheduleClashes,
  expandDayCodes,
  parseTimeSlot
} from './ruleValidator';

export interface CourseCandidate {
  courseCode: string;
  sections: CourseSection[];
  priorityScore: number;
}

export interface SolveScheduleInput {
  courseCodes?: string[];
  sections: CourseSection[];
  student: StudentProfile;
  bypassRules?: BypassRule[];
  approvedExceptions?: ExceptionCase[];
  strategy: ScheduleStrategy;
  maxCredits?: number;
}

export interface ExtendedSolveResult extends SolveScheduleResult {
  rejectedCourses: Record<string, string>;
  idleGapMinutes: number;
}

export interface SchedulingStrategy {
  readonly name: ScheduleStrategy;
  solve(
    candidates: CourseCandidate[],
    maxCredits: number,
    bypassRules: BypassRule[]
  ): CourseSection[];
}

const timeSlotCache = new Map<string, ReturnType<typeof parseTimeSlot>>();

function parseTimeSlotCached(timeSlot: string): ReturnType<typeof parseTimeSlot> {
  if (!timeSlotCache.has(timeSlot)) {
    timeSlotCache.set(timeSlot, parseTimeSlot(timeSlot));
  }
  return timeSlotCache.get(timeSlot)!;
}

export function calculateDailyIdleGapMinutes(sections: CourseSection[]): {
  idleGapMinutes: number;
  distinctDays: number;
} {
  const byDay = new Map<string, Array<{ startMin: number; endMin: number }>>();

  for (const sec of sections) {
    const range = parseTimeSlotCached(sec.timeSlot);
    if (!range) continue;
    for (const day of expandDayCodes(sec.days)) {
      const list = byDay.get(day) ?? [];
      list.push(range);
      byDay.set(day, list);
    }
  }

  let totalGap = 0;
  for (const [, intervals] of byDay) {
    if (intervals.length <= 1) continue;
    intervals.sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < intervals.length; i++) {
      const gap = intervals[i].startMin - intervals[i - 1].endMin;
      if (gap > 0) {
        totalGap += gap;
      }
    }
  }

  return {
    idleGapMinutes: totalGap,
    distinctDays: byDay.size
  };
}

const MAX_SOLVER_STEPS = 15_000;

function deduplicateCandidateSections(sections: CourseSection[]): CourseSection[] {
  const bestBySignature = new Map<string, CourseSection>();
  for (const sec of sections) {
    const signature = `${sec.days}|${sec.timeSlot}|${sec.credits}|${sec.examSlot ?? ''}`;
    const existing = bestBySignature.get(signature);
    if (!existing) {
      bestBySignature.set(signature, sec);
      continue;
    }
    const secAvailable = sec.capacity - sec.enrolled;
    const existingAvailable = existing.capacity - existing.enrolled;
    if (secAvailable > existingAvailable) {
      bestBySignature.set(signature, sec);
    }
  }
  return Array.from(bestBySignature.values());
}

function sectionsClashFast(a: CourseSection, b: CourseSection): boolean {
  const daysA = expandDayCodes(a.days);
  const daysB = expandDayCodes(b.days);
  let daysOverlap = false;
  for (const dA of daysA) {
    if (daysB.includes(dA)) {
      daysOverlap = true;
      break;
    }
  }
  if (!daysOverlap) return false;

  const rangeA = parseTimeSlotCached(a.timeSlot);
  const rangeB = parseTimeSlotCached(b.timeSlot);
  return rangeA && rangeB
    ? rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin
    : a.timeSlot === b.timeSlot;
}

function isComboValid(
  combo: CourseSection[],
  next: CourseSection,
  currentCredits: number,
  maxCredits: number,
  bypassRules: BypassRule[],
  rule63Enforced: boolean
): boolean {
  if (currentCredits + next.credits > maxCredits + 1e-6) {
    return false;
  }

  for (const existing of combo) {
    if (sectionsClashFast(existing, next)) {
      return false;
    }
  }

  if (rule63Enforced) {
    const candidateCombo = [...combo, next];
    const examCheck = checkFinalExamLoad(candidateCombo, bypassRules);
    if (!examCheck.passed) {
      return false;
    }
  }

  return true;
}

export class MilestoneFirstStrategy implements SchedulingStrategy {
  public readonly name: ScheduleStrategy = 'MilestoneFirst';

  public solve(
    candidates: CourseCandidate[],
    maxCredits: number,
    bypassRules: BypassRule[]
  ): CourseSection[] {
    if (candidates.length === 0 || maxCredits <= 0) {
      return [];
    }

    const sorted = [...candidates].sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return a.courseCode.localeCompare(b.courseCode);
    });

    // Bounded backtracking maximizing total milestone priority score, then credits
    const rule63Enforced = bypassRules.some(
      (r) => (r.id === 'rule-6-3' || r.code === 'RULE-6.3') && r.enabled
    );
    let bestCombo: CourseSection[] = [];
    let bestScore = -1;
    let bestCredits = -1;
    let steps = 0;

    const search = (
      idx: number,
      currentCombo: CourseSection[],
      currentCredits: number,
      currentScore: number
    ) => {
      if (steps >= MAX_SOLVER_STEPS) return;
      steps += 1;

      if (
        currentScore > bestScore ||
        (currentScore === bestScore && currentCredits > bestCredits)
      ) {
        bestScore = currentScore;
        bestCredits = currentCredits;
        bestCombo = [...currentCombo];
      }

      if (idx >= sorted.length) return;

      // Upper-bound prune
      let remainingPotential = 0;
      for (let k = idx; k < sorted.length; k++) {
        remainingPotential += sorted[k].priorityScore;
      }
      if (currentScore + remainingPotential < bestScore) {
        return;
      }

      const candidate = sorted[idx];
      // Try each unique-schedule available section for this course (preferring more open seats)
      const orderedSections = deduplicateCandidateSections(candidate.sections).sort(
        (a, b) => b.capacity - b.enrolled - (a.capacity - a.enrolled)
      );

      for (const sec of orderedSections) {
        if (steps >= MAX_SOLVER_STEPS) break;
        if (
          isComboValid(
            currentCombo,
            sec,
            currentCredits,
            maxCredits,
            bypassRules,
            rule63Enforced
          )
        ) {
          currentCombo.push(sec);
          search(
            idx + 1,
            currentCombo,
            currentCredits + sec.credits,
            currentScore + candidate.priorityScore
          );
          currentCombo.pop();
        }
      }

      // Option: skip this course
      if (steps < MAX_SOLVER_STEPS) {
        search(idx + 1, currentCombo, currentCredits, currentScore);
      }
    };

    search(0, [], 0, 0);
    return bestCombo;
  }
}

export class MinimizeGapsStrategy implements SchedulingStrategy {
  public readonly name: ScheduleStrategy = 'MinimizeGaps';

  public solve(
    candidates: CourseCandidate[],
    maxCredits: number,
    bypassRules: BypassRule[]
  ): CourseSection[] {
    if (candidates.length === 0 || maxCredits <= 0) {
      return [];
    }

    const rule63Enforced = bypassRules.some(
      (r) => (r.id === 'rule-6-3' || r.code === 'RULE-6.3') && r.enabled
    );
    let bestCombo: CourseSection[] = [];
    let bestObjective = Number.NEGATIVE_INFINITY;
    let steps = 0;

    const search = (idx: number, currentCombo: CourseSection[], currentCredits: number) => {
      if (steps >= MAX_SOLVER_STEPS) return;
      steps += 1;

      if (currentCombo.length > 0) {
        const { idleGapMinutes, distinctDays } = calculateDailyIdleGapMinutes(currentCombo);
        const objective =
          currentCombo.length * 10_000 -
          idleGapMinutes * 10 -
          distinctDays * 50 +
          currentCredits;
        if (objective > bestObjective) {
          bestObjective = objective;
          bestCombo = [...currentCombo];
        }
      }

      if (idx >= candidates.length) return;

      const maxPossibleCourses = currentCombo.length + (candidates.length - idx);
      if (maxPossibleCourses * 10_000 + maxCredits < bestObjective && bestCombo.length > 0) {
        return;
      }

      const candidate = candidates[idx];
      const orderedSections = deduplicateCandidateSections(candidate.sections).sort(
        (a, b) => b.capacity - b.enrolled - (a.capacity - a.enrolled)
      );
      for (const sec of orderedSections) {
        if (steps >= MAX_SOLVER_STEPS) break;
        if (
          isComboValid(
            currentCombo,
            sec,
            currentCredits,
            maxCredits,
            bypassRules,
            rule63Enforced
          )
        ) {
          currentCombo.push(sec);
          search(idx + 1, currentCombo, currentCredits + sec.credits);
          currentCombo.pop();
        }
      }

      if (steps < MAX_SOLVER_STEPS) {
        search(idx + 1, currentCombo, currentCredits);
      }
    };

    search(0, [], 0);
    return bestCombo;
  }
}

function createStrategy(strategy: ScheduleStrategy | SchedulingStrategy): SchedulingStrategy {
  if (typeof strategy !== 'string') {
    return strategy;
  }
  return strategy === 'MinimizeGaps' ? new MinimizeGapsStrategy() : new MilestoneFirstStrategy();
}

function extractCourseLevel(courseCode: string): number {
  const match = courseCode.match(/(\d{3})/);
  return match ? Number(match[1]) : 100;
}

export class AdvisingEngine {
  private strategy: SchedulingStrategy;

  constructor(strategy: ScheduleStrategy | SchedulingStrategy = 'MilestoneFirst') {
    this.strategy = createStrategy(strategy);
  }

  public setStrategy(strategy: ScheduleStrategy | SchedulingStrategy): void {
    this.strategy = createStrategy(strategy);
  }

  public solve(input: SolveScheduleInput): ExtendedSolveResult {
    this.setStrategy(input.strategy);

    const maxCredits = input.maxCredits ?? input.student.maxCredits ?? 15.0;
    const bypassRules = input.bypassRules ?? [];
    const approvedExceptions = input.approvedExceptions ?? [];
    const rejectedCourses: Record<string, string> = {};
    const warnings: string[] = [];

    if (maxCredits <= 0 || input.sections.length === 0) {
      return {
        ok: true,
        recommendedSectionIds: [],
        sections: [],
        totalCredits: 0,
        clashes: [],
        strategy: this.strategy.name,
        rejectedCourses,
        idleGapMinutes: 0,
        warnings
      };
    }

    const graph = CurriculumGraph.getInstance();
    const criticalSet = new Set(graph.getCriticalPath().map((c) => normalizeCourseCode(c)));
    const clearedSet = new Set(
      input.student.clearedCourses.map((c) => normalizeCourseCode(c.code))
    );

    const requestedSet =
      input.courseCodes && input.courseCodes.length > 0
        ? new Set(input.courseCodes.map((c) => normalizeCourseCode(c)))
        : null;

    // Group sections by normalized course code
    const byCourse = new Map<string, CourseSection[]>();
    for (const sec of input.sections) {
      const key = normalizeCourseCode(sec.courseCode);
      if (requestedSet && !requestedSet.has(key)) continue;
      if (!requestedSet && clearedSet.has(key)) continue;
      const group = byCourse.get(key) ?? [];
      group.push(sec);
      byCourse.set(key, group);
    }

    const candidates: CourseCandidate[] = [];

    for (const [key, courseSections] of byCourse) {
      const representative = courseSections[0];
      const openSections = courseSections.filter((s) => s.capacity - s.enrolled > 0);
      if (openSections.length === 0) {
        rejectedCourses[representative.courseCode] = 'All sections are currently full';
        continue;
      }

      const creditCheck = checkCreditFloor(
        representative,
        input.student,
        bypassRules,
        approvedExceptions
      );
      if (!creditCheck.passed) {
        rejectedCourses[representative.courseCode] =
          `RULE-4.2: Requires ${creditCheck.requiredCredits} credits (student has ${creditCheck.studentCredits})`;
        continue;
      }

      const prereqCheck = checkPrerequisites(
        representative,
        input.student,
        bypassRules,
        approvedExceptions
      );
      if (!prereqCheck.passed) {
        rejectedCourses[representative.courseCode] =
          `Missing prerequisites: ${prereqCheck.missingPrerequisites.join(', ')}`;
        continue;
      }

      const isCritical = criticalSet.has(key);
      const dependentsCount = graph.getDependentsCount(representative.courseCode);
      const level = extractCourseLevel(representative.courseCode);
      const priorityScore =
        (isCritical ? 100 : 0) +
        dependentsCount * 20 +
        Math.round(level / 10) +
        (representative.isLab ? 5 : 0);

      candidates.push({
        courseCode: representative.courseCode,
        sections: deduplicateCandidateSections(openSections),
        priorityScore
      });
    }

    const selected = this.strategy.solve(candidates, maxCredits, bypassRules);
    const clashes: ScheduleClash[] = detectScheduleClashes(selected);
    const totalCredits = selected.reduce((sum, s) => sum + s.credits, 0);
    const { idleGapMinutes } = calculateDailyIdleGapMinutes(selected);

    const selectedCodes = new Set(selected.map((s) => normalizeCourseCode(s.courseCode)));
    for (const candidate of candidates) {
      if (!selectedCodes.has(normalizeCourseCode(candidate.courseCode))) {
        rejectedCourses[candidate.courseCode] =
          'Excluded due to timetable clash, credit cap, or exam load constraint';
      }
    }

    if (selected.length === 0 && candidates.length > 0) {
      warnings.push('No non-clashing schedule could fit within the requested credit cap.');
    }

    return {
      ok: true,
      recommendedSectionIds: selected.map((s) => s.id),
      sections: selected,
      totalCredits,
      clashes,
      strategy: this.strategy.name,
      rejectedCourses,
      idleGapMinutes,
      warnings
    };
  }
}
