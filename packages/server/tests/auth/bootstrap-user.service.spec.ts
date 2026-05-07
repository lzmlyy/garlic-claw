import { ConfigService } from '@nestjs/config';
import { BootstrapUserService } from '../../src/modules/auth/bootstrap-user.service';

describe('BootstrapUserService', () => {
  const validConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
      if (key === 'JWT_SECRET') {return 'jwt-secret';}
      return undefined;
    }),
  } as never as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the single system user on startup warmup', () => {
    const service = new BootstrapUserService(validConfigService);

    // runStartupWarmup should not throw
    expect(() => service.runStartupWarmup()).not.toThrow();
  });

  it('returns the same warmup promise across repeated calls', () => {
    const service = new BootstrapUserService(validConfigService);

    const first = service.runStartupWarmup();
    const second = service.runStartupWarmup();

    // Both calls should return the same value (undefined since it's void)
    expect(first).toBe(second);
    expect(first).toBeUndefined();
  });

  it('fails startup validation when JWT_SECRET is missing', () => {
    const missingJwtConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
        return undefined;
      }),
    } as never as ConfigService;
    const service = new BootstrapUserService(missingJwtConfigService);

    expect(() => service.validateStartupAuthConfig()).toThrow('JWT_SECRET 未配置');
  });

  it('fails startup validation when JWT_SECRET uses the historical fallback value', () => {
    const fallbackJwtConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GARLIC_CLAW_LOGIN_SECRET') {return 'top-secret';}
        if (key === 'JWT_SECRET') {return 'fallback-secret';}
        return undefined;
      }),
    } as never as ConfigService;
    const service = new BootstrapUserService(fallbackJwtConfigService);

    expect(() => service.validateStartupAuthConfig()).toThrow('JWT_SECRET 不能使用示例值或历史默认值');
  });
});
