import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class EvaluateAccessDto {
  @IsString()
  @IsNotEmpty()
  menuCode: string;

  @IsString()
  @IsNotEmpty()
  permissionCode: string;

  @IsNumber()
  @IsOptional()
  resourceId?: number;
}

export class PreviewAccessChangeDto {
  @IsString()
  @IsNotEmpty()
  changeType: string; // PERMISSION_GRANT, PERMISSION_REVOKE, MENU_ACCESS_GRANT, etc

  @IsNumber()
  @IsNotEmpty()
  menuId: number;

  @IsNumber()
  @IsOptional()
  permissionId?: number;

  @IsOptional()
  proposedAllowed?: boolean;
}
