import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../src/modules/auth/auth.service';

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

  it('fails when JWT_SECRET is not configured', async () => {
    const missingJwtConfig = {
      get: jest.fn((key: string) => {
        if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
        if (key === 'GARLIC_CLAW_AUTH_TTL') {return undefined;}
        return undefined;
      }),
    } as never as ConfigService;
    service = new AuthService(missingJwtConfig, jwtService);

    await expect(service.login({ secret: 'top-secret' })).rejects.toThrow('JWT_SECRET 未配置');
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('rejects the historical fallback JWT secret value', async () => {
    const fallbackJwtConfig = {
      get: jest.fn((key: string) => {
        if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
        if (key === 'JWT_SECRET') {return 'fallback-secret';}
        return undefined;
      }),
    } as never as ConfigService;
    service = new AuthService(fallbackJwtConfig, jwtService);

    await expect(service.login({ secret: 'top-secret' })).rejects.toThrow('JWT_SECRET 不能使用示例值或历史默认值');
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
