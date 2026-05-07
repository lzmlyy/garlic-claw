import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { normalizePluginManifest, PluginBootstrapService } from '../../../src/modules/plugin/bootstrap/plugin-bootstrap.service';
import { BuiltinPluginRegistryService } from '../../../src/modules/plugin/builtin/builtin-plugin-registry.service';
import { PluginGovernanceService } from '../../../src/modules/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/modules/plugin/persistence/plugin-persistence.service';
import type { ProjectPluginDefinitionRecord } from '../../../src/modules/plugin/project/project-plugin-registry.service';

describe('PluginBootstrapService', () => {
  const envKey = 'GARLIC_CLAW_PLUGIN_STATE_PATH';
  let originalPluginStatePath: string | undefined;
  let tempRootPath: string;

  beforeEach(() => {
    originalPluginStatePath = process.env[envKey];
    tempRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-plugin-bootstrap-'));
    process.env[envKey] = path.join(tempRootPath, 'plugins.server.json');
  });

  afterEach(() => {
    if (originalPluginStatePath === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = originalPluginStatePath;
    }
    fs.rmSync(tempRootPath, { force: true, recursive: true });
  });

  it('registers plugins and keeps plugin state readable through the real owners', () => {
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );

    const registered = service.registerPlugin({
      fallback: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        runtime: 'local',
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
        runtime: 'local',
      },
      manifest: {
        config: {
          type: 'object',
          items: {
            limit: {
              type: 'int',
              defaultValue: 5,
            },
          },
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
        runtime: 'local',
      },
      manifest: {
        config: {
          type: 'object',
          items: {
            limit: {
              type: 'int',
              defaultValue: 5,
            },
          },
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
        type: 'object',
        items: {
          limit: {
            type: 'int',
            defaultValue: 5,
          },
        },
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
          runtime: 'local',
          version: '1.0.0',
        },
      ),
    ).toEqual({
      hooks: [{ name: 'chat:after-model' }],
      id: 'builtin.ping',
      name: 'Builtin Ping',
      permissions: ['llm:generate'],
      runtime: 'local',
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

  it('normalizes typed config options and render type from plugin manifest', () => {
    expect(
      normalizePluginManifest(
        {
          config: {
            type: 'object',
            items: {
              themes: {
                type: 'list',
                renderType: 'select',
                options: [
                  {
                    value: 'light',
                    label: '浅色',
                  },
                  {
                    value: 'dark',
                    label: '深色',
                  },
                ],
              },
              locale: {
                type: 'string',
                options: [
                  {
                    value: 'zh-CN',
                    label: '简体中文',
                  },
                ],
              },
            },
          },
          permissions: [],
          tools: [],
        } as never,
        {
          id: 'builtin.theme-config',
          name: 'Theme Config',
          runtime: 'local',
          version: '1.0.0',
        },
      ),
    ).toEqual({
      config: {
        type: 'object',
        items: {
          themes: {
            type: 'list',
            renderType: 'select',
            options: [
              {
                value: 'light',
                label: '浅色',
              },
              {
                value: 'dark',
                label: '深色',
              },
            ],
          },
          locale: {
            type: 'string',
            options: [
              {
                value: 'zh-CN',
                label: '简体中文',
              },
            ],
          },
        },
      },
      id: 'builtin.theme-config',
      name: 'Theme Config',
      permissions: [],
      runtime: 'local',
      tools: [],
      version: '1.0.0',
    });
  });

  it('drops retired builtin plugin records and registers the unified memory builtin during bootstrap', () => {
    const persistence = new PluginPersistenceService();
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      persistence,
      new BuiltinPluginRegistryService(),
    );

    persistence.upsertPlugin({
      connected: false,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
      },
      pluginId: 'builtin.memory-context',
    });

    expect(service.bootstrapBuiltins()).toEqual([
      'builtin.automation',
      'builtin.memory',
    ]);
    expect(service.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.automation',
      }),
      expect.objectContaining({
        pluginId: 'builtin.memory',
      }),
    ]);
    expect(service.canReloadBuiltin('builtin.automation')).toBe(true);
    expect(service.canReloadBuiltin('builtin.memory')).toBe(true);
  });

  it('drops deleted project-local plugin records while keeping current project and remote plugins', () => {
    const persistence = new PluginPersistenceService();
    persistence.upsertPlugin({
      connected: false,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'local.removed',
        name: 'Removed Local Plugin',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
      },
      pluginId: 'local.removed',
    });
    persistence.upsertPlugin({
      connected: false,
      defaultEnabled: false,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'remote.keep',
        name: 'Remote Keep',
        permissions: [],
        runtime: 'remote',
        tools: [],
        version: '1.0.0',
      },
      pluginId: 'remote.keep',
      remote: {
        access: {
          accessKey: null,
          serverUrl: null,
        },
        descriptor: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        metadataCache: {
          lastSyncedAt: null,
          manifestHash: null,
          status: 'empty',
        },
      },
    });
    const definitions: ProjectPluginDefinitionRecord[] = [
      {
        definition: {
          manifest: {
            id: 'local.echo',
            name: 'Local Echo',
            permissions: [],
            runtime: 'local',
            tools: [],
            version: '1.0.0',
          },
        },
        directoryPath: 'config/plugins/local-echo',
        entryFilePath: 'config/plugins/local-echo/dist/index.js',
      },
    ];
    const projectPluginRegistryService = {
      getDefinition: jest.fn((pluginId: string) => {
        const definition = definitions.find((entry) => entry.definition.manifest.id === pluginId);
        if (!definition) {
          throw new Error(`Project plugin definition not found: ${pluginId}`);
        }
        return definition;
      }),
      hasDefinition: jest.fn((pluginId: string) => definitions.some((entry) => entry.definition.manifest.id === pluginId)),
      loadDefinitions: jest.fn(() => definitions),
      reloadDefinition: jest.fn((pluginId: string) => {
        const definition = definitions.find((entry) => entry.definition.manifest.id === pluginId);
        if (!definition) {
          throw new Error(`Project plugin definition not found: ${pluginId}`);
        }
        return definition;
      }),
    };
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      persistence,
      new BuiltinPluginRegistryService(),
      projectPluginRegistryService as never,
    );

    expect(service.bootstrapProjectPlugins()).toEqual(['local.echo']);
    expect(service.listPlugins()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: 'local.echo',
      }),
      expect.objectContaining({
        pluginId: 'remote.keep',
      }),
    ]));
    expect(service.listPlugins().map((plugin) => plugin.pluginId)).not.toContain('local.removed');
  });
});
