import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AuthScopeGuard } from '../../src/auth/http-auth';

describe('AuthScopeGuard', () => {
  it('rejects api-key requests that miss required scopes and allows jwt users through', () => {
    const guard = new AuthScopeGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['conversation.message.write']),
    } as never);
    const apiKeyContext = new ExecutionContextHost([{
      user: {
        authType: 'api_key',
        scopes: ['plugin.route.invoke'],
      },
    }]);
    apiKeyContext.setType('http');

    const jwtContext = new ExecutionContextHost([{
      user: {
        authType: 'jwt',
        scopes: [],
      },
    }]);
    jwtContext.setType('http');

    expect(() => guard.canActivate(apiKeyContext)).toThrow('API key missing required scopes');
    expect(guard.canActivate(jwtContext)).toBe(true);
  });
});
