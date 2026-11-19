import { APIRequestContext, expect, Page, test } from '@playwright/test';
import {
  API_BASE,
  apiLogin,
  assertNoHorizontalOverflow,
  attachErrorCollectors,
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
  radarRow,
  reloadAndWaitHydration,
  resetBackendAndBrowser,
  triggerDemoControl,
  uiLogin,
} from './helpers/smartadvisor';

async function runPortalReadinessAudit(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  const collector = attachErrorCollectors(page, { allowExpectedHttpStatuses: false });

  const healthRes = await request.get(HEALTH_URL);
  expect(healthRes.status()).toBe(200);
  const boot = await getBootstrap(request);
  expect(boot.sections.length).toBeGreaterThanOrEqual(9);

  const student = await apiLogin(request, 'student');
  const dagRes = await request.get(`${API_BASE}/student/dag/eligible`, {
    headers: authHeaders(student.token),
  });
  expect(dagRes.status()).toBe(200);
  const dag = await dagRes.json();
  expect(dag.hasCycle).toBe(false);

  await gotoAndWaitHydration(page, '/', /register smarter, not harder\./i);
  await assertNoHorizontalOverflow(page, '/');

  await gotoAndWaitHydration(page, '/login', /portal gateway/i);
  await assertNoHorizontalOverflow(page, '/login');

  await uiLogin(page, 'student');
  for (const route of ['/student/dashboard', '/student/schedule']) {
    await gotoAndWaitHydration(page, route);
    await assertNoHorizontalOverflow(page, route);
  }

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
}

test.describe('Tier 4 — End-to-End Persona & Autonomous Workflows (T4-01 .. T4-05)', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetBackendAndBrowser(request, page);
  });

  test('T4-01: Student Rahim Ahmed peak registration-day journey from login to SHA-256 receipt', async ({
    page,
    request,
  }) => {
    const collector = attachErrorCollectors(page, { allowExpectedHttpStatuses: true });
    await uiLogin(page, 'student');

    await expect(page.getByRole('heading', { name: /welcome back, rahim/i })).toBeVisible();
    await expect(page.getByText(/advising clearance:/i)).toBeVisible();
    await expect(page.getByText(/MAT 120/i).first()).toBeVisible();

    // Run Solver strategies first
    const [solveGapsRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /minimize gaps/i }).click(),
    ]);
    expect(solveGapsRes.status()).toBe(200);

    const [solveMilestoneRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/schedule/solve') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /milestone first/i }).click(),
    ]);
    expect(solveMilestoneRes.status()).toBe(200);

    // Search CSE 327, try full CSE327-03, join waitlist, and swap to CSE327-04 (RA)
    const searchInput = page.getByPlaceholder(/search course code, faculty, room/i);
    await searchInput.fill('CSE 327');

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
      .locator('div.rounded-2xl[role="dialog"]')
      .filter({ has: page.getByRole('heading', { name: /section sold out/i }) })
      .filter({ has: page.getByText(/instant section swap options/i) })
      .last();
    await expect(soldOutModal).toBeVisible();

    const [wlRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/student/waitlist') && r.request().method() === 'POST'
      ),
      soldOutModal.getByRole('button', { name: /join waitlist/i }).click(),
    ]);
    expect(wlRes.status()).toBe(200);

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

    await expect(radarRow(page, 'CSE 327', '04')).toContainText(/staged/i);
    await expect(radarRow(page, 'CSE 327', '01')).not.toContainText(/staged/i);
    await expect(page.getByText(/0 timetable clashes/i)).toBeVisible();

    await gotoAndWaitHydration(page, '/student/schedule', /weekly timetable planner/i);
    await expect(page.getByText(/0\s*(timetable\s*)?clashes/i)).toBeVisible();

    expect(await getTimetableDayText(page, 'Thursday', '04:20 PM - 05:50 PM')).toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Saturday', '04:20 PM - 05:50 PM')).toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Sunday', '04:20 PM - 05:50 PM')).not.toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Thursday', '09:40 AM - 11:10 AM')).toContain(
      'CSE 311L'
    );
    expect(await getTimetableDayText(page, 'Thursday', '11:20 AM - 12:50 PM')).toContain(
      'CSE 311L'
    );

    const [confirmRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/enroll/confirm') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /confirm schedule/i }).click(),
    ]);
    expect(confirmRes.status()).toBe(200);

    await expect(
      page.getByRole('heading', { name: /advising enrollment confirmed/i })
    ).toBeVisible();
    await expect(page.getByText(/#RDS-TXN-/i)).toBeVisible();
    await expect(page.getByText(/SHA256:[a-fA-F0-9]{64}/)).toBeVisible();

    await page.getByRole('button', { name: /^done$/i }).click();
    await reloadAndWaitHydration(page, /weekly timetable planner/i);

    expect(await getTimetableDayText(page, 'Thursday', '04:20 PM - 05:50 PM')).toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Saturday', '04:20 PM - 05:50 PM')).toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Thursday', '09:40 AM - 11:10 AM')).toContain(
      'CSE 311L'
    );

    const boot = await getBootstrap(request);
    expect(boot.waitlistSectionIds).toContain('CSE327-03');
    const sec04 = boot.sections.find((s: any) => s.id === 'CSE327-04');
    expect(sec04.enrolled).toBe(22);
    expect(boot.receipt?.transactionId).toMatch(/^#RDS-TXN-/);
    expect(collector.errors).toEqual([]);
  });

  test('T4-02: Faculty Chair Dr. Nova Ahmed exception triage, capacity expansion & rule live sync', async ({
    browser,
    request,
  }) => {
    const facultyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const facultyPage = await facultyContext.newPage();
      const studentPage = await studentContext.newPage();
      const facultyCollector = attachErrorCollectors(facultyPage, {
        allowExpectedHttpStatuses: false,
      });
      const studentCollector = attachErrorCollectors(studentPage, {
        allowExpectedHttpStatuses: false,
      });

      await uiLogin(studentPage, 'student');
      await openStreamListeners(studentPage);
      await uiLogin(facultyPage, 'faculty');

      const beforeBoot = await getBootstrap(request);

      await facultyPage.getByRole('button', { name: /^standing$/i }).click();
      await exceptionCard(facultyPage, 'CASE #EX-2025-0841').click();
      await expect(facultyPage.getByText(/rule 4\.2/i).first()).toBeVisible();
      const [approveRes] = await Promise.all([
        facultyPage.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/faculty/exceptions/decision') &&
            r.request().method() === 'POST'
        ),
        facultyPage.getByRole('button', { name: /approve exception & enroll/i }).click(),
      ]);
      expect(approveRes.status()).toBe(200);

      await facultyPage.getByRole('button', { name: /^all$/i }).click();
      await exceptionCard(facultyPage, 'CASE #EX-2025-0835').click();
      const [flagRes] = await Promise.all([
        facultyPage.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/faculty/exceptions/decision') &&
            r.request().method() === 'POST'
        ),
        facultyPage.getByRole('button', { name: /flag for in-person advising/i }).click(),
      ]);
      expect(flagRes.status()).toBe(200);

      await exceptionCard(facultyPage, 'CASE #EX-2025-0839').click();
      const [rejectRes] = await Promise.all([
        facultyPage.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/faculty/exceptions/decision') &&
            r.request().method() === 'POST'
        ),
        facultyPage.getByRole('button', { name: /^reject$/i }).click(),
      ]);
      expect(rejectRes.status()).toBe(200);

      await gotoAndWaitHydration(facultyPage, '/faculty/courses', /course capacity oversight/i);
      await facultyCourseCard(facultyPage, 'CSE 425', '01')
        .getByRole('button', { name: /expand capacity/i })
        .click();
      await facultyPage.getByRole('button', { name: /\+10 seats/i }).click();

      let tExpandSent = Date.now();
      const expandReqPromise = facultyPage
        .waitForRequest(
          (r) =>
            r.url().includes('/api/v1/faculty/sections/expand-capacity') &&
            r.method() === 'POST'
        )
        .then((req) => {
          tExpandSent = Date.now();
          return req;
        });
      const expandResPromise = facultyPage.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/sections/expand-capacity') &&
          r.request().method() === 'POST'
      );
      await facultyPage.getByRole('button', { name: /confirm capacity expansion/i }).click();
      await expandReqPromise;
      expect((await expandResPromise).status()).toBe(200);
      await expect(facultyCourseCard(facultyPage, 'CSE 425', '01')).toContainText(
        /10 Available/i
      );

      await expectLiveSyncText(radarRow(studentPage, 'CSE 425', '01'), /10\s*\/\s*51/i, {
        startedAt: tExpandSent,
        slaMs: 500,
        streamPage: studentPage,
        streamMatch: /CSE425-01/i,
      });

      await gotoAndWaitHydration(facultyPage, '/faculty/rules', /automated bypass rules/i);
      const [toggleRes] = await Promise.all([
        facultyPage.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/faculty/rules/toggle') && r.request().method() === 'POST'
        ),
        bypassRuleRow(facultyPage, 'RULE-6.3')
          .getByRole('button', { name: /suspended/i })
          .click(),
      ]);
      expect(toggleRes.status()).toBe(200);
      await expect(bypassRuleRow(facultyPage, 'RULE-6.3')).toContainText(/enabled/i);

      await reloadAndWaitHydration(facultyPage, /automated bypass rules/i);
      await expect(bypassRuleRow(facultyPage, 'RULE-6.3')).toContainText(/enabled/i);

      const afterBoot = await getBootstrap(request);
      findNewNotifications(beforeBoot, afterBoot, {
        eventType: 'PETITION_DECIDED',
        messagePattern: /CASE #EX-2025-0841/i,
      });

      await closeStreamListeners(studentPage);
      expect(facultyCollector.errors).toEqual([]);
      expect(studentCollector.errors).toEqual([]);
    } finally {
      await facultyContext.close();
      await studentContext.close();
    }
  });

  test('T4-03: IT Operations Admin surge mitigation & emergency section allocation', async ({
    browser,
    request,
  }) => {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const adminPage = await adminContext.newPage();
      const studentPage = await studentContext.newPage();
      const adminCollector = attachErrorCollectors(adminPage, {
        allowExpectedHttpStatuses: false,
      });
      const studentCollector = attachErrorCollectors(studentPage, {
        allowExpectedHttpStatuses: false,
      });

      await uiLogin(studentPage, 'student');
      await openStreamListeners(studentPage);
      await uiLogin(adminPage, 'admin');

      const healthRes = await request.get(HEALTH_URL);
      expect(healthRes.status()).toBe(200);
      const health = await healthRes.json();
      expect(health.checks?.api?.status).toBe('up');
      expect(['up', 'memory']).toContain(health.checks?.postgres?.status);
      expect(['up', 'memory']).toContain(health.checks?.redis?.status);

      const [surgeRes] = await Promise.all([
        adminPage.waitForResponse(
          (r) => r.url().includes('/api/v1/demo/surge') && r.request().method() === 'POST'
        ),
        triggerDemoControl(adminPage, /simulate surge spike/i),
      ]);
      expect(surgeRes.status()).toBe(200);
      await adminPage.waitForURL(/\/admin\/health/);
      const kpiGrid = adminPage.locator('#database');
      await expect(kpiGrid.getByText(/3,450/)).toBeVisible();
      await expect(kpiGrid.getByText(/breached sla ceiling/i)).toBeVisible();

      const [scaleRes] = await Promise.all([
        adminPage.waitForResponse(
          (r) => r.url().includes('/api/v1/admin/scale') && r.request().method() === 'POST'
        ),
        adminPage.getByRole('button', { name: /auto-scale api nodes/i }).click(),
      ]);
      expect(scaleRes.status()).toBe(200);
      await expect(kpiGrid.getByText(/compliant with sla/i)).toBeVisible();

      const ackBtn = adminPage.getByRole('button', { name: /^acknowledge$/i });
      await expect(ackBtn).toBeVisible();
      const [ackRes] = await Promise.all([
        adminPage.waitForResponse(
          (r) => r.url().includes('/api/v1/admin/acknowledge') && r.request().method() === 'POST'
        ),
        ackBtn.click(),
      ]);
      expect(ackRes.status()).toBe(200);

      await gotoAndWaitHydration(
        adminPage,
        '/admin/escalations',
        /critical shortage escalation registry/i
      );
      await escalationItem(adminPage, '#ESC-9481').click();
      await adminPage.getByRole('button', { name: /allocate emergency section/i }).click();

      let tDeploySent = Date.now();
      const deployReqPromise = adminPage
        .waitForRequest(
          (r) =>
            r.url().includes('/api/v1/admin/sections/emergency') &&
            r.method() === 'POST'
        )
        .then((req) => {
          tDeploySent = Date.now();
          return req;
        });
      const deployResPromise = adminPage.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/admin/sections/emergency') &&
          r.request().method() === 'POST'
      );
      await adminPage.getByRole('button', { name: /deploy(?:\s+emergency)?\s+section/i }).click();
      await deployReqPromise;
      expect((await deployResPromise).status()).toBe(200);
      await expect(escalationItem(adminPage, '#ESC-9481')).toContainText(/mitigated/i);

      await expectLiveSyncText(radarRow(studentPage, 'CSE 327', '05'), /available/i, {
        startedAt: tDeploySent,
        slaMs: 500,
        streamPage: studentPage,
        streamMatch: /CSE327-05/i,
      });

      await reloadAndWaitHydration(adminPage, /critical shortage escalation registry/i);
      await expect(escalationItem(adminPage, '#ESC-9481')).toContainText(/mitigated/i);

      await reloadAndWaitHydration(studentPage, /welcome back, rahim/i);
      await expect(radarRow(studentPage, 'CSE 327', '05')).toContainText(/available/i);

      await closeStreamListeners(studentPage);
      expect(adminCollector.errors).toEqual([]);
      expect(studentCollector.errors).toEqual([]);
    } finally {
      await adminContext.close();
      await studentContext.close();
    }
  });

  test('T4-04: Autonomous RDS worker failure -> 1-click DAG fallback -> confirmed receipt & 0 drift', async ({
    page,
    request,
  }) => {
    const collector = attachErrorCollectors(page, { allowExpectedHttpStatuses: false });
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
    const failResPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/student/enroll/confirm') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /confirm schedule/i }).click();
    await failReqPromise;
    expect((await failResPromise).status()).toBe(200);

    const fallbackPrompt = page
      .getByText(/rds.*fallback|1-click.*fallback|alternative section/i)
      .first();
    await expectLiveSyncText(
      fallbackPrompt,
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

    const [fbRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/student/rds/fallback') && r.request().method() === 'POST'
      ),
      clickTarget.click(),
    ]);
    expect(fbRes.status()).toBe(200);

    await expect(
      page.getByRole('heading', { name: /advising enrollment confirmed/i })
    ).toBeVisible();
    await expect(page.getByText(/#RDS-TXN-/i)).toBeVisible();
    await expect(page.getByText(/SHA256:[a-fA-F0-9]{64}/)).toBeVisible();

    await page.getByRole('button', { name: /^done$/i }).click();
    await reloadAndWaitHydration(page, /weekly timetable planner/i);

    expect(await getTimetableDayText(page, 'Thursday', '04:20 PM - 05:50 PM')).toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Saturday', '04:20 PM - 05:50 PM')).toContain(
      'CSE 327'
    );
    expect(await getTimetableDayText(page, 'Sunday', '11:20 AM - 12:50 PM')).not.toContain(
      'CSE 327'
    );

    const boot = await getBootstrap(request);
    expect(boot.receipt?.transactionId).toMatch(/^#RDS-TXN-/);
    expect(boot.receipt?.digitalSignature).toMatch(/^SHA256:[a-fA-F0-9]{64}$/);
    await closeStreamListeners(page);
    expect(collector.errors).toEqual([]);
  });

  test('T4-05: Full-stack health, DAG & zero console/page error readiness across all 9 desktop routes', async ({
    page,
    request,
  }) => {
    await runPortalReadinessAudit(page, request);
  });

  test('T4-05m @mobile: Full-stack health, DAG & zero console/page error readiness across all 9 mobile routes', async ({
    page,
    request,
  }) => {
    await runPortalReadinessAudit(page, request);
  });
});
