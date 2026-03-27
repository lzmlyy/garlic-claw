import { BuiltinPluginLoader } from './builtin-plugin.loader';

describe('BuiltinPluginLoader', () => {
  const runtime = {
    registerPlugin: jest.fn(),
    callHost: jest.fn(),
  };

  let loader: BuiltinPluginLoader;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime.registerPlugin.mockResolvedValue(undefined);
    loader = new BuiltinPluginLoader(runtime as never);
  });

  it('registers the default builtin plugins on module init', async () => {
    await loader.onModuleInit();

    expect(runtime.registerPlugin).toHaveBeenCalledTimes(7);
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.core-tools',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.memory-tools',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.memory-context',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.conversation-title',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.provider-router',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.cron-heartbeat',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      7,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.route-inspector',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
  });
});
