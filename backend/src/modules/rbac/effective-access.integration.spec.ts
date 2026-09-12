/**
 * Effective Access Service - REAL database integration tests.
 *
 * These exercise rbac.evaluate_access() (and the V3_7 data-scope helpers)
 * against an actual PostgreSQL instance seeded by database/migrations.
 * They are skipped unless PG_INTEGRATION=true (set by the CI backend job,
 * which provisions a postgres:15 service and runs scripts/run-migrations.ts
 * first). Keep `npm test` local runs dependency-free.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const RUN = process.env.PG_INTEGRATION === 'true';
const maybe = RUN ? describe : describe.skip;

// The generated Prisma client is loaded and instantiated only when we actually
// run. jest executes describe callbacks eagerly (even for describe.skip), so
// everything real must be conditional - otherwise a dependency-free local
// `npm test` (no `prisma generate`, no database) would fail at import time.
let prisma: any = null;
if (RUN) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
}

maybe('EFFECTIVE ACCESS - INTEGRATION (real Postgres)', () => {
  const q = (sql: string, ...params: any[]) =>
    prisma.$queryRawUnsafe(sql, ...params) as Promise<any[]>;

  const userId = async (username: string): Promise<number> => {
    const rows = await q(`SELECT id FROM auth.users WHERE username = $1`, username);
    return Number(rows[0]?.id);
  };

  const nurseId = async (employeeNumber: string): Promise<number> => {
    const rows = await q(`SELECT id FROM nursing.nurses WHERE employee_number = $1`, employeeNumber);
    return Number(rows[0]?.id);
  };

  const evaluate = async (
    uid: number,
    menu: string,
    perm: string,
    resourceId: number | null = null,
  ) => {
    const rows = await q(
      `SELECT * FROM rbac.evaluate_access($1, $2, $3, $4)`,
      uid,
      menu,
      perm,
      resourceId,
    );
    return rows[0];
  };

  beforeAll(async () => {
    if (prisma) await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('denies an inactive user', async () => {
    const id = await userId('maria.garcia');
    await q(`UPDATE auth.users SET status = 'Inactive' WHERE id = $1`, id);
    try {
      const d = await evaluate(id, 'NURSE_MASTER', 'VIEW');
      expect(d.decision).toBe('DENY');
      expect(String(d.reason)).toMatch(/not Active/i);
    } finally {
      await q(`UPDATE auth.users SET status = 'Active' WHERE id = $1`, id);
    }
  });

  it('denies by default when no role_menu_access record exists', async () => {
    const id = await userId('maria.garcia');
    // RN has no USER_MANAGEMENT access in the seed matrix.
    const d = await evaluate(id, 'USER_MANAGEMENT', 'VIEW');
    expect(d.decision).toBe('DENY');
  });

  it('denies expired temporal access and allows a valid window', async () => {
    const id = await userId('maria.garcia');
    const menuRows = await q(`SELECT id FROM rbac.menus WHERE code = 'USER_MANAGEMENT'`);
    const permRows = await q(`SELECT id FROM rbac.permissions WHERE code = 'VIEW'`);
    const menuId = Number(menuRows[0].id);
    const permId = Number(permRows[0].id);

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    // Permission stays valid across both assertions; only the menu-access
    // window changes.
    await q(
      `INSERT INTO rbac.role_permissions
         (role_code, menu_id, permission_id, allowed, source, status, created_by, updated_by, effective_from, effective_to)
       VALUES ('RN', $1, $2, TRUE, 'AccessLevelDefault', 'Active', 1, 1, CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day')
       ON CONFLICT (role_code, menu_id, permission_id)
       DO UPDATE SET allowed = TRUE, status = 'Active',
         effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to`,
      menuId,
      permId,
    );

    const setMenuWindow = (to: string) =>
      q(
        `INSERT INTO rbac.role_menu_access
           (role_code, menu_id, visible, enabled, assignment_source, status, created_by, updated_by, effective_from, effective_to)
         VALUES ('RN', $1, TRUE, TRUE, 'AccessLevelDefault', 'Active', 1, 1, CURRENT_TIMESTAMP - INTERVAL '1 day', $2::timestamp)
         ON CONFLICT (role_code, menu_id)
         DO UPDATE SET visible = TRUE, enabled = TRUE, status = 'Active',
           effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to`,
        menuId,
        to,
      );

    try {
      await setMenuWindow(yesterday);
      const expired = await evaluate(id, 'USER_MANAGEMENT', 'VIEW');
      expect(expired.decision).toBe('DENY');

      await setMenuWindow(tomorrow);
      const valid = await evaluate(id, 'USER_MANAGEMENT', 'VIEW');
      expect(valid.decision).toBe('ALLOW');
    } finally {
      await q(`DELETE FROM rbac.role_permissions WHERE role_code = 'RN' AND menu_id = $1 AND permission_id = $2`, menuId, permId);
      await q(`DELETE FROM rbac.role_menu_access WHERE role_code = 'RN' AND menu_id = $1`, menuId);
    }
  });

  it('ICU_A-scoped RN can read an ICU_A nurse but not an ICU_B nurse', async () => {
    const id = await userId('maria.garcia'); // NursingUnit ICU_A scope
    const sameUnit = await nurseId('EMP-1002'); // ahmed.hassan -> ICU_A
    const otherUnit = await nurseId('EMP-1004'); // david.kim -> ICU_B

    const same = await evaluate(id, 'NURSE_MASTER', 'VIEW', sameUnit);
    expect(same.decision).toBe('ALLOW');
    expect(same.data_scope_valid).toBe(true);

    const other = await evaluate(id, 'NURSE_MASTER', 'VIEW', otherUnit);
    expect(other.decision).toBe('DENY');
    expect(other.data_scope_valid).toBe(false);
  });

  it('Department-scoped nurse manager can read nurses in both ICU units', async () => {
    const id = await userId('susan.lee'); // Department ICU scope
    const icuA = await nurseId('EMP-1002');
    const icuB = await nurseId('EMP-1004');

    const a = await evaluate(id, 'NURSE_MASTER', 'VIEW', icuA);
    const b = await evaluate(id, 'NURSE_MASTER', 'VIEW', icuB);
    expect(a.decision).toBe('ALLOW');
    expect(b.decision).toBe('ALLOW');
  });

  it('get_user_visible_unit_ids returns the correct unit set per scope', async () => {
    const units = async (username: string): Promise<number[]> => {
      const id = await userId(username);
      const rows = await q(`SELECT nursing_unit_id FROM rbac.get_user_visible_unit_ids($1)`, id);
      return rows.map((r: any) => Number(r.nursing_unit_id));
    };

    const maria = await units('maria.garcia'); // NursingUnit ICU_A
    expect(maria).toHaveLength(1);

    const susan = await units('susan.lee'); // Department ICU -> ICU_A + ICU_B
    expect(susan.length).toBeGreaterThanOrEqual(2);

    const rachel = await units('rachel.brown'); // Hospital -> all seeded units
    expect(rachel.length).toBeGreaterThanOrEqual(3);
  });
});
