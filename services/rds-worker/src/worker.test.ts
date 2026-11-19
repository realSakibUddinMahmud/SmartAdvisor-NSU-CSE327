import crypto from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  computeDagCompliantAlternatives,
  generateUnifiedReceiptTokens,
  normalizeRdsPayload,
  performRdsHandshake,
  pushEnrollmentToRds,
  WorkerCourseSection
} from './rdsClient';
import {
  createRdsWorker,
  getRedisConnectionOptions,
  isRedisEnabled,
  isWorkerPostgresEnabled,
  processRdsEnrollment,
  RDS_QUEUE_NAME,
  SYNC_CHANNEL,
  WorkerSyncEvent
} from './worker';

const SAMPLE_SECTIONS: WorkerCourseSection[] = [
  {
    id: 'CSE327-01',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '01',
    faculty: 'Dr. Nabeel Mohammed',
    days: 'ST',
    timeSlot: '11:20 AM - 12:50 PM',
    room: 'SAC 502',
    capacity: 40,
    enrolled: 28,
    waitlisted: 0,
    prerequisites: ['CSE 215']
  },
  {
    id: 'CSE327-02',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '02',
    faculty: 'Dr. Silvia Ahmed',
    days: 'MW',
    timeSlot: '09:40 AM - 11:10 AM',
    room: 'NAC 408',
    capacity: 40,
    enrolled: 36,
    waitlisted: 0,
    prerequisites: ['CSE 215']
  },
  {
    id: 'CSE327-03',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '03',
    faculty: 'Prof. Dr. Rajesh Palit',
    days: 'ST',
    timeSlot: '01:20 PM - 02:50 PM',
    room: 'SAC 415',
    capacity: 40,
    enrolled: 40, // Full
    waitlisted: 14,
    prerequisites: ['CSE 215']
  },
  {
    id: 'CSE327-04',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '04',
    faculty: 'Mr. Tanvir Rahman',
    days: 'RA',
    timeSlot: '04:20 PM - 05:50 PM',
    room: 'LIB 608',
    capacity: 40,
    enrolled: 15,
    waitlisted: 0,
    prerequisites: ['CSE 215']
  },
  {
    id: 'CSE311-03',
    courseCode: 'CSE 311',
    courseTitle: 'Database Systems',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '03',
    faculty: 'Dr. Tanjila Farah',
    days: 'MW',
    timeSlot: '09:40 AM - 11:10 AM',
    room: 'SAC 415',
    capacity: 40,
    enrolled: 22,
    waitlisted: 0,
    prerequisites: ['CSE 215']
  },
  {
    id: 'CSE331-01',
    courseCode: 'CSE 331',
    courseTitle: 'Microprocessor Systems',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '01',
    faculty: 'Mr. Safayat Hossain',
    days: 'Thu',
    timeSlot: '04:20 PM - 05:50 PM',
    room: 'NAC 510',
    capacity: 40,
    enrolled: 31,
    waitlisted: 0,
    prerequisites: ['CSE 231']
  },
  {
    id: 'CSE425-01',
    courseCode: 'CSE 425',
    courseTitle: 'Concepts of Programming Languages',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '01',
    faculty: 'Dr. Nova Ahmed',
    days: 'ST',
    timeSlot: '02:50 PM - 04:20 PM',
    room: 'LIB 602',
    capacity: 40,
    enrolled: 38,
    waitlisted: 2,
    minCreditsRequired: 100,
    prerequisites: ['CSE 215', 'CSE 311']
  }
];

describe('SmartAdvisor Autonomous RDS Worker', () => {
  it('exposes canonical queue and Redis Pub/Sub channel names with Vitest dual-mode defaults', () => {
    expect(RDS_QUEUE_NAME).toBe('rds-enrollment-queue');
    expect(SYNC_CHANNEL).toBe('smartadvisor-sync');
    expect(isRedisEnabled()).toBe(false);
    expect(isWorkerPostgresEnabled()).toBe(false);
    expect(getRedisConnectionOptions().maxRetriesPerRequest).toBeNull();
  });

  it('createRdsWorker initializes with autorun: false and closes cleanly', async () => {
    const worker = createRdsWorker({ host: '127.0.0.1', port: 6379 });
    expect(worker.name).toBe(RDS_QUEUE_NAME);
    expect(worker.opts.autorun).toBe(false);
    await worker.close();
  });

  it('performRdsHandshake executes in simulated mode and mocked HTTP cookie/CSRF mode', async () => {
    const sim = await performRdsHandshake();
    expect(sim.ok).toBe(true);
    expect(sim.mode).toBe('simulated');
    expect(sim.sessionCookie).toContain('JSESSIONID=');
    expect(sim.csrfToken.length).toBeGreaterThan(0);
    expect(sim.handshakeMs).toBeGreaterThanOrEqual(0);

    const mockFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/login')) {
        return new Response('<meta name="csrf-token" content="csrf-abc-123" />', {
          status: 200,
          headers: { 'set-cookie': 'JSESSIONID=RDS-HTTP-99; Path=/; HttpOnly' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const httpResult = await performRdsHandshake({
      baseUrl: 'https://rds.northsouth.edu',
      fetchFn: mockFetch
    });
    expect(httpResult.ok).toBe(true);
    expect(httpResult.mode).toBe('http');
    expect(httpResult.sessionCookie).toContain('JSESSIONID=RDS-HTTP-99');
    expect(httpResult.csrfToken).toBe('csrf-abc-123');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const reversedMockFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/login')) {
        return new Response('<meta content="csrf-reversed-999" name="csrf-token" />', {
          status: 200,
          headers: { 'set-cookie': 'JSESSIONID=RDS-HTTP-100; Path=/; HttpOnly' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const reversedResult = await performRdsHandshake({
      baseUrl: 'https://rds.northsouth.edu',
      fetchFn: reversedMockFetch
    });
    expect(reversedResult.ok).toBe(true);
    expect(reversedResult.csrfToken).toBe('csrf-reversed-999');
    expect(reversedMockFetch).toHaveBeenCalledTimes(2);
  });

  it('generates unified #RDS-TXN-<8HEX> and SHA256:<64HEX> receipt tokens matching API preimage', () => {
    const tokens = generateUnifiedReceiptTokens({
      studentId: '2412159042',
      cartToken: '#NSU-241215-9042',
      sectionIds: ['CSE327-01', 'MAT361-04'],
      semester: 'Spring 2025',
      transactionId: '#RDS-TXN-ABCDEF12'
    });

    const expectedSig =
      'SHA256:' +
      crypto
        .createHash('sha256')
        .update('2412159042:#NSU-241215-9042:CSE327-01,MAT361-04:#RDS-TXN-ABCDEF12')
        .digest('hex');

    expect(tokens.transactionId).toBe('#RDS-TXN-ABCDEF12');
    expect(tokens.digitalSignature).toBe(expectedSig);
  });

  it('processes valid legacy and canonical payloads deterministically and publishes SYNC_UPDATE', async () => {
    const published: WorkerSyncEvent[] = [];
    const legacyPayload = {
      studentId: '21200000',
      courseCode: 'CSE327',
      section: 4,
      semester: 'Spring 2026'
    };

    const result1 = await processRdsEnrollment(legacyPayload, {
      publishSyncEvent: (ev) => {
        published.push(ev);
      }
    });
    const result2 = await processRdsEnrollment(legacyPayload, {
      publishSyncEvent: () => {}
    });

    expect(result1.success).toBe(true);
    expect(result1.studentId).toBe('21200000');
    expect(result1.courseCode).toBe('CSE327');
    expect(result1.message).toContain('Successfully processed enrollment');
    expect(result1.enrolledAt).toBeDefined();
    expect(result1.transactionId).toMatch(/^#RDS-TXN-[0-9A-F]{8}$/);
    expect(result1.digitalSignature).toMatch(/^SHA256:[0-9a-f]{64}$/);
    expect(result1.transactionId).toBe(result2.transactionId);
    expect(result1.digitalSignature).toBe(result2.digitalSignature);
    expect(published).toHaveLength(1);
    expect(published[0].type).toBe('SYNC_UPDATE');

    const canonicalResult = await processRdsEnrollment(
      {
        studentId: '2412159042',
        cartToken: '#NSU-241215-9042',
        semester: 'Spring 2025',
        sectionIds: ['CSE327-01', 'CSE311-03'],
        courses: [
          { courseCode: 'CSE 327', section: 1 },
          { courseCode: 'CSE 311', section: 3 }
        ]
      },
      { publishSyncEvent: () => {} }
    );
    expect(canonicalResult.success).toBe(true);
    expect(canonicalResult.transactionId).toMatch(/^#RDS-TXN-[0-9A-F]{8}$/);
  });

  it('throws on invalid payload missing required fields', async () => {
    await expect(
      processRdsEnrollment({
        studentId: '',
        courseCode: 'CSE327',
        section: 0,
        semester: 'Spring 2026'
      })
    ).rejects.toThrow('Invalid enrollment payload');
  });

  it('intercepts enrollment failure, excludes full/clashing sections (including RA Thu/Sat), and publishes RDS_FALLBACK', async () => {
    const published: WorkerSyncEvent[] = [];

    const result = await processRdsEnrollment(
      {
        studentId: '2412159042',
        cartToken: '#NSU-241215-9042',
        semester: 'Spring 2025',
        sectionIds: ['CSE327-01', 'CSE311-03'],
        courses: [
          { courseCode: 'CSE 327', section: 1 },
          { courseCode: 'CSE 311', section: 3 }
        ],
        stagedSections: [SAMPLE_SECTIONS[0], SAMPLE_SECTIONS[4]], // CSE327-01 + CSE311-03 (MW 09:40 AM)
        allSections: SAMPLE_SECTIONS,
        clearedCourses: [
          { code: 'CSE 115', grade: 'A' },
          { code: 'CSE 215', grade: 'A' },
          { code: 'CSE 231', grade: 'B+' },
          { code: 'CSE 311', grade: 'A-' }
        ],
        creditsCompleted: 96,
        simulateFailure: true
      },
      {
        publishSyncEvent: (ev) => {
          published.push(ev);
        }
      }
    );

    expect(result.success).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.fallbackPrompt).toBeDefined();
    // CSE327-03 is full (40/40); CSE327-02 clashes with CSE311-03 (MW 09:40 AM); only CSE327-04 remains!
    expect(result.fallbackPrompt!.alternatives.map((a) => a.id)).toEqual(['CSE327-04']);
    expect(published).toHaveLength(1);
    expect(published[0].type).toBe('RDS_FALLBACK');

    // Verify RA ('Thu','Sat') clash rejection: CSE327-04 (RA 04:20 PM) clashes with CSE331-01 (Thu 04:20 PM),
    // leaving 0 same-course options and falling back to Tier 2 DAG-eligible check (CSE425-01 blocked by minCredits 100!)
    const raClashFallback = computeDagCompliantAlternatives({
      studentId: '2412159042',
      failedSection: SAMPLE_SECTIONS[0], // CSE327-01
      remainingStagedSections: [SAMPLE_SECTIONS[4], SAMPLE_SECTIONS[5]], // CSE311-03 (MW 09:40) + CSE331-01 (Thu 04:20)
      allSections: SAMPLE_SECTIONS,
      clearedCourses: [
        { code: 'CSE 115', grade: 'A' },
        { code: 'CSE 215', grade: 'A' },
        { code: 'CSE 231', grade: 'B+' },
        { code: 'CSE 311', grade: 'A-' }
      ],
      creditsCompleted: 96
    });
    expect(raClashFallback.alternatives).toEqual([]);

    // With creditsCompleted >= 100, Tier 2 DAG fallback unlocks CSE425-01
    const tier2Unlocked = computeDagCompliantAlternatives({
      studentId: '2412159042',
      failedSection: SAMPLE_SECTIONS[0],
      remainingStagedSections: [SAMPLE_SECTIONS[4], SAMPLE_SECTIONS[5]],
      allSections: SAMPLE_SECTIONS,
      clearedCourses: [
        { code: 'CSE 115', grade: 'A' },
        { code: 'CSE 215', grade: 'A' },
        { code: 'CSE 231', grade: 'B+' },
        { code: 'CSE 311', grade: 'A-' }
      ],
      creditsCompleted: 102
    });
    expect(tier2Unlocked.alternatives.map((a) => a.id)).toEqual(['CSE425-01']);
  });

  it('pushEnrollmentToRds & processRdsEnrollment trigger RDS_FALLBACK on HTTP /api/enroll/push 500 and network failure', async () => {
    const published500: WorkerSyncEvent[] = [];
    const mockFetch500 = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/login')) {
        return new Response('<meta name="csrf-token" content="csrf-500" />', {
          status: 200,
          headers: { 'set-cookie': 'JSESSIONID=RDS-500; Path=/' }
        });
      }
      if (url.endsWith('/auth/handshake')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response('Internal RDS Error', { status: 500 });
    });

    const push500 = await pushEnrollmentToRds(
      {
        studentId: '2412159042',
        cartToken: '#NSU-241215-9042',
        semester: 'Spring 2025',
        sectionIds: ['CSE327-01', 'CSE311-03'],
        stagedSections: [SAMPLE_SECTIONS[0], SAMPLE_SECTIONS[4]],
        allSections: SAMPLE_SECTIONS
      },
      { baseUrl: 'https://rds.northsouth.edu', fetchFn: mockFetch500 }
    );
    expect(push500.ok).toBe(false);
    expect(push500.reason).toContain('HTTP 500');
    expect(push500.fallbackPrompt?.alternatives.map((a) => a.id)).toEqual(['CSE327-04']);

    const worker500 = await processRdsEnrollment(
      {
        studentId: '2412159042',
        cartToken: '#NSU-241215-9042',
        semester: 'Spring 2025',
        sectionIds: ['CSE327-01', 'CSE311-03'],
        stagedSections: [SAMPLE_SECTIONS[0], SAMPLE_SECTIONS[4]],
        allSections: SAMPLE_SECTIONS
      },
      {
        baseUrl: 'https://rds.northsouth.edu',
        fetchFn: mockFetch500,
        publishSyncEvent: (ev) => {
          published500.push(ev);
        }
      }
    );
    expect(worker500.success).toBe(false);
    expect(worker500.fallbackTriggered).toBe(true);
    expect(published500).toHaveLength(1);
    expect(published500[0].type).toBe('RDS_FALLBACK');

    const publishedNetErr: WorkerSyncEvent[] = [];
    const mockFetchNetErr = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/login')) {
        return new Response('<meta name="csrf-token" content="csrf-net" />', { status: 200 });
      }
      if (url.endsWith('/auth/handshake')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error('ECONNREFUSED');
    });

    const workerNetErr = await processRdsEnrollment(
      {
        studentId: '2412159042',
        cartToken: '#NSU-241215-9042',
        semester: 'Spring 2025',
        sectionIds: ['CSE327-01', 'CSE311-03'],
        stagedSections: [SAMPLE_SECTIONS[0], SAMPLE_SECTIONS[4]],
        allSections: SAMPLE_SECTIONS
      },
      {
        baseUrl: 'https://rds.northsouth.edu',
        fetchFn: mockFetchNetErr,
        publishSyncEvent: (ev) => {
          publishedNetErr.push(ev);
        }
      }
    );
    expect(workerNetErr.success).toBe(false);
    expect(workerNetErr.fallbackTriggered).toBe(true);
    expect(workerNetErr.message).toContain('RDS push network failure: ECONNREFUSED');
    expect(publishedNetErr).toHaveLength(1);
    expect(publishedNetErr[0].type).toBe('RDS_FALLBACK');
  });

  it('triggers RDS_FALLBACK when enrolledProvisionally is false and a staged section is full', async () => {
    const published: WorkerSyncEvent[] = [];
    const result = await processRdsEnrollment(
      {
        studentId: '2412159042',
        cartToken: '#NSU-241215-9042',
        semester: 'Spring 2025',
        sectionIds: ['CSE327-03', 'CSE311-03'],
        stagedSections: [SAMPLE_SECTIONS[2], SAMPLE_SECTIONS[4]], // CSE327-03 is 40/40 full
        allSections: SAMPLE_SECTIONS,
        enrolledProvisionally: false,
        simulateFailure: false
      },
      {
        publishSyncEvent: (ev) => {
          published.push(ev);
        }
      }
    );

    expect(result.success).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.message).toContain('0 seats available');
    expect(result.fallbackPrompt?.failedSectionId).toBe('CSE327-03');
    expect(result.fallbackPrompt?.alternatives.map((a) => a.id)).toEqual(['CSE327-04', 'CSE327-01']);
    expect(published).toHaveLength(1);
    expect(published[0].type).toBe('RDS_FALLBACK');
  });

  it('performRdsHandshake throws on loginRes/authRes failure and extracts x-csrf-token header & _csrf input', async () => {
    await expect(
      performRdsHandshake({
        baseUrl: 'https://rds.northsouth.edu',
        fetchFn: vi.fn<typeof fetch>(async () => new Response('Bad Gateway', { status: 500 }))
      })
    ).rejects.toThrow('RDS login handshake failed with HTTP 500');

    await expect(
      performRdsHandshake({
        baseUrl: 'https://rds.northsouth.edu',
        fetchFn: vi.fn<typeof fetch>(async (input) => {
          if (String(input).endsWith('/login')) {
            return new Response('<meta name="csrf-token" content="tok" />', { status: 200 });
          }
          return new Response('Forbidden', { status: 403 });
        })
      })
    ).rejects.toThrow('RDS auth handshake rejected with HTTP 403');

    const headerHandshake = await performRdsHandshake({
      baseUrl: 'https://rds.northsouth.edu',
      fetchFn: vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith('/login')) {
          return new Response('<html></html>', {
            status: 200,
            headers: {
              'x-csrf-token': 'hdr-csrf-777',
              'set-cookie': 'JSESSIONID=HDR-1; Path=/'
            }
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    });
    expect(headerHandshake.csrfToken).toBe('hdr-csrf-777');

    const inputHandshake = await performRdsHandshake({
      baseUrl: 'https://rds.northsouth.edu',
      fetchFn: vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith('/login')) {
          return new Response('<form><input type="hidden" name="_csrf" value="inp-csrf-555" /></form>', {
            status: 200
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    });
    expect(inputHandshake.csrfToken).toBe('inp-csrf-555');
  });

  it('normalizeRdsPayload parses sectionIds-only canonical payloads', () => {
    const normalized = normalizeRdsPayload({
      studentId: '2412159042',
      semester: 'Spring 2025',
      sectionIds: ['CSE327-01', 'MAT361-04']
    });

    expect(normalized.sectionIds).toEqual(['CSE327-01', 'MAT361-04']);
    expect(normalized.courses).toEqual([
      { courseCode: 'CSE327', section: 1 },
      { courseCode: 'MAT361', section: 4 }
    ]);
    expect(normalized.cartToken).toBe('#NSU-2412159042');
  });
});
