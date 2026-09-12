-- ============================================================================
-- V3_8__contract_master.sql - Contract Master & Employment Contract Management
--
-- Adds the employment-contract domain for nursing staff and wires it into the
-- RBAC + data-scope machinery established by V3_7.
--
-- Entity chain realised here:
--   nurse (nurses) -> job_no (nurses.job_no) -> position (nursing.positions)
--   -> unit/department (nurses.home_unit_id -> rbac.nursing_units) -> contract
--   (nursing.contracts) -> credentials (nursing.credentials) ->
--   deployment (nursing.roster_assignments, gated by contract validity).
--
-- Lifecycle: Draft -> PendingApproval -> Active -> (Expired | Terminated |
-- Renewed). Renewal creates a successor contract (renewed_from_contract_id)
-- and marks the predecessor Renewed, preserving full document/audit history.
--
-- Idempotent where possible (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums (V3_0 convention: CREATE TYPE guarded by DO blocks)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE nursing.contract_type AS ENUM ('FixedTerm', 'Permanent', 'Temporary', 'Other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE nursing.contract_status AS ENUM ('Draft', 'PendingApproval', 'Active', 'Expired', 'Terminated', 'Renewed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE nursing.agency_category AS ENUM ('Government', 'Program', 'ThirdParty');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE nursing.position_category AS ENUM ('Nursing', 'Technical', 'Support');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- Contract agencies (MOH / SOP / HCC / HHC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nursing.contract_agencies (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  category    nursing.agency_category NOT NULL DEFAULT 'ThirdParty',
  status      VARCHAR(50)  NOT NULL DEFAULT 'Active',
  created_by  BIGINT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by  BIGINT,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Positions (HN / AHN / CI / SN / PCT / TEC / CN / HCA / MW)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nursing.positions (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  category    nursing.position_category NOT NULL DEFAULT 'Nursing',
  description TEXT,
  status      VARCHAR(50)  NOT NULL DEFAULT 'Active',
  created_by  BIGINT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by  BIGINT,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- The single authoritative employment-contract record.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nursing.contracts (
  id                       BIGSERIAL PRIMARY KEY,
  contract_number          VARCHAR(50) NOT NULL UNIQUE,
  nurse_id                 BIGINT NOT NULL REFERENCES nursing.nurses(id) ON DELETE RESTRICT,
  agency_id                BIGINT NOT NULL REFERENCES nursing.contract_agencies(id) ON DELETE RESTRICT,
  position_id              BIGINT NOT NULL REFERENCES nursing.positions(id) ON DELETE RESTRICT,
  nursing_unit_id          BIGINT REFERENCES rbac.nursing_units(id) ON DELETE SET NULL,
  contract_type            nursing.contract_type NOT NULL DEFAULT 'FixedTerm',
  status                   nursing.contract_status NOT NULL DEFAULT 'Draft',
  start_date               DATE NOT NULL,
  end_date                 DATE,           -- NULL = permanent / open-ended
  salary_amount            NUMERIC(12,2),
  salary_currency          VARCHAR(10) DEFAULT 'SAR',
  document_url             VARCHAR(500),
  notes                    TEXT,
  -- approval workflow
  submitted_by             BIGINT,
  submitted_at             TIMESTAMPTZ,
  approved_by              BIGINT,
  approved_at              TIMESTAMPTZ,
  approval_notes           TEXT,
  -- termination
  terminated_by            BIGINT,
  terminated_at            TIMESTAMPTZ,
  termination_reason       VARCHAR(500),
  -- renewal lineage
  renewed_from_contract_id BIGINT REFERENCES nursing.contracts(id) ON DELETE SET NULL,
  renewal_count            INT NOT NULL DEFAULT 0,
  -- bookkeeping
  created_by               BIGINT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by               BIGINT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT chk_contract_dates CHECK (end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_contracts_nurse_id      ON nursing.contracts(nurse_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status        ON nursing.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date      ON nursing.contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_agency_id     ON nursing.contracts(agency_id);
CREATE INDEX IF NOT EXISTS idx_contracts_position_id   ON nursing.contracts(position_id);
CREATE INDEX IF NOT EXISTS idx_contracts_unit_id       ON nursing.contracts(nursing_unit_id);

-- ----------------------------------------------------------------------------
-- nurses.position_id (the "Position" link in the chain)
-- ----------------------------------------------------------------------------
ALTER TABLE nursing.nurses ADD COLUMN IF NOT EXISTS position_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nurses_position' AND conrelid = 'nursing.nurses'::regclass
  ) THEN
    ALTER TABLE nursing.nurses
      ADD CONSTRAINT fk_nurses_position FOREIGN KEY (position_id)
      REFERENCES nursing.positions(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_nurses_position_id ON nursing.nurses(position_id);

-- ----------------------------------------------------------------------------
-- Seed agencies
-- ----------------------------------------------------------------------------
INSERT INTO nursing.contract_agencies (code, name, description, category, status, created_by, updated_by) VALUES
  ('MOH', 'Ministry of Health',
   'Staff directly employed by the government as civil servants under the Saudi Ministry of Health.',
   'Government', 'Active', 1, 1),
  ('SOP', 'Self-Operating Program',
   'Staff employed under the hospital''s direct hiring program (برنامج التشغيل الذاتي): hospital-specific contracts outside the civil service registry.',
   'Program', 'Active', 1, 1),
  ('HCC', 'Health Care Company',
   'Third-party medical manpower contracting company supplying outsourced staffing.',
   'ThirdParty', 'Active', 1, 1),
  ('HHC', 'Hospital Health Company',
   'Third-party contract budget used to outsource specialized staffing (e.g. ECG technicians and selected nursing staff).',
   'ThirdParty', 'Active', 1, 1)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Seed positions
-- ----------------------------------------------------------------------------
INSERT INTO nursing.positions (code, name, category, description, status, created_by, updated_by) VALUES
  ('HN',  'Head Nurse',           'Nursing',   'Unit-level nursing leader (Head Nurse).', 'Active', 1, 1),
  ('AHN', 'Asst. Head Nurse',     'Nursing',   'Assistant Head Nurse.', 'Active', 1, 1),
  ('CI',  'Clinical Instructor',  'Nursing',   'Clinical Instructor.', 'Active', 1, 1),
  ('SN',  'Staff Nurse',          'Nursing',   'Registered/Staff Nurse.', 'Active', 1, 1),
  ('CN',  'Charge Nurse',         'Nursing',   'Charge Nurse.', 'Active', 1, 1),
  ('MW',  'Midwife',              'Nursing',   'Midwife.', 'Active', 1, 1),
  ('PCT', 'Patient Care Tech',    'Technical', 'Patient Care Technician.', 'Active', 1, 1),
  ('TEC', 'ECG Technician',       'Technical', 'ECG Technician.', 'Active', 1, 1),
  ('HCA', 'Health Care Asst.',    'Support',   'Health Care Assistant.', 'Active', 1, 1)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Assign positions to the demo nurses
-- ----------------------------------------------------------------------------
UPDATE nursing.nurses n SET position_id = p.id
FROM nursing.positions p
WHERE p.code = 'SN' AND n.employee_number IN ('EMP-1001', 'EMP-1002', 'EMP-1003');

UPDATE nursing.nurses n SET position_id = p.id
FROM nursing.positions p
WHERE p.code = 'HCA' AND n.employee_number = 'EMP-1004';

-- ----------------------------------------------------------------------------
-- Seed demo contracts (dates relative to CURRENT_DATE so alerts stay useful)
-- ----------------------------------------------------------------------------
INSERT INTO nursing.contracts
  (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
   contract_type, status, start_date, end_date, created_by, updated_by)
SELECT 'CON-2025-0001', n.id, a.id, p.id, n.home_unit_id,
       'FixedTerm', 'Active', CURRENT_DATE - 365, CURRENT_DATE + 60, 1, 1
FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
WHERE n.employee_number = 'EMP-1001' AND a.code = 'SOP' AND p.code = 'SN'
ON CONFLICT (contract_number) DO NOTHING;

INSERT INTO nursing.contracts
  (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
   contract_type, status, start_date, end_date, created_by, updated_by)
SELECT 'CON-2025-0002', n.id, a.id, p.id, n.home_unit_id,
       'Permanent', 'Active', CURRENT_DATE - 540, NULL, 1, 1
FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
WHERE n.employee_number = 'EMP-1002' AND a.code = 'MOH' AND p.code = 'SN'
ON CONFLICT (contract_number) DO NOTHING;

INSERT INTO nursing.contracts
  (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
   contract_type, status, start_date, end_date, created_by, updated_by)
SELECT 'CON-2025-0003', n.id, a.id, p.id, n.home_unit_id,
       'FixedTerm', 'Active', CURRENT_DATE - 90, CURRENT_DATE + 365, 1, 1
FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
WHERE n.employee_number = 'EMP-1003' AND a.code = 'HCC' AND p.code = 'SN'
ON CONFLICT (contract_number) DO NOTHING;

INSERT INTO nursing.contracts
  (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
   contract_type, status, start_date, end_date, created_by, updated_by)
SELECT 'CON-2025-0004', n.id, a.id, p.id, n.home_unit_id,
       'FixedTerm', 'Expired', CURRENT_DATE - 730, CURRENT_DATE - 30, 1, 1
FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
WHERE n.employee_number = 'EMP-1003' AND a.code = 'HCC' AND p.code = 'SN'
ON CONFLICT (contract_number) DO NOTHING;

INSERT INTO nursing.contracts
  (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
   contract_type, status, start_date, end_date, created_by, updated_by)
SELECT 'CON-2025-0005', n.id, a.id, p.id, n.home_unit_id,
       'Temporary', 'Active', CURRENT_DATE - 30, CURRENT_DATE + 30, 1, 1
FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
WHERE n.employee_number = 'EMP-1004' AND a.code = 'HHC' AND p.code = 'HCA'
ON CONFLICT (contract_number) DO NOTHING;

INSERT INTO nursing.contracts
  (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
   contract_type, status, start_date, end_date, created_by, updated_by)
SELECT 'CON-2025-0006', n.id, a.id, p.id, n.home_unit_id,
       'Temporary', 'Draft', CURRENT_DATE + 30, CURRENT_DATE + 395, 1, 1
FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
WHERE n.employee_number = 'EMP-1004' AND a.code = 'HHC' AND p.code = 'HCA'
ON CONFLICT (contract_number) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Deployability: does the nurse have an Active contract covering p_date?
-- Used by the roster service to block deployment of staff whose contract is
-- invalid/expired (Objective 5).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nursing.nurse_has_active_contract(p_nurse_id BIGINT, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM nursing.contracts c
    WHERE c.nurse_id = p_nurse_id
      AND c.status = 'Active'
      AND c.deleted_at IS NULL
      AND c.start_date <= p_date
      AND (c.end_date IS NULL OR c.end_date >= p_date)
  );
$$;

COMMENT ON FUNCTION nursing.nurse_has_active_contract(BIGINT, DATE) IS
  'Whether the nurse has an Active (non-draft, non-expired, non-terminated) contract covering the given date. Drives roster deployability.';

-- ----------------------------------------------------------------------------
-- Maintenance: flip Active contracts whose end_date has passed to Expired.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nursing.refresh_expired_contracts()
RETURNS TABLE (contract_id BIGINT)
LANGUAGE sql
AS $$
  UPDATE nursing.contracts c
     SET status = 'Expired',
         updated_at = CURRENT_TIMESTAMP
   WHERE c.status = 'Active'
     AND c.deleted_at IS NULL
     AND c.end_date IS NOT NULL
     AND c.end_date < CURRENT_DATE
  RETURNING c.id;
$$;

-- ----------------------------------------------------------------------------
-- Data scope: teach resource_in_scope to resolve CONTRACT_MASTER resources
-- (a contract's owning unit is its nurse's home unit).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rbac.resource_in_scope(
  p_user_id      BIGINT,
  p_menu_code    VARCHAR(100),
  p_resource_id  BIGINT,
  p_at           TIMESTAMP
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_all  BOOLEAN;
  v_unit_id  BIGINT := NULL;
  v_post_id  BIGINT := NULL;
  v_shift_id BIGINT := NULL;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM rbac.user_data_scopes uds
    WHERE uds.user_id = p_user_id
      AND uds.status = 'Active'
      AND uds.scope_type = 'All'
      AND (uds.effective_from IS NULL OR uds.effective_from <= p_at)
      AND (uds.effective_to   IS NULL OR uds.effective_to   >= p_at)
  ) INTO v_has_all;
  IF v_has_all THEN
    RETURN TRUE;
  END IF;

  IF p_menu_code = 'NURSE_MASTER' THEN
    SELECT home_unit_id INTO v_unit_id
    FROM nursing.nurses
    WHERE id = p_resource_id AND deleted_at IS NULL;
  ELSIF p_menu_code = 'CREDENTIALS' THEN
    SELECT n.home_unit_id INTO v_unit_id
    FROM nursing.credentials c
    JOIN nursing.nurses n ON n.id = c.nurse_id
    WHERE c.id = p_resource_id AND c.deleted_at IS NULL;
  ELSIF p_menu_code = 'NURSE_ROSTER' THEN
    SELECT nursing_unit_id, post_id, shift_id
      INTO v_unit_id, v_post_id, v_shift_id
    FROM nursing.roster_assignments
    WHERE id = p_resource_id AND deleted_at IS NULL;
  ELSIF p_menu_code = 'CONTRACT_MASTER' THEN
    SELECT n.home_unit_id INTO v_unit_id
    FROM nursing.contracts c
    JOIN nursing.nurses n ON n.id = c.nurse_id
    WHERE c.id = p_resource_id AND c.deleted_at IS NULL;
  ELSE
    -- No resolver for this menu: fail closed.
    RETURN FALSE;
  END IF;

  IF v_unit_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM rbac.user_data_scopes uds
    WHERE uds.user_id = p_user_id
      AND uds.status = 'Active'
      AND (uds.effective_from IS NULL OR uds.effective_from <= p_at)
      AND (uds.effective_to   IS NULL OR uds.effective_to   >= p_at)
      AND (
           (uds.scope_type = 'NursingUnit' AND uds.nursing_unit_id = v_unit_id)
        OR (uds.scope_type = 'Department' AND uds.department_id = (
              SELECT nu.department_id FROM rbac.nursing_units nu WHERE nu.id = v_unit_id))
        OR (uds.scope_type = 'Hospital' AND uds.organization_id = (
              SELECT d.organization_id
              FROM rbac.nursing_units nu
              JOIN rbac.departments d ON d.id = nu.department_id
              WHERE nu.id = v_unit_id))
        OR (uds.scope_type = 'Post'  AND v_post_id  IS NOT NULL AND uds.post_id  = v_post_id)
        OR (uds.scope_type = 'Shift' AND v_shift_id IS NOT NULL AND uds.shift_id = v_shift_id)
      )
  );
END;
$$;

COMMENT ON FUNCTION rbac.resource_in_scope(BIGINT, VARCHAR, BIGINT, TIMESTAMP) IS
  'Whether the resource (nurse/credential/roster/contract) is inside any of the user''s active data scopes. Unknown menu codes fail closed.';

-- ----------------------------------------------------------------------------
-- RBAC: CONTRACT_MASTER menu + role access
-- ----------------------------------------------------------------------------
INSERT INTO rbac.menus (code, name, description, parent_menu_id, display_order, route, icon, is_functional, status, created_by, updated_by)
SELECT 'CONTRACT_MASTER', 'Contract Master',
       'Employment contracts for nursing staff',
       m.id, 4, '/nursing/contracts', 'file-done', true, 'Active', 1, 1
FROM rbac.menus m WHERE m.code = 'NURSING_WORKFORCE'
ON CONFLICT (code) DO NOTHING;

-- Menu access: who can open the Contract Master screen.
INSERT INTO rbac.role_menu_access (role_code, menu_id, visible, enabled, assignment_source, status, created_by, updated_by)
SELECT r.code, m.id, true, true, 'AccessLevelDefault', 'Active', 1, 1
FROM (VALUES ('SYSTEM_ADMIN'), ('HR_ADMIN'), ('NURSE_MANAGER'), ('COMPLIANCE_OFFICER'), ('SCHEDULER')) AS r(code)
JOIN rbac.menus m ON m.code = 'CONTRACT_MASTER'
ON CONFLICT (role_code, menu_id) DO NOTHING;

-- SYSTEM_ADMIN: every permission (consistent with the V2_4 seed).
INSERT INTO rbac.role_permissions (role_code, menu_id, permission_id, allowed, status, created_by, updated_by)
SELECT 'SYSTEM_ADMIN', m.id, p.id, true, 'Active', 1, 1
FROM rbac.menus m CROSS JOIN rbac.permissions p
WHERE m.code = 'CONTRACT_MASTER'
ON CONFLICT (role_code, menu_id, permission_id) DO NOTHING;

-- HR_ADMIN: full contract administration.
INSERT INTO rbac.role_permissions (role_code, menu_id, permission_id, allowed, status, created_by, updated_by)
SELECT 'HR_ADMIN', m.id, p.id, true, 'Active', 1, 1
FROM rbac.menus m JOIN rbac.permissions p
  ON p.code IN ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'MANAGE')
WHERE m.code = 'CONTRACT_MASTER'
ON CONFLICT (role_code, menu_id, permission_id) DO NOTHING;

-- NURSE_MANAGER: create/approve within their departments.
INSERT INTO rbac.role_permissions (role_code, menu_id, permission_id, allowed, status, created_by, updated_by)
SELECT 'NURSE_MANAGER', m.id, p.id, true, 'Active', 1, 1
FROM rbac.menus m JOIN rbac.permissions p
  ON p.code IN ('VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT')
WHERE m.code = 'CONTRACT_MASTER'
ON CONFLICT (role_code, menu_id, permission_id) DO NOTHING;

-- COMPLIANCE_OFFICER: view + export.
INSERT INTO rbac.role_permissions (role_code, menu_id, permission_id, allowed, status, created_by, updated_by)
SELECT 'COMPLIANCE_OFFICER', m.id, p.id, true, 'Active', 1, 1
FROM rbac.menus m JOIN rbac.permissions p
  ON p.code IN ('VIEW', 'EXPORT')
WHERE m.code = 'CONTRACT_MASTER'
ON CONFLICT (role_code, menu_id, permission_id) DO NOTHING;

-- SCHEDULER: view (needed to see who is deployable).
INSERT INTO rbac.role_permissions (role_code, menu_id, permission_id, allowed, status, created_by, updated_by)
SELECT 'SCHEDULER', m.id, p.id, true, 'Active', 1, 1
FROM rbac.menus m JOIN rbac.permissions p
  ON p.code IN ('VIEW')
WHERE m.code = 'CONTRACT_MASTER'
ON CONFLICT (role_code, menu_id, permission_id) DO NOTHING;

SELECT 'V3_8__contract_master completed' as status;
