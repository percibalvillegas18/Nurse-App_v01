import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateContractDto,
  UpdateContractDto,
  ApproveContractDto,
  TerminateContractDto,
  RenewContractDto,
  EDITABLE_STATUSES,
} from './dto/contracts.dto';

/** Default renewal lead time in days (contracts expiring within this window). */
const DEFAULT_EXPIRING_DAYS = 90;

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==========================================================================
  // Query
  // ==========================================================================

  async listContracts(params: {
    search?: string;
    status?: string;
    agencyId?: number;
    nurseId?: number;
    unitId?: number;
    type?: string;
    page?: number;
    limit?: number;
    userId?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const where: any = { deleted_at: null };

    if (params.status) where.status = params.status;
    if (params.type) where.contract_type = params.type;
    if (params.agencyId) where.agency_id = params.agencyId;
    if (params.nurseId) where.nurse_id = params.nurseId;

    // Data scope: a caller only sees contracts whose nurse is in a unit their
    // scopes cover. null = unrestricted (mock/demo or internal call),
    // [] = no access.
    const visibleUnitIds = await this.getVisibleUnitIds(params.userId);
    if (visibleUnitIds !== null) {
      if (visibleUnitIds.length === 0) {
        return this.emptyPage(page, limit);
      }
      if (params.unitId) {
        if (!visibleUnitIds.includes(params.unitId)) {
          return this.emptyPage(page, limit);
        }
        where.nurse = { home_unit_id: params.unitId };
      } else {
        where.nurse = { home_unit_id: { in: visibleUnitIds } };
      }
    } else if (params.unitId) {
      where.nurse = { home_unit_id: params.unitId };
    }

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { contract_number: { contains: q, mode: 'insensitive' } },
        {
          nurse: {
            first_name: { contains: q, mode: 'insensitive' },
          },
        },
        {
          nurse: {
            last_name: { contains: q, mode: 'insensitive' },
          },
        },
        {
          nurse: {
            employee_number: { contains: q, mode: 'insensitive' },
          },
        },
        {
          nurse: {
            job_no: { contains: q, mode: 'insensitive' },
          },
        },
      ];
    }

    const db = this.db;
    const [rows, total] = await Promise.all([
      db.nursing_contracts.findMany({
        where,
        include: this.includeShape(),
        orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.nursing_contracts.count({ where }),
    ]);

    const items = (rows || []).map((r: any) => this.mapContractRow(r));
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getContract(id: number) {
    const row = await this.db.nursing_contracts.findUnique({
      where: { id },
      include: this.includeShape(),
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException(`Contract #${id} not found`);
    }
    return { contract: this.mapContractRow(row) };
  }

  async listExpiringContracts(days: number = DEFAULT_EXPIRING_DAYS, userId?: number) {
    const today = this.startOfToday();
    const cutoff = new Date(today.getTime() + days * 86400000);
    const where: any = {
      deleted_at: null,
      status: 'Active',
      end_date: { gte: today, lte: cutoff },
    };
    const visible = await this.getVisibleUnitIds(userId);
    if (visible !== null) {
      if (visible.length === 0) return { days, items: [] };
      where.nurse = { home_unit_id: { in: visible } };
    }

    const rows = await this.db.nursing_contracts.findMany({
      where,
      include: this.includeShape(),
      orderBy: [{ end_date: 'asc' }],
    });
    return { days, items: (rows || []).map((r: any) => this.mapContractRow(r)) };
  }

  async listExpiredContracts(userId?: number) {
    const today = this.startOfToday();
    const where: any = {
      deleted_at: null,
      end_date: { lt: today },
      status: { in: ['Active', 'Expired'] },
    };
    const visible = await this.getVisibleUnitIds(userId);
    if (visible !== null) {
      if (visible.length === 0) return { items: [] };
      where.nurse = { home_unit_id: { in: visible } };
    }

    const rows = await this.db.nursing_contracts.findMany({
      where,
      include: this.includeShape(),
      orderBy: [{ end_date: 'asc' }],
    });
    return { items: (rows || []).map((r: any) => this.mapContractRow(r)) };
  }

  async getContractSummary(userId?: number) {
    const where: any = { deleted_at: null };
    const visible = await this.getVisibleUnitIds(userId);
    if (visible !== null) {
      if (visible.length === 0) {
        return this.emptySummary();
      }
      where.nurse = { home_unit_id: { in: visible } };
    }

    const rows: any[] = await this.db.nursing_contracts.findMany({
      where,
      select: { status: true, contract_type: true, agency_id: true, end_date: true },
    });

    const today = this.startOfToday();
    const soonCutoff = new Date(today.getTime() + DEFAULT_EXPIRING_DAYS * 86400000);

    const summary = this.emptySummary();
    const byAgency = new Map<number, number>();

    for (const r of rows) {
      summary.total += 1;
      summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
      summary.byType[r.contract_type] = (summary.byType[r.contract_type] || 0) + 1;
      byAgency.set(Number(r.agency_id), (byAgency.get(Number(r.agency_id)) || 0) + 1);

      if (r.status === 'Active' && r.end_date) {
        const end = new Date(r.end_date);
        if (end < today) summary.expired += 1;
        else if (end <= soonCutoff) summary.expiringSoon += 1;
        else summary.active += 1;
      } else if (r.status === 'Active') {
        summary.active += 1;
      }
    }

    // Resolve agency codes for the byAgency map.
    const agencies: any[] = await this.db.nursing_contract_agencies.findMany({
      where: { id: { in: Array.from(byAgency.keys()) } },
      select: { id: true, code: true },
    });
    const codeById = new Map<number, string>(agencies.map((a) => [Number(a.id), a.code]));
    summary.byAgency = {};
    for (const [id, count] of byAgency.entries()) {
      summary.byAgency[codeById.get(id) || String(id)] = count;
    }

    return summary;
  }

  // ==========================================================================
  // Workflow: create -> submit -> approve -> renew/expire/terminate
  // ==========================================================================

  async createContract(dto: CreateContractDto, actorId: number) {
    const nurse = await this.db.nursing_nurses.findUnique({
      where: { id: dto.nurse_id },
      select: { id: true, home_unit_id: true, first_name: true, last_name: true },
    });
    if (!nurse || nurse.deleted_at) {
      throw new NotFoundException(`Nurse #${dto.nurse_id} not found`);
    }
    await this.assertNurseInScope(actorId, dto.nurse_id);

    // The contract covers the nurse's home unit unless overridden.
    const unitId = dto.nursing_unit_id ?? (nurse.home_unit_id ? Number(nurse.home_unit_id) : null);
    if (unitId != null) await this.assertUnitInScope(actorId, unitId);

    const start = new Date(dto.start_date);
    const end = dto.end_date ? new Date(dto.end_date) : null;
    if (end && end < start) {
      throw new ConflictException('Contract end date cannot be before its start date');
    }

    const contractNumber = (dto.contract_number || '').trim()
      ? dto.contract_number.trim()
      : await this.generateContractNumber();

    try {
      const created = await this.db.nursing_contracts.create({
        data: {
          contract_number: contractNumber,
          nurse_id: dto.nurse_id,
          agency_id: dto.agency_id,
          position_id: dto.position_id,
          nursing_unit_id: unitId,
          contract_type: dto.contract_type || 'FixedTerm',
          status: 'Draft',
          start_date: start,
          end_date: end,
          salary_amount: dto.salary_amount ?? null,
          salary_currency: dto.salary_currency ?? null,
          document_url: dto.document_url ?? null,
          notes: dto.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        },
        include: this.includeShape(),
      });

      await this.auditService.log({
        userId: actorId,
        action: 'CONTRACT_CREATED',
        entityType: 'Contract',
        entityId: created.id,
        entityCode: created.contract_number,
        description: `Contract ${created.contract_number} drafted for nurse #${dto.nurse_id}`,
        status: 'Success',
      });

      return { contract: this.mapContractRow(created) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        contract_number: `Contract number "${contractNumber}" is already used`,
      });
      throw error;
    }
  }

  async updateContract(id: number, dto: UpdateContractDto, actorId: number) {
    const current = await this.ensureContractExists(id);

    // Core (dates/position/agency/unit/type) edits are only allowed before
    // activation; on an activated contract only annotations/pay may change.
    const coreFields = [
      'agency_id',
      'position_id',
      'nursing_unit_id',
      'contract_type',
      'start_date',
      'end_date',
    ];
    const coreEditRequested = coreFields.some((f) => (dto as any)[f] !== undefined);
    if (coreEditRequested && !EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `Contract #${id} is ${current.status}; only notes, document and salary can be edited. ` +
          'Create a renewal to change dates or position.',
      );
    }

    if (dto.nursing_unit_id !== undefined) {
      await this.assertUnitInScope(actorId, dto.nursing_unit_id);
    }
    if (dto.position_id !== undefined) {
      // position is a lookup; nothing scope-sensitive to check beyond existence
      const pos = await this.db.nursing_positions.findUnique({ where: { id: dto.position_id } });
      if (!pos) throw new NotFoundException(`Position #${dto.position_id} not found`);
    }

    const start = dto.start_date !== undefined ? new Date(dto.start_date) : undefined;
    const end = dto.end_date !== undefined ? new Date(dto.end_date) : undefined;
    if (start !== undefined && end !== undefined && end < start) {
      throw new ConflictException('Contract end date cannot be before its start date');
    }

    try {
      const updated = await this.db.nursing_contracts.update({
        where: { id },
        data: {
          ...(dto.contract_number !== undefined && { contract_number: dto.contract_number.trim() }),
          ...(dto.agency_id !== undefined && { agency_id: dto.agency_id }),
          ...(dto.position_id !== undefined && { position_id: dto.position_id }),
          ...(dto.nursing_unit_id !== undefined && { nursing_unit_id: dto.nursing_unit_id }),
          ...(dto.contract_type !== undefined && { contract_type: dto.contract_type }),
          ...(start !== undefined && { start_date: start }),
          ...(end !== undefined && { end_date: end }),
          ...(dto.salary_amount !== undefined && { salary_amount: dto.salary_amount }),
          ...(dto.salary_currency !== undefined && { salary_currency: dto.salary_currency }),
          ...(dto.document_url !== undefined && { document_url: dto.document_url }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          updated_by: actorId,
        },
        include: this.includeShape(),
      });

      await this.auditService.log({
        userId: actorId,
        action: 'CONTRACT_UPDATED',
        entityType: 'Contract',
        entityId: id,
        description: `Contract #${id} updated`,
        changes: dto as any,
        status: 'Success',
      });

      return { contract: this.mapContractRow(updated) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        contract_number: `Contract number "${dto.contract_number}" is already used`,
      });
      throw error;
    }
  }

  async submitContract(id: number, actorId: number) {
    const current = await this.ensureContractExists(id);
    if (current.status !== 'Draft') {
      throw new ConflictException(`Only a Draft contract can be submitted (current: ${current.status})`);
    }
    const updated = await this.db.nursing_contracts.update({
      where: { id },
      data: { status: 'PendingApproval', submitted_by: actorId, submitted_at: new Date(), updated_by: actorId },
      include: this.includeShape(),
    });
    await this.auditService.log({
      userId: actorId,
      action: 'CONTRACT_SUBMITTED',
      entityType: 'Contract',
      entityId: id,
      description: `Contract #${id} submitted for approval`,
      status: 'Success',
    });
    return { contract: this.mapContractRow(updated) };
  }

  async approveContract(id: number, actorId: number, dto: ApproveContractDto) {
    const current = await this.ensureContractExists(id);
    if (current.status !== 'PendingApproval') {
      throw new ConflictException(`Only a PendingApproval contract can be approved (current: ${current.status})`);
    }
    const updated = await this.db.nursing_contracts.update({
      where: { id },
      data: {
        status: 'Active',
        approved_by: actorId,
        approved_at: new Date(),
        approval_notes: dto.approval_notes ?? null,
        updated_by: actorId,
      },
      include: this.includeShape(),
    });
    await this.auditService.log({
      userId: actorId,
      action: 'CONTRACT_APPROVED',
      entityType: 'Contract',
      entityId: id,
      description: `Contract #${id} approved and activated`,
      status: 'Success',
    });
    return { contract: this.mapContractRow(updated) };
  }

  async terminateContract(id: number, actorId: number, dto: TerminateContractDto) {
    const current = await this.ensureContractExists(id);
    if (!['Draft', 'PendingApproval', 'Active'].includes(current.status)) {
      throw new ConflictException(`Contract #${id} is already ${current.status}`);
    }
    const updated = await this.db.nursing_contracts.update({
      where: { id },
      data: {
        status: 'Terminated',
        terminated_by: actorId,
        terminated_at: new Date(),
        termination_reason: dto.termination_reason,
        updated_by: actorId,
      },
      include: this.includeShape(),
    });
    await this.auditService.log({
      userId: actorId,
      action: 'CONTRACT_TERMINATED',
      entityType: 'Contract',
      entityId: id,
      description: `Contract #${id} terminated: ${dto.termination_reason}`,
      status: 'Success',
    });
    return { contract: this.mapContractRow(updated) };
  }

  /**
   * Renewal creates a successor contract chained to the predecessor (which is
   * marked Renewed). This keeps every renewal as its own document + audit
   * record while leaving exactly one Active contract.
   */
  async renewContract(id: number, actorId: number, dto: RenewContractDto) {
    const current = await this.ensureContractExists(id);
    if (!['Active', 'Expired'].includes(current.status)) {
      throw new ConflictException(
        `Only an Active or Expired contract can be renewed (current: ${current.status})`,
      );
    }

    const oldEnd = current.end_date ? new Date(current.end_date) : null;
    const start = dto.start_date
      ? new Date(dto.start_date)
      : oldEnd
        ? new Date(oldEnd.getTime() + 86400000)
        : this.startOfToday();
    const end = dto.end_date ? new Date(dto.end_date) : null;
    if (end && end < start) {
      throw new ConflictException('Renewal end date cannot be before its start date');
    }

    const contractNumber = await this.generateContractNumber();

    try {
      const created = await this.db.nursing_contracts.create({
        data: {
          contract_number: contractNumber,
          nurse_id: Number(current.nurse_id),
          agency_id: Number(current.agency_id),
          position_id: Number(current.position_id),
          nursing_unit_id: current.nursing_unit_id ? Number(current.nursing_unit_id) : null,
          contract_type: current.contract_type,
          status: 'Active',
          start_date: start,
          end_date: end,
          salary_amount: dto.salary_amount ?? current.salary_amount ?? null,
          salary_currency: current.salary_currency ?? null,
          document_url: dto.document_url ?? null,
          notes: dto.notes ?? null,
          renewed_from_contract_id: id,
          renewal_count: Number(current.renewal_count || 0) + 1,
          created_by: actorId,
          updated_by: actorId,
        },
        include: this.includeShape(),
      });

      await this.db.nursing_contracts.update({
        where: { id },
        data: { status: 'Renewed', updated_by: actorId },
      });

      await this.auditService.log({
        userId: actorId,
        action: 'CONTRACT_RENEWED',
        entityType: 'Contract',
        entityId: id,
        entityCode: current.contract_number,
        description: `Contract ${current.contract_number} renewed into ${contractNumber}`,
        status: 'Success',
      });

      return { contract: this.mapContractRow(created), previous_contract_id: id };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        contract_number: `Contract number "${contractNumber}" is already used`,
      });
      throw error;
    }
  }

  async softDeleteContract(id: number, actorId: number) {
    const current = await this.ensureContractExists(id);
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `Contract #${id} is ${current.status}; it cannot be deleted - terminate it instead`,
      );
    }
    await this.db.nursing_contracts.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: actorId },
    });
    await this.auditService.log({
      userId: actorId,
      action: 'CONTRACT_DELETED',
      entityType: 'Contract',
      entityId: id,
      description: `Contract #${id} soft-deleted`,
      status: 'Success',
    });
    return { message: `Contract #${id} deleted` };
  }

  // ==========================================================================
  // Lookups (reference data for forms)
  // ==========================================================================

  async getLookups() {
    const [agencies, positions] = await Promise.all([
      this.db.nursing_contract_agencies.findMany({
        where: { status: 'Active' },
        select: { id: true, code: true, name: true, category: true },
        orderBy: { code: 'asc' },
      }),
      this.db.nursing_positions.findMany({
        where: { status: 'Active' },
        select: { id: true, code: true, name: true, category: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return { agencies: agencies || [], positions: positions || [] };
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  /** Typed accessor - the generated Prisma client may predate these models. */
  private get db(): any {
    return this.prisma as any;
  }

  private includeShape(): any {
    return {
      nurse: { select: { id: true, employee_number: true, job_no: true, first_name: true, last_name: true } },
      agency: { select: { id: true, code: true, name: true, category: true } },
      position: { select: { id: true, code: true, name: true, category: true } },
      nursing_unit: { select: { id: true, code: true, name: true } },
    };
  }

  private async ensureContractExists(id: number): Promise<any> {
    const row = await this.db.nursing_contracts.findUnique({ where: { id } });
    if (!row || row.deleted_at) throw new NotFoundException(`Contract #${id} not found`);
    return row;
  }

  private mapContractRow(r: any) {
    return {
      id: Number(r.id),
      contract_number: r.contract_number,
      nurse: r.nurse
        ? {
            id: Number(r.nurse.id),
            employee_number: r.nurse.employee_number,
            job_no: r.nurse.job_no,
            first_name: r.nurse.first_name,
            last_name: r.nurse.last_name,
          }
        : null,
      agency: r.agency || null,
      position: r.position || null,
      nursing_unit: r.nursing_unit || null,
      contract_type: r.contract_type,
      status: r.status,
      start_date: r.start_date ? this.toDateOnly(new Date(r.start_date)) : null,
      end_date: r.end_date ? this.toDateOnly(new Date(r.end_date)) : null,
      salary_amount: r.salary_amount !== null && r.salary_amount !== undefined ? Number(r.salary_amount) : null,
      salary_currency: r.salary_currency || null,
      document_url: r.document_url || null,
      notes: r.notes || null,
      submitted_by: r.submitted_by ? Number(r.submitted_by) : null,
      submitted_at: r.submitted_at || null,
      approved_by: r.approved_by ? Number(r.approved_by) : null,
      approved_at: r.approved_at || null,
      approval_notes: r.approval_notes || null,
      terminated_by: r.terminated_by ? Number(r.terminated_by) : null,
      terminated_at: r.terminated_at || null,
      termination_reason: r.termination_reason || null,
      renewed_from_contract_id: r.renewed_from_contract_id ? Number(r.renewed_from_contract_id) : null,
      renewal_count: Number(r.renewal_count || 0),
      created_at: r.created_at || null,
      updated_at: r.updated_at || null,
    };
  }

  private emptyPage(page: number, limit: number) {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    };
  }

  private emptySummary() {
    return {
      total: 0,
      active: 0,
      expiringSoon: 0,
      expired: 0,
      byStatus: {},
      byType: {},
      byAgency: {},
    };
  }

  private async generateContractNumber(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `CON-${year}-${String(10000 + Math.floor(Math.random() * 90000))}`;
      const existing = await this.db.nursing_contracts.findFirst({
        where: { contract_number: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    return `CON-${year}-${Date.now()}`;
  }

  // ==========================================================================
  // Data-scope helpers (mirrors NursingService)
  // ==========================================================================

  private isScopeCheckDisabled(): boolean {
    const prisma: any = this.prisma;
    if (typeof prisma.isMockMode === 'function' && prisma.isMockMode()) return true;
    return typeof prisma.$queryRawUnsafe !== 'function';
  }

  private async getVisibleUnitIds(userId?: number): Promise<number[] | null> {
    if (userId == null) return null;
    if (this.isScopeCheckDisabled()) return null;
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT nursing_unit_id FROM rbac.get_user_visible_unit_ids($1)`,
      userId,
    )) as Array<{ nursing_unit_id: bigint | number }>;
    return rows.map((r) => Number(r.nursing_unit_id));
  }

  private async assertUnitInScope(userId: number, unitId?: number | null): Promise<void> {
    if (userId == null || unitId == null) return;
    const visible = await this.getVisibleUnitIds(userId);
    if (visible === null) return;
    if (!visible.includes(Number(unitId))) {
      throw new ForbiddenException('Nursing unit is outside your data scope');
    }
  }

  private async assertNurseInScope(userId: number, nurseId: number): Promise<void> {
    if (userId == null || nurseId == null) return;
    if (this.isScopeCheckDisabled()) return;
    const row = await this.db.nursing_nurses.findUnique({
      where: { id: nurseId },
      select: { home_unit_id: true },
    });
    if (!row || row.home_unit_id == null) {
      throw new ForbiddenException('Nurse is outside your data scope');
    }
    await this.assertUnitInScope(userId, Number(row.home_unit_id));
  }

  private throwIfUniqueViolation(error: any, messages: Record<string, string>): never | void {
    if (error?.code !== 'P2002') return;
    const target: string = Array.isArray(error?.meta?.target)
      ? error.meta.target.join(',')
      : String(error?.meta?.target || '');
    for (const [key, message] of Object.entries(messages)) {
      if (target.includes(key)) throw new ConflictException(message);
    }
    throw new ConflictException('A record with the same unique value already exists');
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private toDateOnly(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
