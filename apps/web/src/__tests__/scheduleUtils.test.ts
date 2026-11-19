import { describe, it, expect } from 'vitest';
import {
  expandDayCodes,
  detectScheduleClashes,
  sectionMatchesDayAndSlot,
  timeSlotsOverlap,
  parseTimeSlot,
  computeSlotCountdown,
  computeCreditPercentage,
  getRoomFireCodeCap,
  getBuildingTransitions,
  getInitials,
  enrichAuditChecks,
  buildTelemetryChartGeometry
} from '@/store/scheduleUtils';
import { INITIAL_SECTIONS, INITIAL_EXCEPTIONS, INITIAL_BYPASS_RULES } from '@/store/smartAdvisorStore';
import { CourseSection } from '@/types';

describe('scheduleUtils', () => {
  it('expands NSU day codes including RA -> Thu and Sat', () => {
    expect(expandDayCodes('ST')).toEqual(['Sun', 'Tue']);
    expect(expandDayCodes('MW')).toEqual(['Mon', 'Wed']);
    expect(expandDayCodes('RA')).toEqual(['Thu', 'Sat']);
    expect(expandDayCodes('Thu')).toEqual(['Thu']);
  });

  it('matches RA sections on Thursday and Saturday, never Sunday', () => {
    const raSection = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-04')!;
    expect(raSection.days).toBe('RA');
    expect(sectionMatchesDayAndSlot(raSection, 'Thursday', '04:20 PM - 05:50 PM')).toBe(true);
    expect(sectionMatchesDayAndSlot(raSection, 'Saturday', '04:20 PM - 05:50 PM')).toBe(true);
    expect(sectionMatchesDayAndSlot(raSection, 'Sunday', '04:20 PM - 05:50 PM')).toBe(false);
  });

  it('matches multi-slot Thursday lab across overlapping timetable rows', () => {
    const lab = INITIAL_SECTIONS.find((s) => s.id === 'CSE311L-02')!;
    expect(sectionMatchesDayAndSlot(lab, 'Thursday', '09:40 AM - 11:10 AM')).toBe(true);
    expect(sectionMatchesDayAndSlot(lab, 'Thursday', '11:20 AM - 12:50 PM')).toBe(true);
    expect(sectionMatchesDayAndSlot(lab, 'Thursday', '01:20 PM - 02:50 PM')).toBe(false);
  });

  it('detects clashes for RA vs Thu interval overlap and ignores non-overlapping times', () => {
    const thuLab = INITIAL_SECTIONS.find((s) => s.id === 'CSE311L-02')!; // Thu 09:40 AM - 12:40 PM
    const raMorningOverlap: CourseSection = {
      ...INITIAL_SECTIONS[0],
      id: 'TEST-RA-1120',
      courseCode: 'CSE 332',
      days: 'RA',
      timeSlot: '11:20 AM - 12:50 PM'
    };
    const raEvening = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-04')!; // RA 04:20 PM - 05:50 PM

    const clashesWithOverlap = detectScheduleClashes([thuLab, raMorningOverlap]);
    expect(clashesWithOverlap).toHaveLength(1);
    expect(clashesWithOverlap[0].day).toContain('Thu');

    const clashesWithoutOverlap = detectScheduleClashes([thuLab, raEvening]);
    expect(clashesWithoutOverlap).toHaveLength(0);
  });

  it('computes slot countdown dynamically from slotClosesAt', () => {
    const now = Date.UTC(2025, 4, 10, 10, 0, 0);
    const closes = new Date(now + (2 * 3600 + 15 * 60 + 9) * 1000).toISOString();
    expect(computeSlotCountdown(closes, now)).toEqual({
      hours: 2,
      minutes: 15,
      seconds: 9,
      expired: false
    });
    expect(computeSlotCountdown(new Date(now - 5000).toISOString(), now)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true
    });
  });

  it('computes dynamic credit percentages accurately', () => {
    expect(computeCreditPercentage(96, 130)).toBe(73.8);
    expect(computeCreditPercentage(68, 130)).toBe(52.3);
    expect(computeCreditPercentage(112, 130)).toBe(86.2);
  });

  it('enforces room fire-code caps and enriches exception audit checks to 6 points', () => {
    const lib608 = INITIAL_SECTIONS.find((s) => s.id === 'CSE311L-02')!;
    expect(getRoomFireCodeCap(lib608)).toBe(45);
    expect(getInitials('Dr. Nova Ahmed')).toBe('NA');
    expect(getInitials('Rahim Ahmed')).toBe('RA');
    expect(getBuildingTransitions([INITIAL_SECTIONS[0], INITIAL_SECTIONS[3]]).summary).toContain('SAC & LIB');

    const farihaCase = INITIAL_EXCEPTIONS.find((e) => e.id === 'CASE #EX-2025-0839')!;
    expect(farihaCase.auditChecks).toHaveLength(2);
    const enriched = enrichAuditChecks(farihaCase, INITIAL_SECTIONS, INITIAL_BYPASS_RULES, 130);
    expect(enriched.length).toBe(6);
  });

  it('builds data-driven SVG chart geometry reflecting SLA ceiling and latency points', () => {
    const geo = buildTelemetryChartGeometry(
      [
        { time: '10:00', rps: 1500, latency: 150 },
        { time: '10:05', rps: 3450, latency: 275 }
      ],
      200
    );
    expect(geo.points).toHaveLength(2);
    expect(geo.latencyPath).toContain('M ');
    expect(geo.latencyPath).toContain('L ');
    expect(geo.points[1].cyLatency).toBeLessThan(geo.slaY);
    expect(geo.points[0].cyLatency).toBeGreaterThan(geo.slaY);
  });

  it('normalizes case/whitespace in expandDayCodes and handles TBA / Unicode dashes in timeSlotsOverlap', () => {
    expect(expandDayCodes(' ra ')).toEqual(['Thu', 'Sat']);
    expect(expandDayCodes('st')).toEqual(['Sun', 'Tue']);
    expect(expandDayCodes('mw')).toEqual(['Mon', 'Wed']);
    expect(expandDayCodes('thursday')).toEqual(['Thu']);

    expect(timeSlotsOverlap('TBA', 'TBA')).toBe(false);
    expect(timeSlotsOverlap('', '')).toBe(false);
    expect(parseTimeSlot('09:40 AM \u2013 11:10 AM')).toEqual({ startMin: 580, endMin: 670 });
    expect(timeSlotsOverlap('09:40 AM \u2013 11:10 AM', '09:40 AM - 11:10 AM')).toBe(true);
  });
});
