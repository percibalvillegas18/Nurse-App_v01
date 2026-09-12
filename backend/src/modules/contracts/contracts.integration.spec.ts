/**
 * Contract Master - REAL database integration tests.
 *
 * Exercises the V3_8 contract schema/seeds, the deployability function
 * (nursing.nurse_has_active_contract) and the CONTRACT_MASTER data-scope
 * resolver against a real PostgreSQL instance seeded by database/migrations.
 * Skipped unless PG_INTEGRATION=true (CI provisions postgres:15).
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const RUN = process.env.PG_INTEGRATION === 'true';
const maybe = RUN ? describe : describe.skip;

let prisma: any = null;
if (RUN) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
}

maybe('CONTRACT MASTER - INTEGRATION (real Postgres)', () => {
  const q = (sql: string, ...params: any[]) =>
    prisma.$queryRawUnsafe(sql, ...params) as Promise<any[]>;

  const one = async (sql: string, ...params: any[]) => (await q(sql, ...params))[0];

  const nurseId = async (emp: string) => Number((await one(`SELECT id FROM nursing.nurses WHERE employee_number = $1`, emp)).id);
  const contractId = async (num: string) => Number((await one(`SELECT id FROM nursing.contracts WHERE contract_number = $1`, num)).id);

  beforeAll(async () => {
    if (prisma) await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('seeds the three agency categories and the nine positions', async () => {
    const agencies: any[] = await q(`SELECT code, category FROM nursing.contract_agencies ORDER BY code`);
    expect(agencies.map((a) => a.code)).toEqual(['HCC', 'HHC', 'MOH', 'SOP']);
    expect(agencies.find((a) => a.code === 'MOH').category).toBe('Government');
    expect(agencies.find((a) => a.code === 'SOP').category).toBe('Program');
    expect(agencies.find((a) => a.code === 'HCC').category).toBe('ThirdParty');

    const positions: any[] = await q(`SELECT code FROM nursing.positions ORDER BY code`);
    expect(positions.map((p) => p.code)).toEqual(
      ['AHN', 'CI', 'CN', 'HCA', 'HN', 'MW', 'PCT', 'SN', 'TEC'],
    );
  });

  it('nurse_has_active_contract is true inside and false outside the covered window', async () => {
    const id = await nurseId('EMP-1001'); // CON-2025-0001: Active, ends +60 days
    const inside: any = await one(
      `SELECT nursing.nurse_has_active_contract($1::bigint, CURRENT_DATE) AS ok`,
      id,
    );
    const outside: any = await one(
      `SELECT nursing.nurse_has_active_contract($1::bigint, CURRENT_DATE + 730) AS ok`,
      id,
    );
    expect(inside.ok).toBe(true);
    expect(outside.ok).toBe(false);
  });

  it('resource_in_scope resolves CONTRACT_MASTER via the nurse home unit', async () => {
    const maria = Number((await one(`SELECT id FROM auth.users WHERE username = 'maria.garcia'`)).id); // RN, ICU_A scope
    const own = await contractId('CON-2025-0001'); // nurse EMP-1001 -> ICU_A
    const other = await contractId('CON-2025-0005'); // nurse EMP-1004 -> ICU_B

    const ownRes: any = await one(
      `SELECT rbac.resource_in_scope($1, 'CONTRACT_MASTER', $2, CURRENT_TIMESTAMP::timestamp) AS ok`,
      maria,
      own,
    );
    const otherRes: any = await one(
      `SELECT rbac.resource_in_scope($1, 'CONTRACT_MASTER', $2, CURRENT_TIMESTAMP::timestamp) AS ok`,
      maria,
      other,
    );
    expect(ownRes.ok).toBe(true);
    expect(otherRes.ok).toBe(false);
  });

  it('a department-scoped manager can resolve contracts in both ICU units', async () => {
    const susan = Number((await one(`SELECT id FROM auth.users WHERE username = 'susan.lee'`)).id); // Nurse Manager, ICU dept
    const icuA = await contractId('CON-2025-0001');
    const icuB = await contractId('CON-2025-0005');
    const a: any = await one(`SELECT rbac.resource_in_scope($1, 'CONTRACT_MASTER', $2, CURRENT_TIMESTAMP::timestamp) AS ok`, susan, icuA);
    const b: any = await one(`SELECT rbac.resource_in_scope($1, 'CONTRACT_MASTER', $2, CURRENT_TIMESTAMP::timestamp) AS ok`, susan, icuB);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('refresh_expired_contracts flips an Active contract whose end_date passed', async () => {
    // Insert a temporary Active contract that is already past its end date.
    await q(`
      INSERT INTO nursing.contracts
        (contract_number, nurse_id, agency_id, position_id, nursing_unit_id,
         contract_type, status, start_date, end_date, created_by, updated_by)
      SELECT 'CON-TEST-EXPIRED', n.id, a.id, p.id, n.home_unit_id,
             'FixedTerm', 'Active', CURRENT_DATE - 400, CURRENT_DATE - 10, 1, 1
      FROM nursing.nurses n, nursing.contract_agencies a, nursing.positions p
      WHERE n.employee_number = 'EMP-1002' AND a.code = 'MOH' AND p.code = 'SN'
      ON CONFLICT (contract_number) DO NOTHING
    `);
    try {
      const ids: any[] = await q(`SELECT contract_id FROM nursing.refresh_expired_contracts()`);
      expect(ids.length).toBeGreaterThanOrEqual(1);
      const status: any = await one(`SELECT status FROM nursing.contracts WHERE contract_number = 'CON-TEST-EXPIRED'`);
      expect(status.status).toBe('Expired');
    } finally {
      await q(`DELETE FROM nursing.contracts WHERE contract_number = 'CON-TEST-EXPIRED'`);
    }
  });
});
