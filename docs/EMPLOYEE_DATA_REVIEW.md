# Employee (Nurse) Data Model Review

**Date:** 2026-09-12
**Scope:** `nursing.nurses` (employee master) — schema, DTO validation, service
write paths, and the Nurse Master UI. Branch `arena/01a095b0-nurse-app-v01`.

This review audits the employee record for **gaps**, **validation** issues, and
**missing fields**, then records what was fixed and what remains.

## 1. Model at a glance

`nursing.nurses` (V3_0 → V3_4) columns:

| Field | Type | Notes |
|---|---|---|
| `employee_number` | varchar(50) UNIQUE NOT NULL | Auto-generated `EMP-YYYY-NNNNN` (not user-entered) |
| `job_no` | varchar(50) UNIQUE NOT NULL | Manually entered, unique (V3_4) |
| `user_id` | bigint UNIQUE → `auth.users` | Optional login-account link |
| `first_name` / `middle_name` / `last_name` | varchar(100) | `fullName` computed = First + Middle + Last |
| `gender` | `nursing.gender` enum | `Male` \| `Female` (V3_2) |
| `date_of_birth` | date | Personal-info group (V3_2) |
| `nationality` | varchar(100) | Display country name (V3_2) |
| `phone` | varchar(50) | Contact No. (mobile) |
| `hire_date` | date (nullable) | Employment group |
| `employment_type` | `nursing.employment_type` enum | `FullTime` \| `PartTime` \| `PRN` \| `Contract` |
| `primary_role_id` | bigint → `system.hospital_roles` | Employment group |
| `home_unit_id` | bigint → `rbac.nursing_units` | Employment group |
| `status` | `nursing.nurse_status` enum | `Active` \| `OnLeave` \| `Suspended` \| `Terminated` |

Email is **deliberately absent** from the nurse row: it is sourced from the
linked login account (`auth.users.email` via `user_id`). The legacy
`nursing.nurses.email` column was dropped in V3_3.

## 2. Verified clean (no action needed)

- **No schema drift.** The Prisma model matches the final migration column set
  (including `job_no` from V3_4 and the dropped `email` from V3_3).
- **Enum validation** already present in the DTOs: `gender`, `employment_type`,
  `status` (`NurseStatus`), `credential_type`, `credential_status`.
- **Data-scope on writes** already enforced (see the write-path work): home-unit
  changes are checked against the actor's scope; unknown units return 404.

## 3. Gaps found and fixed

### 3.1 Referential integrity on writes (was: raw FK 500)
`createNurse` / `updateNurse` accepted any `primary_role_id` or `user_id` and
let the database foreign key reject it with an opaque 500.

**Fix:** the service now validates both references up front and returns
**400 Bad Request** with a clear message:
- `ensureRoleExists()` — `primary_role_id` must resolve to a hospital role.
- `ensureUserAccountExists()` — `user_id` must resolve to an auth account.

`home_unit_id` was already covered (404 via the scope check).

### 3.2 Employee date sanity (was: silently accepted)
Nothing stopped a future `date_of_birth`, or a DOB after the hire date.

**Fix:** `assertValidDates()` now rejects (400):
- a date of birth in the future,
- a date of birth after the hire date (when both are supplied).

`hire_date` in the future is intentionally allowed (a valid "future start
date" for new hires).

### 3.3 Employment group missing from the UI (was: promise, not feature)
The Nurse Master form collected personal info + primary role, but the
"employment group" (`employment_type`, `hire_date`, `home_unit_id`) existed
only in the API — the UI copy even promised "assigned later in the employment
group", a screen that did not exist.

**Fix:** the create/edit modal now has an **Employment** section (Employment
Type, Hire Date, Home Unit) wired into the payload and edit prefill, and the
detail drawer shows Employment Type and Hire Date. Employment Type defaults to
`FullTime`.

### 3.4 Minimum-necessary on the list endpoint (was: over-broad PHI exposure)
`listNurses` returned personal identifiers (`gender`, `dateOfBirth`,
`nationality`, `phone`, `email`, `hireDate`, `userId`) for every row even
though the master table only renders name/role/unit/status.

**Fix:** the list endpoint now returns a summary projection (identity, role,
unit, employment type, status, credential summary) and no longer selects the
linked account's email. Personal identifiers are only served by the
scope-gated `getNurse()` detail endpoint. The Nurse Master UI now fetches the
full record on edit before pre-filling the form.

### 3.5 Phone format + nationality allow-list (was: free text)
`phone` accepted any string ≤ 50 chars and `nationality` any string ≤ 100
chars; the UI restricted the country selection but the API did not.

**Fix:** both DTOs now validate server-side (the global `ValidationPipe`
enforces them at the controller boundary):
- `nationality` must be one of the supported `COUNTRIES` values — now a shared
  module (`countries.ts`) so the DTO and `getLookups()` use the exact same
  list the UI selector offers.
- `phone` must match a loose international format (optional `+`, then digits
  with spaces / dashes / dots / parentheses; empty string allowed).

13 DTO unit tests cover both fields on create and update.

## 4. Noted, not changed (conscious scope decisions)

- **`gender` is binary** (`Male` / `Female`) in the DB enum, DTO, and UI.
  Extending it requires a migration + seeds + frontend; flagged as a product
  decision.
- **Demo-data nationality mismatch (pre-existing).** The V3_1/V3_2 demo rows
  were seeded with demonyms (`Filipino`, `American`, `South Korean`) that are
  **not** in the validated `COUNTRIES` list (which uses country display names
  such as `Philippines`, `United States`, `South Korea`; `Saudi` is the lone
  demonym that matches). Those values remain stored but can no longer be
  re-submitted — editing such a record in the UI requires re-selecting a
  listed country. Normalizing the demo rows (or the list) is a small
  follow-up.
