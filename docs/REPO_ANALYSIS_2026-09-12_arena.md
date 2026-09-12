# Nurse-App_v01 — Repository Analysis (arena branch)

**Date:** 2026-09-12
**Branch:** `arena/01a095b0-nurse-app-v01` @ `41ce23a`
**Method:** Static read of all source + config + migrations, plus live verification
(`npm ci`, `npx tsc --noEmit`, `jest`, `vite build`) in a clean checkout.

> **Status update (same-day follow-up passes):**
>
> - **C-1** (type error), **H-1** (audit-export permission gap) and **M-1**
>   (menu-cache key collision) — fixed and committed (`9da0f44`).
> - **H-2** (data-scope enforcement) — service-layer org/dept/unit filtering +
>   7 new tests, plus `V3_7` SQL defence-in-depth (`1a7ab62`).
> - **M-2** (migration-path consolidation) — single checksummed runner path,
>   README fixed (`e1d14fb`).
> - **M-3** (Prisma/PG drift) — `audit.audit_logs` modelled with composite PK
>   `(id, created_at)` to match V3_6 partitioning (`8686c79`).
> - **M-4** (bundle size) — route-level lazy loading + vendor chunks; entry
>   bundle ~1.5 MB → ~17 KB (`008ded5`).
>
> Verified: backend `tsc --noEmit` ✅, `jest` 3/3 suites (42 passed / 5 skipped)
> ✅, `nest build` ✅, `eslint` 0 errors ✅; frontend `tsc` + `vite build` ✅,
> `eslint` 0 errors ✅.

> Supersedes `docs/REPO_ANALYSIS_2026-09-12.md` (which analyzed an earlier,
> documentation-only state). Nearly every critical finding from that report has
> since been fixed — see "Previously fixed" below.

---

## 1. Snapshot

| | |
|---|---|
| Tracked files | 122 (no binaries, no `node_modules`) |
| Language split | 47 TS · 18 TSX · 16 MD · 15 SQL · 9 JSON · 2 YAML (CI) · 2 Dockerfile |
| Commits visible | 1 (`41ce23a`, squashed arena history) |
| Lockfiles | Committed (backend + frontend `package-lock.json`) |
| CI | `.github/workflows/ci.yml` (backend: npm ci → prisma generate → lint → tsc → jest → build; frontend: npm ci → lint → tsc → build) |
| Tests | 3 spec files (nursing, users, effective-access) |

**Stack**
- **Backend:** NestJS 10 + Prisma 5 (multi-schema) + PostgreSQL 15 + Redis 7
  (ioredis) + JWT (passport-jwt) + bcryptjs. Raw SQL migrations V1→V3 with a
  custom checksummed, transactional runner (`scripts/run-migrations.ts`).
- **Frontend:** React 18 + Vite 5 + TypeScript (strict) + Ant Design 5 +
  TanStack Query 5 + react-router 6 + axios + zustand.
- **Infra:** docker-compose (postgres, redis, pgadmin, backend, frontend),
  multi-stage Dockerfiles, nginx SPA config.
- **Preview:** `backend/mock-server.js` — a 52-route in-memory Express mock used
  only for demo/preview. The Nest backend's own mock layer is gated behind
  `ALLOW_MOCK_DATA=true` and is DENY-by-default.

---

## 2. Live verification results

| Check | Result |
|---|---|
| Backend `npx tsc --noEmit` | ❌ **FAILS** — `TS2558` in `audit.service.ts:91:54` |
| Backend `jest` | ❌ **2 suites fail to run** (same compile error); 8 pass, 5 skipped in the one suite that runs |
| Frontend `npx tsc --noEmit` | ✅ passes |
| Frontend `npm run build` | ✅ builds (9s); ⚠️ single 1.5 MB JS chunk (468 KB gzip) |
| `prisma generate` | ⚠️ failed on sandbox network (binaries.prisma.sh unreachable); generated client was already present from `npm ci`, so type-check ran against a valid client |

**Bottom line: the current commit is RED in CI.** The backend "Type check" and
"Unit tests" steps both fail on the same single error.

---

## 3. Findings

### 🔴 C-1 — Backend does not compile / tests do not run

`backend/src/modules/audit/audit.service.ts:91`:

```ts
const rows = await this.prisma.$queryRawUnsafe<AuditChainBreak[]>(
```

The `PrismaService` injected here is the app's custom wrapper, whose
`$queryRawUnsafe(query, ...params)` is **not generic** — so the type argument
`<AuditChainBreak[]>` is a `TS2558` error. This breaks:

1. `npx tsc --noEmit` (CI "Type check" step), and
2. `jest`, because ts-jest type-checks the import graph — `nursing.service.spec.ts`
   and `users.service.spec.ts` both fail to load via the shared `audit.service.ts`.

**Fix (one line):** drop the type argument and cast, or make the wrapper generic:

```ts
const rows = (await this.prisma.$queryRawUnsafe(
  `SELECT id, expected_prev, actual_prev, problem FROM audit.verify_audit_chain($1::bigint, $2::bigint)`,
  fromId ?? null,
  toId ?? null,
)) as AuditChainBreak[];
```

### 🟠 H-1 — `GET /audit/export` has no permission check

`audit.controller.ts` — `getLogs` and `getStatistics` are decorated
`@CanView('AUDIT_LOGS')`, and the doc comment on `exportLogs` says it is gated by
**AUDIT_LOGS/EXPORT** — but the method has **no permission decorator**:

```ts
@Get('export')
@UseGuards(AuthGuard('jwt'), RbacGuard)   // redundant + no @RequirePermission
async exportLogs(...) { ... }
```

`RbacGuard` returns `true` when no `@RequirePermission` metadata is present, so
**any authenticated user (RN, CNA, …) can download the full audit trail as CSV**
— usernames, IP addresses, actions, and descriptions. Fix: add
`@RequirePermission({ menuCode: 'AUDIT_LOGS', permissionCode: 'EXPORT' })`.

### 🟠 H-2 — Data-scope enforcement is still a stub

`V2_5__fix_evaluate_access_multirole.sql` (STEP 6) explicitly allows access when
**any** scope row exists, with a comment flagging resource-level checks as TODO:

> "For MVP, we allow if any scope exists, but this is documented as TODO for hardening"

Consequently `data_scope_valid` is effectively "has ≥1 scope", and the nursing
queries (`listNurses`, `listRoster`, credential lookups) do **not** filter by the
user's org/department/unit scopes. This is the main remaining gap vs. the
least-privilege goal implied by the `rbac.user_data_scopes` model. It's a known,
documented limitation — but it's the biggest outstanding authorization surface.

### 🟡 M-1 — One Redis key, two incompatible payload shapes

Both of these write to the **same** key `rbac:menus:{userId}`:

- `RbacService.getMenuHierarchy(accessibleOnly=true)` → caches a **nested tree**
  (objects with `children`).
- `EffectiveAccessService.getAccessibleMenus()` → caches a **flat list**
  (`{ id, code, name, route, isAccessible, permissions }`).

The frontend `useAccessibleMenus` (sidebar nav) reads `getMenuHierarchy(true)`,
which returns whatever shape was cached last. If the admin Effective-Access page
is visited first, the nav can read a flat list where it expects a tree. Latent
until the two endpoints interleave for one user; the 300s TTL masks it. Fix:
separate keys (e.g. `rbac:menus:{userId}` vs `rbac:menu-tree:{userId}`).

### 🟡 M-2 — Two migration mechanisms can diverge

- `scripts/run-migrations.ts` — authoritative, checksummed, transactional, with a
  `schema_migrations` history table. Order list is complete (V1_0 → V3_6).
- `docker-compose.yml` mounts `backend/database/migrations` into
  `/docker-entrypoint-initdb.d` — Postgres runs every `.sql` alphabetically **on a
  fresh volume only**, with no history table and no checksums.

A DB bootstrapped via docker-compose and one managed by the runner will not share
history state. Also, the README "Local Dev" manual `psql` list omits `V2_0`,
`V3_5`, and `V3_6`. Recommend documenting the runner as the single source of
truth (or adopting `prisma migrate` / a real tool).

### 🟡 M-3 — Prisma schema vs. partitioned audit table drift

`V3_6` repartitions `audit.audit_logs` with a composite PK `(id, created_at)`.
`schema.prisma` still models `id BigInt @id @default(autoincrement())` (single
`@id`). Functionally harmless today (id is a sequence and stays unique; Prisma is
not used for migrations), but the schema no longer describes the real table and
will surprise anyone who adds a future Prisma migration.

### 🟡 M-4 — Frontend ships as one ~1.5 MB bundle

Vite build warns the main chunk is over 500 KB. Ant Design + icons + query
devtools are inlined. No route-level `React.lazy` code-splitting. Cosmetic for a
hospital LAN, but worth `manualChunks` or lazy routes later.

### ℹ️ Notes (not bugs)

- **Mock/demo data** hardcodes bcrypt hashes of a known password
  (`Password123!`) in `PrismaService.mockData` and documents them in the README.
  Acceptable only because the mock is opt-in (`ALLOW_MOCK_DATA=true`) and the real
  `prisma/seed.ts` hashes properly.
- **Dev JWT secrets** are committed in `.env.example` / `docker-compose.yml`.
  Mitigated: `resolveJwtSecret()` now **refuses to start** without a ≥32-char
  secret (or an ephemeral key when `ALLOW_MOCK_DATA=true`), so the committed
  dev secret is no longer a silent forgery vector.
- **Audit failure is non-blocking by design** — `AuditService.log()` swallows
  write errors so auditing never breaks the request path. Worth a monitoring
  metric since silent audit loss is a HIPAA concern.

---

## 4. Previously fixed (from the earlier analysis)

Confirmed resolved in this codebase:

- ✅ Global one-request lockout → per-account + per-IP throttling
  (`LoginThrottleService`, Redis-backed with in-memory fallback).
- ✅ Unguarded `/auth/attempts*` → now `AuthGuard + RbacGuard + USER_MANAGEMENT`.
- ✅ Missing `AuditController` → implemented with pagination, statistics, export,
  and BigInt-safe serialization.
- ✅ PrismaService fail-open → now refuses to serve without a real DB unless
  `ALLOW_MOCK_DATA=true`; the mock matrix is DENY-by-default.
- ✅ Hardcoded JWT secret fallback → `resolveJwtSecret()` fail-closed.
- ✅ Docker `CMD ["node","dist/main.js"]` mismatch → `tsconfig.build.json`
  includes `src`, output is flat `dist/main.js`.
- ✅ Lockfiles committed; CI workflow added.
- ✅ Redis `retryStrategy → null` → infinite exponential backoff + cache purge on
  reconnect.
- ✅ `/auth/me` strict 401; refresh tokens user-scoped and invalidated at logout.

---

## 5. Strengths

- Mature, coherent RBAC design: multi-role `rbac.evaluate_access()` (V2_5) with
  Redis caching and precise invalidation (per-user / per-role), enforced
  server-side by `RbacGuard` — frontend hiding is explicitly cosmetic.
- Real HIPAA posture: append-only tamper-proof hash chain (V3_5) + monthly
  partitioning with 6-year retention (V3_6), PHI-read audit interceptor that
  stores metadata only, immutable audit triggers + RLS.
- Fail-closed authN/authZ throughout (DB down → deny; no secret → no start;
  mock → deny-by-default).
- Good operational hygiene: real `/health/ready` dependency checks, session
  revocability bound into JWT, per-request id, consistent API envelope, BigInt
  serialization handled.
- Extensive documentation (`ANALYSIS.md`, `REDIS_CACHING.md`,
  `docs/HIPAA_COMPLIANCE_CHECKLIST.md`, per-domain docs).

---

## 6. Suggested next steps (in priority order)

1. Fix C-1 (`audit.service.ts:91`) to un-block CI and tests.
2. Add the missing `AUDIT_LOGS/EXPORT` permission on `GET /audit/export` (H-1).
3. Split the two menu-cache payload shapes onto distinct keys (M-1).
4. Implement real data-scope filtering in nursing queries + finish STEP 6 of
   `evaluate_access` (H-2) — the largest remaining HIPAA least-privilege gap.
5. Consolidate migrations onto one path and refresh README (M-2); reconcile
   Prisma model for the partitioned audit table (M-3).
6. Route-level code-splitting for the frontend (M-4).
