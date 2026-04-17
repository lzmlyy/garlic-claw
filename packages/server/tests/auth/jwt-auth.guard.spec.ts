import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { RequestAuthService } from '../../src/auth/request-auth.service';
import { JwtAuthGuard } from '../../src/auth/http-auth';

describe('JwtAuthGuard', () => {
  it('writes the authenticated jwt user onto the request', async () => {
    const request = { headers: { authorization: 'Bearer jwt-token' } };
    const requestAuth = {
      authenticateJwtRequest: jest.fn().mockResolvedValue({
        authType: 'jwt',
        id: '00000000-0000-4000-8000-000000000001',
        username: 'local-owner',
        email: 'local-owner@garlic-claw.local',
      }),
    } as never as RequestAuthService;
    const guard = new JwtAuthGuard(requestAuth);
    const context = new ExecutionContextHost([request]);
    context.setType('http');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(requestAuth.authenticateJwtRequest).toHaveBeenCalledWith(request);
    expect((request as { user?: unknown }).user).toEqual(
      expect.objectContaining({
        username: 'local-owner',
      }),
    );
  });

  it('surfaces jwt authentication failures', async () => {
    const requestAuth = {
      authenticateJwtRequest: jest.fn().mockRejectedValue(new UnauthorizedException('Missing access token')),
    } as never as RequestAuthService;
    const guard = new JwtAuthGuard(requestAuth);
    const context = new ExecutionContextHost([{ headers: {} }]);
    context.setType('http');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
