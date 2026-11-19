import { describe, it, expect } from 'vitest';
import {
  checkCreditFloor,
  checkPrerequisites,
  detectScheduleClashes,
  checkFinalExamLoad,
  checkRoomCapacity
} from './services/ruleValidator';
import {
  INITIAL_STUDENT,
  INITIAL_SECTIONS,
  INITIAL_BYPASS_RULES,
  INITIAL_EXCEPTIONS
} from './seedData';
import { CourseSection, ExceptionCase } from './types';

describe('Rule Validator Engine (RULE-4.2, RULE-2.1, RULE-6.3, RULE-8.4, Clashes)', () => {
  it('checkCreditFloor blocks 96 < 100 even with pending exception, and passes when >= 100 or approved waiver exists', () => {
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!;

    // Pending exception does NOT bypass RULE-4.2
    const pendingRes = checkCreditFloor(
      cse425,
      INITIAL_STUDENT,
      INITIAL_BYPASS_RULES,
      INITIAL_EXCEPTIONS
    );
    expect(pendingRes.passed).toBe(false);
    expect(pendingRes.overrideEligible).toBe(true);
    expect(pendingRes.waiverActive).toBe(false);

    // Student with 100+ credits passes
    const seniorStudent = { ...INITIAL_STUDENT, creditsCompleted: 102 };
    expect(checkCreditFloor(cse425, seniorStudent).passed).toBe(true);

    // Approved ExceptionCase waiver passes
    const approvedWaiver: ExceptionCase = {
      ...INITIAL_EXCEPTIONS[0],
      status: 'approved'
    };
    const waivedRes = checkCreditFloor(cse425, INITIAL_STUDENT, INITIAL_BYPASS_RULES, [
      approvedWaiver
    ]);
    expect(waivedRes.passed).toBe(true);
    expect(waivedRes.waiverActive).toBe(true);
  });

  it('checkPrerequisites checks missing prerequisites when RULE-2.1 is disabled and bypasses when enabled or waived', () => {
    const mat361 = INITIAL_SECTIONS.find((s) => s.id === 'MAT361-04')!;
    const disabledRules = INITIAL_BYPASS_RULES.map((r) =>
      r.code === 'RULE-2.1' ? { ...r, enabled: false } : r
    );

    const failRes = checkPrerequisites(mat361, INITIAL_STUDENT, disabledRules);
    expect(failRes.passed).toBe(false);
    expect(failRes.missingPrerequisites).toEqual(['MAT 120']);
    expect(failRes.bypassActive).toBe(false);

    const bypassRes = checkPrerequisites(mat361, INITIAL_STUDENT, INITIAL_BYPASS_RULES);
    expect(bypassRes.passed).toBe(true);
    expect(bypassRes.bypassActive).toBe(true);

    const approvedPrereqCase: ExceptionCase = {
      ...INITIAL_EXCEPTIONS[2],
      studentId: INITIAL_STUDENT.id,
      courseCode: 'MAT 361',
      category: 'Prereqs',
      status: 'approved'
    };
    const waivedRes = checkPrerequisites(mat361, INITIAL_STUDENT, disabledRules, [
      approvedPrereqCase
    ]);
    expect(waivedRes.passed).toBe(true);
    expect(waivedRes.bypassActive).toBe(true);
  });

  it('detectScheduleClashes properly maps RA to Thu AND Sat, and ignores Sun/Mon', () => {
    const base = INITIAL_SECTIONS[0];
    const raSec: CourseSection = {
      ...base,
      id: 'RA-1',
      days: 'RA',
      timeSlot: '09:40 AM - 11:10 AM'
    };
    const satSec: CourseSection = {
      ...base,
      id: 'SAT-1',
      days: 'Sat',
      timeSlot: '09:40 AM - 11:10 AM'
    };
    const thuSec: CourseSection = {
      ...base,
      id: 'THU-1',
      days: 'Thu',
      timeSlot: '09:40 AM - 11:10 AM'
    };
    const sunSec: CourseSection = {
      ...base,
      id: 'SUN-1',
      days: 'Sun',
      timeSlot: '09:40 AM - 11:10 AM'
    };

    expect(detectScheduleClashes([raSec, satSec])).toHaveLength(1);
    expect(detectScheduleClashes([raSec, thuSec])).toHaveLength(1);
    expect(detectScheduleClashes([raSec, sunSec])).toHaveLength(0);
  });

  it('detectScheduleClashes detects interval overlaps for 3-hour labs and partial overlaps while allowing back-to-back slots', () => {
    const lab = INITIAL_SECTIONS.find((s) => s.id === 'CSE311L-02')!; // Thu 09:40 AM - 12:40 PM
    const raMorning: CourseSection = {
      ...INITIAL_SECTIONS[3],
      id: 'TEST-RA-MORN',
      days: 'RA',
      timeSlot: '09:40 AM - 11:10 AM'
    };
    const raMid: CourseSection = {
      ...INITIAL_SECTIONS[3],
      id: 'TEST-RA-MID',
      days: 'RA',
      timeSlot: '11:20 AM - 12:50 PM'
    };
    expect(detectScheduleClashes([lab, raMorning])).toHaveLength(1);
    expect(detectScheduleClashes([lab, raMid])).toHaveLength(1);
    expect(detectScheduleClashes([raMorning, raMid])).toHaveLength(0);

    // Partial 10-minute overlap: CSE331-01 (MW 01:20 PM - 02:50 PM) vs CSE425-01 (MW 02:40 PM - 04:10 PM)
    const cse331 = INITIAL_SECTIONS.find((s) => s.id === 'CSE331-01')!;
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!;
    expect(detectScheduleClashes([cse331, cse425])).toHaveLength(1);

    // Exact touching boundary should NOT clash
    const touchA: CourseSection = {
      ...raMorning,
      id: 'TOUCH-A',
      days: 'Mon',
      timeSlot: '09:40 AM - 11:10 AM'
    };
    const touchB: CourseSection = {
      ...raMorning,
      id: 'TOUCH-B',
      days: 'Mon',
      timeSlot: '11:10 AM - 12:40 PM'
    };
    expect(detectScheduleClashes([touchA, touchB])).toHaveLength(0);
  });

  it('checkFinalExamLoad (RULE-6.3) detects 3 exams within 24h when enforced and passes when suspended or spread > 24h', () => {
    const cse327 = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-01')!; // May 10 09:00Z
    const cse331 = INITIAL_SECTIONS.find((s) => s.id === 'CSE331-01')!; // May 10 14:00Z
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!; // May 10 19:00Z
    const mat361 = INITIAL_SECTIONS.find((s) => s.id === 'MAT361-04')!; // May 14 09:00Z

    // Suspended by default in seed
    const suspendedRes = checkFinalExamLoad([cse327, cse331, cse425], INITIAL_BYPASS_RULES);
    expect(suspendedRes.passed).toBe(true);
    expect(suspendedRes.enforced).toBe(false);
    expect(suspendedRes.hasConsecutiveConflict).toBe(true);

    // Enforced when RULE-6.3 enabled
    const enabledRules = INITIAL_BYPASS_RULES.map((r) =>
      r.code === 'RULE-6.3' ? { ...r, enabled: true } : r
    );
    const failRes = checkFinalExamLoad([cse327, cse331, cse425], enabledRules);
    expect(failRes.passed).toBe(false);
    expect(failRes.enforced).toBe(true);
    expect(failRes.conflictingSections).toHaveLength(3);

    // Spread > 24h passes
    const spreadRes = checkFinalExamLoad([cse327, cse331, mat361], enabledRules);
    expect(spreadRes.passed).toBe(true);
    expect(spreadRes.hasConsecutiveConflict).toBe(false);
  });

  it('checkRoomCapacity (RULE-8.4) enforces physical fire-code caps and rule toggle state', () => {
    const cse327 = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-01')!; // SAC 502 cap 40, roomCap 55
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!; // LIB 602 cap 40, roomCap 55
    const cse311L = INITIAL_SECTIONS.find((s) => s.id === 'CSE311L-02')!; // LIB 608 cap 35, roomCap 45

    expect(checkRoomCapacity(cse327, 10, INITIAL_BYPASS_RULES).passed).toBe(true);
    expect(checkRoomCapacity(cse425, 20, INITIAL_BYPASS_RULES).passed).toBe(false);
    expect(checkRoomCapacity(cse311L, 15, INITIAL_BYPASS_RULES).passed).toBe(false);
    expect(checkRoomCapacity(cse327, 0, INITIAL_BYPASS_RULES).passed).toBe(false);
    expect(checkRoomCapacity(cse327, -5, INITIAL_BYPASS_RULES).passed).toBe(false);
    expect(checkRoomCapacity(cse327, 1.5, INITIAL_BYPASS_RULES, true).passed).toBe(false);

    const disabledRule84 = INITIAL_BYPASS_RULES.map((r) =>
      r.code === 'RULE-8.4' ? { ...r, enabled: false } : r
    );
    expect(checkRoomCapacity(cse327, 5, disabledRule84).passed).toBe(false);
  });

  it('checkCreditFloor enforces exact 100===100 pass and 94/93 overrideEligible boundaries', () => {
    const cse425 = INITIAL_SECTIONS.find((s) => s.id === 'CSE425-01')!;

    // Exact floor 100 === 100 passes
    const exact100 = checkCreditFloor(
      cse425,
      { ...INITIAL_STUDENT, creditsCompleted: 100 },
      INITIAL_BYPASS_RULES,
      []
    );
    expect(exact100.passed).toBe(true);
    expect(exact100.studentCredits).toBe(100);
    expect(exact100.requiredCredits).toBe(100);

    // 94 credits with RULE-4.2 enabled -> fails self-stage, overrideEligible: true
    const at94 = checkCreditFloor(
      cse425,
      { ...INITIAL_STUDENT, creditsCompleted: 94 },
      INITIAL_BYPASS_RULES,
      []
    );
    expect(at94.passed).toBe(false);
    expect(at94.overrideEligible).toBe(true);

    // 93 credits with RULE-4.2 enabled -> fails self-stage, overrideEligible: false
    const at93 = checkCreditFloor(
      cse425,
      { ...INITIAL_STUDENT, creditsCompleted: 93 },
      INITIAL_BYPASS_RULES,
      []
    );
    expect(at93.passed).toBe(false);
    expect(at93.overrideEligible).toBe(false);
  });

  it('checkRoomCapacity(..., isDelta=false) rejects target capacity below enrolled count and accepts valid target', () => {
    const cse327 = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-01')!; // enrolled 28, capacity 40, roomCap 55

    const belowEnrolled = checkRoomCapacity(cse327, cse327.enrolled - 1, INITIAL_BYPASS_RULES, false);
    expect(belowEnrolled.passed).toBe(false);
    expect(belowEnrolled.requestedCapacity).toBe(27);
    expect(belowEnrolled.reason).toContain('currently enrolled count (28)');

    const validTarget = checkRoomCapacity(cse327, 45, INITIAL_BYPASS_RULES, false);
    expect(validTarget.passed).toBe(true);
    expect(validTarget.requestedCapacity).toBe(45);
  });
});
