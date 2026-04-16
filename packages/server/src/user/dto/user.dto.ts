import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
  AI = 'ai',
  DEVICE = 'device',
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}
