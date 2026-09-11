import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEmail,
  IsDateString,
  IsIn,
  MaxLength,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Nurses
// ---------------------------------------------------------------------------

export const EMPLOYMENT_TYPES = ['FullTime', 'PartTime', 'PRN', 'Contract'] as const;
export const NURSE_STATUSES = ['Active', 'OnLeave', 'Suspended', 'Terminated'] as const;
export const CREDENTIAL_TYPES = ['License', 'Certification'] as const;
export const CREDENTIAL_STATUSES = [
  'PendingVerification',
  'Valid',
  'ExpiringSoon',
  'Expired',
  'Suspended',
  'Revoked',
] as const;
export const ROSTER_STATUSES = [
  'Scheduled',
  'Confirmed',
  'Completed',
  'Cancelled',
  'Swapped',
  'NoShow',
] as const;

export class CreateNurseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employee_number: string;

  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsDateString()
  hire_date: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employment_type?: string;

  @IsOptional()
  @IsInt()
  primary_role_id?: number;

  @IsOptional()
  @IsInt()
  home_unit_id?: number;
}

export class UpdateNurseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employee_number?: string;

  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsDateString()
  hire_date?: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employment_type?: string;

  @IsOptional()
  @IsInt()
  primary_role_id?: number;

  @IsOptional()
  @IsInt()
  home_unit_id?: number;

  @IsOptional()
  @IsIn(NURSE_STATUSES as unknown as string[])
  status?: string;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export class CreateCredentialDto {
  @IsInt()
  nurse_id: number;

  @IsIn(CREDENTIAL_TYPES as unknown as string[])
  credential_type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  issuing_authority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  credential_number?: string;

  @IsOptional()
  @IsDateString()
  issued_date?: string;

  @IsOptional()
  @IsDateString()
  expiry_date?: string;
}

export class UpdateCredentialDto {
  @IsOptional()
  @IsIn(CREDENTIAL_TYPES as unknown as string[])
  credential_type?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  issuing_authority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  credential_number?: string;

  @IsOptional()
  @IsDateString()
  issued_date?: string;

  @IsOptional()
  @IsDateString()
  expiry_date?: string;

  @IsOptional()
  @IsIn(CREDENTIAL_STATUSES as unknown as string[])
  status?: string;
}

export class VerifyCredentialDto {
  @IsOptional()
  @IsIn(['Valid', 'Suspended', 'Revoked'])
  status?: string = 'Valid';
}

// ---------------------------------------------------------------------------
// Roster assignments
// ---------------------------------------------------------------------------

export class CreateRosterAssignmentDto {
  @IsInt()
  nurse_id: number;

  @IsInt()
  nursing_unit_id: number;

  @IsInt()
  shift_id: number;

  @IsOptional()
  @IsInt()
  post_id?: number;

  @IsDateString()
  assignment_date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRosterAssignmentDto {
  @IsOptional()
  @IsInt()
  nurse_id?: number;

  @IsOptional()
  @IsInt()
  nursing_unit_id?: number;

  @IsOptional()
  @IsInt()
  shift_id?: number;

  @IsOptional()
  @IsInt()
  post_id?: number;

  @IsOptional()
  @IsDateString()
  assignment_date?: string;

  @IsOptional()
  @IsIn(ROSTER_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
