import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateContractDto,
  UpdateContractDto,
  TerminateContractDto,
  RenewContractDto,
  AddContractDocumentDto,
} from './dto/contracts.dto';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private mapContract(row: any) {
    if (!row) return null;
    return {
      id: Number(row.id),
      contractNumber: row.contract_number,
      nurseId: Number(row.nurse_id),
      jobNo: row.job_no,
      positionId: row.position_id != null ? Number(row.position_id) : null,
      agencyId: Number(row.agency_id),
      nursingUnitId: row.nursing_unit_id != null ? Number(row.nursing_unit_id) : null,
      departmentId: row.department_id != null ? Number(row.department_id) : null,
      contractType: row.contract_type,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      probationEndDate: row.probation_end_date,
      renewalOfId: row.renewal_of_id != null ? Number(row.renewal_of_id) : null,
      notes: row.notes,
      activatedAt: row.activated_at,
      terminatedAt: row.terminated_at,
      terminationReason: row.termination_reason,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nurse: row.nurse
        ? {
            id: Number(row.nurse.id),
            employeeNumber: row.nurse.employee_number,
            jobNo: row.nurse.job_no,
            firstName: row.nurse.first_name,
            lastName: row.nurse.last_name,
            fullName: [row.nurse.first_name, row.nurse.middle_name, row.nurse.last_name]
              .filter(Boolean)
              .join(' '),
          }
        : undefined,
      agency: row.agency
        ? {
            id: Number(row.agency.id),
            code: row.agency.code,
            name: row.agency.name,
            agencyType: row.agency.agency_type,
          }
        : undefined,
      position: row.position
        ? {
            id: Number(row.position.id),
            code: row.position.code,
            name: row.position.name,
          }
        : undefined,
    };
  }

  private async transition(
    id: number,
    toStatus: string,
    userId: number,
    reason?: string,
    extra: Record<string, any> = {},
  ) {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM nursing.employment_contracts WHERE id = $1`,
      id,
    );
    if (!existing?.length) throw new NotFoundException(`Contract ${id} not found`);
    const row = existing[0];
    const from = row.status;

    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET
         status = $2,
         updated_by = $3,
         updated_at = CURRENT_TIMESTAMP
         ${extra.sql || ''}
       WHERE id = $1`,
      id,
      toStatus,
      userId,
      ...(extra.params || []),
    );

    // Simpler: dedicated updates per action below rather than dynamic SQL
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO nursing.contract_status_history
         (contract_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      id,
      from,
      toStatus,
      reason || null,
      userId,
    );

    await this.audit.log({
      userId,
      action: `CONTRACT_${toStatus.toUpperCase()}`,
      entityType: 'EmploymentContract',
      entityId: id,
      description: `Contract ${row.contract_number}: ${from} → ${toStatus}`,
      reason,
      status: 'Success',
    });

    return this.getById(id);
  }

  async list(filters: {
    search?: string;
    status?: string;
    agencyId?: number;
    nurseId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let i = 1;

    if (filters.status) {
      conditions.push(`c.status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.agencyId) {
      conditions.push(`c.agency_id = $${i++}`);
      params.push(filters.agencyId);
    }
    if (filters.nurseId) {
      conditions.push(`c.nurse_id = $${i++}`);
      params.push(filters.nurseId);
    }
    if (filters.search) {
      conditions.push(
        `(c.contract_number ILIKE $${i} OR c.job_no ILIKE $${i} OR n.first_name ILIKE $${i} OR n.last_name ILIKE $${i})`,
      );
      params.push(`%${filters.search}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS cnt
       FROM nursing.employment_contracts c
       JOIN nursing.nurses n ON n.id = c.nurse_id
       WHERE ${where}`,
      ...params,
    );
    const total = countRows[0]?.cnt || 0;

    params.push(limit, offset);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*,
              row_to_json(n.*) AS nurse,
              row_to_json(a.*) AS agency,
              row_to_json(p.*) AS position
       FROM nursing.employment_contracts c
       JOIN nursing.nurses n ON n.id = c.nurse_id
       JOIN nursing.contract_agencies a ON a.id = c.agency_id
       LEFT JOIN nursing.positions p ON p.id = c.position_id
       WHERE ${where}
       ORDER BY c.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      ...params,
    );

    // Normalize nested json keys from row_to_json (snake_case)
    const items = rows.map((r) => {
      const nurse = r.nurse
        ? {
            id: r.nurse.id,
            employee_number: r.nurse.employee_number,
            job_no: r.nurse.job_no,
            first_name: r.nurse.first_name,
            middle_name: r.nurse.middle_name,
            last_name: r.nurse.last_name,
          }
        : null;
      return this.mapContract({ ...r, nurse, agency: r.agency, position: r.position });
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getById(id: number) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*,
              row_to_json(n.*) AS nurse,
              row_to_json(a.*) AS agency,
              row_to_json(p.*) AS position
       FROM nursing.employment_contracts c
       JOIN nursing.nurses n ON n.id = c.nurse_id
       JOIN nursing.contract_agencies a ON a.id = c.agency_id
       LEFT JOIN nursing.positions p ON p.id = c.position_id
       WHERE c.id = $1`,
      id,
    );
    if (!rows?.length) throw new NotFoundException(`Contract ${id} not found`);
    const r = rows[0];
    return this.mapContract({
      ...r,
      nurse: r.nurse,
      agency: r.agency,
      position: r.position,
    });
  }

  async listAgencies() {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, code, name, name_ar, description, agency_type, status
       FROM nursing.contract_agencies WHERE status = 'Active' ORDER BY code`,
    );
    return rows.map((a) => ({
      id: Number(a.id),
      code: a.code,
      name: a.name,
      nameAr: a.name_ar,
      description: a.description,
      agencyType: a.agency_type,
      status: a.status,
    }));
  }

  async listPositions() {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, code, name, category, status FROM nursing.positions
       WHERE status = 'Active' ORDER BY code`,
    );
    return rows.map((p) => ({
      id: Number(p.id),
      code: p.code,
      name: p.name,
      category: p.category,
      status: p.status,
    }));
  }

  async listExpiring(days = 90) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, row_to_json(n.*) AS nurse, row_to_json(a.*) AS agency
       FROM nursing.employment_contracts c
       JOIN nursing.nurses n ON n.id = c.nurse_id
       JOIN nursing.contract_agencies a ON a.id = c.agency_id
       WHERE c.status = 'Active'
         AND c.end_date IS NOT NULL
         AND c.end_date <= CURRENT_DATE + ($1 || ' days')::interval
         AND c.end_date >= CURRENT_DATE
       ORDER BY c.end_date ASC`,
      String(days),
    );
    return rows.map((r) => this.mapContract({ ...r, nurse: r.nurse, agency: r.agency }));
  }

  async create(dto: CreateContractDto, userId: number) {
    const nurses = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, job_no, home_unit_id FROM nursing.nurses WHERE id = $1 AND deleted_at IS NULL`,
      dto.nurseId,
    );
    if (!nurses?.length) throw new NotFoundException('Nurse not found');
    const nurse = nurses[0];

    if (dto.endDate && dto.startDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const contractNumber =
      dto.contractNumber?.trim() ||
      `CTR-${Date.now().toString(36).toUpperCase()}-${dto.nurseId}`;

    try {
      const inserted = await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO nursing.employment_contracts (
           contract_number, nurse_id, job_no, position_id, agency_id,
           nursing_unit_id, department_id, contract_type, status,
           start_date, end_date, probation_end_date, notes, created_by, updated_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,'Draft',$9,$10,$11,$12,$13,$13
         ) RETURNING id`,
        contractNumber,
        dto.nurseId,
        nurse.job_no,
        dto.positionId ?? null,
        dto.agencyId,
        dto.nursingUnitId ?? nurse.home_unit_id ?? null,
        dto.departmentId ?? null,
        dto.contractType,
        dto.startDate,
        dto.endDate ?? null,
        dto.probationEndDate ?? null,
        dto.notes ?? null,
        userId,
      );
      const id = Number(inserted[0].id);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO nursing.contract_status_history
           (contract_id, from_status, to_status, reason, changed_by)
         VALUES ($1, NULL, 'Draft', 'Created', $2)`,
        id,
        userId,
      );
      await this.audit.log({
        userId,
        action: 'CONTRACT_CREATED',
        entityType: 'EmploymentContract',
        entityId: id,
        description: `Created contract ${contractNumber}`,
        status: 'Success',
      });
      return this.getById(id);
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new ConflictException(`Contract number "${contractNumber}" already exists`);
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateContractDto, userId: number) {
    const current = await this.getById(id);
    if (!['Draft', 'PendingApproval', 'Suspended'].includes(current.status)) {
      throw new BadRequestException(
        `Cannot edit contract in status ${current.status}; only Draft, PendingApproval, or Suspended`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET
         position_id = COALESCE($2, position_id),
         agency_id = COALESCE($3, agency_id),
         nursing_unit_id = COALESCE($4, nursing_unit_id),
         department_id = COALESCE($5, department_id),
         contract_type = COALESCE($6, contract_type),
         start_date = COALESCE($7::date, start_date),
         end_date = CASE WHEN $8::text = '__CLEAR__' THEN NULL
                         WHEN $8::text IS NULL THEN end_date
                         ELSE $8::date END,
         probation_end_date = CASE WHEN $9::text = '__CLEAR__' THEN NULL
                                   WHEN $9::text IS NULL THEN probation_end_date
                                   ELSE $9::date END,
         notes = COALESCE($10, notes),
         updated_by = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id,
      dto.positionId ?? null,
      dto.agencyId ?? null,
      dto.nursingUnitId ?? null,
      dto.departmentId ?? null,
      dto.contractType ?? null,
      dto.startDate ?? null,
      dto.endDate === null ? '__CLEAR__' : dto.endDate ?? null,
      dto.probationEndDate === null ? '__CLEAR__' : dto.probationEndDate ?? null,
      dto.notes ?? null,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'CONTRACT_UPDATED',
      entityType: 'EmploymentContract',
      entityId: id,
      description: `Updated contract ${current.contractNumber}`,
      status: 'Success',
    });
    return this.getById(id);
  }

  async submit(id: number, userId: number) {
    const c = await this.getById(id);
    if (c.status !== 'Draft') {
      throw new BadRequestException('Only Draft contracts can be submitted');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET status = 'PendingApproval', updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      id,
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO nursing.contract_status_history (contract_id, from_status, to_status, reason, changed_by)
       VALUES ($1, 'Draft', 'PendingApproval', 'Submitted for approval', $2)`,
      id,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'CONTRACT_SUBMITTED',
      entityType: 'EmploymentContract',
      entityId: id,
      status: 'Success',
    });
    return this.getById(id);
  }

  async approve(id: number, userId: number) {
    const c = await this.getById(id);
    if (c.status !== 'PendingApproval' && c.status !== 'Draft') {
      throw new BadRequestException('Only Draft or PendingApproval contracts can be approved');
    }
    const from = c.status;
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET
         status = 'Active',
         approved_at = CURRENT_TIMESTAMP,
         approved_by = $2,
         activated_at = CURRENT_TIMESTAMP,
         activated_by = $2,
         updated_by = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id,
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO nursing.contract_status_history (contract_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, 'Active', 'Approved and activated', $3)`,
      id,
      from,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'CONTRACT_APPROVED',
      entityType: 'EmploymentContract',
      entityId: id,
      status: 'Success',
    });
    return this.getById(id);
  }

  async activate(id: number, userId: number) {
    return this.approve(id, userId);
  }

  async suspend(id: number, userId: number, reason?: string) {
    const c = await this.getById(id);
    if (c.status !== 'Active') {
      throw new BadRequestException('Only Active contracts can be suspended');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET status = 'Suspended', updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      id,
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO nursing.contract_status_history (contract_id, from_status, to_status, reason, changed_by)
       VALUES ($1, 'Active', 'Suspended', $2, $3)`,
      id,
      reason || 'Suspended',
      userId,
    );
    await this.audit.log({
      userId,
      action: 'CONTRACT_SUSPENDED',
      entityType: 'EmploymentContract',
      entityId: id,
      reason,
      status: 'Success',
    });
    return this.getById(id);
  }

  async terminate(id: number, dto: TerminateContractDto, userId: number) {
    const c = await this.getById(id);
    if (!['Active', 'Suspended', 'PendingApproval'].includes(c.status)) {
      throw new BadRequestException(`Cannot terminate contract in status ${c.status}`);
    }
    const from = c.status;
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET
         status = 'Terminated',
         terminated_at = CURRENT_TIMESTAMP,
         terminated_by = $2,
         termination_reason = $3,
         updated_by = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id,
      userId,
      dto.reason,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO nursing.contract_status_history (contract_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, 'Terminated', $3, $4)`,
      id,
      from,
      dto.reason,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'CONTRACT_TERMINATED',
      entityType: 'EmploymentContract',
      entityId: id,
      reason: dto.reason,
      status: 'Success',
    });
    return this.getById(id);
  }

  async renew(id: number, dto: RenewContractDto, userId: number) {
    const prior = await this.getById(id);
    if (!['Active', 'Expired', 'Suspended'].includes(prior.status)) {
      throw new BadRequestException('Only Active, Expired, or Suspended contracts can be renewed');
    }
    const created = await this.create(
      {
        nurseId: prior.nurseId,
        agencyId: dto.agencyId ?? prior.agencyId,
        positionId: dto.positionId ?? prior.positionId ?? undefined,
        nursingUnitId: prior.nursingUnitId ?? undefined,
        departmentId: prior.departmentId ?? undefined,
        contractType: dto.contractType ?? prior.contractType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        notes: dto.notes ?? `Renewal of ${prior.contractNumber}`,
      },
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET renewal_of_id = $2 WHERE id = $1`,
      created.id,
      id,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE nursing.employment_contracts SET status = 'Superseded', updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      id,
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO nursing.contract_status_history (contract_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, 'Superseded', $3, $4)`,
      id,
      prior.status,
      `Superseded by renewal contract ${created.contractNumber}`,
      userId,
    );
    return this.getById(created.id);
  }

  async history(id: number) {
    await this.getById(id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, from_status, to_status, reason, changed_by, changed_at
       FROM nursing.contract_status_history WHERE contract_id = $1
       ORDER BY changed_at ASC`,
      id,
    );
    return rows.map((h) => ({
      id: Number(h.id),
      fromStatus: h.from_status,
      toStatus: h.to_status,
      reason: h.reason,
      changedBy: h.changed_by != null ? Number(h.changed_by) : null,
      changedAt: h.changed_at,
    }));
  }

  async listDocuments(id: number) {
    await this.getById(id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM nursing.contract_documents WHERE contract_id = $1 AND status = 'Active'
       ORDER BY uploaded_at DESC`,
      id,
    );
    return rows.map((d) => ({
      id: Number(d.id),
      contractId: Number(d.contract_id),
      docType: d.doc_type,
      title: d.title,
      fileName: d.file_name,
      storageRef: d.storage_ref,
      mimeType: d.mime_type,
      notes: d.notes,
      uploadedBy: d.uploaded_by != null ? Number(d.uploaded_by) : null,
      uploadedAt: d.uploaded_at,
    }));
  }

  async addDocument(id: number, dto: AddContractDocumentDto, userId: number) {
    await this.getById(id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO nursing.contract_documents
         (contract_id, doc_type, title, file_name, storage_ref, mime_type, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      id,
      dto.docType,
      dto.title ?? null,
      dto.fileName ?? null,
      dto.storageRef ?? null,
      dto.mimeType ?? null,
      dto.notes ?? null,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'CONTRACT_DOCUMENT_ADDED',
      entityType: 'EmploymentContract',
      entityId: id,
      description: `Document ${dto.docType} added`,
      status: 'Success',
    });
    return this.listDocuments(id).then((docs) => docs.find((d) => d.id === Number(rows[0].id)));
  }

  /** Used by roster: nurse must have Active contract covering the date. */
  async nurseHasValidContract(nurseId: number, onDate: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT nursing.nurse_has_valid_contract($1, $2::date) AS ok`,
      nurseId,
      onDate,
    );
    return !!rows[0]?.ok;
  }
}
