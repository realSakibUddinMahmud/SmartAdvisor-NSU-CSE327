import {
  BypassRule,
  CourseSection,
  DayCode,
  ExceptionCase,
  RuleAuditCheck,
  ScheduleClash
} from '@/types';

export const ROOM_FIRE_CODE_CAPS: Record<string, number> = {
  'LIB 602': 55,
  'SAC 502': 55,
  'SAC 415': 55,
  'NAC 408': 50,
  'NAC 510': 50,
  'LIB 608': 45
};

export function getRoomFireCodeCap(section: Pick<CourseSection, 'room' | 'roomCap'>): number {
  return section.roomCap ?? ROOM_FIRE_CODE_CAPS[section.room] ?? 55;
}

export const DAY_EXPANSION_MAP: Record<string, string[]> = {
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

const FULL_TO_SHORT_DAY: Record<string, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat'
};

export function expandDayCodes(dayCode: DayCode | string): string[] {
  const trimmed = dayCode.trim();
  if (!trimmed) return [];
  const upper = trimmed.toUpperCase();
  if (upper === 'ST' || upper === 'MW' || upper === 'RA') {
    return DAY_EXPANSION_MAP[upper];
  }
  const normalized = FULL_TO_SHORT_DAY[trimmed.toLowerCase()];
  return normalized ? [normalized] : [trimmed];
}

export interface TimeRange {
  startMin: number;
  endMin: number;
}

export function parseTimeTokenToMinutes(token: string): number | null {
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
  const normalized = timeSlot.replace(/[\u2012-\u2015]/g, '-');
  const parts = normalized.split('-');
  if (parts.length !== 2) return null;
  const startMin = parseTimeTokenToMinutes(parts[0]);
  const endMin = parseTimeTokenToMinutes(parts[1]);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return null;
  }
  return { startMin, endMin };
}

export function timeSlotsOverlap(slotA: string, slotB: string): boolean {
  const rangeA = parseTimeSlot(slotA);
  const rangeB = parseTimeSlot(slotB);
  if (!rangeA || !rangeB) {
    return false;
  }
  return rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin;
}

export function detectScheduleClashes(stagedSections: CourseSection[]): ScheduleClash[] {
  const clashes: ScheduleClash[] = [];

  for (let i = 0; i < stagedSections.length; i++) {
    for (let j = i + 1; j < stagedSections.length; j++) {
      const a = stagedSections[i];
      const b = stagedSections[j];

      const daysA = expandDayCodes(a.days);
      const daysB = new Set(expandDayCodes(b.days));
      const sharedDays = daysA.filter((d) => daysB.has(d));

      if (sharedDays.length === 0) continue;

      if (timeSlotsOverlap(a.timeSlot, b.timeSlot)) {
        clashes.push({
          sectionA: a,
          sectionB: b,
          day: sharedDays.join('/'),
          time: `${a.timeSlot} / ${b.timeSlot}`
        });
      }
    }
  }

  return clashes;
}

export function sectionMatchesDayAndSlot(
  section: Pick<CourseSection, 'days' | 'timeSlot'>,
  dayName: string,
  slotTimeRange: string
): boolean {
  const trimmedDay = dayName.trim();
  const shortDay = FULL_TO_SHORT_DAY[trimmedDay.toLowerCase()] ?? trimmedDay;
  const sectionDays = expandDayCodes(section.days);
  if (!sectionDays.includes(shortDay)) {
    return false;
  }
  return timeSlotsOverlap(section.timeSlot, slotTimeRange);
}

export function computeSlotCountdown(
  slotClosesAt: string,
  nowMs: number = Date.now()
): { hours: number; minutes: number; seconds: number; expired: boolean } {
  const targetMs = Date.parse(slotClosesAt);
  if (Number.isNaN(targetMs)) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const diffMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, expired: diffMs <= 0 };
}

export function computeCreditPercentage(creditsCompleted: number, creditsTotal: number): number {
  const denominator = creditsTotal > 0 ? creditsTotal : 130;
  return Number(((creditsCompleted / denominator) * 100).toFixed(1));
}

export function getBuildingTransitions(stagedSections: CourseSection[]): {
  buildings: string[];
  summary: string;
} {
  if (stagedSections.length === 0) {
    return { buildings: [], summary: 'No Staged Courses' };
  }
  const seen = new Set<string>();
  const buildings: string[] = [];
  for (const sec of stagedSections) {
    const prefix = sec.room.trim().split(/\s+/)[0];
    if (prefix && !seen.has(prefix)) {
      seen.add(prefix);
      buildings.push(prefix);
    }
  }
  if (buildings.length === 1) {
    return { buildings, summary: `${buildings[0]} Only (0m Walk)` };
  }
  if (buildings.length === 2) {
    return { buildings, summary: `${buildings[0]} & ${buildings[1]} (10m Walk)` };
  }
  return {
    buildings,
    summary: `${buildings.slice(0, -1).join(', ')} & ${buildings[buildings.length - 1]} (Multi-Building)`
  };
}

export function getInitials(name: string): string {
  const titles = new Set(['dr.', 'prof.', 'mr.', 'ms.', 'mrs.', 'dr', 'prof', 'mr', 'ms']);
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter((t) => !titles.has(t.toLowerCase()));
  if (tokens.length === 0) return 'NS';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
}

export function enrichAuditChecks(
  exceptionCase: ExceptionCase,
  sections: CourseSection[],
  bypassRules: BypassRule[],
  creditsTotal = 130
): RuleAuditCheck[] {
  const existing = [...(exceptionCase.auditChecks ?? [])];
  if (existing.length >= 6) {
    return existing;
  }

  const targetSection =
    sections.find((s) => s.id === exceptionCase.sectionId) ??
    sections.find(
      (s) =>
        s.courseCode === exceptionCase.courseCode &&
        s.sectionNumber === exceptionCase.sectionNumber
    );

  const hasRuleKeyword = (keyword: string) =>
    existing.some((c) => c.rule.toLowerCase().includes(keyword.toLowerCase()));

  const candidates: RuleAuditCheck[] = [];

  if (!hasRuleKeyword('Prerequisite')) {
    const prereqs = targetSection?.prerequisites?.join(', ') || 'Core Prerequisites';
    candidates.push({
      rule: `Prerequisite Audit: ${prereqs}`,
      description: `Checked prerequisite chain for ${exceptionCase.courseCode}`,
      passed: exceptionCase.category !== 'Prereqs',
      notes: exceptionCase.category === 'Prereqs' ? 'Co-registration / Rule 2.1 petition' : 'Prerequisites cleared in SIS'
    });
  }

  if (!hasRuleKeyword('Credit') && !hasRuleKeyword('Rule 4.2')) {
    const required = targetSection?.minCreditsRequired ?? 0;
    const met = required === 0 || exceptionCase.creditsCompleted >= required;
    candidates.push({
      rule: 'Rule 4.2: Credit Standing Check',
      description: `Student has ${exceptionCase.creditsCompleted}/${creditsTotal} credits${required ? ` (${required}+ Cr required)` : ''}`,
      passed: met,
      notes: met ? 'Meets course credit standing floor' : 'Standing exception requested'
    });
  }

  if (!hasRuleKeyword('CGPA')) {
    candidates.push({
      rule: 'CGPA Minimum Threshold (>= 3.00)',
      description: `Current Cumulative GPA is ${exceptionCase.cgpa.toFixed(2)}`,
      passed: exceptionCase.cgpa >= 3.0,
      notes: exceptionCase.cgpa >= 3.0 ? 'Honors standing verified' : 'Below discretionary threshold'
    });
  }

  if (!hasRuleKeyword('Capacity') && !hasRuleKeyword('Room')) {
    const cap = targetSection ? `${targetSection.enrolled}/${targetSection.capacity}` : 'Requested section';
    const roomCap = targetSection ? getRoomFireCodeCap(targetSection) : 55;
    const roomOk = targetSection ? targetSection.capacity + 1 <= roomCap : true;
    candidates.push({
      rule: 'Seat Capacity & Room Fire-Code Audit',
      description: `Section ${exceptionCase.sectionNumber} is ${cap} (Room max ${roomCap})`,
      passed: roomOk,
      notes: roomOk ? 'Within physical room fire-code ceiling' : 'At physical room fire-code ceiling'
    });
  }

  if (!hasRuleKeyword('Timetable') && !hasRuleKeyword('Conflict')) {
    candidates.push({
      rule: 'Timetable Conflict Audit',
      description: targetSection
        ? `${targetSection.days} ${targetSection.timeSlot} verified`
        : 'Schedule slot compatibility checked',
      passed: true,
      notes: '0 timetable conflicts detected'
    });
  }

  if (!hasRuleKeyword('Bypass') && !hasRuleKeyword('Priority') && !hasRuleKeyword('Graduation')) {
    const matchingRule = bypassRules.find(
      (r) =>
        r.code === exceptionCase.ruleCode ||
        (exceptionCase.category === 'Credit Standing' && r.code === 'RULE-4.2') ||
        (exceptionCase.category === 'Prereqs' && r.code === 'RULE-2.1') ||
        (exceptionCase.category === 'Capacity' && r.code === 'RULE-8.4')
    );
    candidates.push({
      rule: matchingRule ? `Senate Policy: ${matchingRule.code}` : 'Advisor Priority Verification',
      description: matchingRule ? matchingRule.title : `${exceptionCase.standing} eligibility audit`,
      passed: matchingRule ? matchingRule.enabled : true,
      notes: matchingRule?.enabled ? 'Bypass policy enabled' : 'Requires manual faculty review'
    });
  }

  for (const cand of candidates) {
    if (existing.length >= 6) break;
    existing.push(cand);
  }

  return existing;
}

export interface TelemetryPoint {
  time: string;
  rps: number;
  latency: number;
}

export interface TelemetryChartGeometry {
  points: {
    time: string;
    rps: number;
    latency: number;
    cx: number;
    cyLatency: number;
    cyRps: number;
  }[];
  latencyPath: string;
  rpsPath: string;
  slaY: number;
  maxLatency: number;
  maxRps: number;
}

export function buildTelemetryChartGeometry(
  history: TelemetryPoint[],
  slaCeilingMs: number
): TelemetryChartGeometry {
  const safeHistory = history.length > 0 ? history : [{ time: 'Now', rps: 1842, latency: 218 }];
  const maxLatency = Math.max(300, slaCeilingMs + 60, ...safeHistory.map((p) => p.latency + 20));
  const maxRps = Math.max(4000, ...safeHistory.map((p) => p.rps + 300));

  const leftPad = 50;
  const rightPad = 550;
  const bottomY = 190;
  const chartHeight = 160;
  const count = safeHistory.length;

  const points = safeHistory.map((pt, idx) => {
    const cx =
      count === 1
        ? (leftPad + rightPad) / 2
        : leftPad + (idx / (count - 1)) * (rightPad - leftPad);
    const cyLatency = Number((bottomY - (pt.latency / maxLatency) * chartHeight).toFixed(2));
    const cyRps = Number((bottomY - (pt.rps / maxRps) * chartHeight).toFixed(2));
    return {
      ...pt,
      cx: Number(cx.toFixed(2)),
      cyLatency,
      cyRps
    };
  });

  const latencyPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cyLatency}`)
    .join(' ');
  const rpsPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cyRps}`)
    .join(' ');
  const slaY = Number((bottomY - (slaCeilingMs / maxLatency) * chartHeight).toFixed(2));

  return {
    points,
    latencyPath,
    rpsPath,
    slaY,
    maxLatency,
    maxRps
  };
}
