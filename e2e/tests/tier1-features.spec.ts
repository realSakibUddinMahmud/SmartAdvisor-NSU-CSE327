import { expect, test } from '@playwright/test';
import {
  API_BASE,
  apiLogin,
  authHeaders,
  bypassRuleRow,
  closeStreamListeners,
  escalationItem,
  exceptionCard,
  expectLiveSyncText,
  facultyCourseCard,
  findNewNotifications,
  getBootstrap,
  getTimetableDayText,
  gotoAndWaitHydration,
  HEALTH_URL,
  openStreamListeners,
  portalGatewayCard,
  radarRow,
  reloadAndWaitHydration,
  resetBackendAndBrowser,
  ruleAlertDialog,
  SEEDED_CREDENTIALS,
  triggerDemoControl,
  uiLogin,
  uiQuickDemoLogin,
} from './helpers/smartadvisor';

test.describe('Tier 1 — Core Feature Coverage (T1-01 .. T1-18)', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetBackendAndBrowser(request, page);
  });

  test('T1-01: Auth Gateway role tabs, JWT login, quick demo login, and /auth/me identity', async ({
    page,
    request,
  }) => {
    await gotoAndWaitHydration(page, '/', /register smarter, not harder\./i);
    const gateway = portalGatewayCard(page);
    await expect(gateway.getByRole('heading', { name: /portal gateway/i })).toBeVisible();
    await expect(gateway.getByText(/phase 2 registration(\s+slot)?:\s*open/i)).toBeVisible();

    const idInput = gateway.locator('input[type="text"]');
    await gateway.getByRole('button', { name: /^faculty$/i }).click();
    await expect(idInput).toHaveValue(SEEDED_CREDENTIALS.faculty.id);

    await gateway.getByRole('button', { name: /^it admin$/i }).click();
    await expect(idInput).toHaveValue(SEEDED_CREDENTIALS.admin.id);

    await gateway.getByRole('button', { name: /^student$/i }).click();
    await expect(idInput).toHaveValue(SEEDED_CREDENTIALS.student.id);

    await expect(gateway.getByRole('button', { name: /rahim ahmed/i })).toBeVisible();
    await expect(gateway.getByRole('button', { name: /dr\.?\s*nova ahmed/i })).toBeVisible();
    await expect(gateway.getByRole('button', { name: /it operations/i })).toBeVisible();

    await gateway.locator('input[type="password"]').fill(SEEDED_CREDENTIALS.student.password);
    const [loginRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST'
      ),
      gateway.getByRole('button', { name: /sign in/i }).click(),
    ]);
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.ok).toBe(true);
    expect(typeof loginBody.token).toBe('string');

    await page.waitForURL(/\/student\/dashboard/);
    await expect(page.getByRole('heading', { name: /welcome back, rahim/i })).toBeVisible();

    const meRes = await request.get(`${API_BASE}/auth/me`, {
      headers: authHeaders(loginBody.token),
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.ok).toBe(true);
    expect(meBody.user.id).toBe(SEEDED_CREDENTIALS.student.id);
    expect(meBody.user.role).toBe('student');

    // Also verify 1-click Quick Demo Login calls POST /api/v1/auth/login (200)
    await uiQuickDemoLogin(page, 'faculty');
  });

  test('T1-02: Logout invalidates JWT token across API and returns UI to unauthenticated state', async ({
    page,
    request,
  }) => {
    const { token } = await apiLogin(request, 'student');
    await uiLogin(page, 'student');
    await expect(page.getByRole('heading', { name: /welcome back, rahim/i })).toBeVisible();

    const uiLogoutBtn = page
      .getByRole('button', { name: /log\s*out|sign\s*out/i })
      .first();
    await expect(uiLogoutBtn).toBeVisible();

    const [logoutRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/auth/logout') && r.request().method() === 'POST'
      ),
      uiLogoutBtn.click(),
    ]);
    expect(logoutRes.status()).toBe(200);
    await page.waitForURL(/\/(login)?$/);

    // Unauthenticated route guard redirects all protected portals to /login
    for (const protectedPath of [
      '/student/dashboard',
      '/faculty/exceptions',
      '/admin/health',
    ]) {
      await page.goto(protectedPath, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/login/);
      await expect(portalGatewayCard(page)).toBeVisible();
    }

    const apiLogoutRes = await request.post(`${API_BASE}/auth/logout`, {
      headers: authHeaders(token),
    });
    expect(apiLogoutRes.status()).toBe(200);

    const meAfter = await request.get(`${API_BASE}/auth/me`, {
      headers: authHeaders(token),
    });
    expect(meAfter.status()).toBe(401);

    const stageAfter = await request.post(`${API_BASE}/student/cart/stage`, {
      headers: authHeaders(token),
      data: { sectionId: 'CSE331-01' },
    });
    expect(stageAfter.status()).toBe(401);
  });

  test('T1-03: Health and Bootstrap probes return canonical component & state payloads', async ({
    request,
  }) => {
    const healthRes = await request.get(HEALTH_URL);
    expect(healthRes.status()).toBe(200);
    const health = await healthRes.json();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('smartadvisor-api');
    expect(['postgres', 'memory']).toContain(health.mode);
    expect(health.checks?.api?.status).toBe('up');
    expect(['up', 'memory']).toContain(health.checks?.postgres?.status);
    expect(['up', 'memory']).toContain(health.checks?.redis?.status);

    const boot = await getBootstrap(request);
    expect(boot.student?.id).toBe('2412159042');
    expect(Array.isArray(boot.sections)).toBe(true);
    expect(boot.sections.length).toBeGreaterThanOrEqual(9);
    expect(Array.isArray(boot.stagedSectionIds)).toBe(true);
    expect(Array.isArray(boot.stagedSections)).toBe(true);
    expect(boot.totalCredits).toBe(10);
    expect(Array.isArray(boot.exceptions)).toBe(true);
    expect(Array.isArray(boot.bypassRules)).toBe(true);
    expect(Array.isArray(boot.escalations)).toBe(true);
    expect(Array.isArray(boot.notifications)).toBe(true);
    expect(Array.isArray(boot.waitlistSectionIds)).toBe(true);
    expect(boot.metrics).toBeDefined();
    expect(boot.dagSummary).toBeDefined();
  });

  test('T1-04: Student Dashboard countdown, filtering, search, staging & reload persistence', async ({
    page,
  }) => {
    await uiLogin(page, 'student');
    await expect(page.getByRole('heading', { name: /welcome back, rahim/i })).toBeVisible();
    await expect(page.getByText(/advising clearance:/i)).toBeVisible();

    const timerLocator = page.locator('text=/\\d{2}h\\s*:\\s*\\d{2}m\\s*:\\s*\\d{2}s/').first();
    await expect(timerLocator).toBeVisible();
    const t0 = (await timerLocator.innerText()).trim();
    await expect(timerLocator).not.toHaveText(t0, { timeout: 2500 });

    await page.getByRole('button', { name: /math & physics/i }).click();
    await expect(radarRow(page, 'MAT 361', '04')).toBeVisible();
    await expect(page.locator('table tbody tr').filter({ hasText: 'CSE 327' })).toHaveCount(0);

    await page.getByRole('button', { name: /all departments/i }).click();
    const searchInput = page.getByPlaceholder(/search course code, faculty, room/i);
    await searchInput.fill('Nabeel');
    await expect(radarRow(page, 'CSE 327', '01')).toBeVisible();
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: /^clear$/i }).click();

    const cse331Row = radarRow(page, 'CSE 331', '01');
    await expect(cse331Row).toBeVisible();
    const [stageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      cse331Row.getByRole('button', { name: /^\+?\s*stage$/i }).click(),
    ]);
    expect(stageRes.status()).toBe(200);

    await expect(page.getByText(/13\.0\s*\/\s*15\.0\s*Cr/i)).toBeVisible();
    await reloadAndWaitHydration(page, /welcome back, rahim/i);
    await expect(page.getByText(/13\.0\s*\/\s*15\.0\s*Cr/i)).toBeVisible();

    const [unstageRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/cart/CSE331-01') && r.request().method() === 'DELETE'
      ),
      radarRow(page, 'CSE 331', '01').getByRole('button', { name: /staged/i }).click(),
    ]);
    expect(unstageRes.status()).toBe(200);
    await expect(page.getByText(/10\.0\s*\/\s*15\.0\s*Cr/i)).toBeVisible();
  });

  test('T1-05: Curriculum DAG eligible courses, missing prerequisite MAT 120 & critical path', async ({
    page,
    request,
  }) => {
    const { token } = await apiLogin(request, 'student');
    const dagRes = await request.get(`${API_BASE}/student/dag/eligible`, {
      headers: authHeaders(token),
    });
    expect(dagRes.status()).toBe(200);
    const dag = await dagRes.json();
    expect(dag.ok).toBe(true);
    expect(dag.hasCycle).toBe(false);
    expect(Array.isArray(dag.eligibleCourses)).toBe(true);
    expect(dag.eligibleCourses).toEqual(
      expect.arrayContaining(['CSE 327', 'CSE 331', 'CSE 425'])
    );
    expect(dag.blockedCourses?.['MAT 361']).toEqual(expect.arrayContaining(['MAT 120']));
    expect(Array.isArray(dag.criticalPath)).toBe(true);
    expect(dag.criticalPath.length).toBeGreaterThan(0);

    await uiLogin(page, 'student');
    const dagContainer = page
      .locator('section, div')
      .filter({
        has: page.getByRole('heading', { name: /curriculum.*dag|prerequisite.*dag|dag/i }),
      })
      .filter({ hasText: /critical path/i })
      .filter({ hasNot: page.locator('table') })
      .last();
    await expect(dagContainer).toBeVisible();
    await expect(dagContainer).toContainText(/critical path/i);
    await expect(dagContainer).toContainText(/CSE\s*115/i);
    await expect(dagContainer).toContainText(/CSE\s*215/i);
    await expect(dagContainer).toContainText(/CSE\s*311/i);
    await expect(dagContainer).toContainText(/CSE\s*425/i);
    await expect(dagContainer).toContainText(/CSE\s*231/i);

    await expect(radarRow(page, 'MAT 361', '04')).toContainText(/blocked:\s*MAT\s*120/i);
    await expect(radarRow(page, 'CSE 327', '01')).toContainText(/dag eligible/i);
    await expect(radarRow(page, 'CSE 331', '01')).toContainText(/dag eligible/i);
  });

  test('T1-06: Constraint-Based Schedule Solver switches MilestoneFirst and MinimizeGaps', async ({
    page,
  }) => {
    await uiLogin(page, 'student');

    const milestoneBtn = page.getByRole('button', { name: /milestone first/i });
    const minimizeBtn = page.getByRole('button', { name: /minimize gaps/i });
    await expect(milestoneBtn).toBeVisible();
    await expect(minimizeBtn).toBeVisible();

    const [solve1Res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      milestoneBtn.click(),
    ]);
    expect(solve1Res.status()).toBe(200);
    const solve1 = await solve1Res.json();
    expect(solve1.ok).toBe(true);
    expect(solve1.strategy).toBe('MilestoneFirst');
    expect(solve1.clashes).toEqual([]);
    expect(solve1.totalCredits).toBeLessThanOrEqual(15);

    const [solve2Res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      minimizeBtn.click(),
    ]);
    expect(solve2Res.status()).toBe(200);
    const solve2 = await solve2Res.json();
    expect(solve2.ok).toBe(true);
    expect(solve2.strategy).toBe('MinimizeGaps');
    expect(solve2.clashes).toEqual([]);
    expect(solve2.totalCredits).toBeLessThanOrEqual(15);

    // Solve & Apply on StudentDashboardPage
    const solveApplyBtn = page.getByRole('button', { name: /solve & apply/i });
    await expect(solveApplyBtn).toBeVisible();
    const [solveApplyRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      solveApplyBtn.click(),
    ]);
    expect(solveApplyRes.status()).toBe(200);

    // Also verify StudentSchedulePage Apply Milestone First & Apply Minimize Gaps buttons
    await gotoAndWaitHydration(page, '/student/schedule', /weekly timetable planner/i);
    const applyMilestoneBtn = page.getByRole('button', { name: /apply milestone first/i });
    const applyGapsBtn = page.getByRole('button', { name: /apply minimize gaps/i });
    await expect(applyMilestoneBtn).toBeVisible();
    await expect(applyGapsBtn).toBeVisible();

    const [schedMilestoneRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      applyMilestoneBtn.click(),
    ]);
    expect(schedMilestoneRes.status()).toBe(200);

    const [schedGapsRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      applyGapsBtn.click(),
    ]);
    expect(schedGapsRes.status()).toBe(200);
    await expect(page.getByText(/0 Clashes \(Verified\)/i)).toBeVisible();
  });

  test('T1-07: Weekly Timetable maps RA pattern to Thursday and Saturday (not Sunday)', async ({
    page,
  }) => {
    await uiLogin(page, 'student');

    const [unstageRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/cart/CSE327-01') && r.request().method() === 'DELETE'
      ),
      radarRow(page, 'CSE 327', '01').getByRole('button', { name: /staged/i }).click(),
    ]);
    expect(unstageRes.status()).toBe(200);

    const [stageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 327', '04').getByRole('button', { name: /^\+?\s*stage$/i }).click(),
    ]);
    expect(stageRes.status()).toBe(200);

    await page.getByRole('link', { name: /generate schedule|weekly schedule/i }).first().click();
    await page.waitForURL(/\/student\/schedule/);

    await expect(
      page.getByRole('heading', { name: /weekly timetable planner/i })
    ).toBeVisible();
    await expect(page.getByText(/0\s*(timetable\s*)?clashes/i)).toBeVisible();

    const thursdayLate = await getTimetableDayText(page, 'Thursday', '04:20 PM - 05:50 PM');
    const saturdayLate = await getTimetableDayText(page, 'Saturday', '04:20 PM - 05:50 PM');
    const sundayLate = await getTimetableDayText(page, 'Sunday', '04:20 PM - 05:50 PM');
    const thursdayLabSlot1 = await getTimetableDayText(page, 'Thursday', '09:40 AM - 11:10 AM');
    const thursdayLabSlot2 = await getTimetableDayText(page, 'Thursday', '11:20 AM - 12:50 PM');

    expect(thursdayLate).toContain('CSE 327');
    expect(saturdayLate).toContain('CSE 327');
    expect(sundayLate).not.toContain('CSE 327');
    expect(thursdayLabSlot1).toContain('CSE 311L');
    expect(thursdayLabSlot2).toContain('CSE 311L');
  });

  test('T1-08: Confirm Schedule produces cryptographic #RDS-TXN & SHA-256 receipt and persists seats', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'student');
    await gotoAndWaitHydration(page, '/student/schedule', /weekly timetable planner/i);

    const confirmBtn = page.getByRole('button', { name: /confirm schedule/i });
    await expect(confirmBtn).toBeVisible();

    const [confirmRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/enroll/confirm') && r.request().method() === 'POST'
      ),
      confirmBtn.click(),
    ]);
    expect(confirmRes.status()).toBe(200);

    await expect(
      page.getByRole('heading', { name: /advising enrollment confirmed/i })
    ).toBeVisible();
    await expect(page.getByText(/#RDS-TXN-/i)).toBeVisible();
    await expect(page.getByText(/SHA256:[a-fA-F0-9]{64}/)).toBeVisible();
    await expect(page.getByText(/10\.0 Cr/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^done$/i }).click();
    await gotoAndWaitHydration(page, '/student/dashboard', /welcome back, rahim/i);
    await reloadAndWaitHydration(page, /welcome back, rahim/i);

    const boot = await getBootstrap(request);
    const cse327_01 = boot.sections.find((s: any) => s.id === 'CSE327-01');
    expect(cse327_01.enrolled).toBe(29);
    await expect(radarRow(page, 'CSE 327', '01')).toContainText(/11\s*\/\s*40|11 Left/i);
  });

  test('T1-09: Waitlist join on full section and pending Student Petition submission', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'student');

    // Join waitlist on CSE327-03 (40/40)
    const [fullStageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 327', '03')
        .getByRole('button', { name: /full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
        .click(),
    ]);
    expect(fullStageRes.status()).toBe(409);

    const soldOutModal = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: /section sold out/i }) })
      .last();
    await expect(soldOutModal).toBeVisible();
    await expect(soldOutModal.getByText(/instant section swap options/i)).toBeVisible();

    const [waitlistRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/waitlist') && r.request().method() === 'POST'
      ),
      soldOutModal.getByRole('button', { name: /join waitlist/i }).click(),
    ]);
    expect(waitlistRes.status()).toBe(200);

    const closeBtn = soldOutModal.getByRole('button', { name: /^close$/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(soldOutModal).toBeHidden();

    // Trigger Rule 4.2 on CSE425-01 and submit petition (must remain pending)
    const [ruleStageRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
      ),
      radarRow(page, 'CSE 425', '01')
        .getByRole('button', { name: /^\+?\s*stage$|^full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
        .click(),
    ]);
    expect(ruleStageRes.status()).toBe(422);

    const ruleDialog = ruleAlertDialog(page);
    await expect(ruleDialog).toBeVisible();

    const reasonInput = ruleDialog.locator('textarea, input[name="reason"]');
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill('Need CSE 425 for senior capstone track with 3.64 CGPA');

    const [petitionRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/petitions') && r.request().method() === 'POST'
      ),
      ruleDialog.getByRole('button', { name: /submit petition|request advisor override/i }).click(),
    ]);
    expect(petitionRes.status()).toBe(201);
    const petitionBody = await petitionRes.json();
    expect(petitionBody.ok).toBe(true);
    expect(petitionBody.exceptionCase?.status).toBe('pending');

    const boot = await getBootstrap(request);
    expect(boot.waitlistSectionIds).toContain('CSE327-03');
    expect(boot.stagedSectionIds).not.toContain('CSE425-01');

    // Close rule_alert modal and test inline #petitions "+ Submit Petition" form on StudentDashboardPage
    await ruleDialog.getByRole('button', { name: /^done$/i }).click();
    await expect(ruleDialog).toBeHidden();

    const petitionsPanel = page.locator('#petitions');
    await petitionsPanel.scrollIntoViewIfNeeded();
    await petitionsPanel.getByRole('button', { name: /\+ submit petition/i }).click();
    await petitionsPanel
      .getByPlaceholder(/provide justification/i)
      .fill('Inline petition justification for RULE-4.2 advisor review.');
    const [inlinePetRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/petitions') && r.request().method() === 'POST'
      ),
      petitionsPanel.getByRole('button', { name: /^submit petition$/i }).click(),
    ]);
    expect(inlinePetRes.status()).toBe(201);
    await expect(petitionsPanel.getByText(/Pending faculty review/i)).toBeVisible();
  });

  test('T1-10: Faculty Exception Queue triage (filter, 6-point audit, flag, reject, approve)', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'faculty');
    await expect(page.getByText(/advising exception queue/i)).toBeVisible();

    await page.getByRole('button', { name: /^standing$/i }).click();
    await exceptionCard(page, 'CASE #EX-2025-0841').click();
    await expect(page.getByText(/rule 4\.2/i).first()).toBeVisible();
    await expect(page.getByText('PASSED').first()).toBeVisible();
    await expect(page.getByText('FAILED').first()).toBeVisible();

    await page.getByRole('button', { name: /^all$/i }).click();

    await exceptionCard(page, 'CASE #EX-2025-0835').click();
    const [flagRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/exceptions/decision') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /flag for in-person advising/i }).click(),
    ]);
    expect(flagRes.status()).toBe(200);

    await exceptionCard(page, 'CASE #EX-2025-0839').click();
    const [rejectRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/exceptions/decision') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /^reject$/i }).click(),
    ]);
    expect(rejectRes.status()).toBe(200);

    await exceptionCard(page, 'CASE #EX-2025-0841').click();
    const [approveRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/exceptions/decision') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /approve exception & enroll/i }).click(),
    ]);
    expect(approveRes.status()).toBe(200);

    const boot = await getBootstrap(request);
    const byId = Object.fromEntries(boot.exceptions.map((e: any) => [e.id, e.status]));
    expect(byId['CASE #EX-2025-0835']).toBe('flagged');
    expect(byId['CASE #EX-2025-0839']).toBe('rejected');
    expect(byId['CASE #EX-2025-0841']).toBe('approved');
  });

  test('T1-11: Faculty Course Capacity Expansion under Rule 8.4 updates card and audit log', async ({
    page,
  }) => {
    await uiLogin(page, 'faculty');
    await gotoAndWaitHydration(page, '/faculty/courses', /course capacity oversight/i);

    const cse425Card = facultyCourseCard(page, 'CSE 425', '01');
    await expect(cse425Card).toBeVisible();
    await cse425Card.getByRole('button', { name: /expand capacity/i }).click();

    await expect(
      page.getByRole('heading', { name: /expand section capacity/i })
    ).toBeVisible();
    await page.getByRole('button', { name: /\+10 seats/i }).click();

    const [expandRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/sections/expand-capacity') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /confirm capacity expansion/i }).click(),
    ]);
    expect(expandRes.status()).toBe(200);

    await expect(facultyCourseCard(page, 'CSE 425', '01')).toContainText(/10 Available/i);
    await expect(page.getByText(/capacity expanded/i).first()).toBeVisible();
  });

  test('T1-12: Faculty Bypass Rules toggle and custom rule creation persist', async ({
    page,
  }) => {
    await uiLogin(page, 'faculty');
    await gotoAndWaitHydration(page, '/faculty/rules', /automated bypass rules/i);

    const rule63Row = bypassRuleRow(page, 'RULE-6.3');
    await expect(rule63Row).toContainText(/suspended/i);
    const [toggleRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/faculty/rules/toggle') && r.request().method() === 'POST'
      ),
      rule63Row.getByRole('button', { name: /suspended/i }).click(),
    ]);
    expect(toggleRes.status()).toBe(200);
    await expect(bypassRuleRow(page, 'RULE-6.3')).toContainText(/enabled/i);

    const codeInput = page.getByPlaceholder(/rule-9\.[12]|rule code|code/i).first();
    if (!(await codeInput.isVisible())) {
      const openFormBtn = page
        .getByRole('button', { name: /new rule|create rule|add rule/i })
        .first();
      await expect(openFormBtn).toBeVisible();
      await openFormBtn.click();
      await expect(codeInput).toBeVisible();
    }

    await codeInput.fill('RULE-9.1');
    await page
      .getByLabel(/policy title|title/i)
      .or(page.getByPlaceholder(/title|priority waiver/i))
      .first()
      .fill('Graduating Senior Lab Waiver');
    await page
      .getByLabel(/policy description|description/i)
      .or(page.getByPlaceholder(/description|describe/i))
      .first()
      .fill('Allows final-semester seniors concurrent lab enrollment.');

    const ruleForm = page.locator('form').filter({ has: codeInput }).first();
    const submitBtn =
      (await ruleForm.count()) > 0
        ? ruleForm
            .locator('button[type="submit"]')
            .or(ruleForm.getByRole('button', { name: /save|submit|create|add/i }))
            .first()
        : page.getByRole('button', { name: /^(save|submit)(\s+(bypass\s+)?rule)?$/i }).first();
    await expect(submitBtn).toBeVisible();

    const [createRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/faculty/rules') && r.request().method() === 'POST'
      ),
      submitBtn.click(),
    ]);
    expect(createRes.status()).toBe(201);

    await expect(bypassRuleRow(page, 'RULE-9.1')).toContainText(/enabled/i);
    await reloadAndWaitHydration(page, /automated bypass rules/i);
    await expect(bypassRuleRow(page, 'RULE-9.1')).toContainText(
      /Graduating Senior Lab Waiver/i
    );
  });

  test('T1-13: Admin Health & Telemetry Hub scales nodes and restores SLA compliance', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'admin');
    await expect(
      page.getByRole('heading', { name: /system health & telemetry hub/i })
    ).toBeVisible();
    const kpiGrid = page.locator('#database');
    await expect(kpiGrid.getByText(/breached sla ceiling/i)).toBeVisible();

    const [scaleRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/admin/scale') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /auto-scale api nodes/i }).click(),
    ]);
    expect(scaleRes.status()).toBe(200);

    await expect(kpiGrid.getByText(/compliant with sla/i)).toBeVisible();
    await expect(page.getByText(/8 Active/i).first()).toBeVisible();

    const ackBtn = page.getByRole('button', { name: /^acknowledge$/i });
    await expect(ackBtn).toBeVisible();
    const [ackRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/admin/acknowledge') && r.request().method() === 'POST'
      ),
      ackBtn.click(),
    ]);
    expect(ackRes.status()).toBe(200);

    const boot = await getBootstrap(request);
    expect(boot.metrics.surgeSpikeActive).toBe(false);
  });

  test('T1-14: Admin Escalations deploys emergency section and adds seats', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'admin');
    await gotoAndWaitHydration(page, '/admin/escalations', /critical shortage escalation registry/i);

    await escalationItem(page, '#ESC-9481').click();
    await page.getByRole('button', { name: /allocate emergency section/i }).click();
    await expect(
      page.getByRole('heading', { name: /provision emergency section/i })
    ).toBeVisible();

    const [deployRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/admin/sections/emergency') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /deploy(?:\s+emergency)?\s+section/i }).click(),
    ]);
    expect(deployRes.status()).toBe(200);
    await expect(escalationItem(page, '#ESC-9481')).toContainText(/mitigated/i);

    await escalationItem(page, '#ESC-9482').click();
    const [addSeatsRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/admin/courses/add-seats') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /\+5 seats to all secs/i }).click(),
    ]);
    expect(addSeatsRes.status()).toBe(200);
    await expect(escalationItem(page, '#ESC-9482')).toContainText(/resolved/i);

    const boot = await getBootstrap(request);
    const sec05 = boot.sections.find((s: any) => s.id === 'CSE327-05');
    expect(sec05).toBeDefined();
    expect(sec05.capacity).toBe(40);
  });

  test('T1-15: RDS4 Scheduled Sync refreshes telemetry without corrupting enrollment state', async ({
    request,
  }) => {
    const admin = await apiLogin(request, 'admin');
    const before = await getBootstrap(request);
    const syncRes = await request.post(`${API_BASE}/admin/rds4/sync`, {
      headers: authHeaders(admin.token),
    });
    expect(syncRes.status()).toBe(200);
    const syncBody = await syncRes.json();
    expect(syncBody.ok).toBe(true);

    const after = await getBootstrap(request);
    expect(after.stagedSectionIds).toEqual(before.stagedSectionIds);
    expect(after.sections.length).toBeGreaterThanOrEqual(before.sections.length);
  });

  test('T1-16: Global DemoHeader controls & live SSE + WebSocket event streams (<=500ms SLA)', async ({
    page,
  }) => {
    await uiLogin(page, 'student');
    await openStreamListeners(page);

    let tSent = Date.now();
    const reqPromise = page
      .waitForRequest(
        (r) => r.url().includes('/api/v1/demo/section-full') && r.method() === 'POST'
      )
      .then((req) => {
        tSent = Date.now();
        return req;
      });
    const fullResPromise = page.waitForResponse(
      (r) => r.url().includes('/api/v1/demo/section-full') && r.request().method() === 'POST'
    );
    await triggerDemoControl(page, /fill cse 327 sec 01/i);
    await reqPromise;
    expect((await fullResPromise).status()).toBe(200);

    await expectLiveSyncText(radarRow(page, 'CSE 327', '01'), /full \(0 left\)/i, {
      startedAt: tSent,
      slaMs: 500,
      streamPage: page,
      streamMatch: /CSE327-01/i,
    });

    const streamCounts = await page.evaluate(() => {
      const w = window as unknown as {
        __e2eSseEvents?: unknown[];
        __e2eWsEvents?: unknown[];
      };
      return {
        sse: w.__e2eSseEvents?.length ?? 0,
        ws: w.__e2eWsEvents?.length ?? 0,
      };
    });
    expect(streamCounts.sse).toBeGreaterThan(0);
    expect(streamCounts.ws).toBeGreaterThan(0);

    await closeStreamListeners(page);
    await uiLogin(page, 'admin');

    const [surgeRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/demo/surge') && r.request().method() === 'POST'
      ),
      triggerDemoControl(page, /simulate surge spike/i),
    ]);
    expect(surgeRes.status()).toBe(200);
    await page.waitForURL(/\/admin\/health/);
    const kpiGrid = page.locator('#database');
    await expect(kpiGrid.getByText(/3,450/)).toBeVisible();
    await expect(kpiGrid.getByText(/275\s*ms/i)).toBeVisible();

    const [resetRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/demo/reset') && r.request().method() === 'POST'
      ),
      triggerDemoControl(page, /reset demo state/i),
    ]);
    expect(resetRes.status()).toBe(200);

    await uiLogin(page, 'student');
    await gotoAndWaitHydration(page, '/student/dashboard', /welcome back, rahim/i);
    await expect(radarRow(page, 'CSE 327', '01')).toContainText(/available/i);
    await expect(page.getByText(/10\.0\s*\/\s*15\.0\s*Cr/i)).toBeVisible();
  });

  test('T1-17: SeatTracker Observer notifications delivered on seat expansion & exception decision', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const faculty = await apiLogin(request, 'faculty');

    const wlRes = await request.post(`${API_BASE}/student/waitlist`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'CSE425-01' },
    });
    expect(wlRes.status()).toBe(200);

    await uiLogin(page, 'student');
    const beforeExpandBoot = await getBootstrap(request);

    const expandRes = await request.post(`${API_BASE}/faculty/sections/expand-capacity`, {
      headers: authHeaders(faculty.token),
      data: { sectionId: 'CSE425-01', delta: 5 },
    });
    expect(expandRes.status()).toBe(200);

    const afterBoot = await getBootstrap(request);
    const [latest] = findNewNotifications(beforeExpandBoot, afterBoot, {
      eventType: 'SEAT_OPEN',
      courseCode: 'CSE 425',
      sectionId: 'CSE425-01',
      messagePattern: /CSE\s*425/i,
    });
    expect(latest.channel).toBeTruthy();
    expect(latest.createdAt).toBeTruthy();

    const notifTrigger = page
      .getByRole('button', { name: /notifications|alerts/i })
      .first();
    const notifLink = page
      .getByRole('link', { name: /notifications/i })
      .first();
    if ((await notifTrigger.count()) > 0 && (await notifTrigger.isVisible())) {
      await notifTrigger.click();
    } else if ((await notifLink.count()) > 0 && (await notifLink.isVisible())) {
      await notifLink.click();
    }

    const notifPanel = page
      .locator('[role="dialog"], [role="region"], aside, section, div')
      .filter({
        has: page.getByRole('heading', { name: /notifications|alerts|delivery log/i }),
      })
      .filter({ hasNot: page.locator('table') })
      .filter({ hasText: latest.message.slice(0, 24) })
      .last();
    await expect(notifPanel).toBeVisible();
    await notifPanel.scrollIntoViewIfNeeded();
    await expect(notifPanel).toContainText(/CSE\s*425/i);
    await expect(notifPanel).toContainText(latest.message.slice(0, 24));

    // Exercise Mark all read in #notifications
    const markAllBtn = page.locator('#notifications').getByRole('button', { name: /mark all read/i });
    await expect(markAllBtn).toBeVisible();
    await markAllBtn.click();
    await expect(page.locator('#notifications').getByText(/\(0 unread\)/i)).toBeVisible();
  });

  test('T1-18: Autonomous RDS failure triggers 1-click DAG fallback and produces confirmed receipt', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const dagRes = await request.get(`${API_BASE}/student/dag/eligible`, {
      headers: authHeaders(student.token),
    });
    expect(dagRes.status()).toBe(200);
    const dagBody = await dagRes.json();
    expect(dagBody.eligibleCourses).toContain('CSE 327');

    await uiLogin(page, 'student');
    await gotoAndWaitHydration(page, '/student/schedule', /weekly timetable planner/i);
    await openStreamListeners(page);

    const rdsSimToggle = page
      .getByRole('checkbox', { name: /simulate rds failure/i })
      .or(page.getByRole('button', { name: /simulate rds failure/i }))
      .first();
    await expect(rdsSimToggle).toBeVisible();
    await rdsSimToggle.click();

    let tFailSent = Date.now();
    const failReqPromise = page
      .waitForRequest(
        (r) =>
          r.url().includes('/api/v1/student/enroll/confirm') && r.method() === 'POST'
      )
      .then((req) => {
        tFailSent = Date.now();
        return req;
      });
    const confirmPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/student/enroll/confirm') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /confirm schedule/i }).click();
    await failReqPromise;
    const confirmRes = await confirmPromise;
    expect(confirmRes.status()).toBe(200);
    const confirmBody = await confirmRes.json();
    const fallbackSecId: string | undefined =
      confirmBody.fallbackPrompt?.alternatives?.find((a: any) => a.id === 'CSE327-04')?.id ??
      confirmBody.fallbackPrompt?.fallbackSectionId;
    expect(fallbackSecId).toBeTruthy();

    const fallbackHeading = page
      .getByText(/rds.*fallback|1-click.*fallback|alternative section/i)
      .first();
    await expectLiveSyncText(
      fallbackHeading,
      /rds.*fallback|1-click.*fallback|alternative section/i,
      {
        startedAt: tFailSent,
        slaMs: 500,
        streamPage: page,
        streamMatch: /"type"\s*:\s*"RDS_FALLBACK"/i,
      }
    );

    const fallbackDialog = page
      .getByRole('dialog')
      .filter({
        has: page.getByRole('heading', {
          name: /1-click rds fallback recovery|rds fallback/i,
        }),
      })
      .last();
    const sec04Row = fallbackDialog
      .locator('div.rounded-xl')
      .filter({ hasText: /CSE\s*327\s*Sec\s*04|Section\s*04/i })
      .last();
    const clickTarget = sec04Row.getByRole('button', {
      name: /swap\s*&\s*(?:re-?)?confirm|accept.*fallback|1-click/i,
    });
    await expect(clickTarget).toBeVisible();

    const [fallbackRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/rds/fallback') && r.request().method() === 'POST'
      ),
      clickTarget.click(),
    ]);
    expect(fallbackRes.status()).toBe(200);
    const fallbackBody = await fallbackRes.json();
    const confirmedSection = fallbackBody.state?.sections?.find(
      (s: any) => s.id === (fallbackSecId || 'CSE327-04')
    );
    expect(dagBody.eligibleCourses).toContain(confirmedSection?.courseCode ?? 'CSE 327');

    await expect(
      page.getByRole('heading', { name: /advising enrollment confirmed/i })
    ).toBeVisible();
    await expect(page.getByText(/#RDS-TXN-/i)).toBeVisible();
    await expect(page.getByText(/SHA256:[a-fA-F0-9]{64}/)).toBeVisible();

    await closeStreamListeners(page);
  });
});
