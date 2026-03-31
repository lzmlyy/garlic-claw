import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { RequestAuthService } from './request-auth.service';

describe('RequestAuthService', () => {
  const apiKeys = {
    authenticateToken: jest.fn(),
  };
  const jwtService = {
    verify: jest.fn(),
  } as never as JwtService;
  const jwtStrategy = {
    validate: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue('jwt-secret'),
  } as never as ConfigService;

  let service: RequestAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequestAuthService(
      configService,
      jwtService,
      jwtStrategy as never,
      apiKeys as never,
    );
  });

  it('prefers x-api-key credentials over bearer jwt when both are present', async () => {
    apiKeys.authenticateToken.mockResolvedValue({
      authType: 'api_key',
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
      apiKeyId: 'key-1',
      scopes: ['plugin.route.invoke'],
    });

    await expect(
      service.authenticateAnyRequest({
        headers: {
          'x-api-key': 'gca_key_123',
          authorization: 'Bearer jwt-token',
        },
      } as never),
    ).resolves.toMatchObject({
      authType: 'api_key',
      apiKeyId: 'key-1',
    });
    expect(apiKeys.authenticateToken).toHaveBeenCalledWith('gca_key_123');
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('resolves jwt bearer tokens when no api key credential exists', async () => {
    jwtService.verify = jest.fn().mockReturnValue({
      sub: 'user-1',
      username: 'alice',
      role: 'user',
    }) as never;
    jwtStrategy.validate.mockResolvedValue({
      authType: 'jwt',
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
    });

    await expect(
      service.authenticateAnyRequest({
        headers: {
          authorization: 'Bearer jwt-token',
        },
      } as never),
    ).resolves.toMatchObject({
      authType: 'jwt',
      id: 'user-1',
    });
    expect(jwtStrategy.validate).toHaveBeenCalledWith({
      sub: 'user-1',
      username: 'alice',
      role: 'user',
    });
  });

  it('rejects api key only authentication when no api key credential is present', async () => {
    await expect(
      service.authenticateApiKeyRequest({
        headers: {},
      } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
});
