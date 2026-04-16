import type { ApiKeyScope } from '@garlic-claw/shared';
import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestAuthService } from './request-auth.service';

export type AuthenticatedUser = {
  authType: 'api_key' | 'jwt';
  id: string;
  username: string;
  email: string;
  role: string;
  scopes: ApiKeyScope[];
  apiKeyId?: string;
  apiKeyName?: string;
};

export const AUTH_SCOPES_KEY = 'auth_scopes';
export const AuthScopes = (...scopes: ApiKeyScope[]) => SetMetadata(AUTH_SCOPES_KEY, scopes);
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator((field: string | undefined, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<{ user?: Record<string, unknown> }>().user;
  return field ? user?.[field] : user;
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly requestAuthService: RequestAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    request.user = await this.requestAuthService.authenticateJwtRequest(request);
    return true;
  }
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly requestAuthService: RequestAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    request.user = await this.requestAuthService.authenticateApiKeyRequest(request);
    return true;
  }
}

@Injectable()
export class AuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(AUTH_SCOPES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (requiredScopes.length === 0) {return true;}

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) {throw new ForbiddenException('Missing authenticated user');}
    if (user.authType !== 'api_key') {return true;}
    const missingScopes = requiredScopes.filter((scope) => !user.scopes.includes(scope));
    if (missingScopes.length > 0) {throw new ForbiddenException(`API key missing required scopes: ${missingScopes.join(', ')}`);}
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    return Boolean(user && requiredRoles.includes(user.role));
  }
}
