import { ConfigService } from '@nestjs/config';
import { AdminIdentityService } from '../../src/auth/admin-identity.service';

describe('AdminIdentityService', () => {
  const createService = (env: Record<string, string | undefined>) =>
    new AdminIdentityService({
      get: jest.fn((key: string) => env[key]),
    } as never as ConfigService);

  it('returns super_admin when username matches env config', () => {
    const service = createService({
      SUPER_ADMIN_USERNAMES: 'root, owner ',
    });

    expect(
      service.resolveRole({
        username: 'owner',
        email: 'owner@example.com',
        role: 'user',
      }),
    ).toBe('super_admin');
  });

  it('returns admin when email matches env config', () => {
    const service = createService({
      ADMIN_EMAILS: 'admin@example.com, second@example.com',
    });

    expect(
      service.resolveRole({
        username: 'alice',
        email: 'admin@example.com',
        role: 'user',
      }),
    ).toBe('admin');
  });

  it('returns the bootstrap admin role when the dedicated env account matches', () => {
    const service = createService({
      BOOTSTRAP_ADMIN_USERNAME: 'admin',
      BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      BOOTSTRAP_ADMIN_ROLE: 'super_admin',
    });

    expect(
      service.resolveRole({
        username: 'admin',
        email: 'admin@bootstrap.local',
        role: 'user',
      }),
    ).toBe('super_admin');
  });

  it('falls back to the persisted role when no env identifier matches', () => {
    const service = createService({
      ADMIN_USERNAMES: 'bob',
    });

    expect(
      service.resolveRole({
        username: 'alice',
        email: 'alice@example.com',
        role: 'device',
      }),
    ).toBe('device');
  });
});
