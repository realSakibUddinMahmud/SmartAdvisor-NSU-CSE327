import crypto from 'crypto';

export type DayCode = 'ST' | 'MW' | 'RA' | 'Thu' | 'Sat' | 'Sun' | 'Mon' | 'Tue' | 'Wed';

export interface WorkerCourseSection {
  id: string;
  courseCode: string;
  courseTitle: string;
  department: 'ECE / CSE' | 'Math & Physics' | 'BBA' | 'English & Mod. Lang';
  credits: number;
  sectionNumber: string;
  faculty: string;
  days: DayCode;
  timeSlot: string;
  room: string;
  capacity: number;
  enrolled: number;
  waitlisted: number;
  minCreditsRequired?: number;
  prerequisites: string[];
  isLab?: boolean;
  instructorId?: string;
  roomCap?: number;
  examSlot?: string;
}

export interface WorkerBypassRule {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'Standing' | 'Prerequisite' | 'Exam Load' | 'Capacity';
  enabled: boolean;
  lastUpdated: string;
}

export interface WorkerExceptionCase {
  id: string;
  studentId: string;
  courseCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'flagged';
  ruleCode?: string;
  category: 'Prereqs' | 'Capacity' | 'Credit Standing';
}

export interface RdsFallbackPrompt {
  id: string;
  failedSectionId: string;
  failedCourseCode: string;
  reason: string;
  alternatives: WorkerCourseSection[];
  createdAt: string;
  resolved?: boolean;
  resolvedSectionId?: string;
}

export interface CanonicalRdsCourseItem {
  courseCode: string;
  section: number;
}

export interface RdsEnrollmentPayload {
  studentId: string;
  cartToken?: string;
  semester: string;
  transactionId?: string;
  sectionIds?: string[];
  courses?: CanonicalRdsCourseItem[];
  // Legacy single-course fields
  courseCode?: string;
  section?: number;
  // Optional context for DAG fallback & seat verification
  stagedSections?: WorkerCourseSection[];
  allSections?: WorkerCourseSection[];
  clearedCourses?: Array<{ code: string; grade: string }>;
  creditsCompleted?: number;
  bypassRules?: WorkerBypassRule[];
  approvedExceptions?: WorkerExceptionCase[];
  simulateFailure?: boolean;
  enrolledProvisionally?: boolean;
}

export interface NormalizedRdsPayload {
  studentId: string;
  cartToken: string;
  semester: string;
  transactionId?: string;
  sectionIds: string[];
  courses: CanonicalRdsCourseItem[];
  stagedSections: WorkerCourseSection[];
  allSections: WorkerCourseSection[];
  clearedCourses: Array<{ code: string; grade: string }>;
  creditsCompleted: number;
  bypassRules: WorkerBypassRule[];
  approvedExceptions: WorkerExceptionCase[];
  simulateFailure: boolean;
  enrolledProvisionally: boolean;
}

export interface RdsHandshakeResult {
  ok: boolean;
  mode: 'http' | 'simulated';
  sessionCookie: string;
  csrfToken: string;
  handshakeMs: number;
}

export interface RdsPushResult {
  ok: boolean;
  transactionId: string;
  digitalSignature: string;
  handshakeMs: number;
  mode: 'http' | 'simulated';
  fallbackPrompt?: RdsFallbackPrompt;
  failedSectionId?: string;
  reason?: string;
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

export function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function expandDayCodes(dayCode: DayCode | string): string[] {
  return DAY_EXPANSION_MAP[dayCode] ?? [dayCode];
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

export function parseTimeSlot(timeSlot: string): { startMin: number; endMin: number } | null {
  const parts = timeSlot.split('-');
  if (parts.length !== 2) return null;
  const startMin = parseTimeTokenToMinutes(parts[0]);
  const endMin = parseTimeTokenToMinutes(parts[1]);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return null;
  }
  return { startMin, endMin };
}

export function sectionsClash(a: WorkerCourseSection, b: WorkerCourseSection): boolean {
  const daysA = expandDayCodes(a.days);
  const daysB = expandDayCodes(b.days);
  if (!daysA.some((d) => daysB.includes(d))) {
    return false;
  }

  const rangeA = parseTimeSlot(a.timeSlot);
  const rangeB = parseTimeSlot(b.timeSlot);
  if (!rangeA || !rangeB) {
    return a.timeSlot.trim() === b.timeSlot.trim();
  }

  return rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin;
}

export function normalizeRdsPayload(payload: RdsEnrollmentPayload): NormalizedRdsPayload {
  const studentId = payload.studentId?.trim() ?? '';
  const semester = payload.semester?.trim() ?? '';

  if (!studentId || !semester) {
    throw new Error('Invalid enrollment payload: studentId and semester are required');
  }

  let courses: CanonicalRdsCourseItem[] = Array.isArray(payload.courses)
    ? payload.courses.filter((c) => Boolean(c.courseCode) && Number(c.section) > 0)
    : [];

  let sectionIds: string[] = Array.isArray(payload.sectionIds)
    ? payload.sectionIds.filter((id) => Boolean(id && id.trim()))
    : [];

  if (courses.length === 0 && payload.courseCode && payload.section && payload.section > 0) {
    courses = [{ courseCode: payload.courseCode.trim(), section: Number(payload.section) }];
  }

  if (sectionIds.length === 0 && courses.length > 0) {
    sectionIds = courses.map(
      (c) => `${c.courseCode.replace(/\s+/g, '').toUpperCase()}-${String(c.section).padStart(2, '0')}`
    );
  }

  if (courses.length === 0 && sectionIds.length === 0) {
    throw new Error(
      'Invalid enrollment payload: studentId, courseCode, and section are required'
    );
  }

  if (courses.length === 0 && sectionIds.length > 0) {
    courses = sectionIds.map((id) => {
      const [codePart, secPart] = id.split('-');
      return {
        courseCode: codePart || id,
        section: Number(secPart) || 1
      };
    });
  }

  return {
    studentId,
    cartToken: payload.cartToken?.trim() || `#NSU-${studentId}`,
    semester,
    transactionId: payload.transactionId,
    sectionIds,
    courses,
    stagedSections: payload.stagedSections ?? [],
    allSections: payload.allSections ?? [],
    clearedCourses: payload.clearedCourses ?? [],
    creditsCompleted: payload.creditsCompleted ?? 96,
    bypassRules: payload.bypassRules ?? [],
    approvedExceptions: payload.approvedExceptions ?? [],
    simulateFailure: Boolean(payload.simulateFailure),
    enrolledProvisionally: Boolean(payload.enrolledProvisionally)
  };
}

/**
 * Generates deterministic or transactionId-preserving receipt tokens matching
 * services/api/src/store/backendStore.ts (`#RDS-TXN-<8HEX>` & `SHA256:<64HEX>`).
 */
export function generateUnifiedReceiptTokens(input: {
  studentId: string;
  cartToken: string;
  sectionIds: string[];
  semester: string;
  transactionId?: string;
}): { transactionId: string; digitalSignature: string } {
  const txnSeed = crypto
    .createHash('sha256')
    .update(`${input.studentId}:${input.cartToken}:${input.sectionIds.join(',')}:${input.semester}`)
    .digest('hex');

  const transactionId =
    input.transactionId && /^#RDS-TXN-[0-9A-F]{8}$/.test(input.transactionId)
      ? input.transactionId
      : `#RDS-TXN-${txnSeed.slice(0, 8).toUpperCase()}`;

  const signatureHex = crypto
    .createHash('sha256')
    .update(`${input.studentId}:${input.cartToken}:${input.sectionIds.join(',')}:${transactionId}`)
    .digest('hex');

  return {
    transactionId,
    digitalSignature: `SHA256:${signatureHex}`
  };
}

function extractSetCookieHeader(headers: Headers): string {
  const rawGetSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  const cookies =
    rawGetSetCookie && rawGetSetCookie.length > 0
      ? rawGetSetCookie
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')!]
        : [];

  return cookies
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function extractCsrfToken(headers: Headers, html: string): string {
  const headerToken = headers.get('x-csrf-token');
  if (headerToken && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const metaMatch =
    html.match(/<meta\b[^>]*\bname=["']csrf-token["'][^>]*\bcontent=["']([^"']+)["']/i) ??
    html.match(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']csrf-token["']/i);
  if (metaMatch?.[1]) {
    return metaMatch[1];
  }

  const inputMatch = html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)["']/i);
  if (inputMatch?.[1]) {
    return inputMatch[1];
  }

  return '';
}

export async function performRdsHandshake(options?: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<RdsHandshakeResult> {
  const started = Date.now();
  const baseUrl = (options?.baseUrl ?? process.env.RDS_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const fetchImpl = options?.fetchFn ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? 3000;

  if (!baseUrl) {
    const nonce = crypto.randomBytes(6).toString('hex').toUpperCase();
    return {
      ok: true,
      mode: 'simulated',
      sessionCookie: `JSESSIONID=RDS-SIM-${nonce}`,
      csrfToken: `csrf-${nonce.toLowerCase()}`,
      handshakeMs: Date.now() - started
    };
  }

  const loginRes = await fetchImpl(`${baseUrl}/login`, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!loginRes.ok) {
    throw new Error(`RDS login handshake failed with HTTP ${loginRes.status}`);
  }

  const html = await loginRes.text();
  const sessionCookie = extractSetCookieHeader(loginRes.headers);
  const csrfToken = extractCsrfToken(loginRes.headers, html);

  const authRes = await fetchImpl(`${baseUrl}/auth/handshake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: JSON.stringify({
      client: 'smartadvisor-rds-worker',
      timestamp: Date.now()
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!authRes.ok) {
    throw new Error(`RDS auth handshake rejected with HTTP ${authRes.status}`);
  }

  const refreshedCookie = extractSetCookieHeader(authRes.headers) || sessionCookie;
  return {
    ok: true,
    mode: 'http',
    sessionCookie: refreshedCookie,
    csrfToken,
    handshakeMs: Date.now() - started
  };
}

function isSectionDagEligible(
  candidate: WorkerCourseSection,
  input: {
    studentId: string;
    clearedCourses: Array<{ code: string; grade: string }>;
    creditsCompleted: number;
    bypassRules: WorkerBypassRule[];
    approvedExceptions: WorkerExceptionCase[];
  }
): boolean {
  const clearedSet = new Set(input.clearedCourses.map((c) => normalizeCourseCode(c.code)));
  const candidateNorm = normalizeCourseCode(candidate.courseCode);
  if (clearedSet.has(candidateNorm)) {
    return false;
  }

  const prereqBypassEnabled = input.bypassRules.some(
    (r) => (r.code === 'RULE-2.1' || r.category === 'Prerequisite') && r.enabled
  );
  const prereqWaived = input.approvedExceptions.some(
    (e) =>
      e.studentId === input.studentId &&
      e.status === 'approved' &&
      normalizeCourseCode(e.courseCode) === candidateNorm &&
      (e.ruleCode === 'RULE-2.1' || e.category === 'Prereqs')
  );

  if (!prereqBypassEnabled && !prereqWaived) {
    const missingPrereqs = (candidate.prerequisites ?? []).filter(
      (p) => !clearedSet.has(normalizeCourseCode(p))
    );
    if (missingPrereqs.length > 0) {
      return false;
    }
  }

  if (candidate.minCreditsRequired !== undefined && input.creditsCompleted < candidate.minCreditsRequired) {
    const creditWaived = input.approvedExceptions.some(
      (e) =>
        e.studentId === input.studentId &&
        e.status === 'approved' &&
        normalizeCourseCode(e.courseCode) === candidateNorm &&
        (e.ruleCode === 'RULE-4.2' || e.category === 'Credit Standing')
    );
    if (!creditWaived) {
      return false;
    }
  }

  return true;
}

export function computeDagCompliantAlternatives(params: {
  studentId: string;
  failedSection: WorkerCourseSection;
  remainingStagedSections: WorkerCourseSection[];
  allSections: WorkerCourseSection[];
  clearedCourses?: Array<{ code: string; grade: string }>;
  creditsCompleted?: number;
  bypassRules?: WorkerBypassRule[];
  approvedExceptions?: WorkerExceptionCase[];
  reason?: string;
}): RdsFallbackPrompt {
  const {
    studentId,
    failedSection,
    remainingStagedSections,
    allSections,
    clearedCourses = [],
    creditsCompleted = 96,
    bypassRules = [],
    approvedExceptions = []
  } = params;

  const stagedIds = new Set(remainingStagedSections.map((s) => s.id));
  const stagedCourseCodes = new Set(
    remainingStagedSections.map((s) => normalizeCourseCode(s.courseCode))
  );
  const failedNormCode = normalizeCourseCode(failedSection.courseCode);

  const hasNoClash = (candidate: WorkerCourseSection) =>
    !remainingStagedSections.some((staged) => sectionsClash(candidate, staged));

  const sortCandidates = (list: WorkerCourseSection[]) =>
    [...list].sort((a, b) => {
      const seatsA = a.capacity - a.enrolled;
      const seatsB = b.capacity - b.enrolled;
      if (seatsB !== seatsA) return seatsB - seatsA;
      return a.id.localeCompare(b.id);
    });

  // Tier 1: Same-course open non-clashing sections
  const tier1 = sortCandidates(
    allSections.filter(
      (s) =>
        normalizeCourseCode(s.courseCode) === failedNormCode &&
        s.id !== failedSection.id &&
        s.enrolled < s.capacity &&
        hasNoClash(s)
    )
  );

  // Tier 2: Cross-course DAG-eligible open non-clashing fallback if Tier 1 is empty
  const tier2 =
    tier1.length > 0
      ? []
      : sortCandidates(
          allSections.filter(
            (s) =>
              s.id !== failedSection.id &&
              !stagedIds.has(s.id) &&
              !stagedCourseCodes.has(normalizeCourseCode(s.courseCode)) &&
              s.enrolled < s.capacity &&
              hasNoClash(s) &&
              isSectionDagEligible(s, {
                studentId,
                clearedCourses,
                creditsCompleted,
                bypassRules,
                approvedExceptions
              })
          )
        );

  const alternatives = tier1.length > 0 ? tier1 : tier2;

  return {
    id: `fb-${crypto.randomBytes(4).toString('hex')}`,
    failedSectionId: failedSection.id,
    failedCourseCode: failedSection.courseCode,
    reason:
      params.reason ||
      `RDS remote lock collision on ${failedSection.id}. Select a DAG-compliant alternative.`,
    alternatives,
    createdAt: new Date().toISOString(),
    resolved: false
  };
}

export async function pushEnrollmentToRds(
  rawPayload: RdsEnrollmentPayload,
  options?: {
    baseUrl?: string;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<RdsPushResult> {
  const normalized = normalizeRdsPayload(rawPayload);
  const { transactionId, digitalSignature } = generateUnifiedReceiptTokens({
    studentId: normalized.studentId,
    cartToken: normalized.cartToken,
    sectionIds: normalized.sectionIds,
    semester: normalized.semester,
    transactionId: normalized.transactionId
  });

  const handshake = await performRdsHandshake(options);
  const baseUrl = (options?.baseUrl ?? process.env.RDS_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const fetchImpl = options?.fetchFn ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? 3000;

  let failureReason: string | null = null;
  let failedSection: WorkerCourseSection | undefined;

  if (normalized.simulateFailure) {
    failureReason = `Simulated RDS remote seat exhaustion on ${normalized.sectionIds[0]}`;
    failedSection =
      normalized.stagedSections.find((s) => s.id === normalized.sectionIds[0]) ??
      normalized.allSections.find((s) => s.id === normalized.sectionIds[0]);
  } else if (!normalized.enrolledProvisionally && normalized.stagedSections.length > 0) {
    const fullSec = normalized.stagedSections.find((s) => s.enrolled >= s.capacity);
    if (fullSec) {
      failureReason = `Section ${fullSec.id} has 0 seats available (${fullSec.enrolled}/${fullSec.capacity})`;
      failedSection = fullSec;
    }
  }

  if (!failureReason && baseUrl) {
    try {
      const pushRes = await fetchImpl(`${baseUrl}/api/enroll/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(handshake.sessionCookie ? { Cookie: handshake.sessionCookie } : {}),
          ...(handshake.csrfToken ? { 'X-CSRF-Token': handshake.csrfToken } : {})
        },
        body: JSON.stringify({
          studentId: normalized.studentId,
          cartToken: normalized.cartToken,
          semester: normalized.semester,
          transactionId,
          sectionIds: normalized.sectionIds,
          courses: normalized.courses
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!pushRes.ok) {
        failureReason = `RDS push rejected with HTTP ${pushRes.status}`;
        failedSection =
          normalized.stagedSections[0] ??
          normalized.allSections.find((s) => s.id === normalized.sectionIds[0]);
      }
    } catch (err) {
      failureReason =
        err instanceof Error ? `RDS push network failure: ${err.message}` : 'RDS push failed';
      failedSection =
        normalized.stagedSections[0] ??
        normalized.allSections.find((s) => s.id === normalized.sectionIds[0]);
    }
  }

  if (failureReason) {
    const targetSection: WorkerCourseSection = failedSection ?? {
      id: normalized.sectionIds[0],
      courseCode: normalized.courses[0]?.courseCode || normalized.sectionIds[0],
      courseTitle: normalized.courses[0]?.courseCode || 'Course',
      department: 'ECE / CSE',
      credits: 3.0,
      sectionNumber: String(normalized.courses[0]?.section ?? 1).padStart(2, '0'),
      faculty: 'TBA',
      days: 'ST',
      timeSlot: '11:20 AM - 12:50 PM',
      room: 'TBA',
      capacity: 40,
      enrolled: 40,
      waitlisted: 0,
      prerequisites: []
    };

    const remainingStaged = normalized.stagedSections.filter((s) => s.id !== targetSection.id);
    const fallbackPrompt = computeDagCompliantAlternatives({
      studentId: normalized.studentId,
      failedSection: targetSection,
      remainingStagedSections: remainingStaged,
      allSections: normalized.allSections,
      clearedCourses: normalized.clearedCourses,
      creditsCompleted: normalized.creditsCompleted,
      bypassRules: normalized.bypassRules,
      approvedExceptions: normalized.approvedExceptions,
      reason: failureReason
    });

    return {
      ok: false,
      transactionId,
      digitalSignature,
      handshakeMs: handshake.handshakeMs,
      mode: handshake.mode,
      fallbackPrompt,
      failedSectionId: targetSection.id,
      reason: failureReason
    };
  }

  return {
    ok: true,
    transactionId,
    digitalSignature,
    handshakeMs: handshake.handshakeMs,
    mode: handshake.mode
  };
}
