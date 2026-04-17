import { ForbiddenException } from '@nestjs/common';
import { AuthController } from '../../../../src/adapters/http/auth/auth.controller';

describe('AuthController', () => {
  const authService = {
    devLogin: jest.fn(),
    login: jest.fn(),
    refreshTokens: jest.fn(),
    register: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(authService as never, configService as never);
    configService.get.mockReturnValue('development');
  });

  it('delegates register, login and refresh to the auth service', async () => {
    authService.register.mockResolvedValue({ accessToken: 'register-access', refreshToken: 'register-refresh' });
    authService.login.mockResolvedValue({ accessToken: 'login-access', refreshToken: 'login-refresh' });
    authService.refreshTokens.mockResolvedValue({ accessToken: 'refresh-access', refreshToken: 'refresh-refresh' });

    await expect(controller.register({ email: 'tester@example.com', password: '12345678', username: 'tester' } as never)).resolves.toEqual({
      accessToken: 'register-access',
      refreshToken: 'register-refresh',
    });
    await expect(controller.login({ password: '12345678', username: 'tester' } as never)).resolves.toEqual({
      accessToken: 'login-access',
      refreshToken: 'login-refresh',
    });
    await expect(controller.refresh({ refreshToken: 'refresh-token' } as never)).resolves.toEqual({
      accessToken: 'refresh-access',
      refreshToken: 'refresh-refresh',
    });
  });

  it('blocks dev-login in production and delegates otherwise', async () => {
    authService.devLogin.mockResolvedValue({ accessToken: 'dev-access', refreshToken: 'dev-refresh' });

    await expect(controller.devLogin({ role: 'admin', username: 'dev-admin' } as never)).resolves.toEqual({
      accessToken: 'dev-access',
      refreshToken: 'dev-refresh',
    });

    configService.get.mockReturnValue('production');
    expect(() => controller.devLogin({ role: 'admin', username: 'dev-admin' } as never)).toThrow(ForbiddenException);
  });
});
