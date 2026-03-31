import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_SCOPES_KEY } from '../decorators/auth-scopes.decorator';
import { AuthScopeGuard } from './auth-scope.guard';

describe('AuthScopeGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as never as Reflector;

  let guard: AuthScopeGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthScopeGuard(reflector);
  });

  it('allows jwt-authenticated users without requiring api key scopes', () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(['plugin.route.invoke']) as never;

    expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'controller',
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              authType: 'jwt',
              role: 'user',
            },
          }),
        }),
      } as never),
    ).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      AUTH_SCOPES_KEY,
      ['handler', 'controller'],
    );
  });

  it('allows api key principals that include all required scopes', () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(['plugin.route.invoke']) as never;

    expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'controller',
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              authType: 'api_key',
              scopes: ['plugin.route.invoke', 'conversation.message.write'],
            },
          }),
        }),
      } as never),
    ).toBe(true);
  });

  it('rejects api key principals that miss required scopes', () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(['conversation.message.write']) as never;

    expect(() =>
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'controller',
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              authType: 'api_key',
              scopes: ['plugin.route.invoke'],
            },
          }),
        }),
      } as never),
    ).toThrow(ForbiddenException);
  });
});
