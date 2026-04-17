import { normalizePluginManifest, PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { BuiltinPluginRegistryService } from '../../../src/plugin/builtin/builtin-plugin-registry.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';

describe('PluginBootstrapService', () => {
  it('registers plugins and keeps plugin state readable through the real owners', () => {
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );

    const registered = service.registerPlugin({
      fallback: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        runtime: 'builtin',
      },
      manifest: {
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    expect(registered).toMatchObject({
      connected: true,
      defaultEnabled: true,
      pluginId: 'builtin.ping',
    });
    expect(service.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.ping',
      }),
    ]);
  });

  it('preserves plugin config and scope state when a plugin re-registers', () => {
    const persistence = new PluginPersistenceService();
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      persistence,
    );

    service.registerPlugin({
      fallback: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        runtime: 'builtin',
      },
      manifest: {
        config: {
          fields: [
            {
              key: 'limit',
              type: 'number',
              defaultValue: 5,
            },
          ],
        },
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    persistence.updatePluginConfig('builtin.ping', { limit: 9 });
    persistence.updatePluginScope('builtin.ping', {
      conversations: {
        'conversation-1': false,
      },
      defaultEnabled: false,
    });
    persistence.setConnectionState('builtin.ping', false);

    const registered = service.registerPlugin({
      fallback: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        runtime: 'builtin',
      },
      manifest: {
        config: {
          fields: [
            {
              key: 'limit',
              type: 'number',
              defaultValue: 5,
            },
          ],
        },
        permissions: [],
        tools: [
          {
            description: 'Ping',
            name: 'ping',
            parameters: {},
          },
        ],
        version: '1.0.1',
      } as never,
    });

    expect(registered).toMatchObject({
      configValues: { limit: 9 },
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: false,
      manifest: {
        tools: [
          expect.objectContaining({
            name: 'ping',
          }),
        ],
        version: '1.0.1',
      },
    });
    expect(persistence.getPluginConfig('builtin.ping')).toEqual({
      schema: {
        fields: [
          {
            key: 'limit',
            type: 'number',
            defaultValue: 5,
          },
        ],
      },
      values: {
        limit: 9,
      },
    });
    expect(persistence.getPluginScope('builtin.ping')).toEqual({
      conversations: {
        'conversation-1': false,
      },
      defaultEnabled: false,
    });
  });

  it('normalizes plugin manifest fields with fallback values', () => {
    expect(
      normalizePluginManifest(
        {
          hooks: [{ name: 'chat:after-model' }],
          permissions: ['llm:generate'],
          tools: [
            {
              description: 'Ping',
              name: 'ping',
              parameters: {},
            },
          ],
        } as never,
        {
          id: 'builtin.ping',
          name: 'Builtin Ping',
          runtime: 'builtin',
          version: '1.0.0',
        },
      ),
    ).toEqual({
      hooks: [{ name: 'chat:after-model' }],
      id: 'builtin.ping',
      name: 'Builtin Ping',
      permissions: ['llm:generate'],
      runtime: 'builtin',
      tools: [
        {
          description: 'Ping',
          name: 'ping',
          parameters: {},
        },
      ],
      version: '1.0.0',
    });
  });

  it('registers builtin plugins from the builtin registry and can reload one by id', () => {
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
      new BuiltinPluginRegistryService(),
    );

    expect(service.bootstrapBuiltins()).toEqual([
      'builtin.conversation-title',
      'builtin.memory-context',
      'builtin.subagent-delegate',
    ]);
    expect(service.reloadBuiltin('builtin.memory-context')).toBe('builtin.memory-context');
    expect(service.listPlugins()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pluginId: 'builtin.conversation-title' }),
        expect.objectContaining({ pluginId: 'builtin.memory-context' }),
        expect.objectContaining({
          manifest: expect.objectContaining({
            tools: expect.arrayContaining([
              expect.objectContaining({ name: 'delegate_summary' }),
              expect.objectContaining({ name: 'delegate_summary_background' }),
            ]),
          }),
          pluginId: 'builtin.subagent-delegate',
        }),
      ]),
    );
  });
});
