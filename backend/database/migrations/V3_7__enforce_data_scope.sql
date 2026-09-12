-- =============================================================================
-- V3_7__enforce_data_scope.sql
-- Replace the STEP 6 data-scope stub in rbac.evaluate_access() with
-- resource-specific org/dept/unit validation.
--
-- NOTE: The application service layer (NursingService) is the authoritative
-- enforcement point and is unit-tested. This SQL layer is defence-in-depth for
-- resource-addressed routes (GET/PATCH/DELETE nurse, verify credential,
-- PATCH roster) where RbacGuard passes a resourceId. List endpoints are
-- filtered in the service (they pass no resourceId to the SQL function).
--
-- Scope model (from V1_0 + V2_4 seeds):
--   'All'           -> everything
--   'Hospital'      -> organization_id and everything below it
--   'Department'    -> department_id and its nursing units
--   'NursingUnit'   -> a single unit
--   'Post'/'Shift'  -> enforced at the service layer (roster rows); this SQL
--                     function only receives org/dept/unit ids, so they are
--                     not evaluated here.
--   'Assigned'      -> rule-based (assignment_rule / assignment_rule_config);
--                     no rule engine exists yet, so it fails closed (TODO).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: is the resource (org/dept/unit) within the user's active scopes?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rbac.user_in_data_scope(
  p_user_id BIGINT,
  p_organization_id BIGINT,
  p_department_id BIGINT,
  p_nursing_unit_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  -- 'All' scope grants everything.
  SELECT EXISTS (
    SELECT 1 FROM rbac.user_data_scopes uds
    WHERE uds.user_id = p_user_id
      AND uds.status = 'Active'
      AND uds.scope_type = 'All'
      AND (uds.effective_from IS NULL OR uds.effective_from <= CURRENT_TIMESTAMP)
      AND (uds.effective_to IS NULL OR uds.effective_to >= CURRENT_TIMESTAMP)
  ) INTO v_ok;
  IF v_ok THEN
    RETURN TRUE;
  END IF;

  -- Hospital scope on this organization.
  IF p_organization_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM rbac.user_data_scopes uds
      WHERE uds.user_id = p_user_id
        AND uds.status = 'Active'
        AND uds.scope_type = 'Hospital'
        AND uds.organization_id = p_organization_id
        AND (uds.effective_from IS NULL OR uds.effective_from <= CURRENT_TIMESTAMP)
        AND (uds.effective_to IS NULL OR uds.effective_to >= CURRENT_TIMESTAMP)
    ) INTO v_ok;
    IF v_ok THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Department scope on this department.
  IF p_department_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM rbac.user_data_scopes uds
      WHERE uds.user_id = p_user_id
        AND uds.status = 'Active'
        AND uds.scope_type = 'Department'
        AND uds.department_id = p_department_id
        AND (uds.effective_from IS NULL OR uds.effective_from <= CURRENT_TIMESTAMP)
        AND (uds.effective_to IS NULL OR uds.effective_to >= CURRENT_TIMESTAMP)
    ) INTO v_ok;
    IF v_ok THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- NursingUnit scope on this unit.
  IF p_nursing_unit_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM rbac.user_data_scopes uds
      WHERE uds.user_id = p_user_id
        AND uds.status = 'Active'
        AND uds.scope_type = 'NursingUnit'
        AND uds.nursing_unit_id = p_nursing_unit_id
        AND (uds.effective_from IS NULL OR uds.effective_from <= CURRENT_TIMESTAMP)
        AND (uds.effective_to IS NULL OR uds.effective_to >= CURRENT_TIMESTAMP)
    ) INTO v_ok;
    IF v_ok THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION rbac.user_in_data_scope(BIGINT, BIGINT, BIGINT, BIGINT) IS
  'True when the user has an active data scope covering the given org/dept/unit node. Fail closed.';

-- -----------------------------------------------------------------------------
-- Replace evaluate_access (verbatim from V2_5, only STEP 6 rewritten).
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS rbac.vw_current_access_decisions CASCADE;
DROP FUNCTION IF EXISTS rbac.evaluate_access CASCADE;

CREATE OR REPLACE FUNCTION rbac.evaluate_access(
  p_user_id BIGINT,
  p_menu_code VARCHAR(100),
  p_permission_code VARCHAR(50),
  p_resource_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  decision VARCHAR(50),
  reason VARCHAR(500),
  menu_accessible BOOLEAN,
  permission_granted BOOLEAN,
  data_scope_valid BOOLEAN,
  cache_ttl INT,
  evaluated_at TIMESTAMP,
  user_role VARCHAR(50),
  user_roles TEXT[]
) AS $$
DECLARE
  v_user_status VARCHAR(50);
  v_primary_role_id BIGINT;
  v_primary_role_code VARCHAR(50);
  v_all_role_codes TEXT[];
  v_now TIMESTAMP := CURRENT_TIMESTAMP;
  v_menu_id BIGINT;
  v_menu_status VARCHAR(50);
  v_menu_visible BOOLEAN := FALSE;
  v_menu_enabled BOOLEAN := FALSE;
  v_menu_found BOOLEAN := FALSE;
  v_perm_id BIGINT;
  v_perm_status VARCHAR(50);
  v_perm_allowed BOOLEAN := FALSE;
  v_perm_found BOOLEAN := FALSE;
  v_scope_valid BOOLEAN := FALSE;
  v_scope_count INT := 0;
  v_has_all_scope BOOLEAN := FALSE;
  v_cache_ttl INT := 300;
BEGIN
  -- STEP 1: VALIDATE USER AND GET ALL ACTIVE ROLES (MULTI-ROLE)
  SELECT u.status, u.primary_role_id INTO v_user_status, v_primary_role_id
  FROM auth.users u WHERE u.id = p_user_id;

  IF v_user_status IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'User not found'::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, NULL::VARCHAR(50), ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_user_status != 'Active' THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), ('User status is ' || v_user_status || ', not Active')::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, NULL::VARCHAR(50), ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT ARRAY_AGG(DISTINCT hr.code) INTO v_all_role_codes
  FROM auth.user_role_assignments ura
  JOIN system.hospital_roles hr ON hr.id = ura.role_id
  WHERE ura.user_id = p_user_id
    AND ura.status = 'Active'
    AND hr.status = 'Active'
    AND (ura.effective_from IS NULL OR ura.effective_from <= v_now)
    AND (ura.effective_to IS NULL OR ura.effective_to >= v_now);

  IF v_all_role_codes IS NULL OR ARRAY_LENGTH(v_all_role_codes, 1) IS NULL THEN
    IF v_primary_role_id IS NOT NULL THEN
      SELECT ARRAY[hr.code] INTO v_all_role_codes FROM system.hospital_roles hr WHERE hr.id = v_primary_role_id AND hr.status = 'Active';
    END IF;
  END IF;

  IF v_all_role_codes IS NULL OR ARRAY_LENGTH(v_all_role_codes, 1) IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'User has no active roles'::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, NULL::VARCHAR(50), ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_primary_role_id IS NOT NULL THEN
    SELECT code INTO v_primary_role_code FROM system.hospital_roles WHERE id = v_primary_role_id;
  ELSE
    v_primary_role_code := v_all_role_codes[1];
  END IF;

  -- STEP 2: VALIDATE MENU
  SELECT id, status INTO v_menu_id, v_menu_status FROM rbac.menus WHERE code = p_menu_code;

  IF v_menu_id IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), ('Menu "' || p_menu_code || '" not found')::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  IF v_menu_status != 'Active' THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'Menu is inactive'::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- STEP 3: CHECK ROLE-MENU ACCESS (ANY role -> OR logic)
  SELECT
    BOOL_OR(rma.visible) as visible,
    BOOL_OR(rma.enabled) as enabled,
    BOOL_OR(rma.visible AND rma.enabled) as accessible
  INTO v_menu_visible, v_menu_enabled, v_menu_found
  FROM rbac.role_menu_access rma
  WHERE rma.role_code = ANY(v_all_role_codes)
    AND rma.menu_id = v_menu_id
    AND rma.status = 'Active'
    AND (rma.effective_from IS NULL OR rma.effective_from <= v_now)
    AND (rma.effective_to IS NULL OR rma.effective_to >= v_now);

  IF v_menu_found IS NULL THEN
    v_menu_found := FALSE;
    v_menu_visible := FALSE;
    v_menu_enabled := FALSE;
  END IF;

  IF NOT (v_menu_visible AND v_menu_enabled) THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50),
      ('Menu not accessible for roles [' || ARRAY_TO_STRING(v_all_role_codes, ',') || '] (visible=' || v_menu_visible::TEXT || ', enabled=' || v_menu_enabled::TEXT || ')')::VARCHAR(500),
      v_menu_visible, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- STEP 4: VALIDATE PERMISSION EXISTS
  SELECT id, status INTO v_perm_id, v_perm_status FROM rbac.permissions WHERE code = p_permission_code;

  IF v_perm_id IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), ('Permission "' || p_permission_code || '" not found')::VARCHAR(500), TRUE, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  IF v_perm_status != 'Active' THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'Permission is inactive'::VARCHAR(500), TRUE, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- STEP 5: CHECK ROLE-PERMISSION (ANY role -> OR logic)
  SELECT BOOL_OR(rp.allowed) INTO v_perm_allowed
  FROM rbac.role_permissions rp
  WHERE rp.role_code = ANY(v_all_role_codes)
    AND rp.menu_id = v_menu_id
    AND rp.permission_id = v_perm_id
    AND rp.status = 'Active'
    AND (rp.effective_from IS NULL OR rp.effective_from <= v_now)
    AND (rp.effective_to IS NULL OR rp.effective_to >= v_now);

  IF v_perm_allowed IS NULL THEN
    v_perm_allowed := FALSE;
    v_perm_found := FALSE;
  ELSE
    v_perm_found := v_perm_allowed;
  END IF;

  IF NOT v_perm_allowed THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50),
      ('Permission "' || p_permission_code || '" not granted for roles [' || ARRAY_TO_STRING(v_all_role_codes, ',') || ']')::VARCHAR(500),
      TRUE, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- ========================================================================
  -- STEP 6: CHECK DATA SCOPE - resource-specific org/dept/unit validation.
  --
  -- The resource id is resolved per menu:
  --   NURSE_MASTER  -> p_resource_id is a nursing.nurses.id
  --   CREDENTIALS   -> p_resource_id is a nursing.credentials.id
  --   NURSE_ROSTER  -> p_resource_id is a nursing.roster_assignments.id
  -- Any menu we do not recognise here, or a resource we cannot resolve, is
  -- DENIED (fail closed). Lists pass no resource id and are filtered in the
  -- application service layer.
  -- ========================================================================

  v_scope_valid := TRUE; -- no resource_id => no data-scope check needed

  IF p_resource_id IS NOT NULL THEN
    v_scope_valid := FALSE;

    IF p_menu_code IN ('NURSE_MASTER', 'CREDENTIALS') THEN
      -- Resolve the nurse behind the resource (credential -> nurse -> unit).
      SELECT EXISTS (
        SELECT 1
        FROM nursing.nurses n
        LEFT JOIN rbac.nursing_units nu ON nu.id = n.home_unit_id
        LEFT JOIN rbac.departments d ON d.id = nu.department_id
        WHERE n.deleted_at IS NULL
          AND (
            (p_menu_code = 'NURSE_MASTER' AND n.id = p_resource_id)
            OR
            (p_menu_code = 'CREDENTIALS' AND EXISTS (
              SELECT 1 FROM nursing.credentials c
              WHERE c.id = p_resource_id AND c.nurse_id = n.id AND c.deleted_at IS NULL
            ))
          )
          AND rbac.user_in_data_scope(p_user_id, d.organization_id, nu.department_id, n.home_unit_id)
      ) INTO v_scope_valid;

    ELSIF p_menu_code = 'NURSE_ROSTER' THEN
      -- Resolve the unit behind the roster assignment.
      SELECT EXISTS (
        SELECT 1
        FROM nursing.roster_assignments ra
        LEFT JOIN rbac.nursing_units nu ON nu.id = ra.nursing_unit_id
        LEFT JOIN rbac.departments d ON d.id = nu.department_id
        WHERE ra.id = p_resource_id
          AND ra.deleted_at IS NULL
          AND rbac.user_in_data_scope(p_user_id, d.organization_id, ra.nursing_unit_id, NULL)
      ) INTO v_scope_valid;

    ELSE
      -- Unknown resource type for a menu we do not map: fail closed.
      v_scope_valid := FALSE;
    END IF;
  END IF;

  IF NOT v_scope_valid THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'Resource outside user data scope'::VARCHAR(500), TRUE, TRUE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- STEP 7: ALL CHECKS PASSED - ALLOW
  v_cache_ttl := 300;

  IF EXISTS (
    SELECT 1 FROM rbac.role_menu_access rma
    WHERE rma.role_code = ANY(v_all_role_codes) AND rma.menu_id = v_menu_id AND rma.status = 'Active'
      AND rma.effective_to IS NOT NULL AND rma.effective_to <= v_now + INTERVAL '1 hour'
  ) THEN
    v_cache_ttl := 60;
  END IF;

  RETURN QUERY SELECT 'ALLOW'::VARCHAR(50),
    ('Authorization granted for roles [' || ARRAY_TO_STRING(v_all_role_codes, ',') || ']')::VARCHAR(500),
    v_menu_visible, v_perm_allowed, v_scope_valid, v_cache_ttl, v_now, v_primary_role_code, v_all_role_codes;
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- Recreate the dependent view (dropped above).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW rbac.vw_current_access_decisions AS
SELECT
  u.id as user_id,
  u.username,
  hr.code as role_code,
  hr.name as role_name,
  m.code as menu_code,
  m.name as menu_name,
  p.code as permission_code,
  p.name as permission_name,
  (rbac.evaluate_access(u.id, m.code, p.code)).decision,
  (rbac.evaluate_access(u.id, m.code, p.code)).reason
FROM auth.users u
CROSS JOIN system.hospital_roles hr
CROSS JOIN rbac.menus m
CROSS JOIN rbac.permissions p
WHERE u.status = 'Active'
  AND hr.status = 'Active'
  AND m.status = 'Active'
  AND p.status = 'Active'
  AND EXISTS (
    SELECT 1 FROM auth.user_role_assignments ura
    WHERE ura.user_id = u.id AND ura.role_id = hr.id AND ura.status = 'Active'
  );

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION rbac.user_in_data_scope(BIGINT, BIGINT, BIGINT, BIGINT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.evaluate_access TO PUBLIC;
GRANT SELECT ON rbac.vw_current_access_decisions TO PUBLIC;

SELECT 'V3_7__enforce_data_scope completed' AS status;
