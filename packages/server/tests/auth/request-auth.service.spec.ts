import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RequestAuthService } from '../../src/auth/request-auth.service';

describe('RequestAuthService', () => {
  const configService = {
    get: jest.fn((key: string) => (key === 'JWT_SECRET' ? 'jwt-secret' : undefined)),
  } as never as ConfigService;
  const jwtService = {
    verify: jest.fn(),
  };

  let service: RequestAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequestAuthService(
      configService,
      jwtService as never as JwtService,
    );
  });

  it('returns the single authenticated owner from a valid jwt', async () => {
    jwtService.verify.mockReturnValue({
      sub: '00000000-0000-4000-8000-000000000001',
      username: 'local-owner',
    });

    await expect(
      service.authenticateJwtRequest({
        headers: { authorization: 'Bearer jwt-token' },
      } as never as Request),
    ).resolves.toEqual({
      authType: 'jwt',
      id: '00000000-0000-4000-8000-000000000001',
      username: 'local-owner',
      email: 'local-owner@garlic-claw.local',
    });
  });

  it('rejects jwt requests without a bearer token', async () => {
    await expect(service.authenticateJwtRequest({ headers: {} } as never as Request)).rejects.toThrow(UnauthorizedException);
  });
});
