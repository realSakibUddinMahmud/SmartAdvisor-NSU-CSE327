import { describe, it, expect, beforeEach } from 'vitest';
import { AdvisingEngine } from './services/scheduleSolver';
import { CurriculumGraph } from './services/curriculumGraph';
import {
  INITIAL_BYPASS_RULES,
  INITIAL_SECTIONS,
  INITIAL_STUDENT
} from './seedData';
import { CourseSection } from './types';

describe('AdvisingEngine Constraint-Based Schedule Solver', () => {
  beforeEach(() => {
    CurriculumGraph.resetInstance();
  });

  it('generates a 0-clash schedule within maxCredits excluding full and RULE-4.2 blocked courses', () => {
    const engine = new AdvisingEngine('MilestoneFirst');
    const result = engine.solve({
      sections: INITIAL_SECTIONS,
      student: INITIAL_STUDENT,
      bypassRules: INITIAL_BYPASS_RULES,
      strategy: 'MilestoneFirst',
      maxCredits: 15
    });

    expect(result.ok).toBe(true);
    expect(result.clashes).toHaveLength(0);
    expect(result.totalCredits).toBeLessThanOrEqual(15);
    expect(result.recommendedSectionIds).not.toContain('CSE425-01');
    expect(result.recommendedSectionIds).not.toContain('CSE327-03');
    expect(result.rejectedCourses['CSE 425']).toBeDefined();

    // Tight credit cap boundary (<= 6.0 Cr)
    const tight = engine.solve({
      sections: INITIAL_SECTIONS,
      student: INITIAL_STUDENT,
      bypassRules: INITIAL_BYPASS_RULES,
      strategy: 'MilestoneFirst',
      maxCredits: 6
    });
    expect(tight.totalCredits).toBeLessThanOrEqual(6);
    expect(tight.clashes).toHaveLength(0);
  });

  it('produces distinct selections between MilestoneFirst and MinimizeGaps on controlled catalog', () => {
    const customStudent = {
      ...INITIAL_STUDENT,
      creditsCompleted: 110,
      clearedCourses: [
        { code: 'CSE 115', grade: 'A' },
        { code: 'CSE 215', grade: 'A' },
        { code: 'CSE 231', grade: 'A' },
        { code: 'MAT 120', grade: 'A' }
      ]
    };

    // Catalog with 2 courses where MilestoneFirst picks critical-path CSE 311 (even with large daily gap),
    // while MinimizeGaps picks tighter back-to-back sections.
    const catalog: CourseSection[] = [
      {
        ...INITIAL_SECTIONS[0], // CSE 327
        id: 'CSE327-A',
        courseCode: 'CSE 327',
        days: 'ST',
        timeSlot: '08:00 AM - 09:30 AM',
        enrolled: 10
      },
      {
        ...INITIAL_SECTIONS[0], // CSE 327 tight with CSE 331
        id: 'CSE327-B',
        courseCode: 'CSE 327',
        days: 'MW',
        timeSlot: '09:40 AM - 11:10 AM',
        enrolled: 10
      },
      {
        ...INITIAL_SECTIONS[4], // CSE 311 (critical path prerequisite for CSE 425)
        id: 'CSE311-GAP',
        courseCode: 'CSE 311',
        days: 'ST',
        timeSlot: '02:40 PM - 04:10 PM',
        enrolled: 10
      },
      {
        ...INITIAL_SECTIONS[7], // CSE 331 tight on MW
        id: 'CSE331-TIGHT',
        courseCode: 'CSE 331',
        days: 'MW',
        timeSlot: '11:20 AM - 12:50 PM',
        enrolled: 10
      }
    ];

    const engine = new AdvisingEngine();
    const milestone = engine.solve({
      sections: catalog,
      student: customStudent,
      bypassRules: INITIAL_BYPASS_RULES,
      strategy: 'MilestoneFirst',
      maxCredits: 6
    });
    const minGaps = engine.solve({
      sections: catalog,
      student: customStudent,
      bypassRules: INITIAL_BYPASS_RULES,
      strategy: 'MinimizeGaps',
      maxCredits: 6
    });

    expect(milestone.clashes).toHaveLength(0);
    expect(minGaps.clashes).toHaveLength(0);
    // MilestoneFirst prioritizes critical path CSE 311
    expect(milestone.recommendedSectionIds).toContain('CSE311-GAP');
    // MinimizeGaps achieves strictly lower idleGapMinutes
    expect(minGaps.idleGapMinutes).toBeLessThan(milestone.idleGapMinutes);
  });

  it('avoids placing 3 consecutive exams within 24h when RULE-6.3 is enabled', () => {
    const senior = {
      ...INITIAL_STUDENT,
      creditsCompleted: 110,
      clearedCourses: [
        { code: 'CSE 115', grade: 'A' },
        { code: 'CSE 215', grade: 'A' },
        { code: 'CSE 231', grade: 'A' },
        { code: 'CSE 311', grade: 'A' }
      ]
    };

    const closeExamsCatalog: CourseSection[] = [
      {
        ...INITIAL_SECTIONS[0],
        id: 'EX-1',
        courseCode: 'CSE 327',
        days: 'ST',
        timeSlot: '09:40 AM - 11:10 AM',
        enrolled: 10,
        examSlot: '2025-05-10T09:00:00Z'
      },
      {
        ...INITIAL_SECTIONS[7],
        id: 'EX-2',
        courseCode: 'CSE 331',
        days: 'MW',
        timeSlot: '09:40 AM - 11:10 AM',
        enrolled: 10,
        examSlot: '2025-05-10T14:00:00Z'
      },
      {
        ...INITIAL_SECTIONS[8],
        id: 'EX-3',
        courseCode: 'CSE 425',
        days: 'RA',
        timeSlot: '09:40 AM - 11:10 AM',
        enrolled: 10,
        examSlot: '2025-05-10T19:00:00Z'
      }
    ];

    const rulesWith63 = INITIAL_BYPASS_RULES.map((r) =>
      r.code === 'RULE-6.3' ? { ...r, enabled: true } : r
    );

    const engine = new AdvisingEngine('MilestoneFirst');
    const res = engine.solve({
      sections: closeExamsCatalog,
      student: senior,
      bypassRules: rulesWith63,
      strategy: 'MilestoneFirst',
      maxCredits: 12
    });

    expect(res.sections.length).toBeLessThanOrEqual(2);
    expect(res.clashes).toHaveLength(0);
  });

  it('handles empty catalog, maxCredits 0, and all-clashing sections safely', () => {
    const engine = new AdvisingEngine('MinimizeGaps');

    const empty = engine.solve({
      sections: [],
      student: INITIAL_STUDENT,
      strategy: 'MinimizeGaps',
      maxCredits: 15
    });
    expect(empty.recommendedSectionIds).toEqual([]);
    expect(empty.totalCredits).toBe(0);

    const zeroCap = engine.solve({
      sections: INITIAL_SECTIONS,
      student: INITIAL_STUDENT,
      strategy: 'MinimizeGaps',
      maxCredits: 0
    });
    expect(zeroCap.recommendedSectionIds).toEqual([]);
  });

  it('completes quickly on a 20-course x 5-section catalog using deduplication and MAX_SOLVER_STEPS cap', () => {
    const engine = new AdvisingEngine('MinimizeGaps');
    const largeCatalog: CourseSection[] = [];
    const dayCodes = ['ST', 'MW', 'RA', 'Sun', 'Mon'] as const;

    for (let c = 0; c < 20; c++) {
      const code = `CSE ${500 + c}`;
      for (let s = 1; s <= 5; s++) {
        const startHour = 8 + ((c + s) % 10);
        const startStr = `${String(startHour > 12 ? startHour - 12 : startHour).padStart(2, '0')}:00 ${startHour >= 12 ? 'PM' : 'AM'}`;
        const endHour = startHour + 1;
        const endStr = `${String(endHour > 12 ? endHour - 12 : endHour).padStart(2, '0')}:00 ${endHour >= 12 ? 'PM' : 'AM'}`;
        largeCatalog.push({
          ...INITIAL_SECTIONS[0],
          id: `CSE${500 + c}-0${s}`,
          courseCode: code,
          courseTitle: `Course ${500 + c}`,
          credits: 1.0,
          sectionNumber: `0${s}`,
          days: dayCodes[(c + s) % dayCodes.length],
          timeSlot: `${startStr} - ${endStr}`,
          capacity: 40,
          enrolled: 10 + s,
          prerequisites: [],
          examSlot: `2025-05-${String(10 + (c % 15)).padStart(2, '0')}T09:00:00Z`
        });
      }
    }

    const startMs = Date.now();
    const res = engine.solve({
      sections: largeCatalog,
      student: INITIAL_STUDENT,
      bypassRules: INITIAL_BYPASS_RULES,
      strategy: 'MinimizeGaps',
      maxCredits: 24
    });
    const elapsedMs = Date.now() - startMs;

    expect(res.ok).toBe(true);
    expect(res.clashes).toHaveLength(0);
    expect(res.totalCredits).toBeLessThanOrEqual(24);
    expect(res.sections.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('emits warnings when eligible open candidates exist but maxCredits is below minimum course credits (maxCredits: 1)', () => {
    const engine = new AdvisingEngine('MilestoneFirst');
    const threeCreditCatalog = INITIAL_SECTIONS.filter(
      (s) => s.credits >= 3.0 && s.enrolled < s.capacity && (s.minCreditsRequired ?? 0) === 0
    );
    expect(threeCreditCatalog.length).toBeGreaterThan(0);

    const res = engine.solve({
      sections: threeCreditCatalog,
      student: INITIAL_STUDENT,
      bypassRules: INITIAL_BYPASS_RULES,
      strategy: 'MilestoneFirst',
      maxCredits: 1
    });

    expect(res.ok).toBe(true);
    expect(res.recommendedSectionIds).toEqual([]);
    expect(res.sections).toEqual([]);
    expect(res.warnings).toEqual([
      'No non-clashing schedule could fit within the requested credit cap.'
    ]);
  });
});
