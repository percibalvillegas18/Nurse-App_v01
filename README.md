# Nurse-App_v01 - Hospital Nursing Workforce Management System

## Overview
Complete RBAC-based Nurse Workforce Management System with NestJS + Prisma backend.

## Repository Structure
```
Nurse-App_v01/
── ANALYSIS.md                                   # Deep repo analysis (generated)
── Hospital-RBAC-Complete-Documentation-v1.0.md  # V1 spec (legacy)
── Effective Access Function + Role Model...txt  # V2 Phase 0 spec (authoritative)
── docker-compose.yml                            # Postgres + Redis + pgAdmin + Backend
── docs/
│   ── HIPAA_COMPLIANCE_CHECKLIST.md             # HIPAA technical + administrative checklist
── backend/                                      # NestJS backend
│   ── mock-server.js                            # Express mock API - DEMO/PREVIEW ONLY, never deploy
│   ── src/
│   │   ── main.ts
│   │   ── app.module.ts
│   │   ── health.controller.ts                  # Real DB/Redis readiness checks
│   │   ── common/
│   │   │   ── guards/rbac.guard.ts              # Core authorization guard
│   │   │   ── decorators/require-permission.decorator.ts
│   │   │   ── interceptors/audit.interceptor.ts
│   │   │   └─ filters/http-exception.filter.ts
│   │   └─ modules/
│   │       ── auth/                             # JWT, login, sessions
│   │       ── rbac/                             # Effective access, menus, permissions
│   │       └─ audit/                            # Audit logging
│   ── prisma/
│   │   ── schema.prisma                         # Multi-schema Prisma model
│   │   └─ seed.ts                               # Real hospital seed with bcrypt
│   ── database/migrations/
│   │   ── V1_0__initial_schema.sql
│   │   ── V1_1__system_tables.sql
│   │   ── V2_0__effective_access_function.sql   # Initial version
│   │   ── V2_1__role_model_redesign.sql         # Hospital roles + assignments
│   │   ── V2_2__rbac_tables_role_updates.sql
│   │   ── V2_3__seed_hospital_roles_and_users.sql
│   │   ── V2_4__seed_rbac_configuration.sql     # Menus/permissions matrix
│   │   ── V2_5__fix_evaluate_access_multirole.sql # FIXED production version
│   │   ── V3_0__nursing_domain.sql              # Nurses, credentials, roster assignments
│   │   ── V3_1__seed_nursing_demo.sql           # Demo nurses/credentials/roster (idempotent)
│   │   ── V3_2__nurse_personal_fields.sql       # Middle name, gender, DOB, nationality
│   │   ── V3_3__drop_nurse_email.sql            # Email comes from the linked user account
│   │   ── V3_4__nurse_job_no.sql                # Job No. (manual, unique) on the nurse record
│   │   ── V3_5__tamper_proof_audit_logs.sql     # Hash-chain + immutable audit trail
│   │   ── V3_6__audit_log_partitioning.sql      # Monthly partitioning + 6y retention
│   │   └─ V3_7__enforce_data_scope.sql          # Resource-specific data-scope validation
│   ── scripts/run-migrations.ts
│   ── Dockerfile
│   ── package.json
│   └─ README.md
└─ frontend/                                     # React 18 + Vite + Ant Design
    └─ src/
        ── api/client.ts                         # Axios w/ JWT + refresh interceptor
        ── hooks/useEffectiveAccess.ts           # usePermission(menu, perm)
        ── context/AuthContext.tsx
        └─ pages/                                # Login, Dashboard, NurseMaster,
                                                  # Roster, RBAC admin (Roles,
                                                  # EffectiveAccess, AuditLogs, CacheStats)
```

## Quick Start (Docker)

```bash
# Start all services. The backend applies the checked-in SQL migrations via the
# checksummed runner (scripts/run-migrations.ts) before starting - there is no
# separate postgres init-scripts path, so a fresh volume and a re-run use the
# same single source of truth.
docker-compose up -d

# Check logs
docker-compose logs -f backend

# API at http://localhost:4000/api/v1
# pgAdmin at http://localhost:5050 (admin@hospital.local / admin)
```

## Quick Start (Local Dev)

```bash
cd backend
npm install
cp .env.example .env.development
# Edit .env.development with your DB URL

# Start only DBs
docker-compose up -d postgres redis

# Apply migrations (single source of truth - checksummed + transactional,
# recorded in public.schema_migrations). Run from backend/:
export DATABASE_URL=postgresql://devuser:devpassword@localhost:5432/hospital_rbac_dev
npm run db:migrate:raw            # apply pending migrations
npm run db:migrate:raw -- --dry-run   # preview what would run

# Prisma
npx prisma generate
npm run prisma:seed

# Start backend
npm run start:dev
```

## Test Login

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin.system","password":"Password123!"}'
```

Default users (password `Password123!`):
- admin.system (SYSTEM_ADMIN)
- susan.lee (NURSE_MANAGER)
- james.wilson (CHARGE_NURSE)
- maria.garcia (RN)
- ahmed.hassan (RN)
- jennifer.smith (LPN)
- david.kim (CNA)
- rachel.brown (SCHEDULER)
- patricia.johnson (HR_ADMIN)
- michael.wong (COMPLIANCE_OFFICER)

## Effective Access Fix (V2_5)

**Problem:** V2_0 only checked `primary_role_id`, ignored many-to-many assignments.

**Fix:**
- Now aggregates ALL active roles: `ARRAY_AGG(hr.code) WHERE ura.status='Active' AND temporal valid`
- Uses `BOOL_OR` for OR logic: any role granting visible+enabled = accessible
- Returns `user_roles TEXT[]` for audit
- Improved cache TTL when expiry near
- Data scope: handles `All` scope, counts scopes, TODO for resource-specific

```sql
SELECT BOOL_OR(rma.visible AND rma.enabled) FROM role_menu_access
WHERE role_code = ANY(v_all_role_codes)
```

## Next Steps
- Leave management + workforce analytics domains
- MFA, RLS hardening, audit partitioning
- HIPAA gap closure (see `docs/HIPAA_COMPLIANCE_CHECKLIST.md`)
- Load testing

## Done Recently
- ✅ User Management (Administration): real page replacing the TODO stub.
  Nest `UsersModule` (list/get/lookups + create/edit + deactivate/reactivate +
  admin-set password reset + per-user unlock + sessions & login history,
  RBAC `USER_MANAGEMENT`, audit trail USER_CREATED/UPDATED/DEACTIVATED/
  REACTIVATED/PASSWORD_RESET/UNLOCKED, 9 unit tests). Mock-server parity:
  per-user passwords, suspended users can't log in, login-history/sessions
  endpoints. Per user spec: standard fields only (no schema change),
  primary + additional roles, unlock clears per-user counters only
  (GLOBAL lockout counter unchanged)
- ✅ Test preview = mock server (decision: option A). The arena test server runs
  `backend/mock-server.js` (in-memory, no Postgres) + Vite frontend; no real DB
  is connected. Note: sandbox snapshots exclude `node_modules` — if the preview
  dies after a restore, run `npm ci` in `frontend/` and `backend/` and restart
  both processes.
- ✅ Mock auth realism: `/auth/me` now strict 401 without a valid bearer token;
  refresh tokens are user-scoped, issued at login, invalidated at logout
- ✅ Nursing area menus: Contract + Documents added (To Do placeholders);
  Nurse Master / Credentials / Roster retained; area order per user spec
- ✅ Nursing domain Phase 1: V3_0 schema (nurses/credentials/roster), V3_1 demo seed,
  Nest `NursingModule` with RBAC-guarded CRUD (`/api/v1/nursing/*`), double-booking
  prevention (409), audit logging, unit tests
- ✅ Frontend wired to live data: NurseMaster (search/pagination/CRUD/drawer),
  Credentials compliance radar, Roster calendar with day details
- ✅ Frontend React app (React 18 + Vite + Ant Design)
- ✅ Redis caching with per-user/per-role invalidation (see REDIS_CACHING.md)
- ✅ Real `/health/ready` checks: DB `SELECT 1` via Prisma, Redis `PING`, 503 when DB down
- ✅ CI workflow (`.github/workflows/ci.yml`): backend (npm ci, prisma generate, tsc, jest) + frontend (npm ci, tsc, build)
- ✅ Lockfiles committed for reproducible `npm ci`
- ✅ HIPAA compliance checklist mapped to current implementation (`docs/HIPAA_COMPLIANCE_CHECKLIST.md`)

## Docs
- See `docs/HIPAA_COMPLIANCE_CHECKLIST.md` for the full HIPAA technical, administrative, and organizational checklist with current status mapping
- See `ANALYSIS.md` for deep analysis
- See `backend/README.md` for backend details
- Original specs: `Hospital-RBAC-Complete-Documentation-v1.0.md` and `Effective Access Function...txt`
