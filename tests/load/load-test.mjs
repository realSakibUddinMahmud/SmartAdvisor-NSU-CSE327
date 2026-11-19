import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Must be set before importing services/api/dist/middleware/auth.js so JWT
// secret alignment and dual-mode in-memory ACID fallback match the child server.
if (!process.env.TARGET_URL) {
  process.env.NODE_ENV = 'test';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDistDir = path.resolve(__dirname, '../../services/api/dist');
const appJsPath = path.join(apiDistDir, 'app.js');

const TOTAL_REQUESTS = Number(process.env.LOAD_TOTAL_REQUESTS || 10_000);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 50);
const RACE_STUDENTS = Number(process.env.LOAD_RACE_STUDENTS || 50);
const EXCEPTION_CONCURRENCY = Number(process.env.LOAD_EXCEPTION_CONCURRENCY || 20);
const P95_SLA_MS = Number(process.env.LOAD_P95_SLA_MS || 200);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function jsonRequest(baseUrl, route, options = {}) {
  const { method = 'GET', token, body, headers = {} } = options;
  const reqHeaders = { ...headers };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const started = performance.now();
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const elapsedMs = performance.now() - started;

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  return { status: res.status, data, elapsedMs };
}

async function login(baseUrl, id, password, role) {
  const res = await jsonRequest(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { id, password, ...(role ? { role } : {}) }
  });
  assert.equal(res.status, 200, `Login failed for ${id}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  assert.ok(res.data?.token, `Missing token for ${id}`);
  return res.data.token;
}

async function startChildApiServer() {
  const sseJsPath = path.join(apiDistDir, 'events/sseHub.js');
  const wsJsPath = path.join(apiDistDir, 'events/wsHub.js');

  const bootScript = `
import http from 'node:http';

const [appMod, sseMod, wsMod] = await Promise.all([
  import(process.env.SMARTADVISOR_APP_URL),
  import(process.env.SMARTADVISOR_SSE_URL),
  import(process.env.SMARTADVISOR_WS_URL)
]);

const createApp = appMod.createApp ?? appMod.default?.createApp;
const closeAllSseClients = sseMod.closeAllSseClients ?? sseMod.default?.closeAllSseClients;
const closeWebSocketServer = wsMod.closeWebSocketServer ?? wsMod.default?.closeWebSocketServer;

const app = createApp();
const server = http.createServer(app);
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  closeAllSseClients?.();
  if (closeWebSocketServer) {
    await closeWebSocketServer();
  }
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
}

process.on('message', (msg) => {
  if (msg === 'shutdown') void shutdown();
});
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  process.stdout.write('READY http://127.0.0.1:' + addr.port + '\\n');
});
`;

  const child = spawn(process.execPath, ['--input-type=module', '-e', bootScript], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      SMARTADVISOR_APP_URL: pathToFileURL(appJsPath).href,
      SMARTADVISOR_SSE_URL: pathToFileURL(sseJsPath).href,
      SMARTADVISOR_WS_URL: pathToFileURL(wsJsPath).href
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  const baseUrl = await new Promise((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new Error(`Timed out waiting for child API server READY line. stderr: ${stderrBuf}`));
    }, 10_000);

    child.stdout.on('data', (chunk) => {
      if (settled) return;
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('READY ')) {
          settled = true;
          clearTimeout(timer);
          resolve(line.slice('READY '.length).trim());
          return;
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      if (!settled && stderrBuf.length < 8192) {
        stderrBuf += chunk.toString();
      }
    });

    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `Child API server exited prematurely (code=${code}, signal=${signal}). stdout=${stdoutBuf} stderr=${stderrBuf}`
        )
      );
    });
  });

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve();
      }, 2_000);

      child.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });

      try {
        if (child.connected) {
          child.send('shutdown');
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {
          clearTimeout(killTimer);
          resolve();
        }
      }
    });
  };

  return { baseUrl, stop };
}

async function run() {
  const targetUrl = process.env.TARGET_URL?.replace(/\/+$/, '') || '';
  const isExternal = Boolean(targetUrl);

  let stopChildServer = null;
  let signAuthToken = null;
  let demoPassword = process.env.DEMO_DEFAULT_PASSWORD || 'SmartAdvisor2025!';
  let baseUrl = targetUrl;

  if (!isExternal) {
    if (!fs.existsSync(appJsPath)) {
      throw new Error(
        `Missing compiled API build at ${appJsPath}. Run "npm --prefix services/api run build" first.`
      );
    }

    const [seedMod, authMod] = await Promise.all([
      import(pathToFileURL(path.join(apiDistDir, 'seedData.js')).href),
      import(pathToFileURL(path.join(apiDistDir, 'middleware/auth.js')).href)
    ]);

    demoPassword = seedMod.DEMO_DEFAULT_PASSWORD ?? seedMod.default?.DEMO_DEFAULT_PASSWORD ?? demoPassword;
    signAuthToken = authMod.signAuthToken ?? authMod.default?.signAuthToken;

    const started = await startChildApiServer();
    baseUrl = started.baseUrl;
    stopChildServer = started.stop;
  }

  console.log(`\n=== SmartAdvisor NSU — Load & Concurrency Stress Suite ===`);
  console.log(`Target: ${baseUrl} (${isExternal ? 'external TARGET_URL' : 'isolated child-process NODE_ENV=test'})`);

  try {
    // ------------------------------------------------------------------
    // Phase 1: 10,000 Concurrent Requests Benchmark
    // ------------------------------------------------------------------
    const reset1 = await jsonRequest(baseUrl, '/api/v1/demo/reset', { method: 'POST' });
    assert.equal(reset1.status, 200, 'Phase 1 reset failed');

    const studentToken = await login(baseUrl, '2412159042', demoPassword, 'student');
    const facultyToken = await login(baseUrl, 'nova.ahmed', demoPassword, 'faculty');
    const adminToken = await login(baseUrl, 'admin.itops', demoPassword, 'admin');

    const endpoints = [
      () => jsonRequest(baseUrl, '/health'),
      () => jsonRequest(baseUrl, '/api/v1/bootstrap'),
      () => jsonRequest(baseUrl, '/api/v1/student/dag/eligible', { token: studentToken }),
      () =>
        jsonRequest(baseUrl, '/api/v1/student/schedule/solve', {
          method: 'POST',
          token: studentToken,
          body: { strategy: 'MilestoneFirst', maxCredits: 15 }
        })
    ];

    const latencies = new Array(TOTAL_REQUESTS);
    let nextIndex = 0;
    let okCount = 0;
    let status5xxCount = 0;
    let non200Count = 0;
    let transportErrors = 0;

    const phase1Start = performance.now();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= TOTAL_REQUESTS) break;
          try {
            const res = await endpoints[i % endpoints.length]();
            latencies[i] = res.elapsedMs;
            if (res.status === 200) {
              okCount += 1;
            } else {
              non200Count += 1;
              if (res.status >= 500) status5xxCount += 1;
            }
          } catch {
            latencies[i] = Number.NaN;
            transportErrors += 1;
          }
        }
      })
    );
    const phase1TotalMs = performance.now() - phase1Start;

    const validLatencies = latencies.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const rps = TOTAL_REQUESTS / (phase1TotalMs / 1000);
    const p50 = percentile(validLatencies, 50);
    const p95 = percentile(validLatencies, 95);
    const p99 = percentile(validLatencies, 99);
    const errorRate = ((non200Count + transportErrors) / TOTAL_REQUESTS) * 100;

    console.log(`\n[Phase 1] ${TOTAL_REQUESTS.toLocaleString()} Requests (Concurrency=${CONCURRENCY})`);
    console.table([
      {
        TotalRequests: TOTAL_REQUESTS,
        Concurrency: CONCURRENCY,
        HTTP200: okCount,
        HTTP5xx: status5xxCount,
        TransportErrors: transportErrors,
        ErrorRatePct: Number(errorRate.toFixed(4)),
        TotalTimeMs: Number(phase1TotalMs.toFixed(2)),
        RPS: Number(rps.toFixed(1)),
        p50Ms: Number(p50.toFixed(2)),
        p95Ms: Number(p95.toFixed(2)),
        p99Ms: Number(p99.toFixed(2))
      }
    ]);

    assert.equal(status5xxCount, 0, `Expected 0 HTTP 5xx errors, got ${status5xxCount}`);
    assert.equal(transportErrors, 0, `Expected 0 transport errors, got ${transportErrors}`);
    assert.equal(non200Count, 0, `Expected 0 non-200 responses, got ${non200Count}`);
    assert.ok(p95 < P95_SLA_MS, `Expected p95 < ${P95_SLA_MS}ms, got ${p95.toFixed(2)}ms`);

    // ------------------------------------------------------------------
    // Phase 2: Concurrent Last-Seat Race Wave (Zero-Overbooking ACID)
    // ------------------------------------------------------------------
    const reset2 = await jsonRequest(baseUrl, '/api/v1/demo/reset', { method: 'POST' });
    assert.equal(reset2.status, 200, 'Phase 2 reset failed');

    const stageRes = await jsonRequest(baseUrl, '/api/v1/student/cart/stage', {
      method: 'POST',
      token: studentToken,
      body: { sectionId: 'CSE331-01' }
    });
    assert.equal(stageRes.status, 200, `Failed to stage CSE331-01: ${JSON.stringify(stageRes.data)}`);

    if (isExternal) {
      for (const sid of ['2321450042', '2211290042']) {
        const tok = await login(baseUrl, sid, demoPassword, 'student');
        const stg = await jsonRequest(baseUrl, '/api/v1/student/cart/stage', {
          method: 'POST',
          token: tok,
          body: { sectionId: 'CSE331-01' }
        });
        assert.equal(stg.status, 200, `Failed to stage CSE331-01 for ${sid}`);
      }
    }

    const bootBeforeRace = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse331 = bootBeforeRace.data.sections.find((s) => s.id === 'CSE331-01');
    assert.ok(cse331, 'CSE331-01 missing from bootstrap');

    const syncRes = await jsonRequest(baseUrl, '/api/v1/admin/rds4/sync', {
      method: 'POST',
      token: adminToken,
      body: {
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
            capacity: 40,
            enrolled: 39,
            waitlisted: cse331.waitlisted ?? 0
          }
        ]
      }
    });
    assert.equal(syncRes.status, 200, `Failed to set CSE331-01 to 39/40: ${JSON.stringify(syncRes.data)}`);

    let raceTokens;
    if (!isExternal) {
      raceTokens = Array.from({ length: RACE_STUDENTS }, (_, idx) => {
        const num = String(idx + 1).padStart(2, '0');
        const id = `race-stu-${num}`;
        return signAuthToken({
          id,
          name: `Race Student ${num}`,
          role: 'student',
          email: `${id}@northsouth.edu`,
          department: 'ECE / CSE'
        }).token;
      });
    } else {
      const seededTokens = await Promise.all([
        login(baseUrl, '2412159042', demoPassword, 'student'),
        login(baseUrl, '2321450042', demoPassword, 'student'),
        login(baseUrl, '2211290042', demoPassword, 'student')
      ]);
      raceTokens = Array.from({ length: 30 }, (_, idx) => seededTokens[idx % seededTokens.length]);
    }

    const raceResults = await Promise.all(
      raceTokens.map((tok) =>
        jsonRequest(baseUrl, '/api/v1/student/enroll/confirm', {
          method: 'POST',
          token: tok,
          body: {}
        })
      )
    );

    const race200 = raceResults.filter((r) => r.status === 200).length;
    const race409 = raceResults.filter((r) => r.status === 409).length;
    const race5xx = raceResults.filter((r) => r.status >= 500).length;

    const bootAfterRace = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse331After = bootAfterRace.data.sections.find((s) => s.id === 'CSE331-01');

    console.log(`\n[Phase 2] Last-Seat Race Wave on CSE331-01 (39/40 -> 1 seat left)`);
    console.table([
      {
        ConcurrentBuyers: raceTokens.length,
        Winners_200: race200,
        Rejected_409: race409,
        Errors_5xx: race5xx,
        FinalEnrolled: cse331After.enrolled,
        Capacity: cse331After.capacity,
        Overbooked: cse331After.enrolled > cse331After.capacity
      }
    ]);

    assert.equal(race5xx, 0, `Expected 0 5xx in seat race, got ${race5xx}`);
    assert.equal(cse331After.enrolled, 40, `Expected CSE331-01 enrolled === 40, got ${cse331After.enrolled}`);
    assert.ok(cse331After.enrolled <= cse331After.capacity, 'Overbooking detected!');
    if (!isExternal) {
      assert.equal(race200, 1, `Expected strictly 1 winner (200), got ${race200}`);
      assert.equal(race409, RACE_STUDENTS - 1, `Expected strictly ${RACE_STUDENTS - 1} rejections (409), got ${race409}`);
    } else {
      const race200Responses = raceResults.filter((r) => r.status === 200);
      const winningStudentIds = new Set();
      for (const r of race200Responses) {
        const studentId = r.data?.receipt?.studentId;
        assert.ok(
          typeof studentId === 'string' && studentId.trim().length > 0,
          `Expected every 200 response in Phase 2 to include a non-empty receipt.studentId, got: ${JSON.stringify(r.data)}`
        );
        winningStudentIds.add(studentId);
      }
      assert.equal(
        winningStudentIds.size,
        1,
        `Expected strictly 1 unique winning studentId across 200 responses, got ${winningStudentIds.size}: ${[...winningStudentIds].join(', ')}`
      );
      assert.ok(race200 >= 1 && race409 >= 1, `Expected >=1 200 and >=1 409, got ${race200}/${race409}`);
    }

    // ------------------------------------------------------------------
    // Phase 3: Concurrent Faculty Exception Decision Race
    // ------------------------------------------------------------------
    const reset3 = await jsonRequest(baseUrl, '/api/v1/demo/reset', { method: 'POST' });
    assert.equal(reset3.status, 200, 'Phase 3 reset failed');

    const bootBeforeExc = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse425Before = bootBeforeExc.data.sections.find((s) => s.id === 'CSE425-01');
    assert.ok(cse425Before, 'CSE425-01 missing from bootstrap');

    const excResults = await Promise.all(
      Array.from({ length: EXCEPTION_CONCURRENCY }, () =>
        jsonRequest(baseUrl, '/api/v1/faculty/exceptions/decision', {
          method: 'POST',
          token: facultyToken,
          body: { caseId: 'CASE #EX-2025-0841', action: 'approve' }
        })
      )
    );

    const exc200 = excResults.filter((r) => r.status === 200).length;
    const exc409 = excResults.filter((r) => r.status === 409).length;
    const exc5xx = excResults.filter((r) => r.status >= 500).length;

    const bootAfterExc = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse425After = bootAfterExc.data.sections.find((s) => s.id === 'CSE425-01');

    console.log(`\n[Phase 3] Concurrent Exception Decision Race (CASE #EX-2025-0841)`);
    console.table([
      {
        ConcurrentDecisions: EXCEPTION_CONCURRENCY,
        Approved_200: exc200,
        Rejected_409: exc409,
        Errors_5xx: exc5xx,
        CSE425_Before: `${cse425Before.enrolled}/${cse425Before.capacity}`,
        CSE425_After: `${cse425After.enrolled}/${cse425After.capacity}`
      }
    ]);

    assert.equal(exc5xx, 0, `Expected 0 5xx in exception race, got ${exc5xx}`);
    assert.equal(exc200, 1, `Expected strictly 1 approved decision (200), got ${exc200}`);
    assert.equal(
      exc409,
      EXCEPTION_CONCURRENCY - 1,
      `Expected strictly ${EXCEPTION_CONCURRENCY - 1} duplicate rejections (409), got ${exc409}`
    );
    assert.equal(
      cse425After.enrolled,
      cse425Before.enrolled + 1,
      `Expected CSE425-01 enrolled to increment by +1`
    );
    assert.equal(
      cse425After.capacity,
      cse425Before.capacity + 1,
      `Expected CSE425-01 capacity to increment by +1`
    );

    // ------------------------------------------------------------------
    // Phase 4: Same-Student Concurrent Confirm Idempotency Wave
    // ------------------------------------------------------------------
    const reset4 = await jsonRequest(baseUrl, '/api/v1/demo/reset', { method: 'POST' });
    assert.equal(reset4.status, 200, 'Phase 4 reset failed');

    const bootBeforeIdem = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const stagedIds = bootBeforeIdem.data.stagedSectionIds;
    const beforeEnrolledMap = new Map(
      bootBeforeIdem.data.sections
        .filter((s) => stagedIds.includes(s.id))
        .map((s) => [s.id, s.enrolled])
    );

    const idemWaves = EXCEPTION_CONCURRENCY;
    const idemResults = await Promise.all(
      Array.from({ length: idemWaves }, () =>
        jsonRequest(baseUrl, '/api/v1/student/enroll/confirm', {
          method: 'POST',
          token: studentToken,
          body: {}
        })
      )
    );

    const idem200 = idemResults.filter((r) => r.status === 200).length;
    const idem5xx = idemResults.filter((r) => r.status >= 500).length;

    const bootAfterIdem = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse327IdemBefore = beforeEnrolledMap.get('CSE327-01');
    const cse327IdemAfter = bootAfterIdem.data.sections.find((s) => s.id === 'CSE327-01').enrolled;

    console.log(`\n[Phase 4] Same-Student Concurrent Confirm Idempotency Wave (2412159042)`);
    console.table([
      {
        ConcurrentConfirms: idemWaves,
        HTTP200: idem200,
        Errors_5xx: idem5xx,
        CSE327_Before: cse327IdemBefore,
        CSE327_After: cse327IdemAfter,
        Delta: cse327IdemAfter - cse327IdemBefore
      }
    ]);

    assert.equal(idem5xx, 0, `Expected 0 5xx in Phase 4, got ${idem5xx}`);
    assert.equal(idem200, idemWaves, `Expected all ${idemWaves} idempotent confirms to return 200`);
    for (const [secId, prevEnrolled] of beforeEnrolledMap.entries()) {
      const afterSec = bootAfterIdem.data.sections.find((s) => s.id === secId);
      assert.equal(
        afterSec.enrolled,
        prevEnrolled + 1,
        `Expected ${secId} enrolled to increment by strictly +1 (${prevEnrolled} -> ${prevEnrolled + 1}), got ${afterSec.enrolled}`
      );
    }

    // ------------------------------------------------------------------
    // Phase 5: Concurrent Room Fire-Code Cap Expansion Race (CSE425-01 cap 40 -> 55)
    // ------------------------------------------------------------------
    const reset5 = await jsonRequest(baseUrl, '/api/v1/demo/reset', { method: 'POST' });
    assert.equal(reset5.status, 200, 'Phase 5 reset failed');

    const bootBeforeExpand = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse425ExpandBefore = bootBeforeExpand.data.sections.find((s) => s.id === 'CSE425-01');
    const roomCap = cse425ExpandBefore.roomCap ?? 55;

    const expandResults = await Promise.all(
      Array.from({ length: EXCEPTION_CONCURRENCY }, () =>
        jsonRequest(baseUrl, '/api/v1/faculty/sections/expand-capacity', {
          method: 'POST',
          token: facultyToken,
          body: { sectionId: 'CSE425-01', delta: 10 }
        })
      )
    );

    const expand200 = expandResults.filter((r) => r.status === 200).length;
    const expand422 = expandResults.filter((r) => r.status === 422).length;
    const expand5xx = expandResults.filter((r) => r.status >= 500).length;

    const bootAfterExpand = await jsonRequest(baseUrl, '/api/v1/bootstrap');
    const cse425ExpandAfter = bootAfterExpand.data.sections.find((s) => s.id === 'CSE425-01');

    console.log(`\n[Phase 5] Concurrent Fire-Code Capacity Expansion Race (CSE425-01 +10 vs cap ${roomCap})`);
    console.table([
      {
        ConcurrentExpands: EXCEPTION_CONCURRENCY,
        Succeeded_200: expand200,
        Rejected_422: expand422,
        Errors_5xx: expand5xx,
        Capacity_Before: cse425ExpandBefore.capacity,
        Capacity_After: cse425ExpandAfter.capacity,
        RoomFireCodeCap: roomCap
      }
    ]);

    assert.equal(expand5xx, 0, `Expected 0 5xx in Phase 5, got ${expand5xx}`);
    assert.equal(expand200, 1, `Expected strictly 1 expand-capacity success (200), got ${expand200}`);
    assert.equal(
      expand422,
      EXCEPTION_CONCURRENCY - 1,
      `Expected strictly ${EXCEPTION_CONCURRENCY - 1} fire-code rejections (422), got ${expand422}`
    );
    assert.equal(
      cse425ExpandAfter.capacity,
      cse425ExpandBefore.capacity + 10,
      `Expected CSE425-01 capacity to be ${cse425ExpandBefore.capacity + 10}, got ${cse425ExpandAfter.capacity}`
    );
    assert.ok(
      cse425ExpandAfter.capacity <= roomCap,
      `Room fire-code cap violated: ${cse425ExpandAfter.capacity} > ${roomCap}`
    );

    // Leave clean seeded state
    await jsonRequest(baseUrl, '/api/v1/demo/reset', { method: 'POST' });

    console.log('\nPASS: All load, latency SLA, and ACID concurrency race assertions passed.\n');
  } finally {
    if (stopChildServer) {
      await stopChildServer();
    }
  }
}

run().catch((err) => {
  console.error('\nFAIL: Load & concurrency stress suite failed:', err);
  process.exitCode = 1;
});
