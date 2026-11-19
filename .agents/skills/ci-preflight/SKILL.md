---
name: ci-preflight
description: Run full-repository preflight checks across API, RDS worker, Next.js web, security/load suites, Docker Compose, and visual Playwright E2E
---

# CI Preflight Verification Skill

Execute these verification checks before finalizing production-release changes across the repository. These mirror `.github/workflows/ci-cd.yml` (`backend-ci`, `frontend-ci`, `mobile-ci`, `docker-smoke-test`, and visual Playwright E2E).

## Execution Steps

### 1. Verify Core API Service (`services/api`)
Run TypeScript type-checking, build, and single-fork Vitest suites (prevents Windows `FreeVirtMB` commit exhaustion):
```powershell
cd services/api
npm run typecheck
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork=true
cd ../..
```

### 2. Verify RDS Worker Service (`services/rds-worker`)
Run TypeScript type-checking, build, and Vitest test suites:
```powershell
cd services/rds-worker
npm run typecheck
npm run build
npm test
cd ../..
```

### 3. Verify Next.js Web Portal (`apps/web`)
If building cleanly on a OneDrive-synced Windows workspace, remove any stale `.next` reparse point first (`if (Test-Path .next) { cmd /c rmdir /s /q .next }`):
```powershell
cd apps/web
npm run lint
npm run typecheck
npm test -- --run
npm run build
cd ../..
```

### 4. Run Security Penetration & 10k Load / ACID Race Suites
```powershell
node tests/security/pentest.mjs
node tests/load/load-test.mjs
```

### 5. Validate Docker Compose Configuration
Validate syntax, environment keys, and service definitions in `infrastructure/docker-compose.yml`:
```powershell
docker compose -f infrastructure/docker-compose.yml config --quiet
```

### 6. Run Visual Headed Playwright E2E Suite (`e2e`)
```powershell
cd e2e
npm run typecheck
npx playwright test --list
npm run test:headed
cd ..
```

### 7. Verify Flutter Mobile Companion (`apps/mobile`, when Flutter SDK is present)
```powershell
cd apps/mobile
flutter analyze --no-fatal-infos
flutter test
cd ../..
```

## Success Criteria
- Zero ESLint warnings/errors and zero TypeScript compiler errors (`tsc --noEmit` exits with 0).
- 100% passing Vitest, security pentest, load/ACID race, and headed Playwright (`55/55`) suites with preserved visual artifacts.
- Docker compose configuration parses without syntax or schema errors.
