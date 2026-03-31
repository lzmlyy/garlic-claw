import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyScope } from '@garlic-claw/shared';
import type { AuthenticatedUser } from '../auth-user';
import { AUTH_SCOPES_KEY } from '../decorators/auth-scopes.decorator';

@Injectable()
export class AuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(AUTH_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated user');
    }
    if (user.authType !== 'api_key') {
      return true;
    }

    const missingScopes = requiredScopes.filter((scope) => !user.scopes.includes(scope));
    if (missingScopes.length > 0) {
      throw new ForbiddenException(
        `API key missing required scopes: ${missingScopes.join(', ')}`,
      );
    }

    return true;
  }
}
