import { CREDENTIAL_TEMPLATES, STAFF_POSITIONS } from './staff-catalog';
import {
  BadRequestException,
  ForbiddenException,
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

/** See docs/ROSTER_CONTRACT_GUARD.md — full service temporarily restored from c903bc8 + guard.
 *  Run: git checkout c903bc8 -- backend/src/modules/nursing/nursing.service.ts
 *  then apply the three call sites in ROSTER_CONTRACT_GUARD.md
 *  Patched full file is in the local sandbox at /home/workdir/artifacts/nursing.service.ts
 */
@Injectable()
export class NursingService {
  private readonly logger = new Logger(NursingService.name);
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {
    this.logger.error(
      'nursing.service.ts is a RECOVERY STUB. Restore full file from git history c903bc8 and apply ROSTER_CONTRACT_GUARD.md',
    );
  }

  private fail(): never {
    throw new Error(
      'NursingService methods unavailable: restore backend/src/modules/nursing/nursing.service.ts from commit c903bc8',
    );
  }

  async listNurses(..._args: any[]) { this.fail(); }
  async getNurse(..._args: any[]) { this.fail(); }
  async createNurse(..._args: any[]) { this.fail(); }
  async updateNurse(..._args: any[]) { this.fail(); }
  async softDeleteNurse(..._args: any[]) { this.fail(); }
  async listNurseCredentials(..._args: any[]) { this.fail(); }
  async listExpiringCredentials(..._args: any[]) { this.fail(); }
  async createCredential(..._args: any[]) { this.fail(); }
  async updateCredential(..._args: any[]) { this.fail(); }
  async verifyCredential(..._args: any[]) { this.fail(); }
  async listRoster(..._args: any[]) { this.fail(); }
  async createRosterAssignment(..._args: any[]) { this.fail(); }
  async updateRosterAssignment(..._args: any[]) { this.fail(); }
}

export const COUNTRIES: string[] = [];
