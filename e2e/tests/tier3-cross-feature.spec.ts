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
  gotoAndWaitHydration,
  openStreamListeners,
  radarRow,
  reloadAndWaitHydration,
  resetBackendAndBrowser,
  ruleAlertDialog,
  triggerDemoControl,
  uiLogin,
} from './helpers/smartadvisor';

test.describe('Tier 3 — Cross-Feature & Real-Time Multi-Context Sync (T3-01 .. T3-11)', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetBackendAndBrowser(request, page);
  });

  test('T3-01: Student Petition -> Faculty Approve -> Student Live Sync & Notifier (<=500ms)', async ({
    browser,
    request,
  }) => {
    const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const studentPage = await contextA.newPage();
      const facultyPage = await contextB.newPage();

      await uiLogin(studentPage, 'student');
      await uiLogin(facultyPage, 'faculty');
      await openStreamListeners(studentPage);
      await openStreamListeners(facultyPage);

      const [stageRes] = await Promise.all([
        studentPage.waitForResponse(
          (r) => r.url().includes('/api/v1/student/cart/stage') && r.request().method() === 'POST'
        ),
        radarRow(studentPage, 'CSE 425', '01')
          .getByRole('button', { name: /^\+?\s*stage$|^full\s*\(swap(?:\s*\/\s*waitlist)?\)/i })
          .click(),
      ]);
      expect(stageRes.status()).toBe(422);

      const ruleDialog = ruleAlertDialog(studentPage);
      await expect(ruleDialog).toBeVisible();

      const reasonInput = ruleDialog.locator('textarea, input[name="reason"]');
      await expect(reasonInput).toBeVisible();
      await reasonInput.fill('Need CSE 425 for graduation milestone');

      let tPetSent = Date.now();
      const petReqPromise = studentPage
        .waitForRequest(
          (r) => r.url().includes('/api/v1/student/petitions') && r.method() === 'POST'
        )
        .then((req) => {
          tPetSent = Date.now();
          return req;
        });
      const petPromise = studentPage.waitForResponse(
        (r) => r.url().includes('/api/v1/student/petitions') && r.request().method() === 'POST'
      );
      await ruleDialog
        .getByRole('button', { name: /submit petition|request advisor override/i })
        .click();
      await petReqPromise;
      const petRes = await petPromise;
      expect(petRes.status()).toBe(201);
      const { exceptionCase } = await petRes.json();
      expect(exceptionCase.status).toBe('pending');

      const newCaseCard = exceptionCard(facultyPage, exceptionCase.id);
      await expectLiveSyncText(newCaseCard, exceptionCase.id, {
        startedAt: tPetSent,
        slaMs: 500,
        streamPage: facultyPage,
      });
      await newCaseCard.click();

      const beforeDecideBoot = await getBootstrap(request);

      let tDecideSent = Date.now();
      const decideReqPromise = facultyPage
        .waitForRequest(
          (r) =>
            r.url().includes('/api/v1/faculty/exceptions/decision') &&
            r.method() === 'POST'
        )
        .then((req) => {
          tDecideSent = Date.now();
          return req;
        });
      const decidePromise = facultyPage.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/exceptions/decision') &&
          r.request().method() === 'POST'
      );
      await facultyPage.getByRole('button', { name: /approve exception & enroll/i }).click();
      await decideReqPromise;
      expect((await decidePromise).status()).toBe(200);

      await expectLiveSyncText(radarRow(studentPage, 'CSE 425', '01'), /00\s*\/\s*41/i, {
        startedAt: tDecideSent,
        slaMs: 500,
        streamPage: studentPage,
        streamMatch: /CSE425-01/i,
      });

      const afterBoot = await getBootstrap(request);
      const cse425 = afterBoot.sections.find((s: any) => s.id === 'CSE425-01');
      expect(cse425.capacity).toBe(41);
      expect(cse425.enrolled).toBe(41);

      const approvedEx = afterBoot.exceptions.find((e: any) => e.id === exceptionCase.id);
      expect(approvedEx.status).toBe('approved');

      findNewNotifications(beforeDecideBoot, afterBoot, {
        eventType: 'PETITION_DECIDED',
        courseCode: 'CSE 425',
        messagePattern: new RegExp(exceptionCase.id.replace('#', '\\#')),
      });

      await closeStreamListeners(studentPage);
      await closeStreamListeners(facultyPage);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('T3-02: Faculty Toggle Bypass Rule -> Auto-Approve Matching Pending Exception', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const faculty = await apiLogin(request, 'faculty');

    // Suspend RULE-4.2 first
    const suspendRes = await request.post(`${API_BASE}/faculty/rules/toggle`, {
      headers: authHeaders(faculty.token),
      data: { ruleId: 'rule-4-2' },
    });
    expect(suspendRes.status()).toBe(200);

    // Student submits pending RULE-4.2 petition
    const petRes = await request.post(`${API_BASE}/student/petitions`, {
      headers: authHeaders(student.token),
      data: {
        sectionId: 'CSE425-01',
        courseCode: 'CSE 425',
        ruleCode: 'RULE-4.2',
        reason: 'Senior standing exception petition',
      },
    });
    expect(petRes.status()).toBe(201);
    const { exceptionCase } = await petRes.json();
    expect(exceptionCase.status).toBe('pending');

    // Faculty enables RULE-4.2 on /faculty/rules
    await uiLogin(page, 'faculty');
    await gotoAndWaitHydration(page, '/faculty/rules', /automated bypass rules/i);
    const beforeToggleBoot = await getBootstrap(request);

    const ruleRow = bypassRuleRow(page, 'RULE-4.2');
    await expect(ruleRow).toContainText(/suspended/i);
    const [toggleRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/faculty/rules/toggle') && r.request().method() === 'POST'
      ),
      ruleRow.getByRole('button', { name: /suspended/i }).click(),
    ]);
    expect(toggleRes.status()).toBe(200);
    await expect(bypassRuleRow(page, 'RULE-4.2')).toContainText(/enabled/i);

    const boot = await getBootstrap(request);
    const updatedEx = boot.exceptions.find((e: any) => e.id === exceptionCase.id);
    expect(updatedEx.status).toBe('approved');
    findNewNotifications(beforeToggleBoot, boot, {
      eventType: 'PETITION_DECIDED',
      messagePattern: new RegExp(exceptionCase.id.replace('#', '\\#')),
    });
  });

  test('T3-03: Faculty Create Custom Bypass Rule persists across routes and reload with audit log', async ({
    page,
    request,
  }) => {
    await uiLogin(page, 'faculty');
    await gotoAndWaitHydration(page, '/faculty/rules', /automated bypass rules/i);

    const codeInput = page.getByPlaceholder(/rule-9\.[12]|rule code|code/i).first();
    if (!(await codeInput.isVisible())) {
      const openFormBtn = page
        .getByRole('button', { name: /new rule|create rule|add rule/i })
        .first();
      await expect(openFormBtn).toBeVisible();
      await openFormBtn.click();
      await expect(codeInput).toBeVisible();
    }

    await codeInput.fill('RULE-9.2');
    await page
      .getByLabel(/policy title|title/i)
      .or(page.getByPlaceholder(/title|priority waiver/i))
      .first()
      .fill('Honors Capstone Fast-Track');
    await page
      .getByLabel(/policy description|description/i)
      .or(page.getByPlaceholder(/description|describe/i))
      .first()
      .fill('Permits 3.60+ CGPA seniors to bypass credit floor.');

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

    await gotoAndWaitHydration(page, '/faculty/courses', /course capacity oversight/i);
    await gotoAndWaitHydration(page, '/faculty/exceptions', /advising exception queue/i);
    await gotoAndWaitHydration(page, '/faculty/rules', /automated bypass rules/i);
    await reloadAndWaitHydration(page, /automated bypass rules/i);

    const row = bypassRuleRow(page, 'RULE-9.2');
    await expect(row).toContainText(/Honors Capstone Fast-Track/i);
    const [toggleRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/faculty/rules/toggle') && r.request().method() === 'POST'
      ),
      row.getByRole('button', { name: /enabled/i }).click(),
    ]);
    expect(toggleRes.status()).toBe(200);
    await expect(bypassRuleRow(page, 'RULE-9.2')).toContainText(/suspended/i);

    const boot = await getBootstrap(request);
    expect(
      boot.auditLog.some((a: any) => JSON.stringify(a).match(/RULE-9\.2|Bypass Rule/i))
    ).toBe(true);
  });

  test('T3-04: Last open seat filled triggers Admin auto-escalation in real time (<=500ms)', async ({
    browser,
    request,
  }) => {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const adminPage = await adminContext.newPage();
      await uiLogin(adminPage, 'admin');
      await gotoAndWaitHydration(
        adminPage,
        '/admin/escalations',
        /critical shortage escalation registry/i
      );

      const admin = await apiLogin(request, 'admin');
      const student = await apiLogin(request, 'student');

      // Set CSE331-01 to 39/40 (1 remaining seat) via RDS4 sync
      const initialBoot = await getBootstrap(request);
      const cse331 = initialBoot.sections.find((s: any) => s.id === 'CSE331-01');
      expect(cse331).toBeDefined();

      const syncRes = await request.post(`${API_BASE}/admin/rds4/sync`, {
        headers: authHeaders(admin.token),
        data: {
          snapshots: [
            {
              id: cse331.id,
              courseCode: cse331.courseCode,
              courseTitle: cse331.courseTitle,
              department: cse331.department,
              credits: cse331.credits,
              sectionNumber: cse331.sectionNumber,
              faculty: cse331.faculty,
              days: cse331.days,
              timeSlot: cse331.timeSlot,
              room: cse331.room,
              capacity: cse331.capacity,
              enrolled: 39,
              waitlisted: cse331.waitlisted ?? 0,
            },
          ],
        },
      });
      expect(syncRes.status()).toBe(200);

      for (const id of ['CSE327-01', 'CSE311-03', 'CSE311L-02', 'MAT361-04']) {
        await request.delete(`${API_BASE}/student/cart/${id}`, {
          headers: authHeaders(student.token),
        });
      }

      const stageRes = await request.post(`${API_BASE}/student/cart/stage`, {
        headers: authHeaders(student.token),
        data: { sectionId: 'CSE331-01' },
      });
      expect(stageRes.status()).toBe(200);

      await openStreamListeners(adminPage);

      const tConfirmSent = Date.now();
      const confirmRes = await request.post(`${API_BASE}/student/enroll/confirm`, {
        headers: authHeaders(student.token),
        data: {},
      });
      expect(confirmRes.status()).toBe(200);

      await expectLiveSyncText(escalationItem(adminPage, 'CSE 331'), /SEV-1|Open/i, {
        startedAt: tConfirmSent,
        slaMs: 500,
        streamPage: adminPage,
        streamMatch: /"courseCode"\s*:\s*"CSE 331"(?:(?!"courseCode"\s*:)[\s\S])*?"autoGenerated"\s*:\s*true/i,
      });

      const postBoot = await getBootstrap(request);
      expect(
        postBoot.escalations.find((e: any) => e.courseCode === 'CSE 331')?.autoGenerated
      ).toBe(true);

      await closeStreamListeners(adminPage);
    } finally {
      await adminContext.close();
    }
  });

  test('T3-05: Admin +5 Seats resolves escalation and streams open seats to Student Radar (<=500ms)', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const adminPage = await adminContext.newPage();
      const studentPage = await studentContext.newPage();

      await uiLogin(studentPage, 'student');
      await openStreamListeners(studentPage);
      await uiLogin(adminPage, 'admin');
      await gotoAndWaitHydration(
        adminPage,
        '/admin/escalations',
        /critical shortage escalation registry/i
      );

      await expect(radarRow(studentPage, 'CSE 425', '01')).toContainText(/full \(0 left\)/i);

      await escalationItem(adminPage, '#ESC-9482').click();
      let tAddSeatsSent = Date.now();
      const reqPromise = adminPage
        .waitForRequest(
          (r) =>
            r.url().includes('/api/v1/admin/courses/add-seats') && r.method() === 'POST'
        )
        .then((req) => {
          tAddSeatsSent = Date.now();
          return req;
        });
      const resPromise = adminPage.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/admin/courses/add-seats') && r.request().method() === 'POST'
      );
      await adminPage.getByRole('button', { name: /\+5 seats to all secs/i }).click();
      await reqPromise;
      expect((await resPromise).status()).toBe(200);
      await expect(escalationItem(adminPage, '#ESC-9482')).toContainText(/resolved/i);

      await expectLiveSyncText(
        radarRow(studentPage, 'CSE 425', '01'),
        /05\s*\/\s*45|few seats/i,
        {
          startedAt: tAddSeatsSent,
          slaMs: 500,
          streamPage: studentPage,
          streamMatch: /CSE425-01/i,
        }
      );

      await closeStreamListeners(studentPage);
    } finally {
      await adminContext.close();
      await studentContext.close();
    }
  });

  test('T3-06: Demo Surge Spike -> Admin SLA Breach -> Auto-Scale +2 -> SLA Restored', async ({
    page,
    request,
  }) => {
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
    await expect(kpiGrid.getByText(/breached sla ceiling/i)).toBeVisible();
    await expect(kpiGrid.getByText(/3,450/)).toBeVisible();

    const [scaleRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/admin/scale') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /auto-scale api nodes/i }).click(),
    ]);
    expect(scaleRes.status()).toBe(200);
    await expect(kpiGrid.getByText(/compliant with sla/i)).toBeVisible();

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
    expect(boot.metrics.p95LatencyMs).toBeLessThanOrEqual(boot.metrics.slaCeilingMs);
    expect(boot.metrics.apiNodes).toBeGreaterThanOrEqual(8);
    expect(boot.metrics.surgeSpikeActive).toBe(false);
  });

  test('T3-07: Waitlisted Student notified when Faculty expands CSE425-01 capacity', async ({
    page,
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const wlRes = await request.post(`${API_BASE}/student/waitlist`, {
      headers: authHeaders(student.token),
      data: { sectionId: 'CSE425-01' },
    });
    expect(wlRes.status()).toBe(200);

    const beforeExpandBoot = await getBootstrap(request);

    await uiLogin(page, 'faculty');
    await gotoAndWaitHydration(page, '/faculty/courses', /course capacity oversight/i);
    await facultyCourseCard(page, 'CSE 425', '01')
      .getByRole('button', { name: /expand capacity/i })
      .click();
    await page.getByRole('button', { name: /\+5 seats/i }).click();

    const [expandRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/faculty/sections/expand-capacity') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /confirm capacity expansion/i }).click(),
    ]);
    expect(expandRes.status()).toBe(200);

    const afterBoot = await getBootstrap(request);
    findNewNotifications(beforeExpandBoot, afterBoot, {
      eventType: 'SEAT_OPEN',
      sectionId: 'CSE425-01',
      messagePattern: /CSE\s*425/i,
    });
  });

  test('T3-08: Multi-context live sync propagates seat mutation across independent clients without reload (<=500ms)', async ({
    browser,
    request,
  }) => {
    const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await uiLogin(pageA, 'student');
      await uiLogin(pageB, 'student');
      await openStreamListeners(pageB);

      await expect(radarRow(pageB, 'CSE 327', '01')).toContainText(/available/i);

      let tSent = Date.now();
      const reqPromise = pageA
        .waitForRequest(
          (r) => r.url().includes('/api/v1/demo/section-full') && r.method() === 'POST'
        )
        .then((req) => {
          tSent = Date.now();
          return req;
        });
      const resPromise = pageA.waitForResponse(
        (r) => r.url().includes('/api/v1/demo/section-full') && r.request().method() === 'POST'
      );
      await triggerDemoControl(pageA, /fill cse 327 sec 01/i);
      await reqPromise;
      expect((await resPromise).status()).toBe(200);

      await expectLiveSyncText(radarRow(pageB, 'CSE 327', '01'), /full \(0 left\)/i, {
        startedAt: tSent,
        slaMs: 500,
        streamPage: pageB,
        streamMatch: /CSE327-01/i,
      });

      const boot = await getBootstrap(request);
      const sec = boot.sections.find((s: any) => s.id === 'CSE327-01');
      expect(sec.enrolled).toBe(sec.capacity);

      await closeStreamListeners(pageB);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('T3-09: Network drop and reconnect automatically resyncs stale client state without reload', async ({
    browser,
  }) => {
    const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await uiLogin(pageA, 'student');
      await uiLogin(pageB, 'student');

      await expect(radarRow(pageB, 'CSE 327', '01')).toContainText(/available/i);
      const urlBefore = pageB.url();

      await contextB.setOffline(true);
      const [fullRes] = await Promise.all([
        pageA.waitForResponse(
          (r) => r.url().includes('/api/v1/demo/section-full') && r.request().method() === 'POST'
        ),
        triggerDemoControl(pageA, /fill cse 327 sec 01/i),
      ]);
      expect(fullRes.status()).toBe(200);
      await expect(radarRow(pageA, 'CSE 327', '01')).toContainText(/full \(0 left\)/i);
      await expect(radarRow(pageB, 'CSE 327', '01')).toContainText(/available/i);

      const tReconnect = Date.now();
      await contextB.setOffline(false);
      await expectLiveSyncText(radarRow(pageB, 'CSE 327', '01'), /full \(0 left\)/i, {
        startedAt: tReconnect,
        slaMs: 3000,
        timeoutMs: 5000,
      });
      expect(pageB.url()).toBe(urlBefore);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('T3-10: DAG prereq filtering x Schedule Solver excludes blocked MAT 361 and enforces 0 clashes', async ({
    request,
  }) => {
    const student = await apiLogin(request, 'student');
    const faculty = await apiLogin(request, 'faculty');

    const disable21 = await request.post(`${API_BASE}/faculty/rules/toggle`, {
      headers: authHeaders(faculty.token),
      data: { ruleId: 'rule-2-1' },
    });
    expect(disable21.status()).toBe(200);

    for (const strategy of ['MilestoneFirst', 'MinimizeGaps'] as const) {
      const solveRes = await request.post(`${API_BASE}/student/schedule/solve`, {
        headers: authHeaders(student.token),
        data: {
          courseCodes: ['CSE 327', 'CSE 331', 'MAT 361'],
          strategy,
          maxCredits: 15,
        },
      });
      expect(solveRes.status()).toBe(200);
      const body = await solveRes.json();
      expect(body.ok).toBe(true);
      expect(body.clashes).toEqual([]);
      expect(body.totalCredits).toBeLessThanOrEqual(15);
      const solvedCourses = body.sections.map((s: any) => s.courseCode);
      expect(solvedCourses).not.toContain('MAT 361');
    }
  });

  test('T3-11: Solver -> Confirm -> RDS Failure -> DAG-compliant 1-click fallback -> Receipt', async ({
    request,
  }) => {
    const student = await apiLogin(request, 'student');

    const solveRes = await request.post(`${API_BASE}/student/schedule/solve`, {
      headers: authHeaders(student.token),
      data: { strategy: 'MilestoneFirst', maxCredits: 15 },
    });
    expect(solveRes.status()).toBe(200);

    const failConfirm = await request.post(`${API_BASE}/student/enroll/confirm`, {
      headers: authHeaders(student.token),
      data: { simulateRdsFailure: true },
    });
    expect(failConfirm.status()).toBe(200);
    const failBody = await failConfirm.json();
    expect(failBody.fallbackPrompt).toBeDefined();

    const failedSectionId = failBody.fallbackPrompt.failedSectionId;
    const alts: any[] = failBody.fallbackPrompt.alternatives ?? [];
    const altId =
      alts.find((a: any) => a.id === 'CSE327-04')?.id ??
      (failBody.fallbackPrompt.fallbackSectionId === 'CSE327-04' ? 'CSE327-04' : undefined);
    expect(altId).toBe('CSE327-04');

    const fbRes = await request.post(`${API_BASE}/student/rds/fallback`, {
      headers: authHeaders(student.token),
      data: { failedSectionId, fallbackSectionId: altId },
    });
    expect(fbRes.status()).toBe(200);
    const fbBody = await fbRes.json();
    expect(fbBody.ok).toBe(true);
    expect(fbBody.receipt?.transactionId).toMatch(/^#RDS-TXN-/);
    expect(fbBody.receipt?.digitalSignature).toMatch(/^SHA256:[a-fA-F0-9]{64}$/);
  });
});
