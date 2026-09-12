/**
 * Contracts Service - unit tests with in-memory fake Prisma.
 * Covers: auto contract-number, workflow (draft -> submit -> approve),
 * termination, renewal lineage, edit-after-activation guard, expiry listing,
 * and unique-conflict mapping (P2002 -> 409).
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContractsService } from './contracts.service';

const DAY = 86400000;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

class FakeAuditService {
  log = jest.fn().mockResolvedValue(undefined);
}

class FakePrisma {
  isMockMode = () => false;

  nurses: any[] = [
    { id: 1, employee_number: 'EMP-1001', job_no: 'JOB-1001', first_name: 'Maria', last_name: 'Garcia', home_unit_id: 1, deleted_at: null },
    { id: 4, employee_number: 'EMP-1004', job_no: 'JOB-1004', first_name: 'David', last_name: 'Kim', home_unit_id: 2, deleted_at: null },
  ];
  contracts: any[] = [];
  agencies = [
    { id: 1, code: 'MOH', name: 'Ministry of Health', category: 'Government' },
    { id: 2, code: 'SOP', name: 'Self-Operating Program', category: 'Program' },
  ];
  positions = [
    { id: 1, code: 'SN', name: 'Staff Nurse', category: 'Nursing' },
    { id: 2, code: 'HCA', name: 'Health Care Asst.', category: 'Support' },
  ];
  units = [
    { id: 1, code: 'ICU_A', name: 'ICU Unit A' },
    { id: 2, code: 'ICU_B', name: 'ICU Unit B' },
  ];

  private attach(rows: any[], include?: any) {
    return rows.map((r) => {
      const out = { ...r };
      if (include) {
        if (include.nurse) out.nurse = this.nurses.find((n) => n.id === r.nurse_id) || null;
        if (include.agency) out.agency = this.agencies.find((a) => a.id === r.agency_id) || null;
        if (include.position) out.position = this.positions.find((p) => p.id === r.position_id) || null;
        if (include.nursing_unit) out.nursing_unit = this.units.find((u) => u.id === r.nursing_unit_id) || null;
      }
      return out;
    });
  }

  nursing_nurses = {
    findUnique: async ({ where }: any) =>
      this.nurses.find((n) => n.id === where.id) || null,
  };

  nursing_positions = {
    findMany: async () => this.positions,
    findUnique: async ({ where }: any) => this.positions.find((p) => p.id === where.id) || null,
  };

  nursing_contract_agencies = {
    findMany: async ({ where }: any) => {
      let rows = this.agencies;
      if (where?.id?.in) rows = rows.filter((a) => where.id.in.includes(a.id));
      return rows;
    },
  };

  nursing_contracts = {
    findMany: async ({ where, include, skip = 0, take = 1000 }: any) => {
      let rows = this.contracts.filter((c) => !c.deleted_at);
      if (where?.status) {
        rows = where.status.in ? rows.filter((c) => where.status.in.includes(c.status)) : rows.filter((c) => c.status === where.status);
      }
      if (where?.contract_type) rows = rows.filter((c) => c.contract_type === where.contract_type);
      if (where?.agency_id) rows = rows.filter((c) => c.agency_id === where.agency_id);
      if (where?.nurse_id) rows = rows.filter((c) => c.nurse_id === where.nurse_id);
      if (where?.nurse?.home_unit_id) {
        const unitFilter = where.nurse.home_unit_id;
        rows = rows.filter((c) => {
          const n = this.nurses.find((x) => x.id === c.nurse_id);
          const unit = n?.home_unit_id;
          if (unitFilter.in) return unitFilter.in.includes(unit);
          return unit === unitFilter;
        });
      }
      if (where?.end_date?.gte) rows = rows.filter((c) => c.end_date && c.end_date >= where.end_date.gte);
      if (where?.end_date?.lte) rows = rows.filter((c) => c.end_date && c.end_date <= where.end_date.lte);
      if (where?.end_date?.lt) rows = rows.filter((c) => c.end_date && c.end_date < where.end_date.lt);
      return this.attach(rows.slice(skip, skip + take), include);
    },
    findFirst: async ({ where }: any) =>
      this.contracts.find((c) => c.contract_number === where.contract_number) || null,
    findUnique: async ({ where, include }: any) => {
      const row = this.contracts.find((c) => c.id === where.id);
      if (!row) return null;
      return this.attach([row], include)[0];
    },
    count: async ({ where }: any) => {
      const rows = await this.nursing_contracts.findMany({ where });
      return rows.length;
    },
    create: async ({ data, include }: any) => {
      if (this.contracts.some((c) => c.contract_number === data.contract_number)) {
        throw { code: 'P2002', meta: { target: ['contract_number'] } };
      }
      const row = {
        id: this.contracts.length + 1,
        contract_number: data.contract_number,
        nurse_id: data.nurse_id,
        agency_id: data.agency_id,
        position_id: data.position_id,
        nursing_unit_id: data.nursing_unit_id ?? null,
        contract_type: data.contract_type || 'FixedTerm',
        status: data.status || 'Draft',
        start_date: data.start_date,
        end_date: data.end_date ?? null,
        salary_amount: data.salary_amount ?? null,
        salary_currency: data.salary_currency ?? null,
        document_url: data.document_url ?? null,
        notes: data.notes ?? null,
        submitted_by: data.submitted_by ?? null,
        submitted_at: data.submitted_at ?? null,
        approved_by: data.approved_by ?? null,
        approved_at: data.approved_at ?? null,
        approval_notes: data.approval_notes ?? null,
        terminated_by: data.terminated_by ?? null,
        terminated_at: data.terminated_at ?? null,
        termination_reason: data.termination_reason ?? null,
        renewed_from_contract_id: data.renewed_from_contract_id ?? null,
        renewal_count: data.renewal_count ?? 0,
        created_by: data.created_by ?? null,
        updated_by: data.updated_by ?? null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      this.contracts.push(row);
      return this.attach([row], include)[0];
    },
    update: async ({ where, data, include }: any) => {
      const row = this.contracts.find((c) => c.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updated_at: new Date() });
      return this.attach([row], include)[0];
    },
  };
}

describe('ContractsService', () => {
  let service: ContractsService;
  let fake: FakePrisma;
  let audit: FakeAuditService;

  const baseDto = {
    nurse_id: 1,
    agency_id: 2,
    position_id: 1,
    contract_type: 'FixedTerm',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
  };

  beforeEach(() => {
    fake = new FakePrisma();
    audit = new FakeAuditService();
    service = new ContractsService(fake as any, audit as any);
  });

  it('creates a Draft contract with an auto-generated number and defaults the unit to the nurse home unit', async () => {
    const res = await service.createContract(baseDto, 1);
    expect(res.contract.status).toBe('Draft');
    expect(res.contract.contract_number).toMatch(/^CON-\d{4}-\d{5}$/);
    expect(res.contract.nursing_unit.id).toBe(1); // nurse home unit ICU_A
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONTRACT_CREATED' }));
  });

  it('rejects a duplicate contract number with 409', async () => {
    await service.createContract({ ...baseDto, contract_number: 'CON-X' }, 1);
    await expect(service.createContract({ ...baseDto, contract_number: 'CON-X' }, 1)).rejects.toThrow(
      ConflictException,
    );
  });

  it('walks Draft -> PendingApproval -> Active', async () => {
    const { contract } = await service.createContract(baseDto, 1);
    const submitted = await service.submitContract(contract.id, 1);
    expect(submitted.contract.status).toBe('PendingApproval');
    const approved = await service.approveContract(contract.id, 1, { approval_notes: 'ok' });
    expect(approved.contract.status).toBe('Active');
    expect(approved.contract.approval_notes).toBe('ok');
  });

  it('only approves PendingApproval contracts', async () => {
    const { contract } = await service.createContract(baseDto, 1);
    await expect(service.approveContract(contract.id, 1, {})).rejects.toThrow(ConflictException);
  });

  it('terminates an Active contract with a reason', async () => {
    const { contract } = await service.createContract(baseDto, 1);
    await service.submitContract(contract.id, 1);
    await service.approveContract(contract.id, 1, {});
    const done = await service.terminateContract(contract.id, 1, { termination_reason: 'Resigned' });
    expect(done.contract.status).toBe('Terminated');
    expect(done.contract.termination_reason).toBe('Resigned');
  });

  it('renews an Active contract into a chained successor and marks the predecessor Renewed', async () => {
    const { contract } = await service.createContract(baseDto, 1);
    await service.submitContract(contract.id, 1);
    await service.approveContract(contract.id, 1, {});
    const renewed = await service.renewContract(contract.id, 1, { end_date: '2028-01-01' });
    expect(renewed.contract.status).toBe('Active');
    expect(renewed.contract.renewal_count).toBe(1);
    expect(renewed.contract.renewed_from_contract_id).toBe(contract.id);

    const prev = await service.getContract(contract.id);
    expect(prev.contract.status).toBe('Renewed');
  });

  it('blocks core edits (dates/position) on an activated contract', async () => {
    const { contract } = await service.createContract(baseDto, 1);
    await service.submitContract(contract.id, 1);
    await service.approveContract(contract.id, 1, {});
    await expect(
      service.updateContract(contract.id, { end_date: '2030-01-01' }, 1),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to soft-delete an Active contract (terminate instead)', async () => {
    const { contract } = await service.createContract(baseDto, 1);
    await service.submitContract(contract.id, 1);
    await service.approveContract(contract.id, 1, {});
    await expect(service.softDeleteContract(contract.id, 1)).rejects.toThrow(ConflictException);
  });

  it('lists only Active contracts expiring within the window', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Active expiring soon, Active expiring later, Expired, Draft.
    fake.contracts = [
      { id: 1, contract_number: 'C1', nurse_id: 1, agency_id: 1, position_id: 1, nursing_unit_id: 1, contract_type: 'FixedTerm', status: 'Active', start_date: new Date(), end_date: new Date(today.getTime() + 30 * DAY), renewal_count: 0, deleted_at: null },
      { id: 2, contract_number: 'C2', nurse_id: 1, agency_id: 1, position_id: 1, nursing_unit_id: 1, contract_type: 'FixedTerm', status: 'Active', start_date: new Date(), end_date: new Date(today.getTime() + 400 * DAY), renewal_count: 0, deleted_at: null },
      { id: 3, contract_number: 'C3', nurse_id: 1, agency_id: 1, position_id: 1, nursing_unit_id: 1, contract_type: 'FixedTerm', status: 'Expired', start_date: new Date(today.getTime() - 800 * DAY), end_date: new Date(today.getTime() - DAY), renewal_count: 0, deleted_at: null },
      { id: 4, contract_number: 'C4', nurse_id: 1, agency_id: 1, position_id: 1, nursing_unit_id: 1, contract_type: 'Temporary', status: 'Draft', start_date: new Date(today.getTime() + DAY), end_date: new Date(today.getTime() + 400 * DAY), renewal_count: 0, deleted_at: null },
    ];

    const res = await service.listExpiringContracts(90, undefined);
    expect(res.items.map((c) => c.contract_number)).toEqual(['C1']);
  });

  it('throws 404 for an unknown contract', async () => {
    await expect(service.getContract(999)).rejects.toThrow(NotFoundException);
  });
});
