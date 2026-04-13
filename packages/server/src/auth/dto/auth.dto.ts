import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 30)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 100)
  password!: string;
}

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

export class DevLoginDto {
  @IsString()
  username!: string;

  @IsOptional()
  @IsIn(['super_admin', 'admin', 'user'])
  role?: 'super_admin' | 'admin' | 'user';
}
