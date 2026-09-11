import { IsString, IsNotEmpty, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
