import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RequestAuthService } from './request-auth.service';

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
  constructor(private readonly requestAuthService: RequestAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    request.user = await this.requestAuthService.authenticateJwtRequest(request);
    return true;
  }
}
