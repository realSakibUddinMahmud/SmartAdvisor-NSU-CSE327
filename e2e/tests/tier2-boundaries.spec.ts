import { expect, test } from '@playwright/test';
import {
  API_BASE,
  apiLogin,
  assertNoHorizontalOverflow,
  attachErrorCollectors,
  authHeaders,
  exceptionCard,
  facultyCourseCard,
  getBootstrap,
  gotoAndWaitHydration,
  NON_OWNER_FACULTY_CANDIDATES,
  portalGatewayCard,
  radarRow,
  resetBackendAndBrowser,
  ruleAlertDialog,
  SEEDED_CREDENTIALS,
  SEEDED_STUDENT_ACCOUNTS,
  uiLogin,
} from './helpers/smartadvisor';

test.describe('Tier 2 — Boundary, Security, Concurrency & Mobile Cases (T2-01 .. T2-20)', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetBackendAndBrowser(request, page);
  });

  test('T2-01: BVA Credit Floor RULE-4.2 (96 < 100) blocks CSE425-01 staging with Deficit -4.0', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'student');

    const [stageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 425', '01')
        .getByRole('button', { name: /^\+?\s*stage$|^full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
        .click(),
    ]);
    expect(stageRes.status()).toBe(422);

    const ruleDialog = ruleAlertDialog(page);
    await expect(ruleDialog).toBeVisible();
    await expect(ruleDialog.getByText(/96\s*\/\s*130\s*Cr/i)).toBeVisible();
    await expect(ruleDialog.getByText(/Deficit:\s*-4\.0\s*Credits/i)).toBeVisible();
    await expect(
      ruleDialog.getByText(/(100\s*Cr\s*Required|requires\s*100\s*completed\s*credits)/i)
    ).toBeVisible();

    const boot = await getBootstrap(request);
    expect(boot.stagedSectionIds).not.toContain('CSE425-01');
  });

  test('T2-02: Student petition inside RULE-4.2 modal stays pending and does not auto-approve', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'student');

    const [stageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 425', '01')
        .getByRole('button', { name: /^\+?\s*stage$|^full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
        .click(),
    ]);
    expect(stageRes.status()).toBe(422);
    const ruleDialog = ruleAlertDialog(page);
    await expect(ruleDialog).toBeVisible();

    const reasonInput = ruleDialog.locator('textarea, input[name="reason"]');
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill('Requesting standing override for CSE 425');

    const [petRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/petitions') && r.request().method() === 'POST'
      ),
      ruleDialog.getByRole('button', { name: /submit petition|request advisor override/i }).click(),
    ]);
    expect(petRes.status()).toBe(201);
    const petBody = await petRes.json();
    expect(petBody.exceptionCase?.status).toBe('pending');
    expect(petBody.exceptionCase?.status).not.toBe('approved');

    const boot = await getBootstrap(request);
    expect(boot.stagedSectionIds).not.toContain('CSE425-01');
    const created = boot.exceptions.find((e: any) => e.id === petBody.exceptionCase?.id);
    expect(created?.status).toBe('pending');
  });

  test('T2-03: BVA Full Section 0 Left opens section_full swap modal and swaps to CSE327-04', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'student');

    const [stageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 327', '03')
        .getByRole('button', { name: /full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
        .click(),
    ]);
    expect(stageRes.status()).toBe(409);

    const soldOutModal = page
      .locator('div.rounded-2xl[role="dialog"]')
      .filter({ has: page.getByRole('heading', { name: /section sold out/i }) })
      .filter({ has: page.getByText(/instant section swap options/i) })
      .last();
    await expect(soldOutModal).toBeVisible();
    await expect(soldOutModal.getByText(/instant section swap options/i)).toBeVisible();
    await expect(soldOutModal.getByRole('button', { name: /join waitlist/i })).toBeVisible();

    const selectSec04Btn = soldOutModal
      .locator('div.rounded-xl')
      .filter({ hasText: /\bSection\s*04\b/i })
      .filter({ has: page.getByRole('button', { name: /select section/i }) })
      .last()
      .getByRole('button', { name: /select section/i });
    await expect(selectSec04Btn).toBeVisible();

    const [swapStageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      selectSec04Btn.click(),
    ]);
    expect(swapStageRes.status()).toBe(200);

    const boot = await getBootstrap(request);
    expect(boot.stagedSectionIds).toContain('CSE327-04');
    expect(boot.stagedSectionIds).not.toContain('CSE327-03');
  });

  test('T2-04: BVA Low-seat warning badges match exact thresholds (0, 1..5, >5)', async ({
    page,
  }) => {
    await uiLogin(page, 'student');

    await expect(radarRow(page, 'CSE 327', '02')).toContainText(/few seats/i);
    await expect(radarRow(page, 'CSE 311', '03')).toContainText(/few seats/i);
    await expect(radarRow(page, 'CSE 327', '03')).toContainText(/full \(0 left\)/i);
    await expect(radarRow(page, 'CSE 327', '01')).toContainText(/available/i);
  });

  test('T2-05: DAG missing prerequisite blocks MAT 361 when RULE-2.1 is disabled', async ({
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const faculty = await apiLogin(request, 'faculty');

    const toggleRes = await request.post(`${API_BASE}/faculty/rules/toggle`, {
      headers: authHeaders(faculty.token),
      data: { ruleId: 'rule-2-1' },
    });
    expect(toggleRes.status()).toBe(200);

    const dagRes = await request.get(`${API_BASE}/student/dag/eligible`, {
      headers: authHeaders(student.token),
    });
    expect(dagRes.status()).toBe(200);
    const dag = await dagRes.json();
    expect(dag.blockedCourses?.['MAT 361']).toEqual(expect.arrayContaining(['MAT 120']));

    await request.delete(`${API_BASE}/student/cart/MAT361-04`, {
      headers: authHeaders(student.token),
    });

    const stageRes = await request.post(`${API_BASE}/student/cart/stage`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'MAT361-04' },
    });
    expect([409, 422]).toContain(stageRes.status());
    const stageBody = await stageRes.json();
    expect(JSON.stringify(stageBody)).toMatch(/MAT\s*120/i);
  });

  test('T2-06: Timetable clash guard rejects confirming clashing CSE327-02 + CSE311-03', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    await uiLogin(page, 'student');

    const [stageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 327', '02').getByRole('button', { name: /^\+?\s*stage$/i }).click(),
    ]);
    expect(stageRes.status()).toBe(200);
    await expect(page.getByText(/1\s*clash detected/i)).toBeVisible();

    const confirmRes = await request.post(`${API_BASE}/student/enroll/confirm`, {
      headers: authHeaders(student.token),
      data: {},
    });
    expect(confirmRes.status()).toBe(409);
    const body = await confirmRes.json();
    expect(body.ok).toBe(false);
    expect(body.receipt).toBeUndefined();
  });

  test('T2-07: Credit limit guard rejects exceeding 15.0 Cr and solver caps <= 15.0 Cr', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const admin = await apiLogin(request, 'admin');

    // Provision a distinct, non-clashing 3.0 Cr course section (CSE 373) so staging does not replace CSE327-01
    const emergencyRes = await request.post(`${API_BASE}/admin/sections/emergency`, {
      headers: authHeaders(admin.token),
      data: {
        courseCode: 'CSE 373',
        sectionData: {
          days: 'MW',
          timeSlot: '04:20 PM - 05:50 PM',
        },
      },
    });
    expect(emergencyRes.status()).toBe(200);

    // Initial staged is 10.0 Cr; staging CSE331-01 (+3.0 = 13.0 Cr) and CSE373-05 (+3.0 = 16.0 Cr)
    const s1 = await request.post(`${API_BASE}/student/cart/stage`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'CSE331-01' },
    });
    expect(s1.status()).toBe(200);

    const s2 = await request.post(`${API_BASE}/student/cart/stage`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'CSE373-05' },
    });
    if (s2.status() === 200) {
      const s2Body = await s2.json();
      expect(s2Body.state?.stagedSectionIds).toEqual(
        expect.arrayContaining(['CSE327-01', 'CSE311-03', 'CSE311L-02', 'MAT361-04', 'CSE331-01', 'CSE373-05'])
      );
      const confirmRes = await request.post(`${API_BASE}/student/enroll/confirm`, {
        headers: authHeaders(student.token),
        data: {},
      });
      expect([409, 422]).toContain(confirmRes.status());
      const confirmBody = await confirmRes.json();
      expect(confirmBody.ok).toBe(false);
      expect(confirmBody.receipt).toBeUndefined();
      expect(String(confirmBody.message || '')).toMatch(/credit|maximum|15/i);

      // Verify Web UI confirm surfaces the over-credit error banner and never opens receipt
      await uiLogin(page, 'student');
      const [uiConfirmRes] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/student/enroll/confirm') && r.request().method() === 'POST'
        ),
        page.getByRole('button', { name: /confirm & lock schedule/i }).click(),
      ]);
      expect([409, 422]).toContain(uiConfirmRes.status());
      await expect(page.getByRole('alert').filter({ hasText: /credit|maximum|15/i }).first()).toBeVisible();
      await expect(
        page.getByRole('heading', { name: /advising enrollment confirmed/i })
      ).toHaveCount(0);
    } else {
      expect([409, 422]).toContain(s2.status());
    }

    const solveRes = await request.post(`${API_BASE}/student/schedule/solve`, {
      headers: authHeaders(student.token),
      data: { strategy: 'MilestoneFirst', maxCredits: 15 },
    });
    expect(solveRes.status()).toBe(200);
    const solveBody = await solveRes.json();
    expect(solveBody.totalCredits).toBeLessThanOrEqual(15);
  });

  test('T2-08: BVA Room fire-code cap (LIB 602 max 55) & RULE-8.4 disabled guard', async ({
    request,
  }) => {
    const faculty = await apiLogin(request, 'faculty');

    const ok15 = await request.post(`${API_BASE}/faculty/sections/expand-capacity`, {
      headers: authHeaders(faculty.token),
      data: { sectionId: 'CSE425-01', delta: 15 },
    });
    expect(ok15.status()).toBe(200);

    const failOver = await request.post(`${API_BASE}/faculty/sections/expand-capacity`, {
      headers: authHeaders(faculty.token),
      data: { sectionId: 'CSE425-01', delta: 5 },
    });
    expect([400, 422]).toContain(failOver.status());

    await resetBackendAndBrowser(request);
    const faculty2 = await apiLogin(request, 'faculty');

    const disable84 = await request.post(`${API_BASE}/faculty/rules/toggle`, {
      headers: authHeaders(faculty2.token),
      data: { ruleId: 'rule-8-4' },
    });
    expect(disable84.status()).toBe(200);

    const failDisabled = await request.post(`${API_BASE}/faculty/sections/expand-capacity`, {
      headers: authHeaders(faculty2.token),
      data: { sectionId: 'CSE425-01', delta: 5 },
    });
    expect([400, 422]).toContain(failDisabled.status());
  });

  test('T2-09: Re-deciding an already finalized exception returns 409 without double increment', async ({
    page,
    request,
  }) => {
    const faculty = await apiLogin(request, 'faculty');

    const first = await request.post(`${API_BASE}/faculty/exceptions/decision`, {
      headers: authHeaders(faculty.token),
      data: { caseId: 'CASE #EX-2025-0841', action: 'approve' },
    });
    expect(first.status()).toBe(200);
    const afterFirst = await getBootstrap(request);
    const capAfterFirst = afterFirst.sections.find((s: any) => s.id === 'CSE425-01').capacity;

    const second = await request.post(`${API_BASE}/faculty/exceptions/decision`, {
      headers: authHeaders(faculty.token),
      data: { caseId: 'CASE #EX-2025-0841', action: 'reject' },
    });
    expect(second.status()).toBe(409);

    const afterSecond = await getBootstrap(request);
    const ex = afterSecond.exceptions.find((e: any) => e.id === 'CASE #EX-2025-0841');
    expect(ex.status).toBe('approved');
    const capAfterSecond = afterSecond.sections.find((s: any) => s.id === 'CSE425-01').capacity;
    expect(capAfterSecond).toBe(capAfterFirst);

    // Verify UI disables all decision buttons on finalized case
    await uiLogin(page, 'faculty');
    await exceptionCard(page, 'CASE #EX-2025-0841').click();
    await expect(page.getByText('Finalized')).toBeVisible();
    await expect(page.getByRole('button', { name: /approve exception & enroll/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^reject$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /flag for in-person advising/i })).toBeDisabled();
  });

  test('T2-10: Duplicate emergency section deployment is rejected without duplicate keys', async ({
    request,
  }) => {
    const admin = await apiLogin(request, 'admin');

    const first = await request.post(`${API_BASE}/admin/sections/emergency`, {
      headers: authHeaders(admin.token),
      data: {
        courseCode: 'CSE 327',
        sectionData: {
          faculty: 'Mr. Tanvir Rahman',
          days: 'MW',
          room: 'LIB 608',
          timeSlot: '04:20 PM - 05:50 PM',
          capacity: 40,
        },
      },
    });
    expect(first.status()).toBe(200);

    const second = await request.post(`${API_BASE}/admin/sections/emergency`, {
      headers: authHeaders(admin.token),
      data: {
        courseCode: 'CSE 327',
        sectionData: {
          faculty: 'Mr. Tanvir Rahman',
          days: 'MW',
          room: 'LIB 608',
          timeSlot: '04:20 PM - 05:50 PM',
          capacity: 40,
        },
      },
    });
    expect([400, 409, 422]).toContain(second.status());

    const boot = await getBootstrap(request);
    const ids = boot.sections.map((s: any) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('T2-11: Unauthenticated requests to protected role routes return 401', async ({
    request,
  }) => {
    const endpoints: Array<[string, Record<string, unknown>]> = [
      ['/student/cart/stage', { sectionId: 'CSE331-01' }],
      ['/faculty/exceptions/decision', { caseId: 'CASE #EX-2025-0841', action: 'approve' }],
      [
        '/faculty/rules',
        {
          code: 'RULE-9.9',
          title: 'Standing Test Rule',
          description: 'Standing test rule description',
          category: 'Standing',
          enabled: true,
        },
      ],
      ['/admin/scale', {}],
    ];

    for (const [path, data] of endpoints) {
      const res = await request.post(`${API_BASE}${path}`, { data });
      expect(res.status(), `Expected 401 for unauthenticated POST ${path}`).toBe(401);
    }
  });

  test('T2-12: Student JWT gets 403 on Faculty & Admin endpoints and UI enforces role guard', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');

    const forbiddenCalls: Array<[string, Record<string, unknown>]> = [
      ['/faculty/exceptions/decision', { caseId: 'CASE #EX-2025-0841', action: 'approve' }],
      ['/faculty/sections/expand-capacity', { sectionId: 'CSE425-01', delta: 5 }],
      ['/admin/scale', {}],
      ['/admin/sections/emergency', { courseCode: 'CSE 327' }],
    ];

    for (const [path, data] of forbiddenCalls) {
      const res = await request.post(`${API_BASE}${path}`, {
        headers: authHeaders(student.token),
        data,
      });
      expect(res.status(), `Expected 403 for student calling ${path}`).toBe(403);
    }

    await uiLogin(page, 'student');
    for (const forbidden of ['/admin/health', '/faculty/exceptions']) {
      await gotoAndWaitHydration(page, forbidden);
      await expect(page.getByRole('heading', { name: /access denied/i })).toBeVisible();
      await expect(page.getByText(/unauthorized/i)).toBeVisible();
    }

    await uiLogin(page, 'faculty');
    for (const forbidden of ['/admin/health', '/student/dashboard']) {
      await gotoAndWaitHydration(page, forbidden);
      await expect(page.getByRole('heading', { name: /access denied/i })).toBeVisible();
      await expect(page.getByText(/unauthorized/i)).toBeVisible();
    }

    await uiLogin(page, 'admin');
    await gotoAndWaitHydration(page, '/student/dashboard');
    await expect(page.getByRole('heading', { name: /access denied/i })).toBeVisible();
    await expect(page.getByText(/unauthorized/i)).toBeVisible();
  });

  test('T2-13: Faculty JWT gets 403 on Admin endpoints', async ({ request }) => {
    const faculty = await apiLogin(request, 'faculty');

    const adminCalls: Array<[string, Record<string, unknown>]> = [
      ['/admin/scale', {}],
      ['/admin/sections/emergency', { courseCode: 'CSE 327' }],
      ['/admin/courses/add-seats', { courseCode: 'CSE 425', count: 5 }],
    ];

    for (const [path, data] of adminCalls) {
      const res = await request.post(`${API_BASE}${path}`, {
        headers: authHeaders(faculty.token),
        data,
      });
      expect(res.status(), `Expected 403 for faculty calling ${path}`).toBe(403);
    }
  });

  test('T2-14: Non-owner Faculty expanding another instructor section gets 403', async ({
    page,
    request,
  }) => {
    let tokenToUse: string | null = null;
    let actorCreds: { id: string; password: string } | null = null;
    let targetSectionId = 'MAT361-04';

    for (const candidate of NON_OWNER_FACULTY_CANDIDATES) {
      const loginRes = await request.post(`${API_BASE}/auth/login`, {
        data: { id: candidate.id, password: candidate.password, role: 'faculty' },
      });
      if (loginRes.status() === 200) {
        const body = await loginRes.json();
        tokenToUse = body.token;
        actorCreds = { id: candidate.id, password: candidate.password };
        targetSectionId = candidate.targetSectionId;
        break;
      }
    }

    if (!tokenToUse) {
      const nova = await apiLogin(request, 'faculty');
      tokenToUse = nova.token;
      targetSectionId = 'MAT361-04';
    }

    const before = await getBootstrap(request);
    const beforeCap = before.sections.find((s: any) => s.id === targetSectionId).capacity;

    const expandRes = await request.post(`${API_BASE}/faculty/sections/expand-capacity`, {
      headers: authHeaders(tokenToUse),
      data: { sectionId: targetSectionId, delta: 5 },
    });
    expect(expandRes.status()).toBe(403);

    const after = await getBootstrap(request);
    const afterCap = after.sections.find((s: any) => s.id === targetSectionId).capacity;
    expect(afterCap).toBe(beforeCap);

    // Verify UI ownership badge and 403 error inside capacity_expand modal
    if (actorCreds && targetSectionId === 'CSE425-01') {
      await uiLogin(page, 'faculty', actorCreds);
      await gotoAndWaitHydration(page, '/faculty/courses', /course capacity oversight/i);
      const card = facultyCourseCard(page, 'CSE 425', '01');
      await expect(card).toContainText(/other faculty/i);
      await card.getByRole('button', { name: /expand capacity/i }).click();
      const dialog = page.getByRole('dialog').last();
      await expect(dialog).toBeVisible();
      const [uiExpandRes] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/faculty/sections/expand-capacity') &&
            r.request().method() === 'POST'
        ),
        dialog.getByRole('button', { name: /confirm capacity expansion/i }).click(),
      ]);
      expect(uiExpandRes.status()).toBe(403);
      await expect(dialog.getByRole('alert')).toBeVisible();
    }
  });

  test('T2-15: Invalid login credentials return 401 and display inline error in UI', async ({
    page,
    request,
  }) => {
    const badPw = await request.post(`${API_BASE}/auth/login`, {
      data: { id: SEEDED_CREDENTIALS.student.id, password: 'wrong-password-999', role: 'student' },
    });
    expect(badPw.status()).toBe(401);

    const badUser = await request.post(`${API_BASE}/auth/login`, {
      data: { id: '9999999999', password: 'wrong', role: 'student' },
    });
    expect(badUser.status()).toBe(401);

    await gotoAndWaitHydration(page, '/login', /portal gateway/i);
    const gateway = portalGatewayCard(page);
    const idInput = gateway.locator('input[type="text"]');
    const pwInput = gateway.locator('input[type="password"]');
    await idInput.fill(SEEDED_CREDENTIALS.student.id);
    await pwInput.fill('invalid-pass-123');
    await expect(idInput).toHaveValue(SEEDED_CREDENTIALS.student.id);
    await expect(pwInput).toHaveValue('invalid-pass-123');

    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST'
      ),
      gateway.getByRole('button', { name: /sign in/i }).click(),
    ]);
    expect(res.status()).toBe(401);

    expect(page.url()).toMatch(/\/(login)?$/);
    await expect(page.getByText(/invalid|incorrect|unauthorized|failed/i).first()).toBeVisible();
  });

  test('T2-16: SQLi payloads are rejected/sanitized across auth, petitions, rules & search with zero 500s', async ({
    page,
    request,
  }) => {
    const sqli = "' OR '1'='1; DROP TABLE students;--";
    const student = await apiLogin(request, 'student');
    const faculty = await apiLogin(request, 'faculty');

    const loginAttempt = await request.post(`${API_BASE}/auth/login`, {
      data: { id: sqli, password: sqli, role: 'student' },
    });
    expect(loginAttempt.status()).toBeLessThan(500);
    expect([400, 401, 422]).toContain(loginAttempt.status());

    const petAttempt = await request.post(`${API_BASE}/student/petitions`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'CSE425-01', courseCode: 'CSE 425', ruleCode: 'RULE-4.2', reason: sqli },
    });
    expect(petAttempt.status()).toBeLessThan(500);

    const ruleAttempt = await request.post(`${API_BASE}/faculty/rules`, {
      headers: authHeaders(faculty.token),
      data: {
        code: 'RULE-9.8',
        title: sqli,
        description: sqli,
        category: 'Standing',
        enabled: true,
      },
    });
    expect(ruleAttempt.status()).toBeLessThan(500);

    await uiLogin(page, 'student');
    await page.getByPlaceholder(/search course code, faculty, room/i).fill(sqli);
    const boot = await getBootstrap(request);
    expect(boot.sections.length).toBeGreaterThanOrEqual(9);
  });

  test('T2-17: XSS payloads are neutralized without script execution or browser dialogs', async ({
    page,
    request,
  }) => {
    const xss = '<script>window.__xss=true</script><img src=x onerror="window.__xss=true">';
    const student = await apiLogin(request, 'student');
    const faculty = await apiLogin(request, 'faculty');

    let dialogFired = false;
    page.on('dialog', async (d) => {
      dialogFired = true;
      await d.dismiss();
    });

    const petRes = await request.post(`${API_BASE}/student/petitions`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'CSE425-01', courseCode: 'CSE 425', ruleCode: 'RULE-4.2', reason: xss },
    });
    expect(petRes.status()).toBeLessThan(500);

    const ruleRes = await request.post(`${API_BASE}/faculty/rules`, {
      headers: authHeaders(faculty.token),
      data: {
        code: 'RULE-9.7',
        title: xss,
        description: xss,
        category: 'Standing',
        enabled: true,
      },
    });
    expect(ruleRes.status()).toBeLessThan(500);

    await uiLogin(page, 'faculty');
    await gotoAndWaitHydration(page, '/faculty/exceptions', /advising exception queue/i);
    await gotoAndWaitHydration(page, '/faculty/rules', /automated bypass rules/i);

    const xssExecuted = await page.evaluate(
      () => Boolean((window as unknown as { __xss?: boolean }).__xss)
    );
    expect(xssExecuted).toBe(false);
    expect(dialogFired).toBe(false);
  });

  test('T2-18: Negative/malformed payloads return 400/422 (never 500) and rate-limit headers/429 behave cleanly', async ({
    request,
  }) => {
    const faculty = await apiLogin(request, 'faculty');
    const admin = await apiLogin(request, 'admin');
    const student = await apiLogin(request, 'student');

    const negExpand = await request.post(`${API_BASE}/faculty/sections/expand-capacity`, {
      headers: authHeaders(faculty.token),
      data: { sectionId: 'CSE425-01', delta: -50 },
    });
    expect([400, 422]).toContain(negExpand.status());

    const negSeats = await request.post(`${API_BASE}/admin/courses/add-seats`, {
      headers: authHeaders(admin.token),
      data: { courseCode: 'CSE 425', count: -5 },
    });
    expect([400, 422]).toContain(negSeats.status());

    const missingField = await request.post(`${API_BASE}/student/petitions`, {
      headers: authHeaders(student.token),
      data: { ruleCode: 'RULE-4.2' },
    });
    expect([400, 422]).toContain(missingField.status());

    const malformedJson = await request.post(`${API_BASE}/student/cart/stage`, {
      headers: {
        ...authHeaders(student.token),
        'Content-Type': 'application/json',
      },
      data: '{broken-json',
    });
    expect([400, 422]).toContain(malformedJson.status());

    // Rate-limit header verification with explicit opt-in header under NODE_ENV=test
    const rateBootRes = await request.get(`${API_BASE}/bootstrap`, {
      headers: { 'x-enable-rate-limit': 'true' },
    });
    expect(rateBootRes.status()).toBe(200);
    const rateHeaders = rateBootRes.headers();
    expect(Number(rateHeaders['ratelimit-limit'])).toBeGreaterThan(0);
    expect(rateHeaders['ratelimit-remaining']).toBeDefined();

    // Burst /auth/login with x-enable-rate-limit until real HTTP 429 is enforced
    let hit429 = false;
    let rateBody: Record<string, any> | null = null;
    for (let i = 0; i < 15; i++) {
      const loginBurstRes = await request.post(`${API_BASE}/auth/login`, {
        headers: { 'x-enable-rate-limit': 'true' },
        data: {
          id: SEEDED_CREDENTIALS.student.id,
          password: 'wrong-password-rate-limit-check',
          role: 'student',
        },
      });
      if (loginBurstRes.status() === 429) {
        hit429 = true;
        rateBody = await loginBurstRes.json();
        break;
      }
      expect(loginBurstRes.status()).toBe(401);
    }
    expect(hit429, 'Expected HTTP 429 after bursting /api/v1/auth/login').toBe(true);
    expect(rateBody?.ok).toBe(false);
    expect(rateBody?.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('T2-19: Concurrency last-seat race barrier (20 parallel requests across 3 students) never overbooks', async ({
    request,
  }) => {
    const admin = await apiLogin(request, 'admin');
    const studentLogins = await Promise.all(
      SEEDED_STUDENT_ACCOUNTS.map(async (acct) => {
        const auth = await apiLogin(request, 'student', {
          id: acct.id,
          password: acct.password,
        });
        return { id: acct.id, token: auth.token };
      })
    );

    // Isolate CSE311-03 in each student's cart so only the single remaining seat is contested
    for (const st of studentLogins) {
      const boot = await getBootstrap(request, st.token);
      for (const stagedId of boot.stagedSectionIds as string[]) {
        if (stagedId !== 'CSE311-03') {
          await request.delete(`${API_BASE}/student/cart/${stagedId}`, {
            headers: authHeaders(st.token),
          });
        }
      }
      const afterClear = await getBootstrap(request, st.token);
      if (!afterClear.stagedSectionIds.includes('CSE311-03')) {
        const stageRes = await request.post(`${API_BASE}/student/cart/stage`, {
          headers: authHeaders(st.token),
          data: { sectionId: 'CSE311-03' },
        });
        expect(stageRes.status()).toBe(200);
      }
    }

    // Set CSE311-03 to exactly 39/40 (1 seat left) via RDS4 sync
    const initialBoot = await getBootstrap(request);
    const cse311 = initialBoot.sections.find((s: any) => s.id === 'CSE311-03');
    expect(cse311).toBeDefined();

    const syncRes = await request.post(`${API_BASE}/admin/rds4/sync`, {
      headers: authHeaders(admin.token),
      data: {
        snapshots: [
          {
            id: cse311.id,
            courseCode: cse311.courseCode,
            courseTitle: cse311.courseTitle,
            department: cse311.department,
            credits: cse311.credits,
            sectionNumber: cse311.sectionNumber,
            faculty: cse311.faculty,
            days: cse311.days,
            timeSlot: cse311.timeSlot,
            room: cse311.room,
            capacity: cse311.capacity,
            enrolled: 39,
            waitlisted: cse311.waitlisted ?? 0,
          },
        ],
      },
    });
    expect(syncRes.status()).toBe(200);

    const preRaceBoot = await getBootstrap(request);
    const secBefore = preRaceBoot.sections.find((s: any) => s.id === 'CSE311-03');
    expect(secBefore.enrolled).toBe(39);

    const raceResults = await Promise.all(
      Array.from({ length: 20 }, async (_, idx) => {
        const actor = studentLogins[idx % studentLogins.length];
        const res = await request.post(`${API_BASE}/student/enroll/confirm`, {
          headers: authHeaders(actor.token),
          data: {},
        });
        return { studentId: actor.id, status: res.status() };
      })
    );

    const okWinners = raceResults.filter((r) => r.status === 200);
    const conflict409Count = raceResults.filter((r) => r.status === 409).length;
    expect(okWinners.length).toBeGreaterThanOrEqual(1);
    expect(new Set(okWinners.map((r) => r.studentId)).size).toBe(1);
    expect(conflict409Count).toBeGreaterThanOrEqual(13);

    const postRaceBoot = await getBootstrap(request);
    const secAfter = postRaceBoot.sections.find((s: any) => s.id === 'CSE311-03');
    expect(secAfter.enrolled).toBeLessThanOrEqual(secAfter.capacity);
    expect(secAfter.enrolled).toBe(40);
  });

  test('T2-20 @mobile: All 9 portal routes render cleanly without horizontal overflow at 390x844', async ({
    page,
  }) => {
    const collector = attachErrorCollectors(page, { allowExpectedHttpStatuses: true });

    await gotoAndWaitHydration(page, '/', /register smarter, not harder\./i);
    await assertNoHorizontalOverflow(page, '/');

    await gotoAndWaitHydration(page, '/login', /portal gateway/i);
    await assertNoHorizontalOverflow(page, '/login');

    await uiLogin(page, 'student');
    for (const route of ['/student/dashboard', '/student/schedule']) {
      await gotoAndWaitHydration(page, route);
      await assertNoHorizontalOverflow(page, route);
    }

    // Verify Demo Controls popover and GlobalModals dialog render cleanly inside 390x844
    await gotoAndWaitHydration(page, '/student/dashboard', /welcome back, rahim/i);
    await page.getByRole('button', { name: /demo controls/i }).first().click();
    await expect(page.getByText(/presentation controls/i)).toBeVisible();
    await assertNoHorizontalOverflow(page, '/student/dashboard (demo popover)');
    await page.getByRole('button', { name: /demo controls/i }).first().click();

    await radarRow(page, 'CSE 425', '01')
      .getByRole('button', { name: /^\+?\s*stage$|^full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
      .click();
    const mobileRuleDialog = ruleAlertDialog(page);
    await expect(mobileRuleDialog).toBeVisible();
    const box = await mobileRuleDialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    await assertNoHorizontalOverflow(page, '/student/dashboard (rule_alert modal)');
    await page.keyboard.press('Escape');
    await expect(mobileRuleDialog).toBeHidden();

    await uiLogin(page, 'faculty');
    for (const route of ['/faculty/exceptions', '/faculty/courses', '/faculty/rules']) {
      await gotoAndWaitHydration(page, route);
      await assertNoHorizontalOverflow(page, route);
    }

    await uiLogin(page, 'admin');
    for (const route of ['/admin/health', '/admin/escalations']) {
      await gotoAndWaitHydration(page, route);
      await assertNoHorizontalOverflow(page, route);
    }

    expect(collector.errors).toEqual([]);
  });
});
