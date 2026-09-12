import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  IsIn,
  MaxLength,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Lookups / constants
// ---------------------------------------------------------------------------

export const CONTRACT_TYPES = ['FixedTerm', 'Permanent', 'Temporary', 'Other'] as const;
export const CONTRACT_STATUSES = [
  'Draft',
  'PendingApproval',
  'Active',
  'Expired',
  'Terminated',
  'Renewed',
] as const;

/** Statuses a contract may still be edited from (before activation). */
export const EDITABLE_STATUSES = ['Draft', 'PendingApproval'] as const;

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

export class CreateContractDto {
  /** Optional - auto-generated (CON-YYYY-NNNNN) when omitted. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  contract_number?: string;

  @IsInt()
  nurse_id: number;

  @IsInt()
  agency_id: number;

  @IsInt()
  position_id: number;

  /** Optional - defaults to the nurse's home unit when omitted. */
  @IsOptional()
  @IsInt()
  nursing_unit_id?: number;

  @IsOptional()
  @IsIn(CONTRACT_TYPES as unknown as string[])
  contract_type?: string;

  @IsDateString()
  start_date: string;

  /** Optional - omit for permanent/open-ended contracts. */
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumber()
  salary_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  salary_currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  document_url?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  contract_number?: string;

  @IsOptional()
  @IsInt()
  agency_id?: number;

  @IsOptional()
  @IsInt()
  position_id?: number;

  @IsOptional()
  @IsInt()
  nursing_unit_id?: number;

  @IsOptional()
  @IsIn(CONTRACT_TYPES as unknown as string[])
  contract_type?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumber()
  salary_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  salary_currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  document_url?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ---------------------------------------------------------------------------
// Workflow actions
// ---------------------------------------------------------------------------

export class ApproveContractDto {
  @IsOptional()
  @IsString()
  approval_notes?: string;
}

export class TerminateContractDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  termination_reason: string;
}

export class RenewContractDto {
  /** New contract's start date (defaults to the day after the old end date). */
  @IsOptional()
  @IsDateString()
  start_date?: string;

  /** New contract's end date; omit for permanent. */
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumber()
  salary_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  document_url?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
