import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminIdentityService } from './admin-identity.service';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { AnyAuthGuard } from './guards/any-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { AuthScopeGuard } from './guards/auth-scope.guard';
import { RequestAuthService } from './request-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), PrismaModule],
  controllers: [AuthController, ApiKeyController],
  providers: [
    AuthService,
    ApiKeyService,
    JwtStrategy,
    AdminIdentityService,
    BootstrapAdminService,
    RequestAuthService,
    ApiKeyAuthGuard,
    AnyAuthGuard,
    AuthScopeGuard,
  ],
  exports: [
    AuthService,
    ApiKeyService,
    AdminIdentityService,
    BootstrapAdminService,
    RequestAuthService,
    ApiKeyAuthGuard,
    AnyAuthGuard,
    AuthScopeGuard,
  ],
})
export class AuthModule {}
