import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { RequestAuthService } from '../../src/auth/request-auth.service';
import { ApiKeyAuthGuard } from '../../src/auth/http-auth';

describe('ApiKeyAuthGuard', () => {
  it('delegates api key requests to the auth owner and writes request.user', async () => {
    const request = { headers: { 'x-api-key': 'gca_key_key-1_secret' } };
    const requestAuth = {
      authenticateApiKeyRequest: jest.fn().mockResolvedValue({
        authType: 'api_key',
        id: 'user-1',
        username: 'route-bot',
        email: 'route-bot@example.com',
        role: 'admin',
        scopes: ['conversation.message.write'],
        apiKeyId: 'key-1',
        apiKeyName: 'Route Bot',
      }),
    } as never as RequestAuthService;
    const guard = new ApiKeyAuthGuard(requestAuth);
    const context = new ExecutionContextHost([request]);
    context.setType('http');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(requestAuth.authenticateApiKeyRequest).toHaveBeenCalledWith(request);
    expect((request as { user?: unknown }).user).toEqual(
      expect.objectContaining({
        apiKeyId: 'key-1',
      }),
    );
  });

  it('rejects missing api keys', async () => {
    const requestAuth = {
      authenticateApiKeyRequest: jest.fn().mockRejectedValue(new UnauthorizedException('Missing API key')),
    } as never as RequestAuthService;
    const guard = new ApiKeyAuthGuard(requestAuth);
    const context = new ExecutionContextHost([{ headers: {} }]);
    context.setType('http');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
