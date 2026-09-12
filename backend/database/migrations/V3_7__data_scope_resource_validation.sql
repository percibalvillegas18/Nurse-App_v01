-- =============================================================================
-- V3_7__data_scope_resource_validation.sql
-- Real data-scope (row-level) enforcement for the nursing domain.
--
-- Background: since V2_0, `rbac.evaluate_access()` validated data scope as
-- "does the user have at least one Active scope row" (a stub). That meant any
-- holder of NURSE_MASTER/VIEW could read every nurse in every unit, and list
-- endpoints applied no scope filter at all.
--
-- This migration:
--   1. Adds rbac.get_user_visible_unit_ids(p_user_id)  -> the set of
--      nursing_unit ids a user may see (for server-side LIST filtering),
--      expanding Hospital/Department/NursingUnit/All scopes through the
--      organization -> department -> nursing_unit hierarchy.
--   2. Adds rbac.resource_in_scope(p_user_id, p_menu_code, p_resource_id,
--      p_at) -> BOOLEAN resolving a resource (nurse / credential / roster
--      assignment) to its owning unit and testing it against the user's
--      scopes. Unknown menu codes fail closed (DENY).
--   3. Replaces rbac.evaluate_access() with a version whose data-scope step
--      calls resource_in_scope() instead of the stub.
--
-- Idempotent: CREATE OR REPLACE only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Visible units for a user (list filtering)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rbac.get_user_visible_unit_ids(p_user_id BIGINT)
RETURNS TABLE (nursing_unit_id BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT nu.id
  FROM rbac.user_data_scopes uds
  CROSS JOIN rbac.nursing_units nu
  WHERE uds.user_id = p_user_id
    AND uds.status = 'Active'
    AND nu.status = 'Active'
    AND (uds.effective_from IS NULL OR uds.effective_from <= CURRENT_TIMESTAMP)
    AND (uds.effective_to   IS NULL OR uds.effective_to   >= CURRENT_TIMESTAMP)
    AND (
         uds.scope_type = 'All'
      OR (uds.scope_type = 'Hospital' AND uds.organization_id IS NOT NULL
          AND nu.department_id IN (
                SELECT d.id FROM rbac.departments d
                WHERE d.organization_id = uds.organization_id))
      OR (uds.scope_type = 'Department' AND uds.department_id IS NOT NULL
          AND nu.department_id = uds.department_id)
      OR (uds.scope_type = 'NursingUnit' AND uds.nursing_unit_id IS NOT NULL
          AND nu.id = uds.nursing_unit_id)
    )
$$;

COMMENT ON FUNCTION rbac.get_user_visible_unit_ids(BIGINT) IS
  'Nursing units visible to a user under their active data scopes (All/Hospital/Department/NursingUnit). Empty set = no data access. Used to filter list endpoints server-side.';

-- ---------------------------------------------------------------------------
-- 2. Resource-aware scope check (detail routes)
-- ---------------------------------------------------------------------------
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
  -- 'All' scope grants visibility of every resource.
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

  -- Resolve the resource to its owning unit (and post/shift where relevant).
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
  ELSE
    -- No resolver for this menu: fail closed.
    RETURN FALSE;
  END IF;

  -- A resource that cannot be resolved to a unit is not visible to scoped
  -- users (e.g. an unassigned nurse). Only 'All' scope passes (handled above).
  IF v_unit_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Match when any active scope covers the unit through the hierarchy, or pins
  -- the exact post/shift of a roster assignment.
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
  'Whether the resource (nurse/credential/roster assignment) is inside any of the user''s active data scopes. Unknown menu codes fail closed.';

-- ---------------------------------------------------------------------------
-- 3. evaluate_access: replace the data-scope stub with resource_in_scope
-- ---------------------------------------------------------------------------
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
  user_role VARCHAR(50), -- primary role for backward compat
  user_roles TEXT[] -- all active roles
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
  v_cache_ttl INT := 300;
BEGIN
  -- ========================================================================
  -- STEP 1: VALIDATE USER AND GET ALL ACTIVE ROLES (MULTI-ROLE)
  -- ========================================================================

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

  -- Get ALL active roles (temporal filtering)
  SELECT ARRAY_AGG(DISTINCT hr.code) INTO v_all_role_codes
  FROM auth.user_role_assignments ura
  JOIN system.hospital_roles hr ON hr.id = ura.role_id
  WHERE ura.user_id = p_user_id
    AND ura.status = 'Active'
    AND hr.status = 'Active'
    AND (ura.effective_from IS NULL OR ura.effective_from <= v_now)
    AND (ura.effective_to IS NULL OR ura.effective_to >= v_now);

  -- Fallback to primary_role_id if no assignments (bootstrap case)
  IF v_all_role_codes IS NULL OR ARRAY_LENGTH(v_all_role_codes, 1) IS NULL THEN
    IF v_primary_role_id IS NOT NULL THEN
      SELECT ARRAY[hr.code] INTO v_all_role_codes FROM system.hospital_roles hr WHERE hr.id = v_primary_role_id AND hr.status = 'Active';
    END IF;
  END IF;

  -- Still no roles = DENY
  IF v_all_role_codes IS NULL OR ARRAY_LENGTH(v_all_role_codes, 1) IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'User has no active roles'::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, NULL::VARCHAR(50), ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- Primary role for backward compat = first in array or primary_role_id
  IF v_primary_role_id IS NOT NULL THEN
    SELECT code INTO v_primary_role_code FROM system.hospital_roles WHERE id = v_primary_role_id;
  ELSE
    v_primary_role_code := v_all_role_codes[1];
  END IF;

  -- ========================================================================
  -- STEP 2: VALIDATE MENU
  -- ========================================================================

  SELECT id, status INTO v_menu_id, v_menu_status FROM rbac.menus WHERE code = p_menu_code;

  IF v_menu_id IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), ('Menu "' || p_menu_code || '" not found')::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  IF v_menu_status != 'Active' THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'Menu is inactive'::VARCHAR(500), FALSE, FALSE, FALSE, 300, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- ========================================================================
  -- STEP 3: CHECK ROLE-MENU ACCESS - ANY role grants access (OR logic)
  -- ========================================================================

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

  -- If no record, deny by default
  IF v_menu_found IS NULL THEN
    v_menu_found := FALSE;
    v_menu_visible := FALSE;
    v_menu_enabled := FALSE;
  END IF;

  -- Need both visible AND enabled from ANY role
  IF NOT (v_menu_visible AND v_menu_enabled) THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50),
      ('Menu not accessible for roles [' || ARRAY_TO_STRING(v_all_role_codes, ',') || '] (visible=' || v_menu_visible::TEXT || ', enabled=' || v_menu_enabled::TEXT || ')')::VARCHAR(500),
      v_menu_visible, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- ========================================================================
  -- STEP 4: VALIDATE PERMISSION EXISTS
  -- ========================================================================

  SELECT id, status INTO v_perm_id, v_perm_status FROM rbac.permissions WHERE code = p_permission_code;

  IF v_perm_id IS NULL THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), ('Permission "' || p_permission_code || '" not found')::VARCHAR(500), TRUE, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  IF v_perm_status != 'Active' THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'Permission is inactive'::VARCHAR(500), TRUE, FALSE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- ========================================================================
  -- STEP 5: CHECK ROLE-PERMISSION - ANY role grants permission
  -- ========================================================================

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
  -- STEP 6: CHECK DATA SCOPE - resource-aware validation (V3_7)
  -- ========================================================================

  -- No resource_id supplied (e.g. menu/permission listing) => scope does not
  -- apply at the decision level; list endpoints must filter server-side.
  v_scope_valid := TRUE;

  IF p_resource_id IS NOT NULL THEN
    v_scope_valid := rbac.resource_in_scope(p_user_id, p_menu_code, p_resource_id, v_now);
  END IF;

  IF NOT v_scope_valid THEN
    RETURN QUERY SELECT 'DENY'::VARCHAR(50), 'Resource outside user data scope'::VARCHAR(500), TRUE, TRUE, FALSE, 1800, v_now, v_primary_role_code, v_all_role_codes;
    RETURN;
  END IF;

  -- ========================================================================
  -- STEP 7: ALL CHECKS PASSED - ALLOW
  -- Calculate cache TTL: shorter if temporal bounds near expiry
  -- ========================================================================

  v_cache_ttl := 300; -- Default 5 min

  -- If any role_menu_access or role_permission has effective_to within 1 hour, reduce TTL
  -- This prevents stale ALLOW after expiry
  IF EXISTS (
    SELECT 1 FROM rbac.role_menu_access rma
    WHERE rma.role_code = ANY(v_all_role_codes) AND rma.menu_id = v_menu_id AND rma.status = 'Active'
      AND rma.effective_to IS NOT NULL AND rma.effective_to <= v_now + INTERVAL '1 hour'
  ) THEN
    v_cache_ttl := 60; -- 1 min if expiring soon
  END IF;

  RETURN QUERY SELECT 'ALLOW'::VARCHAR(50),
    ('Authorization granted for roles [' || ARRAY_TO_STRING(v_all_role_codes, ',') || ']')::VARCHAR(500),
    v_menu_visible, v_perm_allowed, v_scope_valid, v_cache_ttl, v_now, v_primary_role_code, v_all_role_codes;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION rbac.get_user_visible_unit_ids(BIGINT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.resource_in_scope(BIGINT, VARCHAR, BIGINT, TIMESTAMP) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.evaluate_access(BIGINT, VARCHAR, VARCHAR, BIGINT) TO PUBLIC;

SELECT 'V3_7__data_scope_resource_validation completed' AS status;
