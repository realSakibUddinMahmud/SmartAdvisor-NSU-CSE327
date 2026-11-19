import { APIRequestContext, expect, Locator, Page } from '@playwright/test';

const WEB_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000';
export const API_BASE = process.env.E2E_API_BASE || `${API_URL}/api/v1`;
export const HEALTH_URL = process.env.E2E_HEALTH_URL || `${API_URL}/health`;
const WS_URL = process.env.E2E_WS_URL || `${API_URL.replace(/^http/i, 'ws')}/ws`;

const DEFAULT_PW = process.env.DEMO_DEFAULT_PASSWORD || 'SmartAdvisor2025!';

export type PortalRole = 'student' | 'faculty' | 'admin';

const ROLE_HEADINGS: Record<PortalRole, RegExp> = {
  student: /welcome back, rahim/i,
  faculty: /advising exception queue/i,
  admin: /system health & telemetry hub/i,
};

export const SEEDED_CREDENTIALS: Record<
  PortalRole,
  { id: string; password: string; route: string; quickButton: RegExp }
> = {
  student: {
    id: process.env.E2E_STUDENT_ID || '2412159042',
    password: process.env.E2E_STUDENT_PASSWORD || DEFAULT_PW,
    route: '/student/dashboard',
    quickButton: /rahim ahmed/i,
  },
  faculty: {
    id: process.env.E2E_FACULTY_ID || 'nova.ahmed',
    password: process.env.E2E_FACULTY_PASSWORD || DEFAULT_PW,
    route: '/faculty/exceptions',
    quickButton: /dr\.?\s*nova ahmed/i,
  },
  admin: {
    id: process.env.E2E_ADMIN_ID || 'admin.itops',
    password: process.env.E2E_ADMIN_PASSWORD || DEFAULT_PW,
    route: '/admin/health',
    quickButton: /it operations/i,
  },
};

export const SEEDED_STUDENT_ACCOUNTS: Array<{
  id: string;
  name: string;
  password: string;
}> = [
  {
    id: process.env.E2E_STUDENT_ID || '2412159042',
    name: 'Rahim Ahmed',
    password: process.env.E2E_STUDENT_PASSWORD || DEFAULT_PW,
  },
  {
    id: '2321450042',
    name: 'Fariha Tasnim',
    password: process.env.E2E_STUDENT_PASSWORD || DEFAULT_PW,
  },
  {
    id: '2211290042',
    name: 'Tanveer Hasan',
    password: process.env.E2E_STUDENT_PASSWORD || DEFAULT_PW,
  },
];

export const NON_OWNER_FACULTY_CANDIDATES = [
  {
    id: process.env.E2E_FACULTY_NON_OWNER_ID || 'nabeel.mohammed',
    password: process.env.E2E_FACULTY_NON_OWNER_PASSWORD || DEFAULT_PW,
    targetSectionId: 'CSE425-01',
  },
  {
    id: 'silvia.ahmed',
    password: process.env.E2E_FACULTY_NON_OWNER_PASSWORD || DEFAULT_PW,
    targetSectionId: 'CSE425-01',
  },
];

export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function apiLogin(
  request: APIRequestContext,
  role: PortalRole,
  override?: { id?: string; password?: string }
): Promise<{
  token: string;
  user: { id: string; role: PortalRole; name: string; email?: string };
}> {
  const creds = SEEDED_CREDENTIALS[role];
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: {
      id: override?.id ?? creds.id,
      password: override?.password ?? creds.password,
      role,
    },
  });
  expect(
    res.status(),
    `Expected POST ${API_BASE}/auth/login to return 200 for role=${role}, got ${res.status()}`
  ).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(typeof body.token).toBe('string');
  expect(body.token.length).toBeGreaterThan(10);
  return { token: body.token, user: body.user };
}

export async function resetBackendAndBrowser(
  request: APIRequestContext,
  page?: Page
): Promise<void> {
  let res = await request.post(`${API_BASE}/demo/reset`);
  if (res.status() === 401 || res.status() === 403) {
    const admin = await apiLogin(request, 'admin');
    res = await request.post(`${API_BASE}/demo/reset`, {
      headers: authHeaders(admin.token),
    });
  }
  expect(res.ok(), `POST ${API_BASE}/demo/reset failed with ${res.status()}`).toBeTruthy();

  if (page) {
    await page.context().clearCookies();
    if (!page.url().startsWith(WEB_URL)) {
      await Promise.all([
        page
          .waitForResponse(
            (r) => r.url().includes('/api/v1/bootstrap') && r.request().method() === 'GET',
            { timeout: 10_000 }
          )
          .catch(() => null),
        page.goto('/login', { waitUntil: 'load' }),
      ]);
    }
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore opaque origin errors
      }
    });
  }
}

export async function getBootstrap(
  request: APIRequestContext,
  token?: string
): Promise<Record<string, any>> {
  const headers: Record<string, string> = {
    ...(token ? authHeaders(token) : {}),
    Connection: 'close',
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request.get(`${API_BASE}/bootstrap`, { headers });
      expect(res.status(), `GET ${API_BASE}/bootstrap failed`).toBe(200);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt === 1) throw err;
    }
  }
  throw lastError;
}

export async function gotoAndWaitHydration(
  page: Page,
  path: string,
  headingPattern?: RegExp
): Promise<void> {
  const [bootRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/v1/bootstrap') && r.request().method() === 'GET',
      { timeout: 10_000 }
    ),
    page.goto(path, { waitUntil: 'load' }),
  ]);
  expect(bootRes.status(), `GET /api/v1/bootstrap during goto(${path})`).toBe(200);
  if (headingPattern) {
    await expect(page.getByRole('heading', { name: headingPattern }).first()).toBeVisible();
  } else {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  }
}

export async function reloadAndWaitHydration(
  page: Page,
  headingPattern?: RegExp
): Promise<void> {
  const [bootRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/v1/bootstrap') && r.request().method() === 'GET',
      { timeout: 10_000 }
    ),
    page.reload({ waitUntil: 'domcontentloaded' }),
  ]);
  expect(bootRes.status(), 'GET /api/v1/bootstrap during reload').toBe(200);
  if (headingPattern) {
    await expect(page.getByRole('heading', { name: headingPattern }).first()).toBeVisible();
  } else {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  }
}

export function portalGatewayCard(page: Page): Locator {
  return page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByRole('heading', { name: /portal gateway/i }) })
    .last();
}

export function ruleAlertDialog(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({
      has: page.getByRole('heading', { name: /academic rule[-\s]*4\.2 standing alert/i }),
    })
    .last();
}

export async function uiLogin(
  page: Page,
  role: PortalRole,
  credsOverride?: { id?: string; password?: string }
): Promise<void> {
  const creds = SEEDED_CREDENTIALS[role];
  await gotoAndWaitHydration(page, '/login', /portal gateway/i);

  const gateway = portalGatewayCard(page);
  await expect(gateway).toBeVisible();

  const tabName =
    role === 'student' ? /^student$/i : role === 'faculty' ? /^faculty$/i : /^it admin$/i;
  const roleTab = gateway.getByRole('button', { name: tabName });
  await expect(roleTab).toBeVisible();
  await roleTab.click();

  const idInput = gateway.locator('input[type="text"]');
  const pwInput = gateway.locator('input[type="password"]');
  await idInput.fill(credsOverride?.id ?? creds.id);
  await pwInput.fill(credsOverride?.password ?? creds.password);

  const [loginRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST',
      { timeout: 10_000 }
    ),
    gateway.getByRole('button', { name: /sign in/i }).click(),
  ]);
  expect(loginRes.status(), `UI sign-in for role=${role} returned ${loginRes.status()}`).toBe(
    200
  );
  await page.waitForURL(new RegExp(creds.route.replace('/', '\\/')));
  await expect(
    page.getByRole('heading', { name: ROLE_HEADINGS[role] }).first()
  ).toBeVisible();
}

export async function uiQuickDemoLogin(page: Page, role: PortalRole): Promise<void> {
  const creds = SEEDED_CREDENTIALS[role];
  await gotoAndWaitHydration(page, '/login', /portal gateway/i);

  const gateway = portalGatewayCard(page);
  const btn = gateway.getByRole('button', { name: creds.quickButton });
  await expect(btn).toBeVisible();

  const [loginRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST',
      { timeout: 10_000 }
    ),
    btn.click(),
  ]);
  expect(loginRes.status(), `Quick demo login for ${role} must succeed`).toBe(200);
  await page.waitForURL(new RegExp(creds.route.replace('/', '\\/')));
  await expect(
    page.getByRole('heading', { name: ROLE_HEADINGS[role] }).first()
  ).toBeVisible();
}

export function radarRow(page: Page, courseCode: string, sectionNumber: string): Locator {
  return page
    .locator('table tbody tr')
    .filter({ hasText: courseCode })
    .filter({ hasText: new RegExp(`Sec\\s*${sectionNumber}(?!\\d)`, 'i') })
    .first();
}

export function exceptionCard(page: Page, caseId: string): Locator {
  return page.locator('div.cursor-pointer').filter({ hasText: caseId }).first();
}

export function facultyCourseCard(
  page: Page,
  courseCode: string,
  sectionNumber: string
): Locator {
  return page
    .locator('main div.rounded-2xl')
    .filter({ hasText: courseCode })
    .filter({ hasText: new RegExp(`Sec\\s*${sectionNumber}(?!\\d)`, 'i') })
    .first();
}

export function bypassRuleRow(page: Page, ruleCode: string): Locator {
  return page.locator('table tbody tr').filter({ hasText: ruleCode }).first();
}

export function escalationItem(page: Page, idOrCourse: string): Locator {
  return page.locator('div.cursor-pointer').filter({ hasText: idOrCourse }).first();
}

export async function getTimetableDayText(
  page: Page,
  dayName: string,
  timeSlotLabel: string
): Promise<string> {
  const table = page.locator('table').filter({ hasText: /Time Slot/i }).first();
  const colIndex = await table
    .locator('thead th')
    .evaluateAll(
      (ths, target) =>
        ths.findIndex(
          (th) => th.textContent?.trim().toLowerCase() === String(target).toLowerCase()
        ),
      dayName
    );
  if (colIndex < 0) return '';
  const row = table.locator('tbody tr').filter({ hasText: timeSlotLabel }).first();
  if ((await row.count()) === 0) return '';
  return (await row.locator('td').nth(colIndex).innerText()).trim();
}

export async function triggerDemoControl(
  page: Page,
  actionText: RegExp | string
): Promise<void> {
  const trigger = page.getByRole('button', { name: /demo controls/i }).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const item = page.getByRole('button', { name: actionText }).first();
  try {
    await item.waitFor({ state: 'visible', timeout: 2500 });
    await item.click();
  } catch {
    // Re-open cleanly if onMouseLeave collapsed the menu during pointer travel
    await trigger.click();
    await item.waitFor({ state: 'visible', timeout: 3000 });
    await item.dispatchEvent('click');
  }
}

export async function assertNoHorizontalOverflow(
  page: Page,
  routeLabel: string
): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `Horizontal overflow on ${routeLabel}: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`
  ).toBeLessThanOrEqual(innerWidth);
}

export function attachErrorCollectors(
  page: Page,
  options?: { allowExpectedHttpStatuses?: boolean }
): { errors: string[] } {
  const errors: string[] = [];
  const allowExpected = options?.allowExpectedHttpStatuses ?? false;
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (
        allowExpected &&
        (text.includes('401') ||
          text.includes('403') ||
          text.includes('409') ||
          text.includes('422'))
      ) {
        return;
      }
      errors.push(`console.error: ${text}`);
    }
  });
  return { errors };
}

interface StreamEventRecord {
  payload: any;
  raw: string;
  receivedAt: number;
}

export async function openStreamListeners(page: Page, timeoutMs = 5000): Promise<void> {
  await page.evaluate(
    ({ apiBase, wsUrl, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const w = window as unknown as {
          __e2eSseEvents?: StreamEventRecord[];
          __e2eWsEvents?: StreamEventRecord[];
          __e2eSseSource?: EventSource;
          __e2eWsSocket?: WebSocket;
        };
        w.__e2eSseSource?.close();
        w.__e2eWsSocket?.close();
        w.__e2eSseEvents = [];
        w.__e2eWsEvents = [];

        let sseOpen = false;
        let wsOpen = false;
        let settled = false;

        const timer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(
              new Error(
                `Stream open timeout after ${timeout}ms (sseOpen=${sseOpen}, wsOpen=${wsOpen})`
              )
            );
          }
        }, timeout);

        const maybeResolve = () => {
          if (!settled && sseOpen && wsOpen) {
            settled = true;
            window.clearTimeout(timer);
            resolve();
          }
        };

        const es = new EventSource(`${apiBase}/events`);
        es.onopen = () => {
          sseOpen = true;
          maybeResolve();
        };
        es.onerror = () => {
          if (!sseOpen && !settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(new Error(`SSE connection failed at ${apiBase}/events`));
          }
        };
        es.onmessage = (evt) => {
          const raw = String(evt.data);
          let payload: any = raw;
          try {
            payload = JSON.parse(raw);
          } catch {
            // keep raw string
          }
          w.__e2eSseEvents?.push({ payload, raw, receivedAt: Date.now() });
        };
        w.__e2eSseSource = es;

        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (ws.readyState === WebSocket.OPEN) {
            wsOpen = true;
            maybeResolve();
          }
        };
        ws.onerror = () => {
          if (!wsOpen && !settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(new Error(`WebSocket connection failed at ${wsUrl}`));
          }
        };
        ws.onmessage = (evt) => {
          const raw = String(evt.data);
          let payload: any = raw;
          try {
            payload = JSON.parse(raw);
          } catch {
            // keep raw string
          }
          w.__e2eWsEvents?.push({ payload, raw, receivedAt: Date.now() });
        };
        w.__e2eWsSocket = ws;
      }),
    { apiBase: API_BASE, wsUrl: WS_URL, timeout: timeoutMs }
  );
}

export async function closeStreamListeners(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __e2eSseSource?: EventSource;
      __e2eWsSocket?: WebSocket;
    };
    w.__e2eSseSource?.close();
    w.__e2eWsSocket?.close();
  });
}

export async function expectLiveSyncText(
  locator: Locator,
  expected: RegExp | string,
  options: {
    startedAt: number;
    slaMs?: number;
    timeoutMs?: number;
    streamPage?: Page;
    streamMatch?: RegExp;
  }
): Promise<{ domElapsedMs: number; sseLatencyMs?: number; wsLatencyMs?: number }> {
  const slaMs = options.slaMs ?? 500;
  const timeoutMs = options.timeoutMs ?? Math.max(1500, slaMs);

  await expect
    .poll(
      async () => {
        const text = (await locator.innerText().catch(() => '')) || '';
        return typeof expected === 'string' ? text.includes(expected) : expected.test(text);
      },
      { timeout: timeoutMs, intervals: [25, 25, 50, 50, 100] }
    )
    .toBe(true);

  const domElapsedMs = Math.max(0, Date.now() - options.startedAt);

  if (options.streamPage) {
    const matchSource = options.streamMatch?.source ?? 'SYNC_UPDATE|RDS_FALLBACK|NOTIFICATION';
    const matchFlags = options.streamMatch?.flags ?? 'i';
    const readFrames = () =>
      options.streamPage!.evaluate(
        ({ minTs, source, flags }) => {
          const re = new RegExp(source, flags);
          const w = window as unknown as {
            __e2eSseEvents?: StreamEventRecord[];
            __e2eWsEvents?: StreamEventRecord[];
          };
          const pick = (arr?: StreamEventRecord[]) =>
            (arr ?? []).find((e) => e.receivedAt >= minTs - 50 && re.test(e.raw));
          return { sse: pick(w.__e2eSseEvents), ws: pick(w.__e2eWsEvents) };
        },
        { minTs: options.startedAt, source: matchSource, flags: matchFlags }
      );

    await expect
      .poll(
        async () => {
          const f = await readFrames();
          return Boolean(f.sse && f.ws);
        },
        { timeout: slaMs, intervals: [15, 25, 50] }
      )
      .toBe(true)
      .catch(() => undefined);

    const frames = await readFrames();

    expect(frames.sse, 'Expected matching SSE frame for live sync').toBeDefined();
    expect(frames.ws, 'Expected matching WebSocket frame for live sync').toBeDefined();

    const sseLatencyMs = Math.max(0, frames.sse!.receivedAt - options.startedAt);
    const wsLatencyMs = Math.max(0, frames.ws!.receivedAt - options.startedAt);
    expect(
      sseLatencyMs,
      `SSE sync latency ${sseLatencyMs}ms exceeded ${slaMs}ms SLA`
    ).toBeLessThanOrEqual(slaMs);
    expect(
      wsLatencyMs,
      `WS sync latency ${wsLatencyMs}ms exceeded ${slaMs}ms SLA`
    ).toBeLessThanOrEqual(slaMs);

    const domHeadroom = process.env.CI ? Math.max(slaMs, 1000) : Math.max(slaMs, 750);
    expect(
      domElapsedMs,
      `DOM sync elapsed ${domElapsedMs}ms exceeded ${domHeadroom}ms`
    ).toBeLessThanOrEqual(domHeadroom);
    return { domElapsedMs, sseLatencyMs, wsLatencyMs };
  }

  expect(
    domElapsedMs,
    `Live sync elapsed ${domElapsedMs}ms exceeded ${slaMs}ms SLA`
  ).toBeLessThanOrEqual(slaMs);
  return { domElapsedMs };
}

export function findNewNotifications(
  beforeBoot: Record<string, any>,
  afterBoot: Record<string, any>,
  filter?: {
    eventType?: string;
    courseCode?: string;
    sectionId?: string;
    messagePattern?: RegExp;
  }
): Record<string, any>[] {
  const beforeList: any[] = Array.isArray(beforeBoot.notifications)
    ? beforeBoot.notifications
    : [];
  const afterList: any[] = Array.isArray(afterBoot.notifications)
    ? afterBoot.notifications
    : [];
  expect(afterList.length).toBeGreaterThan(beforeList.length);

  const beforeIds = new Set(beforeList.map((n) => n.id));
  const added = afterList.filter((n) => !beforeIds.has(n.id));
  expect(added.length).toBeGreaterThan(0);

  const matched = filter
    ? added.filter((n) => {
        if (filter.eventType && n.eventType !== filter.eventType) return false;
        if (filter.courseCode && n.courseCode !== filter.courseCode) return false;
        if (filter.sectionId && n.sectionId !== filter.sectionId) return false;
        if (filter.messagePattern && !filter.messagePattern.test(String(n.message || '')))
          return false;
        return true;
      })
    : added;

  expect(
    matched.length,
    'Expected at least one matching newly emitted notification'
  ).toBeGreaterThan(0);
  for (const item of matched) {
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
  }
  return matched;
}
