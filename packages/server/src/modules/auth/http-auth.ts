import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestAuthService } from './request-auth.service';

export const IS_PUBLIC_ROUTE_KEY = 'garlic-claw:is-public-route';
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE_KEY, true);

export type AuthenticatedUser = {
  authType: 'jwt';
  id: string;
  username: string;
  email: string;
};

export const CurrentUser = createParamDecorator((field: string | undefined, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<{ user?: Record<string, unknown> }>().user;
  return field ? user?.[field] : user;
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly requestAuthService: RequestAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublicRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    request.user = await this.requestAuthService.authenticateJwtRequest(request);
    return true;
  }
}
