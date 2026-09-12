import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateNurseDto,
  UpdateNurseDto,
  CreateCredentialDto,
  UpdateCredentialDto,
  VerifyCredentialDto,
  CreateRosterAssignmentDto,
  UpdateRosterAssignmentDto,
} from './dto/nursing.dto';

/** Days before expiry at which a credential counts as "expiring soon". */
const EXPIRING_SOON_DAYS = 30;

/** ISO countries for the Nationality selector (display names). */
export const COUNTRIES: string[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
  'Comoros', 'Congo (Brazzaville)', 'Congo (Kinshasa)', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
  'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
  'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland',
  'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica',
  'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands',
  'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru',
  'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe',
];

@Injectable()
export class NursingService {
  private readonly logger = new Logger(NursingService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==========================================================================
  // Nurses
  // ==========================================================================

  async listNurses(params: {
    search?: string;
    status?: string;
    unitId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const where: any = { deleted_at: null };

    if (params.status) where.status = params.status;
    if (params.unitId) where.home_unit_id = params.unitId;
    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { first_name: { contains: q, mode: 'insensitive' } },
        { middle_name: { contains: q, mode: 'insensitive' } },
        { last_name: { contains: q, mode: 'insensitive' } },
        { employee_number: { contains: q, mode: 'insensitive' } },
        { job_no: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.nursing_nurses.findMany({
        where,
        include: {
          primary_role: { select: { id: true, code: true, name: true } },
          home_unit: { select: { id: true, code: true, name: true } },
          user: { select: { username: true, email: true } },
          credentials: {
            where: { deleted_at: null },
            select: { status: true, expiry_date: true },
          },
        },
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.nursing_nurses.count({ where }),
    ]);

    const items = (rows || []).map((r: any) => this.mapNurseRow(r));
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

  async getNurse(id: number) {
    const row = await this.prisma.nursing_nurses.findUnique({
      where: { id },
      include: {
        primary_role: { select: { id: true, code: true, name: true } },
        home_unit: { select: { id: true, code: true, name: true } },
        user: { select: { username: true, email: true } },
        credentials: {
          where: { deleted_at: null },
          orderBy: { expiry_date: 'asc' },
        },
        roster_assignments: {
          where: { deleted_at: null, assignment_date: { gte: this.startOfToday() } },
          include: {
            nursing_unit: { select: { id: true, code: true, name: true } },
            shift: { select: { id: true, code: true, name: true } },
            post: { select: { id: true, code: true, name: true } },
          },
          orderBy: { assignment_date: 'asc' },
          take: 14,
        },
      },
    });

    if (!row || row.deleted_at) {
      throw new NotFoundException(`Nurse #${id} not found`);
    }

    return {
      nurse: {
        ...this.mapNurseRow(row),
        credentials: (row.credentials || []).map((c: any) => this.mapCredentialRow(c)),
        upcomingAssignments: (row.roster_assignments || []).map((a: any) =>
          this.mapRosterRow(a),
        ),
      },
    };
  }

  async createNurse(dto: CreateNurseDto, actorId: number) {
    // Employee number is not entered by the user in the personal-info form -
    // auto-generate a unique one (can be edited later in the employment group).
    if (!dto.employee_number) {
      dto.employee_number = await this.generateEmployeeNumber();
    }
    // Job No. is typed by the user, so normalise it before the uniqueness check.
    const jobNo = dto.job_no.trim();
    try {
      const created = await this.prisma.nursing_nurses.create({
        data: {
          employee_number: dto.employee_number,
          job_no: jobNo,
          user_id: dto.user_id ?? null,
          first_name: dto.first_name,
          middle_name: dto.middle_name ?? null,
          last_name: dto.last_name,
          gender: dto.gender ?? null,
          date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          nationality: dto.nationality ?? null,
          phone: dto.phone ?? null,
          hire_date: dto.hire_date ? new Date(dto.hire_date) : null,
          employment_type: dto.employment_type || 'FullTime',
          primary_role_id: dto.primary_role_id ?? null,
          home_unit_id: dto.home_unit_id ?? null,
          created_by: actorId,
          updated_by: actorId,
        },
        include: {
          primary_role: { select: { id: true, code: true, name: true } },
          home_unit: { select: { id: true, code: true, name: true } },
          user: { select: { username: true, email: true } },
          credentials: { where: { deleted_at: null } },
        },
      });

      await this.auditService.log({
        userId: actorId,
        action: 'NURSE_CREATED',
        entityType: 'Nurse',
        entityId: created.id,
        entityCode: created.employee_number,
        description: `Nurse created: ${created.first_name} ${created.last_name} (${created.employee_number})`,
        status: 'Success',
      });

      return { nurse: this.mapNurseRow(created) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        job_no: `Job No. "${jobNo}" is already used by another nurse`,
        employee_number: `Employee number "${dto.employee_number}" already exists`,
        user_id: 'That login account is already linked to another nurse record',
      });
      throw error;
    }
  }

  async updateNurse(id: number, dto: UpdateNurseDto, actorId: number) {
    await this.ensureNurseExists(id);
    try {
      const updated = await this.prisma.nursing_nurses.update({
        where: { id },
        data: {
          ...(dto.job_no !== undefined && { job_no: dto.job_no.trim() }),
          ...(dto.employee_number !== undefined && { employee_number: dto.employee_number }),
          ...(dto.user_id !== undefined && { user_id: dto.user_id }),
          ...(dto.first_name !== undefined && { first_name: dto.first_name }),
          ...(dto.middle_name !== undefined && { middle_name: dto.middle_name }),
          ...(dto.last_name !== undefined && { last_name: dto.last_name }),
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.date_of_birth !== undefined && {
            date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          }),
          ...(dto.nationality !== undefined && { nationality: dto.nationality }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.hire_date !== undefined && {
            hire_date: dto.hire_date ? new Date(dto.hire_date) : null,
          }),
          ...(dto.employment_type !== undefined && { employment_type: dto.employment_type }),
          ...(dto.primary_role_id !== undefined && { primary_role_id: dto.primary_role_id }),
          ...(dto.home_unit_id !== undefined && { home_unit_id: dto.home_unit_id }),
          ...(dto.status !== undefined && { status: dto.status }),
          updated_by: actorId,
        },
        include: {
          primary_role: { select: { id: true, code: true, name: true } },
          home_unit: { select: { id: true, code: true, name: true } },
          user: { select: { username: true, email: true } },
          credentials: { where: { deleted_at: null } },
        },
      });

      await this.auditService.log({
        userId: actorId,
        action: 'NURSE_UPDATED',
        entityType: 'Nurse',
        entityId: id,
        description: `Nurse #${id} updated`,
        changes: dto as any,
        status: 'Success',
      });

      return { nurse: this.mapNurseRow(updated) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        job_no: `Job No. "${(dto.job_no || '').trim()}" is already used by another nurse`,
        employee_number: `Employee number "${dto.employee_number}" already exists`,
        user_id: 'That login account is already linked to another nurse record',
      });
      throw error;
    }
  }

  async softDeleteNurse(id: number, actorId: number) {
    await this.ensureNurseExists(id);
    await this.prisma.nursing_nurses.update({
      where: { id },
      data: { deleted_at: new Date(), status: 'Terminated', updated_by: actorId },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'NURSE_DELETED',
      entityType: 'Nurse',
      entityId: id,
      description: `Nurse #${id} soft-deleted (status -> Terminated)`,
      status: 'Success',
    });

    return { message: `Nurse #${id} deleted` };
  }

  // ==========================================================================
  // Credentials
  // ==========================================================================

  async listNurseCredentials(nurseId: number) {
    await this.ensureNurseExists(nurseId);
    const rows = await this.prisma.nursing_credentials.findMany({
      where: { nurse_id: nurseId, deleted_at: null },
      orderBy: { expiry_date: 'asc' },
    });
    return { items: (rows || []).map((c: any) => this.mapCredentialRow(c)) };
  }

  async listExpiringCredentials(days: number = EXPIRING_SOON_DAYS) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + Math.max(1, days));

    const rows = await this.prisma.nursing_credentials.findMany({
      where: {
        deleted_at: null,
        status: { in: ['Valid', 'ExpiringSoon'] },
        expiry_date: { lte: horizon },
        nurse: { deleted_at: null, status: 'Active' },
      },
      include: {
        nurse: { select: { id: true, employee_number: true, first_name: true, last_name: true } },
      },
      orderBy: { expiry_date: 'asc' },
      take: 500,
    });

    return {
      days,
      items: (rows || []).map((c: any) => ({
        ...this.mapCredentialRow(c),
        nurse: c.nurse
          ? {
              id: c.nurse.id,
              employeeNumber: c.nurse.employee_number,
              fullName: `${c.nurse.first_name} ${c.nurse.last_name}`,
            }
          : null,
      })),
    };
  }

  async createCredential(dto: CreateCredentialDto, actorId: number) {
    await this.ensureNurseExists(dto.nurse_id);
    try {
      const created = await this.prisma.nursing_credentials.create({
        data: {
          nurse_id: dto.nurse_id,
          credential_type: dto.credential_type,
          name: dto.name,
          issuing_authority: dto.issuing_authority ?? null,
          credential_number: dto.credential_number ?? null,
          issued_date: dto.issued_date ? new Date(dto.issued_date) : null,
          expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
          created_by: actorId,
          updated_by: actorId,
        },
      });

      await this.auditService.log({
        userId: actorId,
        action: 'CREDENTIAL_CREATED',
        entityType: 'Credential',
        entityId: created.id,
        entityCode: dto.name,
        description: `Credential ${dto.name} (${dto.credential_type}) added for nurse #${dto.nurse_id}`,
        status: 'Success',
      });

      return { credential: this.mapCredentialRow(created) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        uq_credentials_nurse_type_name: `Nurse already has a ${dto.credential_type} named "${dto.name}"`,
      });
      throw error;
    }
  }

  async updateCredential(id: number, dto: UpdateCredentialDto, actorId: number) {
    await this.ensureCredentialExists(id);
    const updated = await this.prisma.nursing_credentials.update({
      where: { id },
      data: {
        ...(dto.credential_type !== undefined && { credential_type: dto.credential_type }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.issuing_authority !== undefined && { issuing_authority: dto.issuing_authority }),
        ...(dto.credential_number !== undefined && { credential_number: dto.credential_number }),
        ...(dto.issued_date !== undefined && { issued_date: new Date(dto.issued_date) }),
        ...(dto.expiry_date !== undefined && { expiry_date: new Date(dto.expiry_date) }),
        ...(dto.status !== undefined && { status: dto.status }),
        updated_by: actorId,
      },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'CREDENTIAL_UPDATED',
      entityType: 'Credential',
      entityId: id,
      description: `Credential #${id} updated`,
      changes: dto as any,
      status: 'Success',
    });

    return { credential: this.mapCredentialRow(updated) };
  }

  async verifyCredential(id: number, dto: VerifyCredentialDto, actorId: number) {
    await this.ensureCredentialExists(id);
    const updated = await this.prisma.nursing_credentials.update({
      where: { id },
      data: {
        status: dto.status || 'Valid',
        verified_by: actorId,
        verified_at: new Date(),
        updated_by: actorId,
      },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'CREDENTIAL_VERIFIED',
      entityType: 'Credential',
      entityId: id,
      description: `Credential #${id} verified -> ${dto.status || 'Valid'}`,
      status: 'Success',
    });

    return { credential: this.mapCredentialRow(updated) };
  }

  // ==========================================================================
  // Roster assignments
  // ==========================================================================

  async listRoster(params: {
    from?: string;
    to?: string;
    unitId?: number;
    nurseId?: number;
    status?: string;
  }) {
    const from = params.from ? new Date(params.from) : this.startOfToday();
    const to = params.to ? new Date(params.to) : new Date(from.getTime() + 31 * 86400000);
    const where: any = {
      deleted_at: null,
      assignment_date: { gte: from, lte: to },
    };
    if (params.unitId) where.nursing_unit_id = params.unitId;
    if (params.nurseId) where.nurse_id = params.nurseId;
    if (params.status) where.status = params.status;

    const rows = await this.prisma.nursing_roster_assignments.findMany({
      where,
      include: {
        nurse: { select: { id: true, employee_number: true, first_name: true, last_name: true } },
        nursing_unit: { select: { id: true, code: true, name: true } },
        shift: { select: { id: true, code: true, name: true, start_time: true, end_time: true } },
        post: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ assignment_date: 'asc' }, { shift_id: 'asc' }],
      take: 1000,
    });

    return {
      from: this.toDateOnly(from),
      to: this.toDateOnly(to),
      items: (rows || []).map((a: any) => this.mapRosterRow(a)),
    };
  }

  async createRosterAssignment(dto: CreateRosterAssignmentDto, actorId: number) {
    await this.ensureNurseExists(dto.nurse_id);
    try {
      const created = await this.prisma.nursing_roster_assignments.create({
        data: {
          nurse_id: dto.nurse_id,
          nursing_unit_id: dto.nursing_unit_id,
          shift_id: dto.shift_id,
          post_id: dto.post_id ?? null,
          assignment_date: new Date(dto.assignment_date),
          notes: dto.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        },
        include: {
          nurse: { select: { id: true, employee_number: true, first_name: true, last_name: true } },
          nursing_unit: { select: { id: true, code: true, name: true } },
          shift: { select: { id: true, code: true, name: true } },
          post: { select: { id: true, code: true, name: true } },
        },
      });

      await this.auditService.log({
        userId: actorId,
        action: 'ROSTER_CREATED',
        entityType: 'RosterAssignment',
        entityId: created.id,
        description: `Roster assignment created: nurse #${dto.nurse_id} -> ${this.toDateOnly(new Date(dto.assignment_date))}`,
        status: 'Success',
      });

      return { assignment: this.mapRosterRow(created) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        uq_roster_nurse_date_shift: `Nurse #${dto.nurse_id} is already assigned to that shift on ${dto.assignment_date}`,
      });
      throw error;
    }
  }

  async updateRosterAssignment(id: number, dto: UpdateRosterAssignmentDto, actorId: number) {
    await this.ensureRosterExists(id);
    try {
      const updated = await this.prisma.nursing_roster_assignments.update({
        where: { id },
        data: {
          ...(dto.nurse_id !== undefined && { nurse_id: dto.nurse_id }),
          ...(dto.nursing_unit_id !== undefined && { nursing_unit_id: dto.nursing_unit_id }),
          ...(dto.shift_id !== undefined && { shift_id: dto.shift_id }),
          ...(dto.post_id !== undefined && { post_id: dto.post_id }),
          ...(dto.assignment_date !== undefined && {
            assignment_date: new Date(dto.assignment_date),
          }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          updated_by: actorId,
        },
        include: {
          nurse: { select: { id: true, employee_number: true, first_name: true, last_name: true } },
          nursing_unit: { select: { id: true, code: true, name: true } },
          shift: { select: { id: true, code: true, name: true } },
          post: { select: { id: true, code: true, name: true } },
        },
      });

      await this.auditService.log({
        userId: actorId,
        action: 'ROSTER_UPDATED',
        entityType: 'RosterAssignment',
        entityId: id,
        description: `Roster assignment #${id} updated`,
        changes: dto as any,
        status: 'Success',
      });

      return { assignment: this.mapRosterRow(updated) };
    } catch (error: any) {
      this.throwIfUniqueViolation(error, {
        uq_roster_nurse_date_shift: 'That change would double-book the nurse on this shift/date',
      });
      throw error;
    }
  }

  async softDeleteRosterAssignment(id: number, actorId: number) {
    await this.ensureRosterExists(id);
    await this.prisma.nursing_roster_assignments.update({
      where: { id },
      data: { deleted_at: new Date(), status: 'Cancelled', updated_by: actorId },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'ROSTER_DELETED',
      entityType: 'RosterAssignment',
      entityId: id,
      description: `Roster assignment #${id} soft-deleted (status -> Cancelled)`,
      status: 'Success',
    });

    return { message: `Roster assignment #${id} deleted` };
  }

  // ==========================================================================
  // Lookups (reference data for forms; JWT required, no RBAC menu guard)
  // ==========================================================================

  async getLookups() {
    const [roles, units, shifts, posts] = await Promise.all([
      this.prisma.system_hospital_roles.findMany({
        where: { status: 'Active' },
        select: { id: true, code: true, name: true, category: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.rbac_nursing_units.findMany({
        where: { status: 'Active' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.rbac_shifts.findMany({
        where: { status: 'Active' },
        select: { id: true, code: true, name: true, start_time: true, end_time: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.rbac_posts.findMany({
        where: { status: 'Active' },
        select: { id: true, code: true, name: true, nursing_unit_id: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    return {
      roles: roles || [],
      units: units || [],
      shifts: shifts || [],
      posts: posts || [],
      countries: COUNTRIES,
    };
  }

  /**
   * Generate a unique employee number (EMP-YYYY-NNNNN) for the personal-info
   * form, where employee numbers are not entered manually.
   */
  private async generateEmployeeNumber(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `EMP-${year}-${String(10000 + Math.floor(Math.random() * 90000))}`;
      const existing = await this.prisma.nursing_nurses.findFirst({
        where: { employee_number: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    // Extremely unlikely fallback
    return `EMP-${year}-${Date.now()}`;
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  private async ensureNurseExists(id: number) {
    const row = await this.prisma.nursing_nurses.findUnique({ where: { id } });
    if (!row || row.deleted_at) throw new NotFoundException(`Nurse #${id} not found`);
  }

  private async ensureCredentialExists(id: number) {
    const row = await this.prisma.nursing_credentials.findUnique({ where: { id } });
    if (!row || row.deleted_at) throw new NotFoundException(`Credential #${id} not found`);
  }

  private async ensureRosterExists(id: number) {
    const row = await this.prisma.nursing_roster_assignments.findUnique({ where: { id } });
    if (!row || row.deleted_at) throw new NotFoundException(`Roster assignment #${id} not found`);
  }

  /** Map Prisma unique-violation (P2002) to a friendly 409, rethrow otherwise. */
  private throwIfUniqueViolation(error: any, messages: Record<string, string>): never | void {
    if (error?.code !== 'P2002') return;
    const target: string = Array.isArray(error?.meta?.target)
      ? error.meta.target.join(',')
      : String(error?.meta?.target || '');
    for (const key of Object.keys(messages)) {
      if (target.includes(key)) throw new ConflictException(messages[key]);
    }
    throw new ConflictException(`Duplicate value violates unique constraint (${target})`);
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private toDateOnly(d: Date | string): string {
    return new Date(d).toISOString().slice(0, 10);
  }

  private summarizeCredentials(creds: Array<{ status: string; expiry_date: any }>): {
    credentialSummary: 'Valid' | 'ExpiringSoon' | 'Expired' | 'None';
    credentialCounts: { total: number; expired: number; expiringSoon: number };
  } {
    const active = (creds || []).filter(
      (c) => !['Revoked', 'Suspended'].includes(c.status),
    );
    const now = this.startOfToday().getTime();
    const horizon = now + EXPIRING_SOON_DAYS * 86400000;

    let expired = 0;
    let expiringSoon = 0;
    for (const c of active) {
      if (c.status === 'Expired') {
        expired++;
        continue;
      }
      const exp = c.expiry_date ? new Date(c.expiry_date).getTime() : null;
      if (exp === null) continue;
      if (exp < now) expired++;
      else if (exp <= horizon) expiringSoon++;
    }

    const credentialSummary =
      active.length === 0
        ? ('None' as const)
        : expired > 0
          ? ('Expired' as const)
          : expiringSoon > 0
            ? ('ExpiringSoon' as const)
            : ('Valid' as const);

    return {
      credentialSummary,
      credentialCounts: { total: active.length, expired, expiringSoon },
    };
  }

  private mapNurseRow(r: any) {
    return {
      id: Number(r.id),
      employeeNumber: r.employee_number,
      jobNo: r.job_no ?? null,
      firstName: r.first_name,
      middleName: r.middle_name ?? null,
      lastName: r.last_name,
      // Full Name = First + Middle + Last (middle omitted when not set)
      fullName: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '),
      gender: r.gender ?? null,
      dateOfBirth: r.date_of_birth ? this.toDateOnly(r.date_of_birth) : null,
      nationality: r.nationality ?? null,
      // Email is sourced from the linked login account (auth.users.email)
      email: r.user?.email ?? null,
      phone: r.phone,
      hireDate: r.hire_date ? this.toDateOnly(r.hire_date) : null,
      employmentType: r.employment_type,
      status: r.status,
      userId: r.user_id ? Number(r.user_id) : null,
      username: r.user?.username ?? null,
      primaryRole: r.primary_role
        ? { id: Number(r.primary_role.id), code: r.primary_role.code, name: r.primary_role.name }
        : null,
      homeUnit: r.home_unit
        ? { id: Number(r.home_unit.id), code: r.home_unit.code, name: r.home_unit.name }
        : null,
      ...this.summarizeCredentials(r.credentials || []),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapCredentialRow(c: any) {
    const expiry = c.expiry_date ? new Date(c.expiry_date) : null;
    const now = this.startOfToday().getTime();
    return {
      id: Number(c.id),
      nurseId: Number(c.nurse_id),
      credentialType: c.credential_type,
      name: c.name,
      issuingAuthority: c.issuing_authority,
      credentialNumber: c.credential_number,
      issuedDate: c.issued_date ? this.toDateOnly(c.issued_date) : null,
      expiryDate: expiry ? this.toDateOnly(expiry) : null,
      daysUntilExpiry: expiry ? Math.ceil((expiry.getTime() - now) / 86400000) : null,
      status: c.status,
      verifiedBy: c.verified_by ? Number(c.verified_by) : null,
      verifiedAt: c.verified_at,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };
  }

  private mapRosterRow(a: any) {
    return {
      id: Number(a.id),
      nurseId: Number(a.nurse_id),
      nurseName: a.nurse ? `${a.nurse.first_name} ${a.nurse.last_name}` : undefined,
      employeeNumber: a.nurse?.employee_number,
      unitId: Number(a.nursing_unit_id),
      unitCode: a.nursing_unit?.code,
      unitName: a.nursing_unit?.name,
      shiftId: Number(a.shift_id),
      shiftCode: a.shift?.code,
      shiftName: a.shift?.name,
      postId: a.post_id ? Number(a.post_id) : null,
      postCode: a.post?.code,
      postName: a.post?.name,
      assignmentDate: this.toDateOnly(a.assignment_date),
      status: a.status,
      notes: a.notes,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  }
}
