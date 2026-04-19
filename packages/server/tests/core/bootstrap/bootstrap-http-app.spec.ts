jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('../../../src/app.module', () => ({
  AppModule: class AppModule {},
}));

describe('bootstrapHttpApp', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('enables shutdown hooks before listening', async () => {
    const app = {
      enableShutdownHooks: jest.fn(),
      get: jest.fn((token: { name?: string }) => {
        if (token?.name === 'PluginBootstrapService') {
          return { bootstrapBuiltins: jest.fn() };
        }
        if (token?.name === 'BootstrapAdminService') {
          return { runStartupWarmup: jest.fn() };
        }
        throw new Error(`unexpected token: ${token?.name ?? 'unknown'}`);
      }),
      listen: jest.fn().mockResolvedValue(undefined),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
    };
    const { NestFactory } = await import('@nestjs/core');
    jest.mocked(NestFactory.create).mockResolvedValue(app as never);

    const { bootstrapHttpApp } = await import('../../../src/core/bootstrap/bootstrap-http-app');

    await bootstrapHttpApp();

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledTimes(1);
  });
});
