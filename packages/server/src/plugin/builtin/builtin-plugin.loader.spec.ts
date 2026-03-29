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

    expect(runtime.registerPlugin).toHaveBeenCalledTimes(17);
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
          id: 'builtin.automation-tools',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.memory-context',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.message-lifecycle-recorder',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.message-entry-recorder',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      7,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.kb-context',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      8,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.conversation-title',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      9,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.subagent-delegate',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      10,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.provider-router',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      11,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.persona-router',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      12,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.cron-heartbeat',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      13,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.route-inspector',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      14,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.automation-recorder',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      15,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.tool-audit',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      16,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.response-recorder',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
    expect(runtime.registerPlugin).toHaveBeenNthCalledWith(
      17,
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'builtin.plugin-governance-recorder',
          runtime: 'builtin',
        }),
        runtimeKind: 'builtin',
      }),
    );
  });
});
