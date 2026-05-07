import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RequestAuthService } from '../../src/modules/auth/request-auth.service';
import { JwtAuthGuard } from '../../src/modules/auth/http-auth';

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as never as Reflector;

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
  });

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
    const guard = new JwtAuthGuard(requestAuth, reflector);
    const context = createHttpContext(request);

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
    const guard = new JwtAuthGuard(requestAuth, reflector);
    const context = createHttpContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('skips jwt authentication for public routes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const requestAuth = {
      authenticateJwtRequest: jest.fn(),
    } as never as RequestAuthService;
    const guard = new JwtAuthGuard(requestAuth, reflector);

    await expect(guard.canActivate(createHttpContext({ headers: {} }))).resolves.toBe(true);
    expect(requestAuth.authenticateJwtRequest).not.toHaveBeenCalled();
  });
});

function createHttpContext(request: { headers: Record<string, string> }): ExecutionContext {
  return {
    getArgByIndex: jest.fn(),
    getArgs: jest.fn(),
    getClass: jest.fn(),
    getHandler: jest.fn(),
    getType: jest.fn(() => 'http'),
    switchToHttp: jest.fn(() => ({
      getNext: jest.fn(),
      getRequest: jest.fn(() => request),
      getResponse: jest.fn(),
    })),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as never as ExecutionContext;
}
