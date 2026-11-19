---
trigger: always_on
description: Production-Release Architecture, Contract Parity & Dual-Mode Rules — CSE327 Smart Advisor (ITN)
---

# Full-Repository Production-Release Rules & Boundaries — CSE327 Smart Advisor (ITN)

## 1. Role & Ownership
- **User-Authorized Full-Repository Scope**:
  - `services/api/**`: Express + TypeScript REST, WebSocket (`ws`), and SSE (`/api/v1/events`) server running on port 4000.
  - `services/rds-worker/**`: BullMQ + Redis background queue worker processing jobs on `rds-enrollment-queue`.
  - `apps/web/**`: Next.js 14 App Router web portal (`app/**`, `src/components/**`, `src/store/smartAdvisorStore.tsx`, `src/types/index.ts`).
  - `apps/mobile/**`: Flutter Student Companion (`lib/**`, `test/**`).
  - `infrastructure/**`: Docker Compose orchestration (`postgres`, `redis`, `api`, `rds-worker`, `web`, `nginx`), NGINX reverse proxy & rate limiting, and environment configs.
  - `e2e/**`, `tests/**`, `.github/workflows/ci-cd.yml`, `README.md`, `PROJECT_OVERVIEW.md`, and `docs/**`: End-to-end Playwright visual suites, load/security test suites, CI/CD, and release documentation.

## 2. Contract Parity
- **1-to-1 Schema Alignment**: All backend API payloads and responses must strictly match the byte-for-byte identical TypeScript interfaces in `services/api/src/types.ts` and `apps/web/src/types/index.ts` and the state structure of `apps/web/src/store/smartAdvisorStore.tsx`:
  - Core Domain: `StudentProfile`, `CourseSection`, `StagedSection`, `RuleAuditCheck`, `ExceptionCase`, `BypassRule`, `AuditLogItem`, `AdminMetrics`, `EscalationItem`, `ScheduleReceipt`
  - Auth & RBAC: `UserRole`, `AuthUser`, `LoginRequest`, `LoginResponse`, `AuthTokenPayload`
  - DAG, Solver & Sync: `DagNodeSummary`, `DagSummary`, `ScheduleStrategy`, `ScheduleClash`, `SolveScheduleRequest`, `SolveScheduleResult`, `NotificationChannel`, `NotificationEventType`, `NotificationItem`, `WaitlistEntry`, `RdsFallbackPrompt`, `ComponentHealth`, `HealthCheckResult`, `BackendState`
- **ACID Seat Enrollment & Concurrency**:
  - Seat enrollment and reservation flows must execute inside PostgreSQL ACID transactions using `SELECT ... FOR UPDATE` row-level locking on the target section row(s) in deterministic sorted order to guarantee zero race conditions and zero overbooking (`enrolled <= capacity`).
- **Real-Time Cross-Platform Sync**:
  - All database mutations and state transitions must publish events over Redis Pub/Sub (`smartadvisor-sync`) and broadcast via WebSockets (`ws`) and SSE (`/api/v1/events`) to achieve cross-platform synchronization within &le; 500 ms.

## 3. CI/CD Dual-Mode Rule
- **Automated In-Memory Fallback**:
  - Because `.github/workflows/ci-cd.yml` runs `npm test` without starting PostgreSQL or Redis containers, all database and queue layers must support automatic in-memory fallback during `vitest` runs or when `DATABASE_URL` / `REDIS_HOST` is unconfigured.
  - In production and container environments (`infrastructure/docker-compose.yml`), services connect to live PostgreSQL 16 and Redis 7 instances.
  - In-memory mock/store must seamlessly mirror the exact same ACID constraints (`withSectionLock` / `withSectionLocks`, snapshot rollback, strict `enrolled < capacity`) and state mutations so that CI tests pass without external services.

## 4. Granular Atomic Commit Policy & Quality Gates
- **Atomic Milestones**: Keep changes cleanly scoped by milestone across `core-backend-foundation`, `api-routes-realtime-worker`, `web-frontend-production`, `mobile-companion-sync`, `infra-devops-load-security-docs`, and `e2e-testing-track`.
- **Mandatory Quality Gates**:
  - `services/api`: `npm run typecheck && npm run build && npm test`
  - `services/rds-worker`: `npm run typecheck && npm test`
  - `apps/web`: `npm run lint && npm run build`
  - `apps/mobile`: `flutter test`
  - `infrastructure`: `docker compose -f infrastructure/docker-compose.yml config`
  - `e2e`: Headed visual Playwright suite (`e2e/`) passing with recorded visual artifacts.
