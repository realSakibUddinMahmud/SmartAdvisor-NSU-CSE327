import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  SmartAdvisorProvider,
  useSmartAdvisor,
  INITIAL_SECTIONS,
  INITIAL_STUDENT,
  INITIAL_EXCEPTIONS,
  INITIAL_BYPASS_RULES,
  INITIAL_AUDIT_LOG,
  INITIAL_METRICS,
  INITIAL_ESCALATIONS
} from '@/store/smartAdvisorStore';
import { GlobalModals } from '@/components/GlobalModals';
import { StudentSidebar } from '@/components/StudentSidebar';
import { DemoHeader } from '@/components/DemoHeader';
import { RouteGuard } from '@/app/providers';
import StudentSchedulePage from '@/app/student/schedule/page';
import AdminEscalationsPage from '@/app/admin/escalations/page';
import LoginPage from '@/app/login/page';
import FacultyExceptionsPage from '@/app/faculty/exceptions/page';
import FacultyCoursesPage from '@/app/faculty/courses/page';
import FacultyRulesPage from '@/app/faculty/rules/page';
import AdminHealthPage from '@/app/admin/health/page';
import StudentDashboardPage from '@/app/student/dashboard/page';

let mockPathname = '/student/dashboard';
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: mockReplace })
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

function baseBootstrapState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    student: { ...INITIAL_STUDENT, name: 'Fariha Tasnim', id: '2321450042' },
    sections: INITIAL_SECTIONS,
    stagedSectionIds: ['CSE327-01', 'CSE327-04'],
    exceptions: INITIAL_EXCEPTIONS,
    bypassRules: INITIAL_BYPASS_RULES,
    auditLog: INITIAL_AUDIT_LOG,
    metrics: INITIAL_METRICS,
    escalations: INITIAL_ESCALATIONS,
    receipt: null,
    notifications: [],
    waitlistSectionIds: [],
    waitlistEntries: [],
    rdsFallbackPrompt: null,
    ...overrides
  };
}

function ModalTrigger({
  modal,
  payload
}: {
  modal:
    | 'rule_alert'
    | 'section_full'
    | 'capacity_expand'
    | 'receipt'
    | 'rds_fallback'
    | 'emergency_section';
  payload: unknown;
}) {
  const { openModal } = useSmartAdvisor();
  return (
    <button type="button" onClick={() => openModal(modal, payload)}>
      Open Test Modal
    </button>
  );
}

describe('UI Components & Portals', () => {
  beforeEach(() => {
    mockPathname = '/student/dashboard';
    mockPush.mockReset();
    mockReplace.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GlobalModals rule_alert submits student petition and NEVER calls approveException', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/student/petitions')) {
        return new Response(
          JSON.stringify({
            ok: true,
            exceptionCase: {
              ...INITIAL_EXCEPTIONS[0],
              id: 'CASE #EX-2025-9999',
              status: 'pending'
            },
            state: baseBootstrapState()
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <ModalTrigger
          modal="rule_alert"
          payload={{
            section: INITIAL_SECTIONS[8],
            studentCredits: 96,
            requiredCredits: 100,
            ruleCode: 'RULE-4.2'
          }}
        />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    fireEvent.click(screen.getByText('Open Test Modal'));
    expect(screen.getByText(/Academic RULE-4.2 Standing Alert/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', {
      name: /Submit Petition for Advisor Review/i
    });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Petition Submitted for Faculty Review \(CASE #EX-2025-9999\)/i)
      ).toBeInTheDocument()
    );

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.endsWith('/student/petitions'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/faculty/exceptions/decision'))).toBe(false);
  });

  it('GlobalModals section_full joins waitlist and capacity_expand respects LIB 608 cap 45', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/student/waitlist')) {
        return new Response(
          JSON.stringify({ ok: true, position: 15, state: baseBootstrapState() }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const fullSec = INITIAL_SECTIONS.find((s) => s.id === 'CSE327-03')!;
    const lib608Sec = INITIAL_SECTIONS.find((s) => s.id === 'CSE311L-02')!;

    const { rerender } = render(
      <SmartAdvisorProvider>
        <ModalTrigger
          modal="section_full"
          payload={{ fullSection: fullSec, alternatives: [INITIAL_SECTIONS[0]] }}
        />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    fireEvent.click(screen.getByText('Open Test Modal'));
    expect(screen.getByText(/14 students waitlisted/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Join Waitlist/i }));
    });
    await waitFor(() => expect(screen.getByText(/Added to waitlist/i)).toBeInTheDocument());

    rerender(
      <SmartAdvisorProvider>
        <ModalTrigger modal="capacity_expand" payload={lib608Sec} />
        <GlobalModals />
      </SmartAdvisorProvider>
    );
    fireEvent.click(screen.getByText('Open Test Modal'));
    // LIB 608 has capacity 35 and roomCap 45 -> +15 (50 > 45) must be disabled!
    expect(screen.getByRole('button', { name: /\+15 Seats/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /\+10 Seats/i })).not.toBeDisabled();
  });

  it('GlobalModals receipt renders dynamic student name/ID and rds_fallback swaps cleanly', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/student/rds/fallback')) {
        return new Response(
          JSON.stringify({
            ok: true,
            receipt: {
              transactionId: '#RDS-TXN-CAFEBABE',
              studentId: '2321450042',
              cartToken: '#NSU-232145-0042',
              timestamp: '2025-05-01T12:00:00Z',
              semester: 'Fall 2025',
              totalCredits: 3.0,
              sections: [INITIAL_SECTIONS[3]],
              digitalSignature: 'SHA256:' + 'c'.repeat(64),
              status: 'confirmed',
              source: 'rds-worker'
            },
            state: baseBootstrapState()
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <ModalTrigger
          modal="rds_fallback"
          payload={{
            id: 'fb-99',
            failedSectionId: 'CSE327-01',
            failedCourseCode: 'CSE 327',
            reason: 'RDS seat contention',
            alternatives: [INITIAL_SECTIONS[3]],
            createdAt: new Date().toISOString()
          }}
        />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Open Test Modal'));
    expect(screen.getByText(/1-Click RDS Fallback Recovery/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Swap & Re-Confirm/i }));
    });

    await waitFor(() => expect(screen.getByText('#RDS-TXN-CAFEBABE')).toBeInTheDocument());
    expect(screen.getByText('Fariha Tasnim (2321450042)')).toBeInTheDocument();
    expect(screen.getByText('Fall 2025')).toBeInTheDocument();
    expect(screen.getByText('rds-worker')).toBeInTheDocument();
  });

  it('StudentSidebar never links to /faculty/exceptions and highlights only Dashboard by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(baseBootstrapState()), { status: 200 }))
    );

    const { container } = render(
      <SmartAdvisorProvider>
        <StudentSidebar />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByText('Fariha Tasnim')).toBeInTheDocument());
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href')?.includes('/faculty'))).toBe(false);
    const activeLinks = links.filter((a) => a.className.includes('text-nsu-teal'));
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveTextContent('Dashboard');
  });

  it('StudentSchedulePage renders RA section on Thursday & Saturday (never Sunday) and flags clashes', async () => {
    mockPathname = '/student/schedule';
    const clashSec = {
      ...INITIAL_SECTIONS[0],
      id: 'CSE999-01',
      courseCode: 'CSE 999',
      days: 'ST' as const,
      timeSlot: '11:20 AM - 12:50 PM'
    };
    const stateWithClash = baseBootstrapState({
      sections: [...INITIAL_SECTIONS, clashSec],
      stagedSectionIds: ['CSE327-01', 'CSE327-04', 'CSE999-01']
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(stateWithClash), { status: 200 }))
    );

    const { container } = render(
      <SmartAdvisorProvider>
        <StudentSchedulePage />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByText(/1 Clash Detected/i)).toBeInTheDocument());

    // Saturday header exists
    expect(screen.getByRole('columnheader', { name: 'Saturday' })).toBeInTheDocument();

    // RA section (CSE327-04, 04:20 PM - 05:50 PM) appears in Thursday & Saturday cells, NOT Sunday
    const satCell = container.querySelector('td[data-day="Saturday"][data-slot="04:20 PM - 05:50 PM"]');
    const thuCell = container.querySelector('td[data-day="Thursday"][data-slot="04:20 PM - 05:50 PM"]');
    const sunCell = container.querySelector('td[data-day="Sunday"][data-slot="04:20 PM - 05:50 PM"]');

    expect(satCell?.textContent).toContain('CSE 327');
    expect(thuCell?.textContent).toContain('CSE 327');
    expect(sunCell?.textContent).not.toContain('CSE 327');

    // Confirm button disabled when clash exists
    expect(screen.getByRole('button', { name: /Confirm Schedule/i })).toBeDisabled();
  });

  it('RouteGuard redirects unauthenticated /student/dashboard to /login and blocks student on /admin/health', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(baseBootstrapState()), { status: 200 }))
    );

    mockPathname = '/student/dashboard';
    const { rerender } = render(
      <SmartAdvisorProvider>
        <RouteGuard>
          <div>Protected Student Content</div>
        </RouteGuard>
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.getByText(/Redirecting to Portal Gateway/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Student Content')).not.toBeInTheDocument();

    // Pre-seed student session and navigate to /admin/health
    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'jwt-student',
        user: { id: '2412159042', name: 'Rahim Ahmed', role: 'student', email: 'r@nsu.edu' }
      })
    );
    mockPathname = '/admin/health';

    rerender(
      <SmartAdvisorProvider key="admin-check">
        <RouteGuard>
          <div>Admin Secret Content</div>
        </RouteGuard>
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: /Access Denied/i })).toBeInTheDocument());
    expect(screen.getByText(/Unauthorized: Your role does not have permission/i)).toBeInTheDocument();
    expect(screen.queryByText('Admin Secret Content')).not.toBeInTheDocument();
  });

  it('AdminEscalationsPage Sync RDS4 renders syncResult.totalProcessed and syncResult.driftCount', async () => {
    mockPathname = '/admin/escalations';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/admin/rds4/sync')) {
        return new Response(
          JSON.stringify({
            ok: true,
            syncResult: { totalProcessed: 12, driftCount: 3 },
            state: baseBootstrapState()
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <AdminEscalationsPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Sync RDS4/i })).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sync RDS4/i }));
    });

    await waitFor(() =>
      expect(
        screen.getByText(/RDS4 snapshot synced \(12 sections processed, 3 updates\)\./i)
      ).toBeInTheDocument()
    );
  });

  it('DemoHeader renders accessible Sign Out button when signed in', async () => {
    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'jwt-student',
        user: { id: '2412159042', name: 'Rahim Ahmed', role: 'student', email: 'r@nsu.edu' }
      })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(baseBootstrapState()), { status: 200 }))
    );

    render(
      <SmartAdvisorProvider>
        <DemoHeader />
      </SmartAdvisorProvider>
    );

    const signOutBtn = await screen.findByRole('button', { name: /Sign Out/i });
    expect(signOutBtn).toBeInTheDocument();
    expect(signOutBtn.closest('.hidden')).toBeNull();
  });

  it('G1: GlobalModals rule_alert renders RULE-2.1 without false -4.0 deficit and renders RULE-6.3 conflictingSections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(baseBootstrapState()), { status: 200 }))
    );

    const mat361 = INITIAL_SECTIONS.find((s) => s.id === 'MAT361-04')!;
    const { rerender } = render(
      <SmartAdvisorProvider>
        <ModalTrigger
          modal="rule_alert"
          payload={{
            section: mat361,
            ruleCode: 'RULE-2.1',
            missingPrerequisites: ['MAT 120']
          }}
        />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    fireEvent.click(screen.getByText('Open Test Modal'));
    expect(screen.getByText(/Academic RULE-2\.1 Prerequisite Alert/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing Prerequisites: MAT 120/i)).toBeInTheDocument();
    expect(screen.queryByText(/Deficit: -4\.0 Credits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/requires 100 completed credits/i)).not.toBeInTheDocument();

    rerender(
      <SmartAdvisorProvider key="rule-6-3-modal">
        <ModalTrigger
          modal="rule_alert"
          payload={{
            section: INITIAL_SECTIONS[8],
            ruleCode: 'RULE-6.3',
            conflictingSections: [INITIAL_SECTIONS[0], INITIAL_SECTIONS[7], INITIAL_SECTIONS[8]]
          }}
        />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    fireEvent.click(screen.getByText('Open Test Modal'));
    expect(screen.getByText(/Academic RULE-6\.3 Exam Load Alert/i)).toBeInTheDocument();
    expect(screen.getByText(/Consecutive Final Exam Load Conflict/i)).toBeInTheDocument();
    expect(screen.getByText(/CSE 327 Sec 01/i)).toBeInTheDocument();
    expect(screen.getByText(/CSE 331 Sec 01/i)).toBeInTheDocument();
    expect(screen.getByText(/CSE 425 Sec 01/i)).toBeInTheDocument();
    expect(screen.queryByText(/Deficit: -4\.0 Credits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/requires 100 completed credits/i)).not.toBeInTheDocument();
  });

  it('G4: RouteGuard blocks faculty and admin from /student/dashboard with Access Denied', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return new Response(
            JSON.stringify({
              ok: true,
              user: { id: 'nova.ahmed', name: 'Dr. Nova Ahmed', role: 'faculty', email: 'n@nsu.edu' }
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      })
    );

    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'jwt-faculty',
        user: { id: 'nova.ahmed', name: 'Dr. Nova Ahmed', role: 'faculty', email: 'n@nsu.edu' }
      })
    );
    mockPathname = '/student/dashboard';

    const { rerender } = render(
      <SmartAdvisorProvider key="fac-student-guard">
        <RouteGuard>
          <div>Student Dashboard Secret</div>
        </RouteGuard>
      </SmartAdvisorProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Access Denied/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/does not have permission to access the Student Portal/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to My Portal/i })).toHaveAttribute(
      'href',
      '/faculty/exceptions'
    );
    expect(screen.queryByText('Student Dashboard Secret')).not.toBeInTheDocument();

    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'jwt-admin',
        user: { id: 'admin.itops', name: 'IT Ops', role: 'admin', email: 'a@nsu.edu' }
      })
    );
    rerender(
      <SmartAdvisorProvider key="adm-student-guard">
        <RouteGuard>
          <div>Student Dashboard Secret</div>
        </RouteGuard>
      </SmartAdvisorProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Return to My Portal/i })).toHaveAttribute(
        'href',
        '/admin/health'
      )
    );
  });

  it('G6: GlobalModals emergency_section deploys section and Escape closes open modal', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/admin/sections/emergency')) {
        return new Response(JSON.stringify({ ok: true, state: baseBootstrapState() }), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <ModalTrigger modal="emergency_section" payload={{ courseCode: 'CSE 327' }} />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    fireEvent.click(screen.getByText('Open Test Modal'));
    expect(screen.getByRole('heading', { name: /Provision Emergency Section/i })).toBeInTheDocument();

    // Escape closes modal
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Provision Emergency Section/i })
      ).not.toBeInTheDocument()
    );

    // Re-open and deploy
    fireEvent.click(screen.getByText('Open Test Modal'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deploy Emergency Section/i }));
    });
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/admin/sections/emergency'))
    ).toBe(true);
  });

  it('G6: LoginPage handles role tabs, rememberMe persistence, error alert, and navigation', async () => {
    mockPathname = '/login';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.password === 'badpass') {
          return new Response(JSON.stringify({ ok: false, message: 'Invalid credentials' }), {
            status: 401
          });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'jwt-login-test',
            user: {
              id: 'nova.ahmed',
              name: 'Dr. Nova Ahmed',
              role: 'faculty',
              email: 'nova.ahmed@northsouth.edu'
            }
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <LoginPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: /Portal Gateway/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Faculty$/i }));
    expect(screen.getByLabelText(/Faculty Username/i)).toHaveValue('nova.ahmed');

    const pwInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwInput, { target: { value: 'badpass' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));

    // Uncheck rememberMe -> only sessionStorage should hold token
    const rememberCheckbox = screen.getByRole('checkbox');
    fireEvent.click(rememberCheckbox);
    expect(rememberCheckbox).not.toBeChecked();

    fireEvent.change(pwInput, { target: { value: 'SmartAdvisor2025!' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/faculty/exceptions'));
    expect(window.sessionStorage.getItem('smartadvisor_auth_session_v1')).toContain('jwt-login-test');
    expect(window.localStorage.getItem('smartadvisor_auth_session_v1')).toBeNull();
  });

  it('G6: FacultyExceptionsPage handles flagged -> approve and disables finalized buttons', async () => {
    mockPathname = '/faculty/exceptions';
    const flaggedCase = {
      ...INITIAL_EXCEPTIONS[0],
      id: 'CASE #EX-FLAG-1',
      status: 'flagged' as const
    };
    const approvedCase = {
      ...INITIAL_EXCEPTIONS[1],
      id: 'CASE #EX-APP-1',
      status: 'approved' as const
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(
          JSON.stringify(
            baseBootstrapState({
              exceptions: [flaggedCase, approvedCase]
            })
          ),
          { status: 200 }
        );
      }
      if (url.endsWith('/faculty/exceptions/decision')) {
        return new Response(
          JSON.stringify({
            ok: true,
            state: baseBootstrapState({
              exceptions: [{ ...flaggedCase, status: 'approved' }, approvedCase]
            })
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SmartAdvisorProvider>
        <FacultyExceptionsPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() =>
      expect(screen.getAllByText('CASE #EX-FLAG-1').length).toBeGreaterThanOrEqual(1)
    );
    fireEvent.click(screen.getAllByText('CASE #EX-FLAG-1')[0]);

    expect(screen.getByRole('button', { name: /Flag for In-Person Advising/i })).toBeDisabled();
    const approveBtn = screen.getByRole('button', { name: /Approve Exception & Enroll/i });
    expect(approveBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(approveBtn);
    });
    await waitFor(() =>
      expect(screen.getByText(/marked approved/i)).toBeInTheDocument()
    );

    fireEvent.click(screen.getAllByText('CASE #EX-APP-1')[0]);
    expect(screen.getByText('Finalized')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve Exception & Enroll/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reject$/i })).toBeDisabled();
  });

  it('G6: FacultyCoursesPage shows ownership badges and FacultyRulesPage validates and creates rule', async () => {
    mockPathname = '/faculty/courses';
    window.sessionStorage.setItem(
      'smartadvisor_auth_session_v1',
      JSON.stringify({
        token: 'jwt-nova',
        user: {
          id: 'nova.ahmed',
          name: 'Dr. Nova Ahmed',
          role: 'faculty',
          email: 'nova@nsu.edu',
          instructorName: 'Dr. Nova Ahmed'
        }
      })
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: 'nova.ahmed',
              name: 'Dr. Nova Ahmed',
              role: 'faculty',
              email: 'nova@nsu.edu',
              instructorName: 'Dr. Nova Ahmed'
            }
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/faculty/rules')) {
        return new Response(
          JSON.stringify({
            ok: true,
            rule: {
              id: 'rule-9-5',
              code: 'RULE-9.5',
              title: 'Capstone Waiver',
              description: 'Grants senior capstone override.',
              category: 'Standing',
              enabled: true,
              lastUpdated: 'Just now'
            },
            autoApprovedCount: 2,
            state: baseBootstrapState()
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <SmartAdvisorProvider>
        <FacultyCoursesPage />
        <GlobalModals />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByText('Your Section')).toBeInTheDocument());
    expect(screen.getAllByText('Other Faculty').length).toBeGreaterThan(0);

    mockPathname = '/faculty/rules';
    rerender(
      <SmartAdvisorProvider>
        <FacultyRulesPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create Bypass Rule/i })).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText(/Rule Code/i), { target: { value: 'R1' } });
    fireEvent.change(screen.getByLabelText(/Policy Title/i), { target: { value: 'AB' } });
    fireEvent.change(screen.getByLabelText(/Policy Description/i), { target: { value: 'Tiny' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create Bypass Rule/i }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Rule code \(>=3 chars\)/i);

    fireEvent.change(screen.getByLabelText(/Rule Code/i), { target: { value: 'RULE-9.5' } });
    fireEvent.change(screen.getByLabelText(/Policy Title/i), {
      target: { value: 'Capstone Waiver' }
    });
    fireEvent.change(screen.getByLabelText(/Policy Description/i), {
      target: { value: 'Grants senior capstone override.' }
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create Bypass Rule/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Auto-approved 2 matching petition\(s\)/i)).toBeInTheDocument()
    );
  });

  it('G6 & G12: AdminHealthPage renders 503 degraded probe & SVG hover tooltip; StudentDashboardPage clears solverPreview on reset', async () => {
    mockPathname = '/admin/health';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'degraded',
            service: 'smartadvisor-api',
            mode: 'postgres',
            checks: {
              api: { status: 'up', latencyMs: 4 },
              postgres: { status: 'down', details: 'PG connection refused' },
              redis: { status: 'up', latencyMs: 2 }
            },
            timestamp: new Date().toISOString()
          }),
          { status: 503 }
        );
      }
      if (url.endsWith('/bootstrap')) {
        return new Response(JSON.stringify(baseBootstrapState()), { status: 200 });
      }
      if (url.endsWith('/student/schedule/solve')) {
        return new Response(
          JSON.stringify({
            ok: true,
            recommendedSectionIds: ['CSE327-01', 'CSE331-01'],
            sections: [INITIAL_SECTIONS[0], INITIAL_SECTIONS[7]],
            totalCredits: 6.0,
            clashes: [],
            strategy: 'MinimizeGaps',
            idleGapMinutes: 15
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/demo/reset')) {
        return new Response(JSON.stringify({ ok: true, state: baseBootstrapState() }), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, rerender } = render(
      <SmartAdvisorProvider>
        <AdminHealthPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() => expect(screen.getByText(/DEGRADED \(postgres\)/i)).toBeInTheDocument());
    expect(screen.getByText('PG connection refused')).toBeInTheDocument();

    const pointGroups = container.querySelectorAll('svg g');
    expect(pointGroups.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(pointGroups[0]);
    expect(screen.getByText(/Throughput:/i)).toBeInTheDocument();
    expect(screen.getByText(/P95 Latency:/i)).toBeInTheDocument();

    mockPathname = '/student/dashboard';
    rerender(
      <SmartAdvisorProvider key="dash-reset">
        <DemoHeader />
        <StudentDashboardPage />
      </SmartAdvisorProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Minimize Gaps/i })).toBeInTheDocument()
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Minimize Gaps/i }));
    });
    await waitFor(() => expect(screen.getByText(/15m idle gap/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Demo Controls/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reset Demo State/i }));
    });
    await waitFor(() => expect(screen.queryByText(/15m idle gap/i)).not.toBeInTheDocument());
  });
});
