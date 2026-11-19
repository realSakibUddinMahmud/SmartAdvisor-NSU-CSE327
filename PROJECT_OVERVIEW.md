# SmartAdvisor NSU — Project Overview & Technical Architecture

[![CI/CD Pipeline](https://github.com/DarkMonarch1/NSU_CSE327_SEC04_ITN/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/DarkMonarch1/NSU_CSE327_SEC04_ITN/actions/workflows/ci-cd.yml)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14.x-000000?logo=next.js&logoColor=white)
![Flutter](https://img.shields.io/badge/Flutter-Stable-02569B?logo=flutter&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)

> **North South University (NSU)**  
> **Department of Electrical & Computer Engineering**  
> **Course:** CSE 327 (Section 04) — Software Engineering  
> **Supervisor:** Intisar Tahmeed Sir `[ITN]`  
> **Companion Guides:** [`README.md`](README.md) · [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md)

---

## 1. Vision & Sprint 1–4 Delivery Matrix

**SmartAdvisor NSU** resolves peak advising-minute seat contention, prerequisite errors, schedule clashes, and faculty approval bottlenecks by combining deterministic ACID locking, graph-based prerequisite validation, real-time cross-platform synchronization, and asynchronous RDS integration.

| Story / Requirement | Scope | Implemented Modules |
| :--- | :--- | :--- |
| `US-S1`, `FR-01`, `BL-03`, `BL-04` | Atomic seat locking, waitlist, student petition flow & RDS4 sync | `services/api/src/store/backendStore.ts`, `routes/student.ts`, `services/rds4Sync.ts`, `apps/web/src/components/GlobalModals.tsx` |
| `US-S2`, `FR-02`, `FR-03`, `BL-02`, `BL-05` | `CurriculumGraph` DAG engine & `AdvisingEngine` schedule solver (`MilestoneFirst` / `MinimizeGaps`) | `services/api/src/services/curriculumGraph.ts`, `scheduleSolver.ts`, `ruleValidator.ts`, `apps/web/app/student/{dashboard,schedule}/page.tsx` |
| `US-S3`, `FR-05`, `FR-06`, `NFR-04`, `BL-06`, `BL-07` | Sub-500ms WS/SSE + Redis Pub/Sub sync & Observer seat-open notifications | `services/api/src/events/{redisBus,wsHub,sseHub,realtimeBridge}.ts`, `services/notifier.ts`, `apps/web/src/store/smartAdvisorStore.tsx`, `apps/mobile/lib/state/app_state.dart` |
| `US-S4`, `BL-10` | Headless BullMQ RDS worker, `#RDS-TXN-*` / `SHA256:*` receipts & 1-click DAG fallback | `services/rds-worker/src/{index,worker,rdsClient}.ts`, `services/api/src/events/rdsQueue.ts`, `routes/student.ts` (`/rds/fallback`) |
| `US-F1..F3`, `FR-04`, `BL-08` | Faculty exception queue, owner RBAC, room fire-code caps & Senate bypass rules | `services/api/src/middleware/rbac.ts`, `routes/faculty.ts`, `apps/web/app/faculty/{exceptions,courses,rules}/page.tsx` |
| `US-A1..A3`, `FR-07`, `BL-09` | IT Admin `/health` probes (`503` degraded), 1m SLA breach monitor, scaling & SEV-1 escalations | `services/api/src/app.ts`, `events/slaMonitor.ts`, `routes/admin.ts`, `apps/web/app/admin/{health,escalations}/page.tsx` |
| `NFR-01..NFR-05`, `BL-01`, Sprint 4 | JWT/RBAC/Zod/Helmet/CSRF/NGINX rate limiting, Docker Compose, 10k load & pen-tests, Playwright E2E & docs | `services/api/src/middleware/*`, `infrastructure/*`, `tests/{load,security}/*`, `e2e/*`, `docs/DEMO_GUIDE.md` |

---

## 2. Software Design Patterns & Subproject Architecture

- **Singleton Pattern (`CurriculumGraph`)**: `services/api/src/services/curriculumGraph.ts` maintains a single validated DAG over the 10-course curriculum, detecting cycles, computing eligible/blocked courses, and resolving the critical prerequisite path.
- **Strategy Pattern (`AdvisingEngine`)**: `services/api/src/services/scheduleSolver.ts` switches between `MilestoneFirst` (prioritizes critical-path courses) and `MinimizeGaps` (minimizes idle time between classes) while enforcing zero timetable clashes and credit ceilings.
- **Observer Pattern (`NotifierService` & Real-Time Subscribers)**: `services/api/src/services/notifier.ts` dispatches seat-open, petition-decision, waitlist, and RDS-fallback alerts across registered transports and stores persistent `NotificationItem` records.
- **Dual-Mode Repository (`BackendStore`)**: `services/api/src/store/backendStore.ts` transparently runs PostgreSQL 16 ACID transactions (`SELECT ... FOR UPDATE`) when `DATABASE_URL` is configured, and falls back to an identical mutex-locked in-memory ACID engine (`withSectionLock` / `withSectionLocks`) during `vitest` and standalone local runs.
- **Producer-Consumer Queue (`BullMQ`)**: `services/api/src/events/rdsQueue.ts` enqueues confirmed enrollments onto `rds-enrollment-queue`, consumed by `services/rds-worker/src/worker.ts` and `rdsClient.ts`.

---

## 3. PostgreSQL 16 Schema (15 Tables) & Concurrency Model

Defined in `services/api/src/db/schema.sql` and migrated idempotently on startup (`services/api/src/db/migrate.ts` with `pg_advisory_xact_lock(327001)`):

1. `users` — Seeded accounts (`student`, `faculty`, `admin`), scrypt password hashes, department & instructor metadata.
2. `revoked_tokens` — JWT `jti` revocation blocklist populated by `POST /api/v1/auth/logout`.
3. `students` — Academic standing, completed credits, CGPA, `max_credits`, `cart_token`, `cleared_courses`.
4. `course_sections` — Live capacities, `enrolled` counts, `room_cap` fire-code limits, `instructor_id`, `CHECK (enrolled >= 0 AND enrolled <= capacity)`.
5. `staged_sections` — Per-student draft cart items (`REFERENCES students(id)`, `REFERENCES course_sections(id)`).
6. `enrollments` — Committed student-section enrollment records preventing duplicate seat consumption.
7. `waitlist_entries` — Ordered per-section student waitlists (`position`, `status`).
8. `exception_cases` — Student petitions & 6-point audit checklists (`pending`, `approved`, `rejected`, `flagged`).
9. `bypass_rules` — Senate policy overrides (`RULE-4.2`, `RULE-2.1`, `RULE-6.3`, `RULE-8.4`, custom rules).
10. `audit_logs` — Immutable operational & advising timeline entries.
11. `admin_metrics` — Throughput, p95 latency, SLA ceiling, pool usage, and active API node counts.
12. `escalations` — SEV-1 course capacity deficit tracking (`Open`, `Mitigated`, `Resolved`).
13. `schedule_receipts` — Deterministic `#RDS-TXN-*` and `SHA256:*` enrollment & fallback receipts.
14. `notifications` — Observer-dispatched seat-open, waitlist, petition, and fallback alerts (`sms`, `push`, `in_app`).
15. `rds_fallback_prompts` — 1-click DAG-compliant recovery alternatives persisted on RDS push failures.

**Deadlock-Free Locking**: Both PostgreSQL (`SELECT ... FROM course_sections WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE`) and memory mode (`withSectionLocks` sorted by section ID) acquire section locks in deterministic ascending ID order, eliminating lock-order deadlocks and guaranteeing `enrolled <= capacity`.

---

## 4. Real-Time Sync & Headless RDS Worker Flow

1. **Mutation Commit**: API route commits transaction in PostgreSQL or memory store.
2. **Pub/Sub Broadcast**: `backendStore` publishes `{ type: 'SYNC_UPDATE' | 'RDS_FALLBACK' | 'NOTIFICATION', state, timestamp }` to Redis channel `smartadvisor-sync` (`services/api/src/events/redisBus.ts`).
3. **Dual Transport Delivery**: `realtimeBridge.ts` fans out events to WebSocket clients (`/ws`, 30s heartbeats) and SSE clients (`/api/v1/events`, 25s keepalives, `X-Accel-Buffering: no`), mirrored across browser tabs via `BroadcastChannel`.
4. **Worker Handshake & Fallback**: `services/rds-worker` executes `GET /login` → `POST /auth/handshake` → `POST /api/enroll/push` against `RDS_BASE_URL` (or simulated mode if unset). On failure, it rolls back provisional enrollment, computes DAG-compliant non-clashing alternatives, persists the fallback prompt, and publishes `RDS_FALLBACK` over `smartadvisor-sync` within $\le 500\text{ ms}$.

---

## 5. Security & Governance Architecture

- **Authentication**: Scrypt-hashed credentials (`seedData.ts`), HS256 JWT (`JWT_SECRET` enforced $\ge 16$ chars in `NODE_ENV=production`), `15m` expiry, and immediate `jti` revocation on `/auth/logout`.
- **Authorization**: Route-level `requireRole(...)` guards plus `canManageSection` ownership checks (`403` for non-owners) and room fire-code caps (`422`).
- **Input & Edge Protection**: Helmet CSP/frameguard/referrer headers, recursive SQLi/XSS/null-byte scanner (`400 SECURITY_INPUT_REJECTED`), Zod schemas, JSON syntax validation, optional strict `CSRF_ENFORCE=true` origin guard (`403 CSRF_ORIGIN_REJECTED`), and Express + NGINX leaky-bucket rate limiting (`429`).

---

## 6. Monorepo Structure & Quality Gates

```text
NSU_CSE327_SEC04_ITN/
├── .github/workflows/ci-cd.yml   # backend-ci, web-ci, mobile-ci, docker-smoke-test, security-load-ci, e2e-playwright-ci
├── .env.{development,staging,demo}.example
├── apps/{web,mobile}/            # Next.js 14 Web Portal & Flutter Mobile Companion
├── services/{api,rds-worker}/    # Express Core API (:4000) & BullMQ RDS Worker
├── infrastructure/               # docker-compose.yml (6 services) + nginx/nginx.conf (:80)
├── tests/{load,security}/        # load-test.mjs (10k + races), locustfile.py, pentest.mjs (33 checks)
├── e2e/                          # Playwright visual E2E suite (Tiers 1–4 desktop + mobile)
└── docs/DEMO_GUIDE.md            # Sprint 4 User Guide & 5-minute live demo script
```

| Gate | Command |
| :--- | :--- |
| API & Worker | `cd services/api && npm run typecheck && npm test && npm run build` / `cd services/rds-worker && npm run typecheck && npm test && npm run build` |
| Web App | `cd apps/web && npm run typecheck && npm test && npm run lint && npm run build` |
| Mobile App | `cd apps/mobile && flutter pub get && flutter analyze --no-fatal-infos && flutter test` |
| Infra & NGINX | `docker compose -f infrastructure/docker-compose.yml config` |
| Security & Load | `node tests/security/pentest.mjs` & `node tests/load/load-test.mjs` |
| Visual E2E | `cd e2e && npm run typecheck && npm run test:headed` |

---

## 7. Team Roster & Git Branch Ownership

| Team Member | Role | Assigned Branch |
| :--- | :--- | :--- |
| **Jihanur Rahman** | Monorepo Core & CI/CD, Full-Stack | [`Jihanur-Rahman`](https://github.com/DarkMonarch1/NSU_CSE327_SEC04_ITN/tree/Jihanur-Rahman) |
| **MD. Sarafat Hossin Talukder Asif** | Web Platform (Next.js) & Mobile Platform (Flutter) | [`MD.-Sarafat-Hossin-Talukder-Asif`](https://github.com/DarkMonarch1/NSU_CSE327_SEC04_ITN/tree/MD.-Sarafat-Hossin-Talukder-Asif) |
| **Md Junayed Uddin** | Backend & RDS Integration | [`Md-Junayed-Uddin`](https://github.com/DarkMonarch1/NSU_CSE327_SEC04_ITN/tree/Md-Junayed-Uddin) |
| **Sakib Uddin Mahamud** | Deployment & Cybersecurity | [`Sakib-Uddin-Mahamud`](https://github.com/DarkMonarch1/NSU_CSE327_SEC04_ITN/tree/Sakib-Uddin-Mahamud) |

---

## 8. Known Limitations

- Headless RDS (`RDS_BASE_URL` unset) and SMS/Push transports (`DefaultNotificationTransport`) run in simulated mode unless external credentials/endpoints are provided.
- In-memory fallback mode (no `DATABASE_URL`) shares one primary cart (`2412159042`); PostgreSQL 16 mode persists separate carts and enrollments for all seeded students.
- Web SSO ("NSU Google Workspace") authenticates against seeded demo credentials rather than live Google OAuth.
- Mobile `Instant Telegram & SMS Radar` is a local UI toggle, and mobile offline login supports `2412159042` / `SmartAdvisor2025!`.
