import {
  CourseSection,
  StudentProfile,
  BypassRule,
  ExceptionCase,
  ScheduleClash,
  DayCode
} from '../types';
import { ROOM_FIRE_CODE_CAPS } from '../seedData';
import { CurriculumGraph, normalizeCourseCode } from './curriculumGraph';

export type { ScheduleClash };

export interface CreditFloorCheckResult {
  passed: boolean;
  ruleCode: 'RULE-4.2';
  studentCredits: number;
  requiredCredits: number;
  waiverActive?: boolean;
  overrideEligible?: boolean;
}

export interface PrerequisiteCheckResult {
  passed: boolean;
  missingPrerequisites: string[];
  bypassActive: boolean;
}

export interface ExamLoadCheckResult {
  passed: boolean;
  ruleCode: 'RULE-6.3';
  enforced: boolean;
  hasConsecutiveConflict: boolean;
  conflictingSections: CourseSection[];
}

export interface RoomCapacityCheckResult {
  passed: boolean;
  ruleCode: 'RULE-8.4';
  currentCapacity: number;
  requestedCapacity: number;
  maxRoomCapacity: number;
  reason?: string;
}

export interface TimeRange {
  startMin: number;
  endMin: number;
}

const DAY_EXPANSION_MAP: Record<string, string[]> = {
  ST: ['Sun', 'Tue'],
  MW: ['Mon', 'Wed'],
  RA: ['Thu', 'Sat'],
  Sun: ['Sun'],
  Mon: ['Mon'],
  Tue: ['Tue'],
  Wed: ['Wed'],
  Thu: ['Thu'],
  Sat: ['Sat']
};

export function expandDayCodes(dayCode: DayCode | string): string[] {
  if (DAY_EXPANSION_MAP[dayCode]) {
    return DAY_EXPANSION_MAP[dayCode];
  }
  return [dayCode];
}

function parseTimeTokenToMinutes(token: string): number | null {
  const match = token.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (meridiem === 'AM') {
    if (hours === 12) hours = 0;
  } else if (meridiem === 'PM') {
    if (hours !== 12) hours += 12;
  }

  if (hours < 0 || hours > 23) return null;
  return hours * 60 + minutes;
}

export function parseTimeSlot(timeSlot: string): TimeRange | null {
  const parts = timeSlot.split('-');
  if (parts.length !== 2) return null;
  const startMin = parseTimeTokenToMinutes(parts[0]);
  const endMin = parseTimeTokenToMinutes(parts[1]);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return null;
  }
  return { startMin, endMin };
}

/**
 * Checks Rule 4.2: Credit Floor Standing for 400-level course sections.
 * Fails when section.minCreditsRequired is defined and student.creditsCompleted < section.minCreditsRequired,
 * unless an approved ExceptionCase waiver exists for this student & course.
 * Note: RULE-4.2 being enabled grants advisor-override eligibility (>= 94 Cr), NOT unconditional self-staging pass.
 */
export function checkCreditFloor(
  section: CourseSection,
  student: StudentProfile,
  bypassRules: BypassRule[] = [],
  approvedExceptions: ExceptionCase[] = []
): CreditFloorCheckResult {
  const requiredCredits = section.minCreditsRequired ?? 0;

  if (section.minCreditsRequired === undefined || student.creditsCompleted >= section.minCreditsRequired) {
    return {
      passed: true,
      ruleCode: 'RULE-4.2',
      studentCredits: student.creditsCompleted,
      requiredCredits,
      waiverActive: false,
      overrideEligible: true
    };
  }

  const normalizedTarget = normalizeCourseCode(section.courseCode);
  const hasApprovedWaiver = approvedExceptions.some(
    (ex) =>
      ex.status === 'approved' &&
      ex.studentId === student.id &&
      normalizeCourseCode(ex.courseCode) === normalizedTarget &&
      (ex.category === 'Credit Standing' || ex.ruleCode === 'RULE-4.2')
  );

  const isRule42Enabled = bypassRules.some(
    (rule) => (rule.id === 'rule-4-2' || rule.code === 'RULE-4.2') && rule.enabled
  );

  return {
    passed: hasApprovedWaiver,
    ruleCode: 'RULE-4.2',
    studentCredits: student.creditsCompleted,
    requiredCredits,
    waiverActive: hasApprovedWaiver,
    overrideEligible: isRule42Enabled && student.creditsCompleted >= 94
  };
}

/**
 * Validates DAG prerequisite requirements against student's cleared courses.
 * Bypassed if Rule 2.1 (Prerequisite Co-Registration Exemption) is enabled or an approved Prereqs waiver exists.
 */
export function checkPrerequisites(
  section: CourseSection,
  student: StudentProfile,
  bypassRules: BypassRule[] = [],
  approvedExceptions: ExceptionCase[] = []
): PrerequisiteCheckResult {
  const normalizedTarget = normalizeCourseCode(section.courseCode);
  const hasApprovedWaiver = approvedExceptions.some(
    (ex) =>
      ex.status === 'approved' &&
      ex.studentId === student.id &&
      normalizeCourseCode(ex.courseCode) === normalizedTarget &&
      (ex.category === 'Prereqs' || ex.ruleCode === 'RULE-2.1')
  );

  const isRule21Active = bypassRules.some(
    (rule) => (rule.id === 'rule-2-1' || rule.code === 'RULE-2.1') && rule.enabled
  );

  if (isRule21Active || hasApprovedWaiver) {
    return {
      passed: true,
      missingPrerequisites: [],
      bypassActive: true
    };
  }

  const clearedSet = new Set(student.clearedCourses.map((c) => normalizeCourseCode(c.code)));
  const dagMissing = CurriculumGraph.getInstance().getMissingPrerequisites(
    section.courseCode,
    student.clearedCourses
  );

  const missingMap = new Map<string, string>();
  for (const prereq of section.prerequisites) {
    const key = normalizeCourseCode(prereq);
    if (!clearedSet.has(key) && !missingMap.has(key)) {
      missingMap.set(key, prereq);
    }
  }
  for (const prereq of dagMissing) {
    const key = normalizeCourseCode(prereq);
    if (!clearedSet.has(key) && !missingMap.has(key)) {
      missingMap.set(key, prereq);
    }
  }

  const missingPrerequisites = Array.from(missingMap.values());

  return {
    passed: missingPrerequisites.length === 0,
    missingPrerequisites,
    bypassActive: false
  };
}

/**
 * Detects timetable schedule clashes among staged sections.
 * - ST -> Sun, Tue
 * - MW -> Mon, Wed
 * - RA -> Thu, Sat
 * Uses interval-based overlap on parsed time slots (with string equality fallback).
 */
export function detectScheduleClashes(stagedSections: CourseSection[]): ScheduleClash[] {
  const clashes: ScheduleClash[] = [];

  for (let i = 0; i < stagedSections.length; i++) {
    for (let j = i + 1; j < stagedSections.length; j++) {
      const a = stagedSections[i];
      const b = stagedSections[j];

      const daysA = expandDayCodes(a.days);
      const daysB = new Set(expandDayCodes(b.days));
      const daysOverlap = daysA.some((d) => daysB.has(d));

      if (!daysOverlap) continue;

      const rangeA = parseTimeSlot(a.timeSlot);
      const rangeB = parseTimeSlot(b.timeSlot);
      const timesOverlap =
        rangeA && rangeB
          ? rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin
          : a.timeSlot === b.timeSlot;

      if (timesOverlap) {
        clashes.push({
          sectionA: a,
          sectionB: b,
          day: a.days,
          time: a.timeSlot
        });
      }
    }
  }

  return clashes;
}

function resolveExamTimestampMs(section: CourseSection): number {
  if (section.examSlot) {
    const parsed = Date.parse(section.examSlot);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  // Deterministic fallback exam slot derived from day code & start time
  const dayOffsetDays: Record<string, number> = {
    ST: 0,
    Sun: 0,
    Tue: 0,
    MW: 1,
    Mon: 1,
    Wed: 1,
    RA: 2,
    Thu: 2,
    Sat: 2
  };
  const baseMs = Date.UTC(2025, 4, 10 + (dayOffsetDays[section.days] ?? 3), 9, 0, 0);
  const range = parseTimeSlot(section.timeSlot);
  if (!range) return baseMs;
  return baseMs + Math.max(0, range.startMin - 9 * 60) * 60_000;
}

/**
 * Checks Rule 6.3: Consecutive Exam Load Rebalancer.
 * Detects 3 distinct courses having final exams within a 24-hour window.
 */
export function checkFinalExamLoad(
  sections: CourseSection[],
  bypassRules: BypassRule[] = []
): ExamLoadCheckResult {
  const enforced = bypassRules.some(
    (rule) => (rule.id === 'rule-6-3' || rule.code === 'RULE-6.3') && rule.enabled
  );

  // Deduplicate by courseCode so multi-section inputs don't double-count the same course
  const uniqueByCourse = new Map<string, CourseSection>();
  for (const sec of sections) {
    const key = normalizeCourseCode(sec.courseCode);
    if (!uniqueByCourse.has(key)) {
      uniqueByCourse.set(key, sec);
    }
  }

  const exams = Array.from(uniqueByCourse.values())
    .map((sec) => ({ section: sec, startMs: resolveExamTimestampMs(sec) }))
    .sort((a, b) => a.startMs - b.startMs);

  const WINDOW_MS = 24 * 60 * 60 * 1000;
  let hasConsecutiveConflict = false;
  let conflictingSections: CourseSection[] = [];

  for (let i = 0; i <= exams.length - 3; i++) {
    if (exams[i + 2].startMs - exams[i].startMs <= WINDOW_MS) {
      hasConsecutiveConflict = true;
      conflictingSections = [exams[i].section, exams[i + 1].section, exams[i + 2].section];
      break;
    }
  }

  return {
    passed: !enforced || !hasConsecutiveConflict,
    ruleCode: 'RULE-6.3',
    enforced,
    hasConsecutiveConflict,
    conflictingSections
  };
}

/**
 * Checks Rule 8.4: Physical room fire-code capacity ceiling.
 */
export function checkRoomCapacity(
  section: CourseSection,
  deltaOrTargetCapacity: number,
  bypassRules: BypassRule[] = [],
  isDelta = true
): RoomCapacityCheckResult {
  const maxRoomCapacity = section.roomCap ?? ROOM_FIRE_CODE_CAPS[section.room] ?? 55;
  const requestedCapacity = isDelta ? section.capacity + deltaOrTargetCapacity : deltaOrTargetCapacity;

  if (
    !Number.isFinite(deltaOrTargetCapacity) ||
    (isDelta && (deltaOrTargetCapacity <= 0 || !Number.isInteger(deltaOrTargetCapacity))) ||
    !Number.isInteger(requestedCapacity)
  ) {
    return {
      passed: false,
      ruleCode: 'RULE-8.4',
      currentCapacity: section.capacity,
      requestedCapacity,
      maxRoomCapacity,
      reason: 'Capacity expansion delta must be a positive integer.'
    };
  }

  if (requestedCapacity < section.enrolled) {
    return {
      passed: false,
      ruleCode: 'RULE-8.4',
      currentCapacity: section.capacity,
      requestedCapacity,
      maxRoomCapacity,
      reason: `Cannot reduce capacity below currently enrolled count (${section.enrolled}).`
    };
  }

  if (requestedCapacity > section.capacity && bypassRules.length > 0) {
    const rule84 = bypassRules.find((r) => r.id === 'rule-8-4' || r.code === 'RULE-8.4');
    if (rule84 && !rule84.enabled) {
      return {
        passed: false,
        ruleCode: 'RULE-8.4',
        currentCapacity: section.capacity,
        requestedCapacity,
        maxRoomCapacity,
        reason: 'RULE-8.4 (Department Head Seat Override) is currently suspended.'
      };
    }
  }

  if (requestedCapacity > maxRoomCapacity) {
    return {
      passed: false,
      ruleCode: 'RULE-8.4',
      currentCapacity: section.capacity,
      requestedCapacity,
      maxRoomCapacity,
      reason: `Requested capacity (${requestedCapacity}) exceeds ${section.room} fire-code limit (${maxRoomCapacity}).`
    };
  }

  return {
    passed: true,
    ruleCode: 'RULE-8.4',
    currentCapacity: section.capacity,
    requestedCapacity,
    maxRoomCapacity
  };
}
