import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../src/auth/auth.service';

describe('AuthService', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
      if (key === 'GARLIC_CLAW_AUTH_TTL') {return undefined;}
      if (key === 'JWT_SECRET') {return 'jwt-secret';}
      return undefined;
    }),
  } as never as ConfigService;
  const jwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  } as never as JwtService;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(configService, jwtService);
  });

  it('signs a single long-lived token when the shared secret matches', async () => {
    await expect(service.login({ secret: ' top-secret ' })).resolves.toEqual({
      accessToken: 'mock-token',
    });

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: expect.any(String),
        username: expect.any(String),
      }),
      expect.objectContaining({
        expiresIn: '30d',
        secret: 'jwt-secret',
      }),
    );
  });

  it('uses the configured auth ttl when present', async () => {
    configService.get = jest.fn((key: string) => {
      if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
      if (key === 'GARLIC_CLAW_AUTH_TTL') {return '7d';}
      if (key === 'JWT_SECRET') {return 'jwt-secret';}
      return undefined;
    });
    service = new AuthService(configService, jwtService);

    await service.login({ secret: 'top-secret' });

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        expiresIn: '7d',
      }),
    );
  });

  it('rejects invalid shared secrets', async () => {
    await expect(service.login({ secret: 'bad-secret' })).rejects.toThrow(UnauthorizedException);
  });
});
