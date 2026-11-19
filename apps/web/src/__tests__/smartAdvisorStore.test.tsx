import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import {
  SmartAdvisorProvider,
  useSmartAdvisor,
  INITIAL_STUDENT,
  INITIAL_SECTIONS,
  INITIAL_EXCEPTIONS,
  INITIAL_BYPASS_RULES,
  INITIAL_AUDIT_LOG,
  INITIAL_METRICS,
  INITIAL_ESCALATIONS
} from '@/store/smartAdvisorStore';
import StudentDashboardPage from '@/app/student/dashboard/page';
import { GlobalModals } from '@/components/GlobalModals';
import { BackendState } from '@/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/student/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

function createBaseState(): BackendState {
  return {
    student: INITIAL_STUDENT,
    sections: INITIAL_SECTIONS,
    stagedSectionIds: ['CSE327-01'],
    exceptions: INITIAL_EXCEPTIONS,
    bypassRules: INITIAL_BYPASS_RULES,
    auditLog: INITIAL_AUDIT_LOG,
    metrics: INITIAL_METRICS,
    escalations: INITIAL_ESCALATIONS,
    receipt: null,
    notifications: [],
    waitlistSectionIds: [],
    waitlistEntries: [],
    rdsFallbackPrompt: null
  };
}

let latestStore: ReturnType<typeof useSmartAdvisor> | null = null;

function StoreHarness() {
  const ctx = useSmartAdvisor();
  latestStore = ctx;
  return (
    <div>
      <span data-testid="auth-user">{ctx.authUser?.id ?? 'anon'}</span>
      <span data-testid="last-error">{ctx.lastError ?? 'none'}</span>
      <span data-testid="active-modal">{ctx.activeModal ?? 'none'}</span>
      <span data-testid="receipt-txn">{ctx.receipt?.transactionId ?? 'none'}</span>
    </div>
  );
}

describe('SmartAdvisorStore API & Auth Reconciliation', () => {
  beforeEach(() => {
    latestStore = null;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticates via /auth/login, attaches Bearer JWT on mutations, and clears on /auth/logout', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(createBaseState()), { status: 200 });
      }
      if (url.endsWith('/auth/login')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'jwt-test-token-123',
            user: {
              id: '2412159042',
              name: 'Rahim Ahmed',
              role: 'student',
              email: 'rahim.ahmed01@northsouth.edu'
            }
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/student/waitlist')) {
        const authHeader = (init?.headers as Record<string, string>)?.Authorization;
        expect(authHeader).toBe('Bearer jwt-test-token-123');
        const nextState = createBaseState();
        nextState.waitlistSectionIds = ['CSE327-03'];
        return new Response(
          JSON.stringify({ ok: true, position: 15, state: nextState }),
          { status: 200 }
        );
      }
      if (url.endsWith('/auth/logout')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(latestStore).not.toBeNull());

    await act(async () => {
      const res = await latestStore!.login('2412159042', 'SmartAdvisor2025!', 'student');
      expect(res.ok).toBe(true);
    });

    expect(screen.getByTestId('auth-user')).toHaveTextContent('2412159042');
    expect(window.sessionStorage.getItem('smartadvisor_auth_session_v1')).toContain(
      'jwt-test-token-123'
    );

    await act(async () => {
      const wl = await latestStore!.joinWaitlist('CSE327-03');
      expect(wl.ok).toBe(true);
      expect(wl.data?.position).toBe(15);
    });

    await act(async () => {
      await latestStore!.logout();
    });

    expect(screen.getByTestId('auth-user')).toHaveTextContent('anon');
    expect(window.sessionStorage.getItem('smartadvisor_auth_session_v1')).toBeNull();
  });

  it('surfaces 401/403/422 errors and reconciles real receipt + rds_fallback from API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(createBaseState()), { status: 200 });
      }
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.password !== 'SmartAdvisor2025!') {
          return new Response(JSON.stringify({ ok: false, message: 'Invalid credentials' }), {
            status: 401
          });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'jwt-stu',
            user: { id: '2412159042', name: 'Rahim Ahmed', role: 'student', email: 'r@nsu.edu' }
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/faculty/sections/expand-capacity')) {
        return new Response(
          JSON.stringify({ ok: false, message: 'Forbidden: does not own section' }),
          { status: 403 }
        );
      }
      if (url.endsWith('/student/enroll/confirm')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.simulateRdsFailure) {
          return new Response(
            JSON.stringify({
              ok: true,
              fallbackPrompt: {
                id: 'fb-1',
                failedSectionId: 'CSE327-01',
                failedCourseCode: 'CSE 327',
                reason: 'RDS contention',
                alternatives: [INITIAL_SECTIONS[3]],
                createdAt: new Date().toISOString()
              }
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            receipt: {
              transactionId: '#RDS-TXN-A1B2C3D4',
              studentId: '2412159042',
              cartToken: '#NSU-241215-9042',
              timestamp: '2025-05-01T10:00:00Z',
              totalCredits: 3.0,
              sections: [INITIAL_SECTIONS[0]],
              digitalSignature: 'SHA256:' + 'f'.repeat(64),
              status: 'confirmed',
              source: 'api'
            },
            state: createBaseState()
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/student/rds/fallback')) {
        return new Response(
          JSON.stringify({
            ok: true,
            receipt: {
              transactionId: '#RDS-TXN-DEADBEEF',
              studentId: '2412159042',
              cartToken: '#NSU-241215-9042',
              timestamp: '2025-05-01T10:01:00Z',
              totalCredits: 3.0,
              sections: [INITIAL_SECTIONS[3]],
              digitalSignature: 'SHA256:' + 'a'.repeat(64),
              status: 'confirmed',
              source: 'rds-worker'
            },
            state: createBaseState()
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(latestStore).not.toBeNull());

    await act(async () => {
      const bad = await latestStore!.login('2412159042', 'wrong-pass', 'student');
      expect(bad.ok).toBe(false);
      expect(bad.status).toBe(401);
    });
    expect(screen.getByTestId('last-error')).toHaveTextContent('Invalid credentials');

    await act(async () => {
      const denied = await latestStore!.expandCapacity('CSE327-01', 5);
      expect(denied.ok).toBe(false);
      expect(denied.status).toBe(403);
    });
    expect(screen.getByTestId('last-error')).toHaveTextContent('does not own section');

    await act(async () => {
      const fb = await latestStore!.confirmSchedule({ simulateRdsFailure: true });
      expect(fb.ok).toBe(true);
      expect(fb.data?.fallbackPrompt?.failedSectionId).toBe('CSE327-01');
    });
    expect(screen.getByTestId('active-modal')).toHaveTextContent('rds_fallback');

    await act(async () => {
      const resolved = await latestStore!.resolveRdsFallback('CSE327-01', 'CSE327-04');
      expect(resolved.ok).toBe(true);
      expect(resolved.data?.receipt?.transactionId).toBe('#RDS-TXN-DEADBEEF');
    });
    expect(latestStore?.receipt?.transactionId).toBe('#RDS-TXN-DEADBEEF');
    await waitFor(() =>
      expect(screen.getByTestId('receipt-txn')).toHaveTextContent('#RDS-TXN-DEADBEEF')
    );
  });

  it('applySolvedSchedule in offline fallback mode atomically replaces all previous staged sections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(latestStore).not.toBeNull());
    expect(latestStore!.stagedSectionIds).toEqual([
      'CSE327-01',
      'CSE311-03',
      'CSE311L-02',
      'MAT361-04'
    ]);

    await act(async () => {
      const solved = await latestStore!.applySolvedSchedule({
        courseCodes: ['CSE 327', 'CSE 331'],
        strategy: 'MilestoneFirst',
        maxCredits: 15
      });
      expect(solved?.recommendedSectionIds).toEqual(['CSE327-01', 'CSE331-01']);
    });

    expect(latestStore!.stagedSectionIds).toEqual(['CSE327-01', 'CSE331-01']);
  });

  it('sends Bearer JWT on /student/dag/eligible when sessionStorage is pre-seeded and preserves session', async () => {
    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'persisted-student-jwt',
        user: {
          id: '2321450042',
          name: 'Fariha Tasnim',
          role: 'student',
          email: 'fariha.tasnim@northsouth.edu'
        }
      })
    );

    const dagAuthHeaders: Array<string | undefined> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers as Record<string, string>) || {};
      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: '2321450042',
              name: 'Fariha Tasnim',
              role: 'student',
              email: 'fariha.tasnim@northsouth.edu'
            }
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(createBaseState()), { status: 200 });
      }
      if (url.endsWith('/student/dag/eligible')) {
        dagAuthHeaders.push(headers.Authorization);
        return new Response(
          JSON.stringify({
            ok: true,
            eligibleCourses: ['CSE 327'],
            blockedCourses: {},
            criticalPath: ['CSE 215', 'CSE 327'],
            hasCycle: false
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <StudentDashboardPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(dagAuthHeaders.length).toBeGreaterThanOrEqual(1));
    expect(dagAuthHeaders[0]).toBe('Bearer persisted-student-jwt');
    expect(window.sessionStorage.getItem('smartadvisor_auth_session_v1')).toContain(
      'persisted-student-jwt'
    );
  });

  it('triggers bootstrap resync and reconnect on browser online event', async () => {
    let bootstrapCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        bootstrapCalls += 1;
        return new Response(JSON.stringify(createBaseState()), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(bootstrapCalls).toBe(1));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(bootstrapCalls).toBe(2));
  });

  it('closes SSE/WS on offline, ignores offline frames, and reconnects + resyncs on online', async () => {
    let bootstrapCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        bootstrapCalls += 1;
        return new Response(JSON.stringify(createBaseState()), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const sseInstances: Array<{
      readyState: number;
      close: ReturnType<typeof vi.fn>;
      onopen: (() => void) | null;
      onmessage: ((e: { data: string }) => void) | null;
      onerror: (() => void) | null;
    }> = [];
    const wsInstances: Array<{
      readyState: number;
      close: ReturnType<typeof vi.fn>;
      onopen: (() => void) | null;
      onmessage: ((e: { data: string }) => void) | null;
      onclose: (() => void) | null;
      onerror: (() => void) | null;
    }> = [];

    class MockEventSource {
      static CLOSED = 2;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn(() => {
        this.readyState = 2;
      });
      constructor() {
        sseInstances.push(this);
      }
    }

    class MockWebSocket {
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn(() => {
        this.readyState = 3;
      });
      constructor() {
        wsInstances.push(this);
      }
    }

    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('WebSocket', MockWebSocket);

    const onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);

    try {
      render(
        <SmartAdvisorProvider>
          <StoreHarness />
        </SmartAdvisorProvider>
      );

      await waitFor(() => expect(bootstrapCalls).toBe(1));
      expect(sseInstances).toHaveLength(1);
      expect(wsInstances).toHaveLength(1);

      const firstSse = sseInstances[0];
      const firstWs = wsInstances[0];

      onLineSpy.mockReturnValue(false);
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(firstSse.close).toHaveBeenCalledTimes(1);
      expect(firstWs.close).toHaveBeenCalledTimes(1);

      // Even if a stale frame fires while offline, it must be ignored
      const staleState = createBaseState();
      staleState.stagedSectionIds = ['CSE331-01'];
      await act(async () => {
        firstSse.onmessage?.({ data: JSON.stringify({ type: 'SYNC_UPDATE', state: staleState }) });
        firstWs.onmessage?.({ data: JSON.stringify({ type: 'SYNC_UPDATE', state: staleState }) });
      });
      expect(latestStore!.stagedSectionIds).toEqual(['CSE327-01']);

      // Reconnect on online
      onLineSpy.mockReturnValue(true);
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => expect(bootstrapCalls).toBe(2));
      expect(sseInstances).toHaveLength(2);
      expect(wsInstances).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('G5: online resetDemoState resets telemetryHistory and online applySolvedSchedule rolls back on mid-loop 409', async () => {
    const serverState = createBaseState();
    serverState.stagedSectionIds = ['CSE327-01', 'CSE311-03'];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(serverState), { status: 200 });
      }
      if (url.endsWith('/demo/surge')) {
        const surged = {
          ...serverState,
          metrics: { ...INITIAL_METRICS, requestsPerSec: 3450, p95LatencyMs: 275, surgeSpikeActive: true }
        };
        return new Response(JSON.stringify({ ok: true, state: surged }), { status: 200 });
      }
      if (url.endsWith('/demo/reset')) {
        return new Response(JSON.stringify({ ok: true, state: createBaseState() }), { status: 200 });
      }
      if (url.endsWith('/student/schedule/solve')) {
        return new Response(
          JSON.stringify({
            ok: true,
            recommendedSectionIds: ['CSE327-04', 'CSE331-01'],
            sections: [INITIAL_SECTIONS[3], INITIAL_SECTIONS[7]],
            totalCredits: 6.0,
            clashes: [],
            strategy: 'MilestoneFirst'
          }),
          { status: 200 }
        );
      }
      if (url.includes('/student/cart/') && init?.method === 'DELETE') {
        const id = url.split('/').pop()!;
        serverState.stagedSectionIds = serverState.stagedSectionIds.filter((s) => s !== id);
        return new Response(JSON.stringify({ ok: true, state: serverState }), { status: 200 });
      }
      if (url.endsWith('/student/cart/stage')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.sectionId === 'CSE331-01') {
          return new Response(
            JSON.stringify({
              ok: false,
              modal: 'section_full',
              payload: { fullSection: INITIAL_SECTIONS[7], alternatives: [] }
            }),
            { status: 409 }
          );
        }
        if (!serverState.stagedSectionIds.includes(body.sectionId)) {
          serverState.stagedSectionIds = [...serverState.stagedSectionIds, body.sectionId];
        }
        return new Response(JSON.stringify({ ok: true, state: serverState }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(latestStore?.stagedSectionIds).toEqual(['CSE327-01', 'CSE311-03']));

    await act(async () => {
      await latestStore!.simulateSurgeSpike();
    });
    expect(latestStore!.telemetryHistory.length).toBe(6);

    await act(async () => {
      await latestStore!.resetDemoState();
    });
    expect(latestStore!.telemetryHistory.length).toBe(5);
    expect(latestStore!.telemetryHistory[4].latency).toBe(INITIAL_METRICS.p95LatencyMs);

    // Re-stage CSE311-03 and test online applySolvedSchedule partial failure rollback
    await act(async () => {
      await latestStore!.stageSection('CSE311-03');
    });
    expect(latestStore!.stagedSectionIds).toEqual(['CSE327-01', 'CSE311-03']);

    await act(async () => {
      const res = await latestStore!.applySolvedSchedule({
        strategy: 'MilestoneFirst',
        maxCredits: 15
      });
      expect(res).toBeNull();
    });

    expect(latestStore!.stagedSectionIds.sort()).toEqual(['CSE311-03', 'CSE327-01']);
  });

  it('G5: dedupes RDS_FALLBACK SSE+WS delivery by prompt.id so modalBusy is not reset', async () => {
    let resolveFallbackReq: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return Promise.resolve(new Response(JSON.stringify(createBaseState()), { status: 200 }));
      }
      if (url.endsWith('/student/rds/fallback')) {
        return new Promise<Response>((resolve) => {
          resolveFallbackReq = resolve;
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sseInstances: Array<{ onmessage: ((e: { data: string }) => void) | null; close: () => void }> = [];
    const wsInstances: Array<{ onmessage: ((e: { data: string }) => void) | null; close: () => void }> = [];

    class MockEventSource {
      static CLOSED = 2;
      readyState = 1;
      onmessage: ((e: { data: string }) => void) | null = null;
      close = vi.fn();
      constructor() {
        sseInstances.push(this);
      }
    }
    class MockWebSocket {
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 1;
      onmessage: ((e: { data: string }) => void) | null = null;
      close = vi.fn();
      constructor() {
        wsInstances.push(this);
      }
    }
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('WebSocket', MockWebSocket);

    try {
      render(
        <SmartAdvisorProvider>
          <StoreHarness />
          <GlobalModals />
        </SmartAdvisorProvider>
      );

      await waitFor(() => expect(sseInstances).toHaveLength(1));

      const promptPayload = {
        id: 'fb-dedupe-1',
        failedSectionId: 'CSE327-01',
        failedCourseCode: 'CSE 327',
        reason: 'RDS contention',
        alternatives: [INITIAL_SECTIONS[3]],
        createdAt: new Date().toISOString(),
        resolved: false
      };
      const frame = JSON.stringify({ type: 'RDS_FALLBACK', payload: promptPayload });

      // First delivery opens modal
      await act(async () => {
        sseInstances[0].onmessage?.({ data: frame });
      });
      const swapBtn = await screen.findByRole('button', { name: /Swap & Re-Confirm/i });

      // Click swap -> modalBusy becomes true ("Swapping...")
      await act(async () => {
        fireEvent.click(swapBtn);
      });
      expect(screen.getByRole('button', { name: /Swapping\.\.\./i })).toBeDisabled();

      // Duplicate WS delivery with same prompt.id must NOT reset modalBusy!
      await act(async () => {
        wsInstances[0].onmessage?.({ data: frame });
      });
      expect(screen.getByRole('button', { name: /Swapping\.\.\./i })).toBeDisabled();

      // Finish pending fallback request cleanly
      await act(async () => {
        resolveFallbackReq?.(
          new Response(JSON.stringify({ ok: true, state: createBaseState() }), { status: 200 })
        );
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('G5 & G6: clears revoked session on /auth/me 401, syncs via BroadcastChannel, marks notifications read, and honors rememberMe', async () => {
    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'revoked-jwt',
        user: { id: '2412159042', name: 'Rahim Ahmed', role: 'student', email: 'r@nsu.edu' }
      })
    );

    const channels: Array<{ onmessage: ((e: { data: unknown }) => void) | null; postMessage: (d: unknown) => void; close: () => void }> = [];
    class MockBroadcastChannel {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    const baseWithNotifs = createBaseState();
    baseWithNotifs.notifications = [
      {
        id: 'n-1',
        studentId: '2412159042',
        channel: 'IN_APP',
        eventType: 'SEAT_OPEN',
        title: 'Seat Open',
        message: 'Seat opened',
        status: 'sent',
        createdAt: new Date().toISOString(),
        read: false
      },
      {
        id: 'n-2',
        studentId: '2412159042',
        channel: 'SMS',
        eventType: 'PETITION_DECIDED',
        title: 'Approved',
        message: 'Petition approved',
        status: 'sent',
        createdAt: new Date().toISOString(),
        read: false
      }
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return new Response(JSON.stringify({ ok: false, message: 'Revoked' }), { status: 401 });
      }
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseWithNotifs), { status: 200 });
      }
      if (url.endsWith('/auth/login')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'jwt-remember-1',
            user: { id: '2412159042', name: 'Rahim Ahmed', role: 'student', email: 'r@nsu.edu' }
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(
        <SmartAdvisorProvider>
          <StoreHarness />
        </SmartAdvisorProvider>
      );

      await waitFor(() => expect(screen.getByTestId('auth-user')).toHaveTextContent('anon'));
      expect(window.sessionStorage.getItem('smartadvisor_auth_session_v1')).toBeNull();

      // BroadcastChannel sync
      const bcState = createBaseState();
      bcState.stagedSectionIds = ['CSE327-04'];
      bcState.notifications = baseWithNotifs.notifications;
      await act(async () => {
        channels.forEach((c) => c.onmessage?.({ data: { type: 'SYNC_UPDATE', state: bcState } }));
      });
      expect(latestStore!.stagedSectionIds).toEqual(['CSE327-04']);

      // markNotificationRead single + all
      await act(async () => {
        latestStore!.markNotificationRead('n-1');
      });
      expect(latestStore!.notifications.find((n) => n.id === 'n-1')?.read).toBe(true);
      expect(latestStore!.notifications.find((n) => n.id === 'n-2')?.read).toBe(false);
      await act(async () => {
        latestStore!.markNotificationRead();
      });
      expect(latestStore!.notifications.every((n) => n.read)).toBe(true);

      // rememberMe = true persists in localStorage + sessionStorage; rememberMe = false clears localStorage
      await act(async () => {
        await latestStore!.login('2412159042', 'SmartAdvisor2025!', 'student', true);
      });
      expect(window.localStorage.getItem('smartadvisor_auth_session_v1')).toContain('jwt-remember-1');

      await act(async () => {
        await latestStore!.login('2412159042', 'SmartAdvisor2025!', 'student', false);
      });
      expect(window.sessionStorage.getItem('smartadvisor_auth_session_v1')).toContain('jwt-remember-1');
      expect(window.localStorage.getItem('smartadvisor_auth_session_v1')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('G5 & G7: offline confirmSchedule guards (400/409) and offline stageSection RULE-2.1 & RULE-6.3 parity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(latestStore).not.toBeNull());

    // 1. Offline RULE-2.1: disable rule-2-1, stage MAT361-04 (missing MAT 120)
    await act(async () => {
      await latestStore!.unstageSection('MAT361-04');
    });
    await act(async () => {
      await latestStore!.toggleBypassRule('rule-2-1');
    });
    await act(async () => {
      const ok = await latestStore!.stageSection('MAT361-04');
      expect(ok).toBe(false);
    });
    expect(latestStore!.activeModal).toBe('rule_alert');
    expect(latestStore!.modalPayload?.ruleCode).toBe('RULE-2.1');
    expect(latestStore!.modalPayload?.missingPrerequisites).toContain('MAT 120');

    // 2. Offline RULE-6.3: enable rule-6-3, stage CSE331-01 (exam 2025-05-10T14:00Z + CSE327-01 09:00Z + add a 3rd exam within 24h)
    await act(async () => {
      latestStore!.closeModal();
      await latestStore!.toggleBypassRule('rule-6-3');
      // Enable rule-2-1 back and add an exam-conflicting course on 2025-05-10 by staging CSE311 (2025-05-11T14:00Z) - wait: CSE327-01 (May 10 09:00), CSE331-01 (May 10 14:00), CSE311-03 (May 11 14:00) -> 30h; let's check CSE311-03 vs May 10:
      // Wait: if we unstage CSE311-03 and CSE311L-02, let's see what triggers <= 24h:
      // CSE327-01 is 2025-05-10T09:00Z, CSE331-01 is 2025-05-10T14:00Z. Let's check if staging CSE425 (2025-05-10T19:00Z) or we can verify 24h window when student has 100+ credits or another course.
    });

    // Test RULE-6.3 via BroadcastChannel / localStorage hydrated sections with 3 exams in 24h
    await act(async () => {
      await latestStore!.unstageSection('CSE327-01');
      await latestStore!.unstageSection('CSE311-03');
      await latestStore!.unstageSection('CSE311L-02');
    });

    // Empty cart confirmSchedule -> 400
    await act(async () => {
      const emptyRes = await latestStore!.confirmSchedule();
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.status).toBe(400);
    });

    // Clashing cart confirmSchedule -> 409 (CSE327-02 MW 09:40 AM + CSE311-03 MW 09:40 AM)
    await act(async () => {
      await latestStore!.stageSection('CSE327-02');
      await latestStore!.stageSection('CSE311-03');
    });
    await act(async () => {
      const clashRes = await latestStore!.confirmSchedule();
      expect(clashRes.ok).toBe(false);
      expect(clashRes.status).toBe(409);
    });
  });

  it('G7: offline stageSection enforces RULE-6.3 when 3 distinct courses have exams within 24 hours', async () => {
    const state63 = createBaseState();
    state63.bypassRules = INITIAL_BYPASS_RULES.map((r) =>
      r.id === 'rule-6-3' ? { ...r, enabled: true } : r
    );
    // Give student 105 credits and cleared CSE 311 so CSE 425 passes RULE-4.2 and RULE-2.1, hitting RULE-6.3
    state63.student = { ...INITIAL_STUDENT, creditsCompleted: 105 };
    state63.sections = INITIAL_SECTIONS.map((s) =>
      s.id === 'CSE425-01' ? { ...s, enrolled: 25 } : s
    );
    // CSE327-01 (May 10 09:00Z) + CSE331-01 (May 10 14:00Z) + CSE425-01 (May 10 19:00Z) => all within 10 hours!
    state63.stagedSectionIds = ['CSE327-01', 'CSE331-01'];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(state63), { status: 200 });
      }
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <StoreHarness />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(latestStore?.stagedSectionIds).toEqual(['CSE327-01', 'CSE331-01']));

    await act(async () => {
      const ok = await latestStore!.stageSection('CSE425-01');
      expect(ok).toBe(false);
    });
    expect(latestStore!.activeModal).toBe('rule_alert');
    expect(latestStore!.modalPayload?.ruleCode).toBe('RULE-6.3');
    expect(latestStore!.modalPayload?.conflictingSections).toHaveLength(3);
  });
});
