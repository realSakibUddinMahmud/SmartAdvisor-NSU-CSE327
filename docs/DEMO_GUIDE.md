# SmartAdvisor NSU — Sprint 4 User, Demo & Operations Guide

> **North South University (NSU) — CSE 327 (Section 04) Software Engineering**  
> **Supervisor:** Intisar Tahmeed Sir `[ITN]`  
> **System:** SmartAdvisor NSU Autonomous Advising & High-Concurrency Course Registration Platform

---

## 1. Architecture & Service Port Overview

SmartAdvisor NSU runs as a unified multi-service system behind an NGINX reverse proxy (`:80`) or directly on per-service local ports:

| Service / Component | Container Name | Internal / Local Port | Public / Proxied Route | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **NGINX Gateway** | `smartadvisor-nginx` | `80` | `http://localhost` | Reverse proxy, leaky-bucket rate limiting (`api_limit`, `auth_limit`), WebSocket & SSE streaming |
| **Next.js 14 Web Portal** | `smartadvisor-web` | `3000` | `http://localhost/` (or `:3000`) | Student, Faculty & IT Admin web portals with RouteGuard RBAC and live WS/SSE sync |
| **Express Core API** | `smartadvisor-api` | `4000` | `http://localhost/api/v1/*`, `/ws`, `/health` | JWT Auth/RBAC, Zod + SQLi/XSS middleware, DAG & Solver engines, ACID transactions, WS/SSE hubs |
| **BullMQ RDS Worker** | `smartadvisor-rds-worker` | — | Queue `rds-enrollment-queue` | Asynchronous headless RDS handshake/push, `#RDS-TXN-*` / `SHA256:*` receipts, `RDS_FALLBACK` |
| **PostgreSQL 16** | `smartadvisor-postgres` | `5432` | `localhost:5432` | 15-table relational store with `SELECT ... FOR UPDATE` pessimistic row locking |
| **Redis 7** | `smartadvisor-redis` | `6379` | `localhost:6379` | Pub/Sub (`smartadvisor-sync`) for sub-500ms cross-platform sync & BullMQ job broker |
| **Flutter Mobile App** | — | — | `--dart-define=API_URL=...` | Student Companion with live WebSocket/SSE sync and graceful offline fallback |

---

## 2. Environment Setup & Run Guide

### Option A: Full 6-Container Production Stack (Docker Compose + NGINX)

1. Review or copy an environment template from the repository root:
   - `.env.development.example` — local developer defaults
   - `.env.staging.example` — hardened production-like configuration (`CSRF_ENFORCE=true`)
   - `.env.demo.example` — live presentation defaults behind NGINX `:80`
2. Build and launch all 6 containers (`postgres`, `redis`, `api`, `rds-worker`, `web`, `nginx`):
   ```bash
   docker compose -f infrastructure/docker-compose.yml up -d --build
   ```
3. Verify stack readiness:
   ```bash
   curl http://localhost/health
   ```
   Expected response (`200 OK`):
   ```json
   {
     "status": "ok",
     "service": "smartadvisor-api",
     "mode": "postgres",
     "checks": {
       "api": { "status": "up" },
       "postgres": { "status": "up" },
       "redis": { "status": "up" }
     }
   }
   ```
4. Open **`http://localhost`** (via NGINX) or **`http://localhost:3000`** (direct Next.js).
5. Stop and clean up when done:
   ```bash
   docker compose -f infrastructure/docker-compose.yml down
   ```

### Option B: Local Dual-Mode Development (Zero External DB Required)

`services/api` automatically switches to an **ACID in-memory fallback store** when `DATABASE_URL` and `REDIS_HOST` are unset (ideal for rapid local development and CI tests):

```bash
# Terminal 1 — Core API (:4000)
cd services/api
npm ci
npm run build
npm start

# Terminal 2 — Next.js Web Portal (:3000)
cd apps/web
npm ci
npm run dev
```

*(Optional Hybrid Mode)*: Start only `postgres` and `redis` via Docker (`docker compose -f infrastructure/docker-compose.yml up -d postgres redis`), set `DATABASE_URL` and `REDIS_HOST=localhost`, and start `services/rds-worker` (`npm ci && npm run build && npm start`) alongside `services/api`.

### Option C: Flutter Mobile Student Companion

```bash
cd apps/mobile
flutter pub get
flutter run --dart-define=API_URL=http://localhost:4000
```
- **Android Emulator**: pass `--dart-define=API_URL=http://10.0.2.2:4000`.
- **Through NGINX Gateway**: pass `--dart-define=API_URL=http://localhost` (or host LAN IP for physical devices).

---

## 3. Seeded Demo Accounts, Catalog & Room Caps

All 12 seeded accounts use the default password **`SmartAdvisor2025!`** (configurable via `DEMO_DEFAULT_PASSWORD` / `NEXT_PUBLIC_DEMO_DEFAULT_PASSWORD`):

### 3.1 Seeded Accounts (12 Total)

| ID / Username | Name | Role | Email | Department | Notes / Owned Sections |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `2412159042` | **Rahim Ahmed** | `student` | `rahim.ahmed01@northsouth.edu` | `ECE / CSE` | **Primary Demo Student** (`96/130` Cr, CGPA `3.64`, Senior Standing, Cart `#NSU-241215-9042`, Advisor: Dr. Nova Ahmed) |
| `2321450042` | Fariha Tasnim | `student` | `fariha.tasnim@northsouth.edu` | `ECE / CSE` | Junior (`68` Cr, CGPA `3.42`, Cart `#NSU-232145-0042`, cleared `CSE 115`, `CSE 215`) |
| `2211290042` | Tanveer Hasan | `student` | `tanveer.hasan@northsouth.edu` | `ECE / CSE` | Senior (`112` Cr, CGPA `3.81`, Cart `#NSU-221129-0042`, cleared `CSE 115`, `CSE 215`, `CSE 311`) |
| `nova.ahmed` | **Dr. Nova Ahmed** | `faculty` | `nova.ahmed@northsouth.edu` | `ECE / CSE` | **Primary Demo Faculty / Chair** — owns `CSE425-01` |
| `nabeel.mohammed` | Dr. Nabeel Mohammed | `faculty` | `nabeel.mohammed@northsouth.edu` | `ECE / CSE` | Owns `CSE327-01` |
| `silvia.ahmed` | Dr. Silvia Ahmed | `faculty` | `silvia.ahmed@northsouth.edu` | `ECE / CSE` | Owns `CSE327-02` |
| `rajesh.palit` | Prof. Dr. Rajesh Palit | `faculty` | `rajesh.palit@northsouth.edu` | `ECE / CSE` | Owns `CSE327-03`, `CSE331-01` |
| `tanvir.rahman` | Mr. Tanvir Rahman | `faculty` | `tanvir.rahman@northsouth.edu` | `ECE / CSE` | Owns `CSE327-04` |
| `tanjila.farah` | Dr. Tanjila Farah | `faculty` | `tanjila.farah@northsouth.edu` | `ECE / CSE` | Owns `CSE311-03` |
| `safayat.hossain` | Mr. Safayat Hossain | `faculty` | `safayat.hossain@northsouth.edu` | `ECE / CSE` | Owns `CSE311L-02` |
| `hasina.akter` | Dr. Hasina Akter | `faculty` | `hasina.akter@northsouth.edu` | `Math & Physics` | Owns `MAT361-04` |
| `admin.itops` | **IT Operations Admin** | `admin` | `itops@northsouth.edu` | `IT Operations` | **Primary Demo IT Admin** |

### 3.2 Curriculum DAG (10 Courses)

- **Foundations**: `CSE 115` (3.0 Cr), `MAT 120` (3.0 Cr)
- **Tier 2**: `CSE 215` (prereq: `CSE 115`), `CSE 231` (prereq: `CSE 115`)
- **Tier 3**: `CSE 311` (`CSE 215`), `CSE 311L` (1.0 Cr, `CSE 215`), `CSE 327` (`CSE 215`), `CSE 331` (`CSE 231`), `MAT 361` (`MAT 120`)
- **Tier 4**: `CSE 425` (prereqs: `CSE 215`, `CSE 311`; `RULE-4.2` credit floor: `100` earned credits)
- **Rahim Ahmed (`2412159042`) DAG State**: Cleared `CSE 115`, `CSE 215`, `CSE 311`, `CSE 231` (`96` Cr). Eligible: `CSE 327`, `CSE 331`, `CSE 425` (requires Rule 4.2 override/petition until 100 Cr). Blocked: `MAT 361` (missing `MAT 120`). Critical Path: `CSE 115 -> CSE 215 -> CSE 311 -> CSE 425`.

### 3.3 Seeded Sections (9) & Room Fire-Code Caps (6)

| Section ID | Course | Days & Time | Room (Fire Cap) | Enrolled / Cap | Initial State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CSE327-01` | `CSE 327` Sec 01 | `ST` `11:20 AM - 12:50 PM` | `SAC 502` (`55`) | `28 / 40` | **Staged in Initial Draft** |
| `CSE327-02` | `CSE 327` Sec 02 | `MW` `09:40 AM - 11:10 AM` | `NAC 408` (`50`) | `36 / 40` | Few Seats Left |
| `CSE327-03` | `CSE 327` Sec 03 | `ST` `01:20 PM - 02:50 PM` | `SAC 415` (`55`) | `40 / 40` | Full (`14` waitlisted) |
| `CSE327-04` | `CSE 327` Sec 04 | `RA` `04:20 PM - 05:50 PM` | `LIB 602` (`55`) | `21 / 40` | Open (Thu/Sat fallback) |
| `CSE311-03` | `CSE 311` Sec 03 | `MW` `09:40 AM - 11:10 AM` | `NAC 408` (`50`) | `37 / 40` | **Staged in Initial Draft** |
| `CSE311L-02` | `CSE 311L` Sec 02 | `Thu` `09:40 AM - 12:40 PM` | `LIB 608` (`45`) | `27 / 35` | **Staged in Initial Draft** (1.0 Cr) |
| `MAT361-04` | `MAT 361` Sec 04 | `ST` `01:20 PM - 02:50 PM` | `NAC 510` (`50`) | `18 / 40` | **Staged in Initial Draft** |
| `CSE331-01` | `CSE 331` Sec 01 | `MW` `01:20 PM - 02:50 PM` | `SAC 415` (`55`) | `35 / 40` | Open |
| `CSE425-01` | `CSE 425` Sec 01 | `MW` `02:40 PM - 04:10 PM` | `LIB 602` (`55`) | `40 / 40` | Full (`10` waitlisted, `RULE-4.2`) |

Initial Staged Cart Total: `CSE327-01` (3.0) + `CSE311-03` (3.0) + `CSE311L-02` (1.0) + `MAT361-04` (3.0) = **10.0 Cr** (max `15.0 Cr`).

---

## 4. Portal-by-Portal User Guide

### 4.1 Auth Gateway (`/`, `/login`) & Global Demo Bar
- **Sign-In**: Choose a role tab (`Student`, `Faculty`, `IT Admin`), enter a seeded ID and password (`SmartAdvisor2025!`), click **Demo Credentials?** to inspect test credentials, or use the **1-Click Authenticated Demo Access** buttons (each exchanges real credentials against `POST /api/v1/auth/login` for a short-lived HS256 JWT).
- **RouteGuard RBAC**: Unauthenticated visits to `/student/*`, `/faculty/*`, or `/admin/*` redirect to `/login`. Cross-role navigation (e.g., a Student opening `/faculty/exceptions`) renders an `Access Denied` screen.
- **DemoHeader Controls**: Switch role tabs, inspect the `Live Sync ≤500ms` WS/SSE badge, sign out (`POST /api/v1/auth/logout`, revoking the JWT `jti`), or open **Demo Controls** (`Simulate Surge Spike`, `Fill CSE 327 Sec 01`, `Dr. Nova Approves CSE 425`, `Reset Demo State`).

### 4.2 Student Web Portal (`/student/dashboard`, `/student/schedule`)
- **Dashboard (`/student/dashboard`)**:
  - View Advising Slot Countdown, earned credits (`96 / 130`), and Curriculum DAG Critical Path (`DAG Eligible`, `Critical Path`, `Blocked: MAT 120`).
  - Filter the **Live Seat Radar** by search term or department, inspect real-time seat availability, and stage/unstage sections (`+ Stage` / `Remove`).
  - Staging a full section (`CSE327-03`) opens the **Sold-Out Modal** with instant same-course swap options and **Join Waitlist** (`POST /api/v1/student/waitlist`).
  - Staging `CSE425-01` (`RULE-4.2`: 96 < 100 Cr) opens the **Rule Alert Modal** where students submit a formal **Pending Petition** (`POST /api/v1/student/petitions`) to the faculty queue — never self-approved on the client.
  - Run the **Constraint Schedule Solver** (`MilestoneFirst` or `MinimizeGaps`) from the sticky selection bar to auto-recommend clash-free sections.
- **Timetable & Confirmation (`/student/schedule`)**:
  - Visual 6-day NSU timetable (`Saturday`–`Thursday`), properly mapping `RA` sections to **Thursday & Saturday** and highlighting the `12:50 PM - 01:20 PM` Lunch/Zuhr recess row.
  - Detects timetable clashes in red, supports `Minimize Gaps` / `Milestone First` quick-apply, includes a **Simulate RDS Failure** toggle for testing failure recovery, and locks enrollment via **Confirm Schedule** (`POST /api/v1/student/enroll/confirm`).
  - On RDS failure, the **1-Click RDS Fallback Recovery** modal presents DAG-compliant open alternatives; clicking **Swap & Re-Confirm** (`POST /api/v1/student/rds/fallback`) atomically commits the fallback section and issues a printable `#RDS-TXN-*` + `SHA256:*` receipt.

### 4.3 Faculty Web Portal (`/faculty/exceptions`, `/faculty/courses`, `/faculty/rules`)
- **Exception Queue (`/faculty/exceptions`)**: Filter by `All`, `Standing`, `Capacity`, or `Prereqs`; inspect the 6-point academic audit; click **Approve Exception & Enroll**, **Reject**, or **Flag for In-Person Advising** (`POST /api/v1/faculty/exceptions/decision`). Re-deciding an already finalized case is rejected (`409`).
- **Course Capacity Oversight (`/faculty/courses`)**: Displays **Your Section** vs **Other Faculty** ownership badges. Faculty may expand capacity (`+5`, `+10`, `+15`) only on sections they own (`403` otherwise) and strictly up to the physical room fire-code ceiling (`422` if exceeded).
- **Senate Bypass Rules (`/faculty/rules`)**: Toggle `RULE-4.2`, `RULE-2.1`, `RULE-6.3`, or `RULE-8.4`, or create a custom bypass rule (`POST /api/v1/faculty/rules`). Enabling a rule automatically approves matching pending student petitions.

### 4.4 IT Admin Operations Portal (`/admin/health`, `/admin/escalations`)
- **System Health & Telemetry (`/admin/health`)**: Live `/health` probes for `API Service`, `PostgreSQL 16`, and `Redis 7 Pub/Sub` (polled every 5s), dual-axis SVG Throughput & Latency chart, 60-second sustained SLA breach detector, **Auto-Scale API Nodes (+2)** (`POST /api/v1/admin/scale`), **Acknowledge** (`POST /api/v1/admin/acknowledge`), and live Operations Audit Log.
- **SEV-1 Escalation Registry (`/admin/escalations`)**: Live waitlist deficits derived from section counts, **Sync RDS4** (`POST /api/v1/admin/rds4/sync`), **+5 Seats to All Secs** (`POST /api/v1/admin/courses/add-seats`), and **Allocate Emergency Section** (`Sec 05`, +40 seats via `POST /api/v1/admin/sections/emergency`).

### 4.5 Flutter Mobile Companion (`apps/mobile`)
- Sign in on `LoginScreen` (`2412159042` / `SmartAdvisor2025!`).
- Navigate 4 bottom tabs (`Advising`, `Schedule`, `Prereqs`, `Alerts & IT`):
  - **Advising**: Credit Ring, Priority Window countdown, live RDS fallback alert banner, Fast-Enroll cards.
  - **Prereqs / Catalog**: Search, eligibility filters, inline Prerequisite DAG chain, radio section picker.
  - **Schedule**: `Milestone` / `Min Gaps` solver toggle, clash detector, `AI Optimize Cart`, `Confirm & Finalize`.
  - **Alerts & IT / Petitions**: Real-time seat-open notifications, 1-tap `Claim Seat`, Gateway latency banner with `Retry` resync.

---

## 5. Reproducible 5-Minute Live Demo Script

1. **`0:00 – 0:30` | Clean Reset & Multi-Role Auth**:
   - Open `http://localhost` (or `http://localhost:3000`). Click **Demo Controls → Reset Demo State**.
   - Sign in as Student **Rahim Ahmed** (`2412159042` / `SmartAdvisor2025!`) in Window A.
   - Open a second browser/incognito window (Window B) and sign in as Faculty **Dr. Nova Ahmed** (`nova.ahmed` / `SmartAdvisor2025!`).
2. **`0:30 – 1:45` | Student Radar, Waitlist, Rule 4.2 Petition & Solver (Window A)**:
   - Point out the `10.0 Cr` staged cart and DAG Critical Path badges (`CSE 327`, `CSE 331`, `CSE 425`; `MAT 361` blocked).
   - Click `CSE 327 Sec 03` (`40/40 Full`) → **Sold-Out Modal** opens → click **Join Waitlist**.
   - Click `CSE 425 Sec 01` → **Rule 4.2 Alert** (`96/100 Cr`) opens → enter justification and submit a **Pending Petition**.
   - Click **Minimize Gaps** / **Milestone First** solver to preview clash-free optimization.
3. **`1:45 – 2:45` | Cross-Tab Faculty Triage & Live Sync ≤ 500ms (Window B → Window A)**:
   - Switch to Window B (`/faculty/exceptions`) — confirm the newly submitted petition is already visible without refreshing.
   - Approve `CASE #EX-2025-0841`, then open `/faculty/courses`, verify `Your Section` on `CSE425-01` (and attempt `CSE327-01` to show ownership RBAC protection), and expand `CSE425-01` within `LIB 602` cap (`55`).
   - Observe Window A update within `≤ 500ms` via WebSocket/SSE.
4. **`2:45 – 3:45` | 6-Day `RA` Timetable & 1-Click RDS Fallback Recovery (Window A)**:
   - Navigate to `/student/schedule`, swap `CSE327-01` for `CSE327-04` (`RA`, `04:20 PM - 05:50 PM`), and verify both **Thursday** and **Saturday** blocks render with `0` clashes.
   - Check **Simulate RDS Failure**, click **Confirm Schedule**, and observe the **1-Click RDS Fallback Recovery** modal.
   - Click **Swap & Re-Confirm** to commit the fallback section and display the `#RDS-TXN-*` and `SHA256:*` cryptographic receipt.
5. **`3:45 – 4:45` | IT Admin Surge, Auto-Scale & Emergency Section (Window B)**:
   - Switch Window B to IT Admin (`admin.itops` on `/admin/health`), trigger **Demo Controls → Simulate Surge Spike** (`3,450 req/s`, `275 ms` p95 SLA breach).
   - Click **Auto-Scale API Nodes (+2)** (`p95` recovers to `138 ms`) and **Acknowledge**.
   - Open `/admin/escalations`, click **Allocate Emergency Section** on `#ESC-9481` (`CSE 327 Sec 05`, +40 seats), and verify `CSE 327 Sec 05` appears immediately in Student Window A.
6. **`4:45 – 5:00` | Mobile Companion & Reset**:
   - Show the Flutter Mobile Student Companion synced to the same live API (`--dart-define=API_URL=http://localhost:4000`), then run **Demo Controls → Reset Demo State**.

---

## 6. Known Limitations & Operational Assumptions

1. **Simulated External Integrations**: Headless RDS handshakes (`RDS_BASE_URL` unset) and SMS/Push notifications (`DefaultNotificationTransport`) operate in deterministic simulated mode unless external NSU RDS endpoints or SMS/Push gateway credentials are supplied.
2. **In-Memory Fallback Single-Student Cart**: When `DATABASE_URL` is unset (CI/in-memory mode), all student profiles share the primary in-memory staged cart fixture (`2412159042`). Full PostgreSQL 16 mode (`docker-compose.yml` or `DATABASE_URL` configured) persists independent carts and enrollments per student (`2412159042`, `2321450042`, `2211290042`).
3. **Demo SSO Button**: The "NSU Google Workspace" SSO button on `/login` authenticates using the seeded role credentials via `/api/v1/auth/login` rather than a live Google OAuth 2.0 client ID.
4. **Mobile Platform Scope & Offline Mode**: Faculty and IT Admin portals are Web-only; the Flutter app is a Student Companion. Mobile `Instant Telegram & SMS Radar` is a local UI preference toggle, and offline fallback login supports only the primary seeded student (`2412159042` / `SmartAdvisor2025!`).
5. **Production Security Requirements**: Setting `NODE_ENV=production` requires `JWT_SECRET` (`≥ 16` characters) or auth operations will throw; strict cross-origin CSRF rejection requires `CSRF_ENFORCE=true`.
