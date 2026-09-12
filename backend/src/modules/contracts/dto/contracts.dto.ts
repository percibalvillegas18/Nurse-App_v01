import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsIn,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CONTRACT_TYPES = ['Permanent', 'FixedTerm', 'Temporary', 'Locum', 'Other'] as const;
export const CONTRACT_STATUSES = [
  'Draft',
  'PendingApproval',
  'Active',
  'Suspended',
  'Expired',
  'Terminated',
  'Superseded',
] as const;

export class CreateContractDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractNumber?: string;

  @IsInt()
  nurseId: number;

  @IsOptional()
  @IsInt()
  positionId?: number;

  @IsInt()
  agencyId: number;

  @IsOptional()
  @IsInt()
  nursingUnitId?: number;

  @IsOptional()
  @IsInt()
  departmentId?: number;

  @IsIn(CONTRACT_TYPES as unknown as string[])
  contractType: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsInt()
  positionId?: number;

  @IsOptional()
  @IsInt()
  agencyId?: number;

  @IsOptional()
  @IsInt()
  nursingUnitId?: number;

  @IsOptional()
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsIn(CONTRACT_TYPES as unknown as string[])
  contractType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TerminateContractDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason: string;
}

export class RenewContractDto {
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(CONTRACT_TYPES as unknown as string[])
  contractType?: string;

  @IsOptional()
  @IsInt()
  agencyId?: number;

  @IsOptional()
  @IsInt()
  positionId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddContractDocumentDto {
  @IsString()
  @IsNotEmpty()
  docType: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  storageRef?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
