import { AuthController } from '../../../../src/adapters/http/auth/auth.controller';

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
  };

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(authService as never);
  });

  it('delegates single-secret login to the auth service', async () => {
    authService.login.mockResolvedValue({ accessToken: 'login-access' });

    await expect(controller.login({ secret: 'top-secret' } as never)).resolves.toEqual({
      accessToken: 'login-access',
    });
    expect(authService.login).toHaveBeenCalledWith({ secret: 'top-secret' });
  });
});
