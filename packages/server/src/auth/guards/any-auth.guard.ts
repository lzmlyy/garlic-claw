import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RequestAuthService } from '../request-auth.service';

@Injectable()
export class AnyAuthGuard {
  constructor(private readonly requestAuth: RequestAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    request.user = await this.requestAuth.authenticateAnyRequest(request);
    return true;
  }
}
