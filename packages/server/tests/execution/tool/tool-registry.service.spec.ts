import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AiModelExecutionService } from '../../../src/modules/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/modules/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/modules/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/modules/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/modules/execution/automation/automation.service';
import { BashToolService } from '../../../src/modules/execution/bash/bash-tool.service';
import { EditToolService } from '../../../src/modules/execution/edit/edit-tool.service';
import { HostFilesystemBackendService } from '../../../src/modules/execution/file/host-filesystem-backend.service';
import { GlobToolService } from '../../../src/modules/execution/glob/glob-tool.service';
import { GrepToolService } from '../../../src/modules/execution/grep/grep-tool.service';
import { InvalidToolService } from '../../../src/modules/execution/invalid/invalid-tool.service';
import { ProjectWorktreeSearchOverlayService } from '../../../src/modules/execution/project/project-worktree-search-overlay.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/modules/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { ReadToolService } from '../../../src/modules/execution/read/read-tool.service';
import { RuntimeCommandService } from '../../../src/modules/execution/runtime/runtime-command.service';
import { RuntimeCommandCaptureService } from '../../../src/modules/execution/runtime/runtime-command-capture.service';
import { RuntimeJustBashService } from '../../../src/modules/execution/runtime/runtime-just-bash.service';
import { RuntimeNativeShellService } from '../../../src/modules/execution/runtime/runtime-native-shell.service';
import { RuntimeOneShotShellService } from '../../../src/modules/execution/runtime/runtime-one-shot-shell.service';
import { RuntimeBackendRoutingService } from '../../../src/modules/execution/runtime/runtime-backend-routing.service';
import type { RuntimeBackend } from '../../../src/modules/execution/runtime/runtime-command.types';
import { RuntimeFilesystemBackendService } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.service';
import type { RuntimeFilesystemBackend } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.types';
import { readRuntimeShellToolName } from '../../../src/modules/execution/runtime/runtime-shell-tool-name';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../../src/modules/execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../../src/modules/execution/runtime/runtime-tool-permission.service';
import { RuntimeToolsSettingsService } from '../../../src/modules/execution/runtime/runtime-tools-settings.service';
import { RuntimeWslShellService } from '../../../src/modules/execution/runtime/runtime-wsl-shell.service';
import { SkillRegistryService } from '../../../src/modules/execution/skill/skill-registry.service';
import { SkillToolService } from '../../../src/modules/execution/skill/skill-tool.service';
import { SubagentSettingsService } from '../../../src/modules/execution/subagent/subagent-settings.service';
import { ToolManagementSettingsService } from '../../../src/modules/execution/tool/tool-management-settings.service';
import { ToolOutputCaptureService } from '../../../src/modules/execution/tool/tool-output-capture.service';
import { SubagentToolService } from '../../../src/modules/execution/subagent/subagent-tool.service';
import { TodoToolService } from '../../../src/modules/execution/todo/todo-tool.service';
import { WebFetchToolService } from '../../../src/modules/execution/webfetch/webfetch-tool.service';
import { WriteToolService } from '../../../src/modules/execution/write/write-tool.service';
import { BuiltinPluginRegistryService } from '../../../src/modules/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/modules/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/modules/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/modules/plugin/persistence/plugin-persistence.service';
import { PersonaService } from '../../../src/modules/persona/persona.service';
import { PersonaStoreService } from '../../../src/modules/persona/persona-store.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/modules/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/modules/runtime/gateway/runtime-gateway-remote-transport.service';
import { ConversationMessageService } from '../../../src/modules/runtime/host/conversation-message.service';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';
import { ConversationTodoService } from '../../../src/modules/runtime/host/conversation-todo.service';
import { KnowledgeReaderService } from '../../../src/modules/runtime/host/knowledge-reader.service';
import { PluginDispatchService } from '../../../src/modules/runtime/host/plugin-dispatch.service';
import { PluginRuntimeService } from '../../../src/modules/runtime/host/plugin-runtime.service';
import { ToolGatewayService } from '../../../src/modules/runtime/host/tool-gateway.service';
import { PluginHostService } from '../../../src/modules/runtime/host/plugin-host.service';
import { SubagentRunnerService } from '../../../src/modules/runtime/host/subagent-runner.service';
import { UserContextService } from '../../../src/modules/runtime/host/user-context.service';
import { RuntimePluginGovernanceService } from '../../../src/modules/runtime/kernel/runtime-plugin-governance.service';
import { ToolRegistryService } from '../../../src/modules/execution/tool/tool-registry.service';

const runtimeWorkspaceRoots: string[] = [];
const runtimeOneShotShellServices: RuntimeOneShotShellService[] = [];
const originalRuntimeWorkspaceRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
const originalSettingsConfigPath = process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
const originalHintsTestRoot = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;

describe('ToolRegistryService', () => {
  afterEach(async () => {
    if (originalRuntimeWorkspaceRoot === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = originalRuntimeWorkspaceRoot;
    }
    if (originalSettingsConfigPath === undefined) {
      delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    } else {
      process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = originalSettingsConfigPath;
    }
    if (originalHintsTestRoot === undefined) {
      delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    } else {
      process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalHintsTestRoot;
    }
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (!nextRoot) {
        continue;
      }
      try {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      } catch {
        // Windows 下进程退出后目录锁可能未立即释放，只做尽力清理。
      }
    }
  });

  it('lists plugin tool sources and tool records', async () => {
    const { service } = createFixture();

    await expect(service.listOverview()).resolves.toEqual(expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin.memory',
          kind: 'plugin',
          totalTools: 2,
        }),
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'plugin:builtin.memory:save_memory',
        }),
        expect.objectContaining({
          toolId: 'plugin:builtin.memory:search_memory',
        }),
      ]),
    }));
  });

  it('lists MCP tool sources and tool records', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
            },
            required: ['city'],
          },
        },
      ],
    });

    await expect(service.listOverview()).resolves.toEqual(expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({
          kind: 'mcp',
          id: 'weather',
          totalTools: 1,
        }),
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'mcp:weather:get_forecast',
          sourceKind: 'mcp',
          sourceId: 'weather',
          parameters: {
            city: {
              type: 'string',
              required: true,
              description: 'City name',
            },
          },
        }),
      ]),
    }));
  });

  it('includes native skill tool in the executable tool set', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toContain('skill');
  });

  it('includes native todowrite, webfetch, bash, read, glob, grep, write and edit tools in the executable tool set', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual(expect.arrayContaining([
      'todowrite',
      'webfetch',
      'bash',
      'read',
      'glob',
      'grep',
      'write',
      'edit',
    ]));
  });

  it('exposes powershell as the shell tool name when native-shell is selected on Windows', async () => {
    const { runtimeToolsSettingsService, service } = createFixture();
    runtimeToolsSettingsService.updateConfig({
      shellBackend: 'native-shell',
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });

    expect(Object.keys(toolSet ?? {})).toContain(readRuntimeShellToolName('native-shell'));
  });

  it('updates source and tool enabled flags and dispatches plugin source actions', async () => {
    const { runtimePluginGovernanceService, service } = createFixture();
    runtimePluginGovernanceService.runPluginAction = jest.fn().mockImplementation(async ({ action, pluginId }) => ({
      accepted: true,
      action,
      pluginId,
      message: action === 'health-check' ? '插件健康检查通过' : '已重新装载本地插件',
    })) as never;

    await expect(
      service.setSourceEnabled('plugin', 'builtin.memory', false),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        id: 'builtin.memory',
      }),
    );
    await expect(
      service.setToolEnabled('plugin:builtin.memory:save_memory', false),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        toolId: 'plugin:builtin.memory:save_memory',
      }),
    );
    await expect(
      service.runSourceAction('plugin', 'builtin.memory', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory',
      message: '插件健康检查通过',
    });
    await expect(
      service.runSourceAction('plugin', 'builtin.memory', 'reload'),
    ).rejects.toThrow('工具源 plugin:builtin.memory 不支持治理动作 reload');
  });

  it('cleans current plugin source state when local reload finds that the directory was removed', async () => {
    const {
      pluginBootstrapService,
      conversationStore,
      pluginRuntime,
      runtimePluginGovernanceService,
      service,
      toolManagementSettingsService,
    } = createFixture();
    jest.spyOn(pluginBootstrapService, 'getPlugin').mockReturnValue({
      connected: true,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.memory',
        name: 'Memory',
        permissions: [],
        runtime: 'local',
        tools: [
          {
            description: 'save',
            name: 'save_memory',
            parameters: {},
          },
        ],
        version: '1.0.0',
      },
      pluginId: 'builtin.memory',
      status: 'online',
    } as never);
    jest.spyOn(pluginBootstrapService, 'canReloadLocal').mockReturnValue(true);
    jest.spyOn(pluginBootstrapService, 'reloadLocal').mockReturnValue({
      pluginId: 'builtin.memory',
      removed: true,
    });
    const deletePluginRuntimeStateSpy = jest.spyOn(pluginRuntime, 'deletePluginRuntimeState');
    const deletePluginConversationSessionsSpy = jest.spyOn(conversationStore, 'deletePluginConversationSessions');
    const deleteGovernanceRuntimeStateSpy = jest.spyOn(runtimePluginGovernanceService, 'deletePluginRuntimeState');
    toolManagementSettingsService.writeSourceEnabledOverride('plugin:builtin.memory', false);
    toolManagementSettingsService.writeToolEnabledOverride('plugin:builtin.memory:save_memory', false);

    await expect(
      service.runSourceAction('plugin', 'builtin.memory', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory',
      message: '本地插件目录已删除，已清理旧记录',
    });

    expect(deletePluginRuntimeStateSpy).toHaveBeenCalledWith('builtin.memory');
    expect(deletePluginConversationSessionsSpy).toHaveBeenCalledWith('builtin.memory');
    expect(deleteGovernanceRuntimeStateSpy).toHaveBeenCalledWith('builtin.memory');
    expect(toolManagementSettingsService.readSourceEnabledOverride('plugin:builtin.memory')).toBeUndefined();
    expect(toolManagementSettingsService.readToolEnabledOverride('plugin:builtin.memory:save_memory')).toBeUndefined();
  });

  it('persists source and tool enabled overrides across service reload', async () => {
    const fixture = createFixture();

    await fixture.service.setSourceEnabled('plugin', 'builtin.memory', false);
    await fixture.service.setToolEnabled('plugin:builtin.memory:save_memory', false);

    const reloaded = createFixture({ runtimeWorkspaceRoot: fixture.runtimeWorkspaceRoot });
    const overview = await reloaded.service.listOverview();
    const source = overview.sources.find((entry) => entry.kind === 'plugin' && entry.id === 'builtin.memory');
    const tool = overview.tools.find((entry) => entry.toolId === 'plugin:builtin.memory:save_memory');

    expect(source?.enabled).toBe(false);
    expect(tool?.enabled).toBe(false);
  });

  it('does not report plugin tools as enabled when the whole plugin source is disabled', async () => {
    const { service } = createFixture();

    await service.setSourceEnabled('plugin', 'builtin.memory', false);

    await expect(
      service.setToolEnabled('plugin:builtin.memory:save_memory', true),
    ).resolves.toEqual(expect.objectContaining({
      enabled: false,
      toolId: 'plugin:builtin.memory:save_memory',
    }));

    const overview = await service.listOverview();
    const source = overview.sources.find((entry) => entry.kind === 'plugin' && entry.id === 'builtin.memory');
    const tool = overview.tools.find((entry) => entry.toolId === 'plugin:builtin.memory:save_memory');

    expect(source).toEqual(expect.objectContaining({
      enabled: false,
      enabledTools: 0,
      id: 'builtin.memory',
      kind: 'plugin',
    }));
    expect(tool).toEqual(expect.objectContaining({
      enabled: false,
      toolId: 'plugin:builtin.memory:save_memory',
    }));
  });

  it('does not fabricate plugin health before any health snapshot exists', async () => {
    const { service } = createFixture();

    const overview = await service.listOverview();
    const source = overview.sources.find((entry) => entry.kind === 'plugin' && entry.id === 'builtin.memory');

    expect(source).toEqual(expect.objectContaining({
      id: 'builtin.memory',
      kind: 'plugin',
    }));
    expect(source?.health).toBeUndefined();
    expect(source?.lastCheckedAt).toBeUndefined();
    expect(source?.lastError).toBeUndefined();
  });

  it('uses stored plugin health snapshot in tool overview after a real check', async () => {
    const { runtimePluginGovernanceService, service } = createFixture();

    await runtimePluginGovernanceService.readPluginHealthSnapshot('builtin.memory');

    const overview = await service.listOverview();
    const source = overview.sources.find((entry) => entry.kind === 'plugin' && entry.id === 'builtin.memory');

    expect(source).toEqual(expect.objectContaining({
      health: 'healthy',
      id: 'builtin.memory',
      kind: 'plugin',
    }));
    expect(source?.lastCheckedAt).toEqual(expect.any(String));
  });

  it('updates MCP source enabled flags and dispatches MCP source actions', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [],
    });
    mcpService.setServerEnabled.mockResolvedValue(undefined);
    mcpService.runGovernanceAction.mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });

    await expect(service.setSourceEnabled('mcp', 'weather', false)).resolves.toEqual(
      expect.objectContaining({
        kind: 'mcp',
        id: 'weather',
      }),
    );
    await expect(service.runSourceAction('mcp', 'weather', 'health-check')).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });
    expect(mcpService.setServerEnabled).toHaveBeenCalledWith('weather', false);
  });

  it('applies MCP tool enabled overrides to overview and executable tool set', async () => {
    const { mcpService, service, toolManagementSettingsService } = createFixture();
    const buildOverview = () => {
      const firstEnabled = toolManagementSettingsService.readToolEnabledOverride('mcp:weather:get_forecast') ?? true;
      const secondEnabled = toolManagementSettingsService.readToolEnabledOverride('mcp:weather:get_alerts') ?? true;
      return [{
        source: {
          kind: 'mcp' as const,
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy' as const,
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
          totalTools: 2,
          enabledTools: [firstEnabled, secondEnabled].filter(Boolean).length,
          supportedActions: ['health-check', 'reconnect', 'reload'],
        },
        tools: [
          {
            toolId: 'mcp:weather:get_forecast',
            name: 'get_forecast',
            callName: 'weather__get_forecast',
            description: 'Get forecast',
            parameters: {},
            enabled: firstEnabled,
            sourceKind: 'mcp' as const,
            sourceId: 'weather',
            sourceLabel: 'weather',
            health: 'healthy' as const,
            lastError: null,
            lastCheckedAt: '2026-04-14T00:00:00.000Z',
          },
          {
            toolId: 'mcp:weather:get_alerts',
            name: 'get_alerts',
            callName: 'weather__get_alerts',
            description: 'Get alerts',
            parameters: {},
            enabled: secondEnabled,
            sourceKind: 'mcp' as const,
            sourceId: 'weather',
            sourceLabel: 'weather',
            health: 'healthy' as const,
            lastError: null,
            lastCheckedAt: '2026-04-14T00:00:00.000Z',
          },
        ],
      }];
    };
    mcpService.listToolSources.mockImplementation(buildOverview);

    await expect(service.setToolEnabled('mcp:weather:get_alerts', false)).resolves.toEqual(
      expect.objectContaining({
        toolId: 'mcp:weather:get_alerts',
        enabled: false,
      }),
    );

    const overview = await service.listOverview();
    const alertTool = overview.tools.find((entry) => entry.toolId === 'mcp:weather:get_alerts');
    const source = overview.sources.find((entry) => entry.kind === 'mcp' && entry.id === 'weather');

    expect(alertTool?.enabled).toBe(false);
    expect(source).toEqual(expect.objectContaining({
      totalTools: 2,
      enabledTools: 1,
    }));

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toContain('weather__get_forecast');
    expect(Object.keys(toolSet ?? {})).not.toContain('weather__get_alerts');
  });

  it('keeps MCP sources visible in overview when a source is disabled but still has known tools', async () => {
    const { mcpService, service } = createFixture();
    mcpService.listToolSources.mockReturnValue([
      {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: false,
          health: 'error',
          lastError: 'server offline',
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
          totalTools: 2,
          enabledTools: 0,
          supportedActions: ['health-check', 'reconnect', 'reload'],
        },
        tools: [
          {
            toolId: 'mcp:weather:get_forecast',
            name: 'get_forecast',
            callName: 'weather__get_forecast',
            description: 'Get forecast',
            parameters: {},
            enabled: false,
            sourceKind: 'mcp',
            sourceId: 'weather',
            sourceLabel: 'weather',
            health: 'error',
            lastError: 'server offline',
            lastCheckedAt: '2026-04-14T00:00:00.000Z',
          },
          {
            toolId: 'mcp:weather:get_alerts',
            name: 'get_alerts',
            callName: 'weather__get_alerts',
            description: 'Get alerts',
            parameters: {},
            enabled: false,
            sourceKind: 'mcp',
            sourceId: 'weather',
            sourceLabel: 'weather',
            health: 'error',
            lastError: 'server offline',
            lastCheckedAt: '2026-04-14T00:00:00.000Z',
          },
        ],
      },
    ]);

    const overview = await service.listOverview();

    expect(overview.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'mcp',
        id: 'weather',
        enabled: false,
        totalTools: 2,
        enabledTools: 0,
      }),
    ]));
  });

  it('keeps offline plugin sources visible in overview but excludes them from executable tools', async () => {
    const { pluginBootstrapService, service } = createFixture();
    pluginBootstrapService.registerPlugin({
      connected: false,
      fallback: {
        id: 'remote.weather',
        name: 'Remote Weather',
        runtime: 'remote',
      },
      manifest: {
        id: 'remote.weather',
        name: 'Remote Weather',
        permissions: [],
        runtime: 'remote',
        tools: [
          {
            description: 'Get forecast',
            name: 'get_forecast',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
      remote: {
        access: { accessKey: 'key', serverUrl: 'https://example.com/plugin' },
        descriptor: {
          auth: { mode: 'required' },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        metadataCache: {
          lastSyncedAt: '2026-05-01T00:00:00.000Z',
          manifestHash: 'hash-1',
          status: 'cached',
        },
      },
    });

    const overview = await service.listOverview();
    const source = overview.sources.find((entry) => entry.kind === 'plugin' && entry.id === 'remote.weather');
    const tool = overview.tools.find((entry) => entry.toolId === 'plugin:remote.weather:get_forecast');

    expect(source).toEqual(expect.objectContaining({
      kind: 'plugin',
      id: 'remote.weather',
      totalTools: 1,
      enabledTools: 0,
    }));
    expect(tool).toEqual(expect.objectContaining({
      toolId: 'plugin:remote.weather:get_forecast',
      enabled: false,
      sourceKind: 'plugin',
    }));

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(Object.keys(toolSet ?? {})).not.toContain('get_forecast');
  });

  it('filters out tools disabled for the current conversation scope', async () => {
    const { pluginBootstrapService, service } = createFixture();
    const builtinPersisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    builtinPersisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('builtin.memory'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: true,
      lastSeenAt: new Date().toISOString(),
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.memory-tools',
        name: 'Remote Memory Tools',
        runtime: 'remote',
      },
      governance: {
        defaultEnabled: false,
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: '搜索记忆',
            name: 'search_memory',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });
    const persisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    persisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('remote.memory-tools'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
        'conversation-2': true,
      },
      defaultEnabled: false,
      lastSeenAt: new Date().toISOString(),
    });

    await expect(service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    })).resolves.toEqual(expect.objectContaining({
      skill: expect.any(Object),
    }));

    const enabledTools = await service.buildToolSet({
      context: {
        conversationId: 'conversation-2',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(enabledTools).toBeDefined();
    expect(Object.keys(enabledTools ?? {})).toEqual([
      'save_memory',
      'search_memory',
      'bash',
      'read',
      'glob',
      'grep',
      'write',
      'edit',
      'spawn_subagent',
      'wait_subagent',
      'send_input_subagent',
      'interrupt_subagent',
      'close_subagent',
      'todowrite',
      'webfetch',
      'skill',
      'invalid',
    ]);
  });

  it('blocks direct plugin execution when the plugin is disabled for the current conversation scope', async () => {
    const { pluginBootstrapService, pluginDispatch, service } = createFixture();
    const executeToolSpy = jest.spyOn(pluginDispatch, 'executeTool');
    const persisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    persisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('builtin.memory'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: true,
      lastSeenAt: new Date().toISOString(),
    });

    await expect(service.executeRegisteredTool({
      context: {
        conversationId: 'conversation-1',
        source: 'automation',
        userId: 'user-1',
      },
      params: { content: 'should not run' },
      sourceId: 'builtin.memory',
      sourceKind: 'plugin',
      toolName: 'save_memory',
    })).rejects.toThrow('Tool disabled for current context: plugin:builtin.memory:save_memory');
    expect(executeToolSpy).not.toHaveBeenCalled();
  });

  it('blocks direct plugin execution when the source is disabled', async () => {
    const { pluginDispatch, service } = createFixture();
    const executeToolSpy = jest.spyOn(pluginDispatch, 'executeTool');

    await service.setSourceEnabled('plugin', 'builtin.memory', false);

    await expect(service.executeRegisteredTool({
      context: {
        conversationId: 'conversation-1',
        source: 'automation',
        userId: 'user-1',
      },
      params: { content: 'should not run' },
      sourceId: 'builtin.memory',
      sourceKind: 'plugin',
      toolName: 'save_memory',
    })).rejects.toThrow('Tool disabled for current context: plugin:builtin.memory:save_memory');
    expect(executeToolSpy).not.toHaveBeenCalled();
  });

  it('blocks direct MCP execution when the tool is disabled', async () => {
    const { mcpService, service } = createFixture();
    mcpService.listToolSources.mockReturnValue([
      {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-05-01T00:00:00.000Z',
          totalTools: 1,
          enabledTools: 0,
          supportedActions: ['health-check', 'reconnect', 'reload'],
        },
        tools: [
          {
            toolId: 'mcp:weather:get_forecast',
            name: 'get_forecast',
            callName: 'weather__get_forecast',
            description: 'Get forecast',
            parameters: {},
            enabled: false,
            sourceKind: 'mcp',
            sourceId: 'weather',
            sourceLabel: 'weather',
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      },
    ]);

    await expect(service.executeRegisteredTool({
      context: {
        conversationId: 'conversation-1',
        source: 'automation',
        userId: 'user-1',
      },
      params: { city: 'Shanghai' },
      sourceId: 'weather',
      sourceKind: 'mcp',
      toolName: 'get_forecast',
    })).rejects.toThrow('Tool disabled for current context: mcp:weather:get_forecast');
    expect(mcpService.callTool).not.toHaveBeenCalled();
  });

  it('includes builtin tools in the executable tool set when enabled', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual([
      'save_memory',
      'search_memory',
      'bash',
      'read',
      'glob',
      'grep',
      'write',
      'edit',
      'spawn_subagent',
      'wait_subagent',
      'send_input_subagent',
      'interrupt_subagent',
      'close_subagent',
      'todowrite',
      'webfetch',
      'skill',
      'invalid',
    ]);
  });

  it('does not expose internal invalid tool in the available tool summary list', async () => {
    const { service } = createFixture();

    const tools = await service.listAvailableTools({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(tools.map((entry) => entry.name)).not.toContain('invalid');
  });

  it('dispatches native webfetch tool execution through the webfetch owner', async () => {
    const { service, webFetchService } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['webfetch'],
    });
    const webFetchTool = toolSet?.webfetch;
    expect(webFetchTool).toBeDefined();
    const result = await (webFetchTool as any).execute({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
    const modelOutput = await (webFetchTool as any).toModelOutput({
      input: {
        format: 'markdown',
        url: 'https://example.com/smoke',
      },
      output: result,
      toolCallId: 'call-webfetch-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('<webfetch_result>'),
      data: expect.objectContaining({
        format: 'markdown',
        title: 'Smoke Example',
        url: 'https://example.com/smoke',
      }),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<webfetch_result>'),
    }));
    expect(webFetchService.fetch).toHaveBeenCalledWith({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
  });

  it('dispatches native bash tool execution through the runtime owner and persists workspace files', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell');
      const { conversationId, runtimeToolPermissionService, service, runtimeWorkspaceRoot } = createFixture();

      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-allow-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const writeExecution = (bashTool as any).execute({
        command: buildRuntimeShellPersistAndReadCommand('logs/run.txt', 'persisted'),
        description: '写入并校验运行日志',
      });
      const writeRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(writeRequest).toMatchObject({
        messageId: 'assistant-message-allow-1',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, writeRequest.id, 'once');
      const writeResult = await writeExecution;

      const readExecution = (bashTool as any).execute({
        command: buildRuntimeShellReadCommand('logs/run.txt'),
        description: '读取刚才的运行日志',
      });
      const readRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(readRequest).toMatchObject({
        messageId: 'assistant-message-allow-1',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, readRequest.id, 'once');
      const readResult = await readExecution;
      const modelOutput = await (bashTool as any).toModelOutput({
        input: { command: buildRuntimeShellReadCommand('logs/run.txt'), description: '读取刚才的运行日志' },
        output: readResult,
        toolCallId: 'call-bash-1',
      });

      expect(writeResult).toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('persisted'),
      }));
      expect(readResult).toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('persisted'),
      }));
      expect(readResult).not.toHaveProperty('cwd');
      expect(readResult).not.toHaveProperty('stdout');
      expect(readResult).not.toHaveProperty('stderr');
      expect(readWrappedToolData(readResult)).toEqual(expect.objectContaining({
        cwd: '/',
        stdout: expect.stringContaining('persisted'),
      }));
      expect(modelOutput).toEqual(expect.objectContaining({
        type: 'text',
        value: expect.stringContaining(`<${shellToolName}_result>`),
      }));
      expect((modelOutput as { value: string }).value).not.toContain('cwd: /');
      expect((modelOutput as { value: string }).value).not.toContain('backend:');
      expect(
        fs.readFileSync(path.join(runtimeWorkspaceRoot, conversationId, 'logs', 'run.txt'), 'utf8').replace(/\r\n/g, '\n'),
      ).toBe('persisted\n');
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('applies internal runtime-tools bash output config through the internal settings owner', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell');
      const { conversationId, runtimeToolPermissionService, runtimeToolsSettingsService, service } = createFixture();
      runtimeToolsSettingsService.updateConfig({
        shellBackend: 'native-shell',
        bashOutput: {
          maxLines: 2,
          showTruncationDetails: false,
        },
      });

      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-allow-2',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: buildRuntimeShellMultilineOutputCommand(['line-1', 'line-2', 'line-3', 'line-4']),
        description: '生成多行输出',
      });
      const request = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      runtimeToolPermissionService.reply(conversationId, request.id, 'once');
      const result = await execution;
      const modelOutput = await (bashTool as any).toModelOutput({
        input: {
          command: buildRuntimeShellMultilineOutputCommand(['line-1', 'line-2', 'line-3', 'line-4']),
          description: '生成多行输出',
        },
        output: result,
        toolCallId: 'call-bash-config-1',
      });

      expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
        backendKind: 'native-shell',
        stdout: expect.stringContaining('line-4'),
      }));
      expect(modelOutput).toEqual(expect.objectContaining({
        type: 'text',
        value: expect.stringContaining(`<${shellToolName}_result>`),
      }));
      expect((modelOutput as { value: string }).value).toContain('<stdout>\nline-3\nline-4\n</stdout>');
      expect((modelOutput as { value: string }).value).not.toContain('output truncated');
      expect((modelOutput as { value: string }).value).not.toContain('line-2\nline-3');
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes internal runtime-tools bash execution through the configured shell backend', async () => {
    const shellToolName = readRuntimeShellToolName('native-shell');
    const { conversationId, runtimeToolPermissionService, runtimeToolsSettingsService, service } = createFixture();
    runtimeToolsSettingsService.updateConfig({
      shellBackend: 'native-shell',
    });

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-shell-config-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.[shellToolName];
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'echo configured-backend',
      description: '验证配置指定 shell backend',
    });
    const request = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(request).toMatchObject({
      backendKind: 'native-shell',
      messageId: 'assistant-message-shell-config-1',
      toolName: shellToolName,
    });
    runtimeToolPermissionService.reply(conversationId, request.id, 'once');
    const result = await execution;

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      backendKind: 'native-shell',
      stdout: expect.stringContaining('configured-backend'),
    }));
  });

  it('uses the platform default backend when internal runtime-tools shellBackend is unset', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-shell-default-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'printf "default-platform-backend\\n"',
      description: '验证 internal runtime-tools 默认 shell backend',
    });
    const request = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(request).toMatchObject({
      backendKind: 'just-bash',
      messageId: 'assistant-message-shell-default-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, request.id, 'once');
    const result = await execution;

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      backendKind: 'just-bash',
      stdout: expect.stringContaining('default-platform-backend'),
    }));
  });

  it('supports hot-switching internal runtime-tools bash execution to the platform-scoped secondary backend', async () => {
    const secondaryShellBackendKind = process.platform === 'win32' ? 'wsl-shell' : 'native-shell';
    const shellToolName = readRuntimeShellToolName(secondaryShellBackendKind);
    const runtimeBackends = process.platform === 'win32'
      ? (() => {
        const baseRuntimeBackends = createRealRuntimeBackendsForShellRouting(undefined, { includeWsl: false });
        return [
          ...baseRuntimeBackends,
          createKindAliasedRuntimeBackend('wsl-shell', baseRuntimeBackends, 'just-bash'),
        ];
      })()
      : undefined;
    const { conversationId, runtimeToolPermissionService, runtimeToolsSettingsService, service } = createFixture({
      ...(runtimeBackends ? { runtimeBackends } : {}),
    });
    runtimeToolsSettingsService.updateConfig({
      shellBackend: secondaryShellBackendKind,
    });

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-shell-config-alias-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.[shellToolName];
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'printf "configured-secondary-backend\\n"',
      description: '验证配置热切换 secondary shell backend',
    });
    const request = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(request).toMatchObject({
      backendKind: secondaryShellBackendKind,
      messageId: 'assistant-message-shell-config-alias-1',
      toolName: shellToolName,
    });
    runtimeToolPermissionService.reply(conversationId, request.id, 'once');
    const result = await execution;

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      backendKind: secondaryShellBackendKind,
      stdout: expect.stringContaining('configured-secondary-backend'),
    }));
  });

  it('lists internal subagent tools as a dedicated internal source', async () => {
    const { service } = createFixture();

    const overview = await service.listOverview();

    expect(overview.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'internal',
        id: 'subagent',
        label: 'Subagent',
      }),
    ]));
    expect(overview.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: 'internal',
        sourceId: 'subagent',
        callName: 'spawn_subagent',
        description: expect.stringContaining('wait_subagent'),
        toolId: 'internal:subagent:spawn_subagent',
      }),
      expect.objectContaining({
        sourceKind: 'internal',
        sourceId: 'subagent',
        callName: 'wait_subagent',
        description: expect.stringContaining('result'),
        toolId: 'internal:subagent:wait_subagent',
      }),
      expect.objectContaining({
        sourceKind: 'internal',
        sourceId: 'subagent',
        callName: 'spawn_subagent',
        parameters: expect.objectContaining({
          subagentType: expect.objectContaining({
            description: expect.stringContaining('general'),
          }),
        }),
      }),
    ]));
  });

  it('routes internal subagent tools through the internal subagent owner', async () => {
    const { subagentRunner, service } = createFixture();
    jest.spyOn(subagentRunner, 'spawnSubagent').mockResolvedValue({
      pluginId: 'subagent',
      pluginDisplayName: 'Subagent',
      requestPreview: '继续处理当前仓库',
      conversationId: 'subagent-conversation-2',
      parentConversationId: 'conversation-1',
      title: '浏览器烟测分身',
      messageCount: 2,
      updatedAt: '2026-04-26T10:00:00.000Z',
      runtimeKind: 'local',
      status: 'queued',
      requestedAt: '2026-04-26T10:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      closedAt: null,
    } as never);
    jest.spyOn(subagentRunner, 'waitSubagent').mockResolvedValue({
      conversationId: 'subagent-conversation-2',
      result: '已完成',
      title: '浏览器烟测分身',
      name: '浏览器烟测分身',
      status: 'completed',
    } as never);
    jest.spyOn(subagentRunner, 'getSubagent').mockReturnValue({
      pluginId: 'subagent',
      pluginDisplayName: 'Subagent',
      requestPreview: '继续处理当前仓库',
      conversationId: 'subagent-conversation-2',
      parentConversationId: 'conversation-1',
      title: '浏览器烟测分身',
      messageCount: 2,
      updatedAt: '2026-04-26T10:00:01.000Z',
      runtimeKind: 'local',
      status: 'completed',
      requestedAt: '2026-04-26T10:00:00.000Z',
      startedAt: '2026-04-26T10:00:00.500Z',
      finishedAt: '2026-04-26T10:00:01.000Z',
      closedAt: null,
      context: { source: 'plugin', conversationId: 'conversation-1' },
      request: {
        messages: [{ content: '继续处理当前仓库', role: 'user' }],
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.4',
        text: '已完成',
        message: { role: 'assistant', content: '已完成' },
        toolCalls: [],
        toolResults: [],
      },
    } as never);

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['spawn_subagent', 'wait_subagent'],
    });

    const backgroundResult = await (toolSet?.spawn_subagent as any).execute({
      description: '继续处理',
      name: '浏览器烟测分身',
      prompt: '继续处理当前仓库',
    });
    const waitedResult = await (toolSet?.wait_subagent as any).execute({
      conversationId: 'subagent-conversation-2',
      timeoutMs: 1000,
    });

    expect(backgroundResult).toEqual(expect.objectContaining({
      kind: 'tool:json',
      value: {
        conversationId: 'subagent-conversation-2',
        status: 'queued',
        title: '浏览器烟测分身',
      },
      data: expect.objectContaining({
        conversationId: 'subagent-conversation-2',
        status: 'queued',
        title: '浏览器烟测分身',
      }),
    }));
    expect(waitedResult).toEqual(expect.objectContaining({
      kind: 'tool:json',
      value: {
        conversationId: 'subagent-conversation-2',
        name: '浏览器烟测分身',
        result: '已完成',
        status: 'completed',
        title: '浏览器烟测分身',
      },
      data: expect.objectContaining({
        conversationId: 'subagent-conversation-2',
        status: 'completed',
      }),
    }));
    expect(subagentRunner.spawnSubagent).toHaveBeenCalledWith(
      'subagent',
      'Subagent',
      expect.objectContaining({ conversationId: 'conversation-1' }),
      expect.objectContaining({
        description: '继续处理',
        name: '浏览器烟测分身',
        messages: [
          {
            content: [{ text: '继续处理当前仓库', type: 'text' }],
            role: 'user',
          },
        ],
      }),
    );
    expect(subagentRunner.waitSubagent).toHaveBeenCalledWith('subagent', {
      conversationId: 'subagent-conversation-2',
      timeoutMs: 1000,
    });
  });

  it('passes name through send_input_subagent to the subagent owner', async () => {
    const { subagentRunner, service } = createFixture();
    jest.spyOn(subagentRunner, 'sendInputSubagent').mockResolvedValue({
      pluginId: 'subagent',
      pluginDisplayName: 'Subagent',
      requestPreview: '补一条新的输入',
      conversationId: 'subagent-conversation-2',
      parentConversationId: 'conversation-1',
      title: '跟进分身',
      messageCount: 4,
      updatedAt: '2026-04-26T10:00:02.000Z',
      runtimeKind: 'local',
      status: 'queued',
      requestedAt: '2026-04-26T10:00:02.000Z',
      startedAt: null,
      finishedAt: null,
      closedAt: null,
    } as never);

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['send_input_subagent'],
    });

    const result = await (toolSet?.send_input_subagent as any).execute({
      conversationId: 'subagent-conversation-2',
      description: '继续处理',
      name: '跟进分身',
      prompt: '补一条新的输入',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:json',
      value: {
        conversationId: 'subagent-conversation-2',
        status: 'queued',
        title: '跟进分身',
      },
      data: expect.objectContaining({
        conversationId: 'subagent-conversation-2',
        title: '跟进分身',
      }),
    }));
    expect(subagentRunner.sendInputSubagent).toHaveBeenCalledWith(
      'subagent',
      expect.objectContaining({ conversationId: 'conversation-1' }),
      expect.objectContaining({
        conversationId: 'subagent-conversation-2',
        description: '继续处理',
        name: '跟进分身',
        messages: [
          {
            content: [{ text: '补一条新的输入', type: 'text' }],
            role: 'user',
          },
        ],
      }),
    );
  });

  it('keeps bash description on stable workspace semantics instead of backend governance details', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    expect((bashTool as { description: string }).description).toContain('在当前 session 的执行后端中执行命令');
    expect((bashTool as { description: string }).description).toContain('同一 session 下写入 backend 当前可见路径的文件');
    expect((bashTool as { description: string }).description).not.toContain('当前默认 runtime 后端');
    expect((bashTool as { description: string }).description).not.toContain('宿主工作区');
    expect((bashTool as { description: string }).description).not.toContain('权限审批');
  });

  it('requires runtime approval before executing native bash tool', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: buildRuntimeShellPwdCommand(),
      description: '查看当前工作目录',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('attaches static shell hints to bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cd nested && cat logs/run.txt && rm logs/old.txt',
      description: '检查 bash 审批提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-hints-1',
      metadata: {
        command: 'cd nested && cat logs/run.txt && rm logs/old.txt',
        commandHints: {
          fileCommands: ['cd', 'cat', 'rm'],
          usesCd: true,
        },
        description: '检查 bash 审批提示',
      },
      summary: `检查 bash 审批提示 (/)；静态提示: ${[
        '含 cd',
        '文件命令: cd, cat, rm',
      ].join('、')}`,
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces redundant cd hint when bash workdir is already provided', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-workdir-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cd nested && cat app.txt',
      description: '检查 bash workdir 提示',
      workdir: 'nested',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-workdir-hints-1',
      metadata: {
        command: 'cd nested && cat app.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          redundantCdWithWorkdir: true,
          usesCd: true,
        },
        description: '检查 bash workdir 提示',
        workdir: 'nested',
      },
      summary: `检查 bash workdir 提示 (nested)；静态提示: ${[
        '含 cd',
        '已提供 workdir，命令里仍含 cd',
        '文件命令: cd, cat',
      ].join('、')}`,
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces parent traversal hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-parent-traversal-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cd .. && cat ../notes.txt',
      description: '检查 bash 上级目录提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-parent-traversal-hints-1',
      metadata: {
        command: 'cd .. && cat ../notes.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          parentTraversalPaths: ['..', '../notes.txt'],
          usesCd: true,
          usesParentTraversal: true,
        },
        description: '检查 bash 上级目录提示',
      },
      summary: `检查 bash 上级目录提示 (/)；静态提示: ${[
        '含 cd',
        '相对上级路径: .., ../notes.txt',
        '文件命令: cd, cat',
      ].join('、')}`,
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces network command hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-network-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl -fsSL https://example.com/install.sh',
      description: '检查 bash 联网提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-network-hints-1',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh',
        commandHints: {
          networkCommands: ['curl'],
          usesNetworkCommand: true,
        },
        description: '检查 bash 联网提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash 联网提示 (/)；静态提示: 联网命令: curl',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces powershell native network command hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ps-network-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'iwr https://example.com/api; irm https://example.com/data',
      description: '检查 bash powershell 联网提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ps-network-hints-1',
      metadata: {
        command: 'iwr https://example.com/api; irm https://example.com/data',
        commandHints: {
          networkCommands: ['invoke-webrequest', 'invoke-restmethod'],
          usesNetworkCommand: true,
        },
        description: '检查 bash powershell 联网提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash powershell 联网提示 (/)；静态提示: 联网命令: invoke-webrequest, invoke-restmethod',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces combined network and external-path hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-network-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl -fsSL https://example.com/install.sh -o ~/install.sh',
      description: '检查 bash 联网外部路径提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-network-external-hints-1',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh -o ~/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash 联网外部路径提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash 联网外部路径提示 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces curl output external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-curl-output-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
      description: '检查 bash curl output 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-curl-output-external-hints-1',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash curl output 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash curl output 外部写入提示 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces wget output-document external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-wget-output-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'wget -O ~/install.sh https://example.com/install.sh',
      description: '检查 bash wget 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-wget-output-external-hints-1',
      metadata: {
        command: 'wget -O ~/install.sh https://example.com/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash wget 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash wget 外部写入提示 (/)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface lowercase wget -p as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-wget-lowercase-p-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'wget -p ~/downloads https://example.com/index.html',
      description: '检查 bash wget 短参数大小写',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-wget-lowercase-p-hints-1',
      metadata: {
        command: 'wget -p ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash wget 短参数大小写',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash wget 短参数大小写 (/)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface uppercase curl --Output as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-curl-uppercase-output-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl --Output ~/download.txt https://example.com/file.txt',
      description: '检查 bash curl 长参数大小写',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-curl-uppercase-output-hints-1',
      metadata: {
        command: 'curl --Output ~/download.txt https://example.com/file.txt',
        commandHints: {
          absolutePaths: ['~/download.txt'],
          externalAbsolutePaths: ['~/download.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash curl 长参数大小写',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash curl 长参数大小写 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/download.txt、外部绝对路径: ~/download.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface mixed-case wget --Directory-Prefix as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-wget-mixedcase-directory-prefix-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
      description: '检查 bash wget 长参数大小写',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-wget-mixedcase-directory-prefix-hints-1',
      metadata: {
        command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash wget 长参数大小写',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash wget 长参数大小写 (/)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git clone external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-clone-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git clone https://example.com/repo.git ~/repo-copy',
      description: '检查 bash git clone 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-clone-external-hints-1',
      metadata: {
        command: 'git clone https://example.com/repo.git ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash git clone 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash git clone 外部写入提示 (/)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: ~/repo-copy、写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git clone separate git dir as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-clone-separate-git-dir-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git clone --separate-git-dir ~/repo.git https://example.com/repo.git',
      description: '检查 bash git clone 单独 git 目录提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-clone-separate-git-dir-hints-1',
      metadata: {
        command: 'git clone --separate-git-dir ~/repo.git https://example.com/repo.git',
        commandHints: {
          absolutePaths: ['~/repo.git'],
          externalAbsolutePaths: ['~/repo.git'],
          externalWritePaths: ['~/repo.git'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash git clone 单独 git 目录提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash git clone 单独 git 目录提示 (/)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: ~/repo.git、写入命令涉及外部绝对路径: ~/repo.git、外部绝对路径: ~/repo.git',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git init external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-init-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git init ~/repo-copy',
      description: '检查 bash git init 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-init-external-hints-1',
      metadata: {
        command: 'git init ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git init 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git init 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git init destination as external write without promoting template path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-init-template-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git init --template ~/template-dir ~/repo-copy',
      description: '检查 bash git init 模板参数误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-init-template-hints-1',
      metadata: {
        command: 'git init --template ~/template-dir ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/template-dir', '~/repo-copy'],
          externalAbsolutePaths: ['~/template-dir', '~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git init 模板参数误报',
      },
      operations: ['command.execute'],
      summary: '检查 bash git init 模板参数误报 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/template-dir, ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git archive output file as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-archive-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git archive --output ~/repo.tar HEAD',
      description: '检查 bash git archive 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-archive-external-hints-1',
      metadata: {
        command: 'git archive --output ~/repo.tar HEAD',
        commandHints: {
          absolutePaths: ['~/repo.tar'],
          externalAbsolutePaths: ['~/repo.tar'],
          externalWritePaths: ['~/repo.tar'],
          writesExternalPath: true,
        },
        description: '检查 bash git archive 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git archive 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo.tar、外部绝对路径: ~/repo.tar',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git bundle create output file as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-bundle-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git bundle create ~/repo.bundle HEAD',
      description: '检查 bash git bundle 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-bundle-external-hints-1',
      metadata: {
        command: 'git bundle create ~/repo.bundle HEAD',
        commandHints: {
          absolutePaths: ['~/repo.bundle'],
          externalAbsolutePaths: ['~/repo.bundle'],
          externalWritePaths: ['~/repo.bundle'],
          writesExternalPath: true,
        },
        description: '检查 bash git bundle 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git bundle 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo.bundle、外部绝对路径: ~/repo.bundle',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git format-patch output directory as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-format-patch-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git format-patch --output-directory ~/patches HEAD~2',
      description: '检查 bash git format-patch 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-format-patch-external-hints-1',
      metadata: {
        command: 'git format-patch --output-directory ~/patches HEAD~2',
        commandHints: {
          absolutePaths: ['~/patches'],
          externalAbsolutePaths: ['~/patches'],
          externalWritePaths: ['~/patches'],
          writesExternalPath: true,
        },
        description: '检查 bash git format-patch 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git format-patch 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/patches、外部绝对路径: ~/patches',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces tar create archive file as external write without promoting source paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-tar-create-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'tar -cf ~/archive.tar /workspace/source.txt',
      description: '检查 bash tar create 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-tar-create-external-hints-1',
      metadata: {
        command: 'tar -cf ~/archive.tar /workspace/source.txt',
        commandHints: {
          absolutePaths: ['~/archive.tar', '/workspace/source.txt'],
          externalAbsolutePaths: ['~/archive.tar'],
          externalWritePaths: ['~/archive.tar'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 bash tar create 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash tar create 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/archive.tar、文件命令: tar、外部绝对路径: ~/archive.tar',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces tar extract directory as external write without promoting archive input', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-tar-extract-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'tar -xf /workspace/archive.tar -C ~/output',
      description: '检查 bash tar extract 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-tar-extract-external-hints-1',
      metadata: {
        command: 'tar -xf /workspace/archive.tar -C ~/output',
        commandHints: {
          absolutePaths: ['/workspace/archive.tar', '~/output'],
          externalAbsolutePaths: ['~/output'],
          externalWritePaths: ['~/output'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 bash tar extract 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash tar extract 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/output、文件命令: tar、外部绝对路径: ~/output',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces cp destination as external write without promoting source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cp-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cp /workspace/source.txt ~/copied.txt',
      description: '检查 bash cp 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cp-external-hints-1',
      metadata: {
        command: 'cp /workspace/source.txt ~/copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/source.txt', '~/copied.txt'],
          externalAbsolutePaths: ['~/copied.txt'],
          externalWritePaths: ['~/copied.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash cp 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash cp 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/copied.txt、文件命令: cp、外部绝对路径: ~/copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mv destination as external write without promoting source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mv-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mv /workspace/source.txt ~/moved.txt',
      description: '检查 bash mv 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mv-external-hints-1',
      metadata: {
        command: 'mv /workspace/source.txt ~/moved.txt',
        commandHints: {
          absolutePaths: ['/workspace/source.txt', '~/moved.txt'],
          externalAbsolutePaths: ['~/moved.txt'],
          externalWritePaths: ['~/moved.txt'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 bash mv 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash mv 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/moved.txt、文件命令: mv、外部绝对路径: ~/moved.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces cp target-directory as external write without promoting source paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cp-target-directory-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cp -t ~/copied-dir /workspace/source-a.txt /workspace/source-b.txt',
      description: '检查 bash cp target-directory 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cp-target-directory-hints-1',
      metadata: {
        command: 'cp -t ~/copied-dir /workspace/source-a.txt /workspace/source-b.txt',
        commandHints: {
          absolutePaths: ['~/copied-dir', '/workspace/source-a.txt', '/workspace/source-b.txt'],
          externalAbsolutePaths: ['~/copied-dir'],
          externalWritePaths: ['~/copied-dir'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash cp target-directory 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash cp target-directory 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/copied-dir、文件命令: cp、外部绝对路径: ~/copied-dir',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mv target-directory as external write without promoting source paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mv-target-directory-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mv --target-directory ~/moved-dir /workspace/source-a.txt /workspace/source-b.txt',
      description: '检查 bash mv target-directory 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mv-target-directory-hints-1',
      metadata: {
        command: 'mv --target-directory ~/moved-dir /workspace/source-a.txt /workspace/source-b.txt',
        commandHints: {
          absolutePaths: ['~/moved-dir', '/workspace/source-a.txt', '/workspace/source-b.txt'],
          externalAbsolutePaths: ['~/moved-dir'],
          externalWritePaths: ['~/moved-dir'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 bash mv target-directory 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash mv target-directory 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/moved-dir、文件命令: mv、外部绝对路径: ~/moved-dir',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git worktree add external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-worktree-add-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git worktree add -b feature ~/repo-copy main',
      description: '检查 bash git worktree 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-worktree-add-external-hints-1',
      metadata: {
        command: 'git worktree add -b feature ~/repo-copy main',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git worktree 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git worktree 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git submodule add external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-submodule-add-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git submodule add https://example.com/repo.git ~/repo-copy',
      description: '检查 bash git submodule 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-submodule-add-external-hints-1',
      metadata: {
        command: 'git submodule add https://example.com/repo.git ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git submodule 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git submodule 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces scp destination external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-scp-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'scp user@example.com:/var/log/app.log ~/app.log',
      description: '检查 bash scp 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-scp-external-hints-1',
      metadata: {
        command: 'scp user@example.com:/var/log/app.log ~/app.log',
        commandHints: {
          absolutePaths: ['~/app.log'],
          externalAbsolutePaths: ['~/app.log'],
          externalWritePaths: ['~/app.log'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash scp 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash scp 外部写入提示 (/)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: ~/app.log、写入命令涉及外部绝对路径: ~/app.log、外部绝对路径: ~/app.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface curl upload-file local input paths as external writes in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-curl-upload-input-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl --upload-file ~/input.txt https://example.com/upload',
      description: '检查 bash curl upload-file 误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-curl-upload-input-hints-1',
      metadata: {
        command: 'curl --upload-file ~/input.txt https://example.com/upload',
        commandHints: {
          absolutePaths: ['~/input.txt'],
          externalAbsolutePaths: ['~/input.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash curl upload-file 误报',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash curl upload-file 误报 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/input.txt、外部绝对路径: ~/input.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface scp local source paths as external writes in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-scp-local-source-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'scp ~/input.txt user@example.com:/var/log/app.log',
      description: '检查 bash scp 本地源文件误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-scp-local-source-hints-1',
      metadata: {
        command: 'scp ~/input.txt user@example.com:/var/log/app.log',
        commandHints: {
          absolutePaths: ['~/input.txt'],
          externalAbsolutePaths: ['~/input.txt'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash scp 本地源文件误报',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash scp 本地源文件误报 (/)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: ~/input.txt、外部绝对路径: ~/input.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces external write-path hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-write-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
      description: '检查 bash 写入外部路径提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-write-external-hints-1',
      metadata: {
        command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash 写入外部路径提示',
      },
      summary: '检查 bash 写入外部路径提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces Copy-Item destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
      description: '检查 bash Copy-Item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-item-external-hints-1',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Copy-Item 外部写入提示',
      },
      summary: '检查 bash Copy-Item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces cpi destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cpi-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt',
      description: '检查 bash cpi 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cpi-external-hints-1',
      metadata: {
        command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-alias.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash cpi 外部写入提示',
      },
      summary: '检查 bash cpi 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-alias.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-alias.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces copy destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-word-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-word.txt',
      description: '检查 bash copy 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-word-external-hints-1',
      metadata: {
        command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-word.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-word.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash copy 外部写入提示',
      },
      summary: '检查 bash copy 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-word.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-word.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached Copy-Item destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-quoted-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-quoted.txt"',
      description: '检查 bash Copy-Item quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-item-quoted-external-hints-1',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-quoted.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Copy-Item quoted attached 外部写入提示',
      },
      summary: '检查 bash Copy-Item quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-quoted.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached cpi destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cpi-quoted-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-alias-quoted.txt"',
      description: '检查 bash cpi quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cpi-quoted-external-hints-1',
      metadata: {
        command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-alias-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-alias-quoted.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash cpi quoted attached 外部写入提示',
      },
      summary: '检查 bash cpi quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-alias-quoted.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-alias-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached copy destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-word-quoted-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-word-quoted.txt"',
      description: '检查 bash copy quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-word-quoted-external-hints-1',
      metadata: {
        command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-word-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-word-quoted.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash copy quoted attached 外部写入提示',
      },
      summary: '检查 bash copy quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-word-quoted.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-word-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces Copy-Item literalpath destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-literalpath-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Copy-Item -LiteralPath filesystem::C:\\temp\\input-literal.txt -Destination:"filesystem::D:\\temp\\copied-literal.txt"',
      description: '检查 bash Copy-Item literalpath 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-item-literalpath-external-hints-1',
      metadata: {
        command: 'Copy-Item -LiteralPath filesystem::C:\\temp\\input-literal.txt -Destination:"filesystem::D:\\temp\\copied-literal.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input-literal.txt', 'filesystem::D:\\temp\\copied-literal.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input-literal.txt', 'filesystem::D:\\temp\\copied-literal.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-literal.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Copy-Item literalpath 外部写入提示',
      },
      summary: '检查 bash Copy-Item literalpath 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-literal.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input-literal.txt, filesystem::D:\\temp\\copied-literal.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces powershell env destination expansion in copy-item permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-env.txt"',
        description: '检查 bash Copy-Item env destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-env-hints-1',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-env.txt"',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-env.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-env.txt'],
            externalWritePaths: ['C:\\env-root\\copied-env.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item env destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item env destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied-env.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, C:\\env-root\\copied-env.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces braced powershell env destination expansion in copy-item permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-braced-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\copied-braced-env.txt"',
        description: '检查 bash Copy-Item braced env destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-braced-env-hints-1',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\copied-braced-env.txt"',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-braced-env.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-braced-env.txt'],
            externalWritePaths: ['C:\\env-root\\copied-braced-env.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item braced env destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item braced env destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied-braced-env.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, C:\\env-root\\copied-braced-env.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces powershell env destinations after filesystem provider prefixes in copy-item permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-provider-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-env.txt"',
        description: '检查 bash Copy-Item provider env destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-provider-env-hints-1',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-env.txt"',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::C:\\env-root\\copied-provider-env.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::C:\\env-root\\copied-provider-env.txt'],
            externalWritePaths: ['filesystem::C:\\env-root\\copied-provider-env.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item provider env destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item provider env destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\env-root\\copied-provider-env.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::C:\\env-root\\copied-provider-env.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces Move-Item destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-move-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
      description: '检查 bash Move-Item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-move-item-external-hints-1',
      metadata: {
        command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Move-Item 外部写入提示',
      },
      summary: '检查 bash Move-Item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mi destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mi-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt',
      description: '检查 bash mi 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mi-external-hints-1',
      metadata: {
        command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-alias.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash mi 外部写入提示',
      },
      summary: '检查 bash mi 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-alias.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-alias.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached Move-Item destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-move-item-quoted-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-quoted.txt"',
      description: '检查 bash Move-Item quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-move-item-quoted-external-hints-1',
      metadata: {
        command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-quoted.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Move-Item quoted attached 外部写入提示',
      },
      summary: '检查 bash Move-Item quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-quoted.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached mi destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mi-quoted-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-alias-quoted.txt"',
      description: '检查 bash mi quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mi-quoted-external-hints-1',
      metadata: {
        command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-alias-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-alias-quoted.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash mi quoted attached 外部写入提示',
      },
      summary: '检查 bash mi quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-alias-quoted.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-alias-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached move destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-move-word-quoted-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'move -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-word-quoted.txt"',
      description: '检查 bash move quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-move-word-quoted-external-hints-1',
      metadata: {
        command: 'move -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-word-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-word-quoted.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash move quoted attached 外部写入提示',
      },
      summary: '检查 bash move quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-word-quoted.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-word-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces move destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-move-word-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'move -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-word.txt',
      description: '检查 bash move 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-move-word-external-hints-1',
      metadata: {
        command: 'move -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-word.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-word.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash move 外部写入提示',
      },
      summary: '检查 bash move 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-word.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-word.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces del target as external write without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-del-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'del C:\\temp -Include D:\\archived.log',
      description: '检查 bash del 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-del-external-hints-1',
      metadata: {
        command: 'del C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash del 外部写入提示',
      },
      summary: '检查 bash del 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces erase target as external write without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-erase-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'erase C:\\temp -Include D:\\archived.log',
      description: '检查 bash erase 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-erase-external-hints-1',
      metadata: {
        command: 'erase C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash erase 外部写入提示',
      },
      summary: '检查 bash erase 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached remove-item target without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-remove-item-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Remove-Item -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 bash remove-item quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-remove-item-quoted-hints-1',
      metadata: {
        command: 'Remove-Item -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash remove-item quoted attached 外部写入提示',
      },
      summary: '检查 bash remove-item quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached remove-item literalpath target without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-remove-item-literalpath-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Remove-Item -LiteralPath:"C:\\temp" -Include D:\\archived.log',
      description: '检查 bash remove-item literalpath quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-remove-item-literalpath-quoted-hints-1',
      metadata: {
        command: 'Remove-Item -LiteralPath:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash remove-item literalpath quoted attached 外部写入提示',
      },
      summary: '检查 bash remove-item literalpath quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached rd target without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rd-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'rd -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 bash rd quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rd-quoted-hints-1',
      metadata: {
        command: 'rd -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rd quoted attached 外部写入提示',
      },
      summary: '检查 bash rd quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached ri target without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ri-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'ri -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 bash ri quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ri-quoted-hints-1',
      metadata: {
        command: 'ri -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash ri quoted attached 外部写入提示',
      },
      summary: '检查 bash ri quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached del target without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-del-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'del -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 bash del quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-del-quoted-hints-1',
      metadata: {
        command: 'del -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash del quoted attached 外部写入提示',
      },
      summary: '检查 bash del quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached erase target without promoting include path to external write paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-erase-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'erase -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 bash erase quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-erase-quoted-hints-1',
      metadata: {
        command: 'erase -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 bash erase quoted attached 外部写入提示',
      },
      summary: '检查 bash erase quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces redirection write-path hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-redirect-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
      description: '检查 bash 重定向写入外部路径提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-redirect-external-hints-1',
      metadata: {
        command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\redirected.txt'],
          writesExternalPath: true,
        },
        description: '检查 bash 重定向写入外部路径提示',
      },
      summary: '检查 bash 重定向写入外部路径提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\redirected.txt、外部绝对路径: filesystem::C:\\temp\\redirected.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface single-quoted powershell env redirection as external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-redirect-single-quoted-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Write-Output done > \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-single-quoted-env.txt\'',
        description: '检查 bash 单引号 powershell env 重定向误报',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-redirect-single-quoted-env-hints-1',
        metadata: {
          command: 'Write-Output done > \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-single-quoted-env.txt\'',
          description: '检查 bash 单引号 powershell env 重定向误报',
        },
        summary: '检查 bash 单引号 powershell env 重定向误报 (/)',
        toolName: 'bash',
      });
      expect((pendingRequest.metadata as any).commandHints?.externalWritePaths).toBeUndefined();
      expect((pendingRequest.metadata as any).commandHints?.writesExternalPath).toBeUndefined();
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not surface single-quoted provider env redirection as external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-redirect-single-quoted-provider-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Write-Output done > \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-provider-single-quoted-env.txt\'',
        description: '检查 bash 单引号 provider env 重定向误报',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-redirect-single-quoted-provider-env-hints-1',
        metadata: {
          command: 'Write-Output done > \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-provider-single-quoted-env.txt\'',
          description: '检查 bash 单引号 provider env 重定向误报',
        },
        summary: '检查 bash 单引号 provider env 重定向误报 (/)',
        toolName: 'bash',
      });
      expect((pendingRequest.metadata as any).commandHints?.externalWritePaths).toBeUndefined();
      expect((pendingRequest.metadata as any).commandHints?.writesExternalPath).toBeUndefined();
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces out-file filepath write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-out-file-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
      description: '检查 bash out-file 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-out-file-external-hints-1',
      metadata: {
        command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['get-content', 'out-file'],
          writesExternalPath: true,
        },
        description: '检查 bash out-file 外部写入提示',
      },
      summary: '检查 bash out-file 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: get-content, out-file、外部绝对路径: filesystem::C:\\temp\\copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached out-file filepath write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-out-file-quoted-attached-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Out-File -FilePath:"C:\\temp\\copied-attached-quoted.txt" D:\\payload.txt',
      description: '检查 bash out-file quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-out-file-quoted-attached-external-hints-1',
      metadata: {
        command: 'Out-File -FilePath:"C:\\temp\\copied-attached-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\copied-attached-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\copied-attached-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\copied-attached-quoted.txt'],
          fileCommands: ['out-file'],
          writesExternalPath: true,
        },
        description: '检查 bash out-file quoted attached 外部写入提示',
      },
      summary: '检查 bash out-file quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-attached-quoted.txt、文件命令: out-file、外部绝对路径: C:\\temp\\copied-attached-quoted.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached set-content path write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-quoted-attached-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Set-Content -Path:"C:\\temp\\note-attached-quoted.txt" D:\\payload.txt',
      description: '检查 bash set-content quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-set-content-quoted-attached-external-hints-1',
      metadata: {
        command: 'Set-Content -Path:"C:\\temp\\note-attached-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-attached-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-attached-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-attached-quoted.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 bash set-content quoted attached 外部写入提示',
      },
      summary: '检查 bash set-content quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-attached-quoted.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-attached-quoted.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached set-content literalpath write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-literalpath-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Set-Content -LiteralPath:"C:\\temp\\note-literal-quoted.txt" D:\\payload.txt',
      description: '检查 bash set-content literalpath quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-set-content-literalpath-quoted-hints-1',
      metadata: {
        command: 'Set-Content -LiteralPath:"C:\\temp\\note-literal-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-literal-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-literal-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-literal-quoted.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 bash set-content literalpath quoted attached 外部写入提示',
      },
      summary: '检查 bash set-content literalpath quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-literal-quoted.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-literal-quoted.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces powershell env path expansion in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Set-Content -Path:"$env:GARLIC_CLAW_HINTS_TEST_ROOT\\note-env.txt" D:\\payload.txt',
        description: '检查 bash set-content env path 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-set-content-env-hints-1',
        metadata: {
          command: 'Set-Content -Path:"$env:GARLIC_CLAW_HINTS_TEST_ROOT\\note-env.txt" D:\\payload.txt',
          commandHints: {
            absolutePaths: ['C:\\env-root\\note-env.txt', 'D:\\payload.txt'],
            externalAbsolutePaths: ['C:\\env-root\\note-env.txt', 'D:\\payload.txt'],
            externalWritePaths: ['C:\\env-root\\note-env.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '检查 bash set-content env path 外部写入提示',
        },
        summary: '检查 bash set-content env path 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\note-env.txt、文件命令: set-content、外部绝对路径: C:\\env-root\\note-env.txt, D:\\payload.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces braced powershell env path expansion in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-braced-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Set-Content -Path:"${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-braced-env.txt" D:\\payload.txt',
        description: '检查 bash set-content braced env path 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-set-content-braced-env-hints-1',
        metadata: {
          command: 'Set-Content -Path:"${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-braced-env.txt" D:\\payload.txt',
          commandHints: {
            absolutePaths: ['C:\\env-root\\note-braced-env.txt', 'D:\\payload.txt'],
            externalAbsolutePaths: ['C:\\env-root\\note-braced-env.txt', 'D:\\payload.txt'],
            externalWritePaths: ['C:\\env-root\\note-braced-env.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '检查 bash set-content braced env path 外部写入提示',
        },
        summary: '检查 bash set-content braced env path 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\note-braced-env.txt、文件命令: set-content、外部绝对路径: C:\\env-root\\note-braced-env.txt, D:\\payload.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces braced powershell env paths after filesystem provider prefixes in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-provider-braced-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Set-Content -Path:"filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-braced-env.txt" D:\\payload.txt',
        description: '检查 bash set-content provider braced env path 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-set-content-provider-braced-env-hints-1',
        metadata: {
          command: 'Set-Content -Path:"filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-braced-env.txt" D:\\payload.txt',
          commandHints: {
            absolutePaths: ['filesystem::C:\\env-root\\note-provider-braced-env.txt', 'D:\\payload.txt'],
            externalAbsolutePaths: ['filesystem::C:\\env-root\\note-provider-braced-env.txt', 'D:\\payload.txt'],
            externalWritePaths: ['filesystem::C:\\env-root\\note-provider-braced-env.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '检查 bash set-content provider braced env path 外部写入提示',
        },
        summary: '检查 bash set-content provider braced env path 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\env-root\\note-provider-braced-env.txt、文件命令: set-content、外部绝对路径: filesystem::C:\\env-root\\note-provider-braced-env.txt, D:\\payload.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces single-quoted destination literals in copy-item permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-single-quoted-literal-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const execution = (bashTool as any).execute({
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:\'filesystem::D:\\temp\\copied-single-quoted-literal.txt\'',
      description: '检查 bash Copy-Item single quoted literal destination 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-item-single-quoted-literal-hints-1',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:\'filesystem::D:\\temp\\copied-single-quoted-literal.txt\'',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-single-quoted-literal.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-single-quoted-literal.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-single-quoted-literal.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Copy-Item single quoted literal destination 外部写入提示',
      },
      summary: '检查 bash Copy-Item single quoted literal destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-single-quoted-literal.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-single-quoted-literal.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces single-quoted attached literal paths in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-single-quoted-literal-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const execution = (bashTool as any).execute({
      command: 'Set-Content -Path:\'C:\\temp\\note-single-quoted-literal.txt\' D:\\payload.txt',
      description: '检查 bash set-content single quoted literal path 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-set-content-single-quoted-literal-hints-1',
      metadata: {
        command: 'Set-Content -Path:\'C:\\temp\\note-single-quoted-literal.txt\' D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-single-quoted-literal.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-single-quoted-literal.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-single-quoted-literal.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 bash set-content single quoted literal path 外部写入提示',
      },
      summary: '检查 bash set-content single quoted literal path 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-single-quoted-literal.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-single-quoted-literal.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface single-quoted powershell env destinations as external writes in copy-item permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-single-quoted-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-single-quoted-env.txt\'',
        description: '检查 bash Copy-Item single quoted env destination 误报',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-single-quoted-env-hints-1',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-single-quoted-env.txt\'',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt'],
            fileCommands: ['copy-item'],
          },
          description: '检查 bash Copy-Item single quoted env destination 误报',
        },
        summary: '检查 bash Copy-Item single quoted env destination 误报 (/)；静态提示: 文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not surface single-quoted braced powershell env paths as external writes in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-single-quoted-braced-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Set-Content -Path \'${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-single-quoted-braced-env.txt\' D:\\payload.txt',
        description: '检查 bash set-content single quoted braced env path 误报',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-set-content-single-quoted-braced-env-hints-1',
        metadata: {
          command: 'Set-Content -Path \'${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-single-quoted-braced-env.txt\' D:\\payload.txt',
          commandHints: {
            absolutePaths: ['D:\\payload.txt'],
            externalAbsolutePaths: ['D:\\payload.txt'],
            fileCommands: ['set-content'],
          },
          description: '检查 bash set-content single quoted braced env path 误报',
        },
        summary: '检查 bash set-content single quoted braced env path 误报 (/)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not surface single-quoted provider env destinations as external writes in copy-item permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-provider-single-quoted-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-single-quoted-env.txt\'',
        description: '检查 bash Copy-Item single quoted provider env destination 误报',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-provider-single-quoted-env-hints-1',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-single-quoted-env.txt\'',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt'],
            fileCommands: ['copy-item'],
          },
          description: '检查 bash Copy-Item single quoted provider env destination 误报',
        },
        summary: '检查 bash Copy-Item single quoted provider env destination 误报 (/)；静态提示: 文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not surface single-quoted provider braced env paths as external writes in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-provider-single-quoted-braced-env-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Set-Content -Path \'filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-single-quoted-braced-env.txt\' D:\\payload.txt',
        description: '检查 bash set-content single quoted provider braced env path 误报',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-set-content-provider-single-quoted-braced-env-hints-1',
        metadata: {
          command: 'Set-Content -Path \'filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-single-quoted-braced-env.txt\' D:\\payload.txt',
          commandHints: {
            absolutePaths: ['D:\\payload.txt'],
            externalAbsolutePaths: ['D:\\payload.txt'],
            fileCommands: ['set-content'],
          },
          description: '检查 bash set-content single quoted provider braced env path 误报',
        },
        summary: '检查 bash set-content single quoted provider braced env path 误报 (/)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not surface powershell local variable paths as external writes in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-local-variable-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Set-Content -Path "$targetRoot\\note.txt" D:\\payload.txt',
      description: '检查 bash set-content 本地变量路径误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-set-content-local-variable-hints-1',
      metadata: {
        command: 'Set-Content -Path "$targetRoot\\note.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['D:\\payload.txt'],
          externalAbsolutePaths: ['D:\\payload.txt'],
          fileCommands: ['set-content'],
        },
        description: '检查 bash set-content 本地变量路径误报',
      },
      summary: '检查 bash set-content 本地变量路径误报 (/)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface braced powershell local variable paths as external writes in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-braced-local-variable-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Set-Content -Path "${targetRoot}\\note-braced-local.txt" D:\\payload.txt',
      description: '检查 bash set-content braced 本地变量路径误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-set-content-braced-local-variable-hints-1',
      metadata: {
        command: 'Set-Content -Path "${targetRoot}\\note-braced-local.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['D:\\payload.txt'],
          externalAbsolutePaths: ['D:\\payload.txt'],
          fileCommands: ['set-content'],
        },
        description: '检查 bash set-content braced 本地变量路径误报',
      },
      summary: '检查 bash set-content braced 本地变量路径误报 (/)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface provider braced powershell local variable paths as external writes in set-content permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-set-content-provider-braced-local-variable-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Set-Content -Path "filesystem::${targetRoot}\\note-provider-braced-local.txt" D:\\payload.txt',
      description: '检查 bash set-content provider braced 本地变量路径误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-set-content-provider-braced-local-variable-hints-1',
      metadata: {
        command: 'Set-Content -Path "filesystem::${targetRoot}\\note-provider-braced-local.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['D:\\payload.txt'],
          externalAbsolutePaths: ['D:\\payload.txt'],
          fileCommands: ['set-content'],
        },
        description: '检查 bash set-content provider braced 本地变量路径误报',
      },
      summary: '检查 bash set-content provider braced 本地变量路径误报 (/)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces powershell Join-Path command substitution destinations as external writes in copy-item permission requests', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-command-substitution-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied.txt\')"',
        description: '检查 bash Copy-Item Join-Path destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-command-substitution-hints-1',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied.txt\')"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\env-root\\copied.txt'],
            externalAbsolutePaths: ['C:\\env-root\\copied.txt'],
            externalWritePaths: ['C:\\env-root\\copied.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item Join-Path destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item Join-Path destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied.txt、文件命令: copy-item、外部绝对路径: C:\\env-root\\copied.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces powershell Join-Path local variable destinations as external writes in copy-item permission requests', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        allowedToolNames: ['bash'],
        assistantMessageId: 'assistant-message-bash-copy-item-join-path-local-variable-hints-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: '$root=\'C:\\temp\'; Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $root \'copied-local.txt\')"',
        description: '检查 bash Copy-Item Join-Path 本地变量 destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-bash-copy-item-join-path-local-variable-hints-1',
        metadata: {
          command: '$root=\'C:\\temp\'; Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $root \'copied-local.txt\')"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\temp\\copied-local.txt'],
            externalAbsolutePaths: ['C:\\temp\\copied-local.txt'],
            externalWritePaths: ['C:\\temp\\copied-local.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item Join-Path 本地变量 destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item Join-Path 本地变量 destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-local.txt、文件命令: copy-item、外部绝对路径: C:\\temp\\copied-local.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('surfaces provider-prefixed powershell Join-Path command substitution destinations as external writes in copy-item permission requests', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-provider-command-substitution-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path /workspace/input.txt -Destination "filesystem::$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-provider.txt\')"',
        description: '检查 bash Copy-Item provider Join-Path destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        messageId: 'assistant-message-bash-copy-item-provider-command-substitution-hints-1',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination "filesystem::$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-provider.txt\')"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\env-root\\copied-provider.txt'],
            externalAbsolutePaths: ['filesystem::C:\\env-root\\copied-provider.txt'],
            externalWritePaths: ['filesystem::C:\\env-root\\copied-provider.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item provider Join-Path destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item provider Join-Path destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\env-root\\copied-provider.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\env-root\\copied-provider.txt',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces powershell Join-Path-assigned local variable destinations as external writes in copy-item permission requests', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        allowedToolNames: ['bash'],
        assistantMessageId: 'assistant-message-bash-copy-item-assigned-join-path-local-variable-hints-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: '$root = Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'nested\'; Copy-Item -Path /workspace/input.txt -Destination "$root\\copied-assigned-join-path.txt"',
        description: '检查 bash Copy-Item Join-Path 赋值本地变量 destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-bash-copy-item-assigned-join-path-local-variable-hints-1',
        metadata: {
          command: '$root = Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'nested\'; Copy-Item -Path /workspace/input.txt -Destination "$root\\copied-assigned-join-path.txt"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\env-root\\nested\\copied-assigned-join-path.txt'],
            externalAbsolutePaths: ['C:\\env-root\\nested\\copied-assigned-join-path.txt'],
            externalWritePaths: ['C:\\env-root\\nested\\copied-assigned-join-path.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item Join-Path 赋值本地变量 destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item Join-Path 赋值本地变量 destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\nested\\copied-assigned-join-path.txt、文件命令: copy-item、外部绝对路径: C:\\env-root\\nested\\copied-assigned-join-path.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces parenthesized powershell Join-Path destinations as external writes in copy-item permission requests', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        allowedToolNames: ['bash'],
        assistantMessageId: 'assistant-message-bash-copy-item-parenthesized-join-path-hints-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path /workspace/input.txt -Destination (Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-parenthesized.txt\')',
        description: '检查 bash Copy-Item parenthesized Join-Path destination 外部写入提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-bash-copy-item-parenthesized-join-path-hints-1',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination (Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-parenthesized.txt\')',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\env-root\\copied-parenthesized.txt'],
            externalAbsolutePaths: ['C:\\env-root\\copied-parenthesized.txt'],
            externalWritePaths: ['C:\\env-root\\copied-parenthesized.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 bash Copy-Item parenthesized Join-Path destination 外部写入提示',
        },
        summary: '检查 bash Copy-Item parenthesized Join-Path destination 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied-parenthesized.txt、文件命令: copy-item、外部绝对路径: C:\\env-root\\copied-parenthesized.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('surfaces sc alias positional set-content write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-sc-positional-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'sc C:\\temp\\note-short.txt D:\\payload.txt',
      description: '检查 bash sc positional 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-sc-positional-external-hints-1',
      metadata: {
        command: 'sc C:\\temp\\note-short.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-short.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-short.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-short.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 bash sc positional 外部写入提示',
      },
      summary: '检查 bash sc positional 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-short.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-short.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces ac alias positional add-content write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ac-positional-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'ac C:\\temp\\append.txt D:\\payload.txt',
      description: '检查 bash ac positional 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ac-positional-external-hints-1',
      metadata: {
        command: 'ac C:\\temp\\append.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\append.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\append.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\append.txt'],
          fileCommands: ['add-content'],
          writesExternalPath: true,
        },
        description: '检查 bash ac positional 外部写入提示',
      },
      summary: '检查 bash ac positional 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\append.txt、文件命令: add-content、外部绝对路径: C:\\temp\\append.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached add-content path write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-add-content-quoted-attached-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Add-Content -Path:"C:\\temp\\append-attached-quoted.txt" D:\\payload.txt',
      description: '检查 bash add-content quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-add-content-quoted-attached-external-hints-1',
      metadata: {
        command: 'Add-Content -Path:"C:\\temp\\append-attached-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\append-attached-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\append-attached-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\append-attached-quoted.txt'],
          fileCommands: ['add-content'],
          writesExternalPath: true,
        },
        description: '检查 bash add-content quoted attached 外部写入提示',
      },
      summary: '检查 bash add-content quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\append-attached-quoted.txt、文件命令: add-content、外部绝对路径: C:\\temp\\append-attached-quoted.txt, D:\\payload.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mkdir path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mkdir-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mkdir -Path C:\\temp -Name created-dir',
      description: '检查 bash mkdir 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mkdir-external-hints-1',
      metadata: {
        command: 'mkdir -Path C:\\temp -Name created-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 bash mkdir 外部写入提示',
      },
      summary: '检查 bash mkdir 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached mkdir path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mkdir-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mkdir -Path:"C:\\temp" -Name created-quoted-dir',
      description: '检查 bash mkdir quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mkdir-quoted-hints-1',
      metadata: {
        command: 'mkdir -Path:"C:\\temp" -Name created-quoted-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-quoted-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 bash mkdir quoted attached 外部写入提示',
      },
      summary: '检查 bash mkdir quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-quoted-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces md alias path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-md-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'md -Path C:\\temp -Name created-alias-dir',
      description: '检查 bash md 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-md-external-hints-1',
      metadata: {
        command: 'md -Path C:\\temp -Name created-alias-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 bash md 外部写入提示',
      },
      summary: '检查 bash md 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached md alias path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-md-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'md -Path:"C:\\temp" -Name created-alias-quoted-dir',
      description: '检查 bash md quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-md-quoted-hints-1',
      metadata: {
        command: 'md -Path:"C:\\temp" -Name created-alias-quoted-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-quoted-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 bash md quoted attached 外部写入提示',
      },
      summary: '检查 bash md quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-quoted-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached new-item path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-quoted-attached-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item -Path:"C:\\temp" -Name created-attached-quoted.txt -ItemType File',
      description: '检查 bash new-item quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-quoted-attached-hints-1',
      metadata: {
        command: 'New-Item -Path:"C:\\temp" -Name created-attached-quoted.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-attached-quoted.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item quoted attached 外部写入提示',
      },
      summary: '检查 bash new-item quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-attached-quoted.txt、文件命令: new-item、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached rename-item path plus newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-quoted-attached-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item -Path:"C:\\temp\\old.txt" -NewName renamed-attached-quoted.txt',
      description: '检查 bash rename-item quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-quoted-attached-hints-1',
      metadata: {
        command: 'Rename-Item -Path:"C:\\temp\\old.txt" -NewName renamed-attached-quoted.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old.txt'],
          externalAbsolutePaths: ['C:\\temp\\old.txt'],
          externalWritePaths: ['C:\\temp\\renamed-attached-quoted.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item quoted attached 外部写入提示',
      },
      summary: '检查 bash rename-item quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-attached-quoted.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces rename-item literalpath plus newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-literalpath-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item -LiteralPath:"C:\\temp\\old-literal.txt" -NewName renamed-literal.txt',
      description: '检查 bash rename-item literalpath 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-literalpath-hints-1',
      metadata: {
        command: 'Rename-Item -LiteralPath:"C:\\temp\\old-literal.txt" -NewName renamed-literal.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-literal.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-literal.txt'],
          externalWritePaths: ['C:\\temp\\renamed-literal.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item literalpath 外部写入提示',
      },
      summary: '检查 bash rename-item literalpath 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-literal.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-literal.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces ni alias path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ni-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'ni -Path C:\\temp -Name created-alias.txt -ItemType File',
      description: '检查 bash ni 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ni-hints-1',
      metadata: {
        command: 'ni -Path C:\\temp -Name created-alias.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash ni 外部写入提示',
      },
      summary: '检查 bash ni 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias.txt、文件命令: new-item、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached ni alias path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ni-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'ni -Path:"C:\\temp" -Name created-alias-quoted.txt -ItemType File',
      description: '检查 bash ni quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ni-quoted-hints-1',
      metadata: {
        command: 'ni -Path:"C:\\temp" -Name created-alias-quoted.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-quoted.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash ni quoted attached 外部写入提示',
      },
      summary: '检查 bash ni quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-quoted.txt、文件命令: new-item、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces ren alias path plus newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ren-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'ren C:\\temp\\old-alias.txt renamed-alias.txt',
      description: '检查 bash ren 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ren-hints-1',
      metadata: {
        command: 'ren C:\\temp\\old-alias.txt renamed-alias.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-alias.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-alias.txt'],
          externalWritePaths: ['C:\\temp\\renamed-alias.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash ren 外部写入提示',
      },
      summary: '检查 bash ren 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-alias.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-alias.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces quoted attached ren alias path plus newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ren-quoted-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'ren -Path:"C:\\temp\\old-quoted.txt" -NewName renamed-alias-quoted.txt',
      description: '检查 bash ren quoted attached 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ren-quoted-hints-1',
      metadata: {
        command: 'ren -Path:"C:\\temp\\old-quoted.txt" -NewName renamed-alias-quoted.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-quoted.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-quoted.txt'],
          externalWritePaths: ['C:\\temp\\renamed-alias-quoted.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash ren quoted attached 外部写入提示',
      },
      summary: '检查 bash ren quoted attached 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-alias-quoted.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-quoted.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces new-item path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
      description: '检查 bash new-item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-external-hints-1',
      metadata: {
        command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item 外部写入提示',
      },
      summary: '检查 bash new-item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces rename-item path plus newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
      description: '检查 bash rename-item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-external-hints-1',
      metadata: {
        command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item 外部写入提示',
      },
      summary: '检查 bash rename-item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces new-item positional path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-positional-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
      description: '检查 bash new-item positional 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-positional-hints-1',
      metadata: {
        command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created-positional.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item positional 外部写入提示',
      },
      summary: '检查 bash new-item positional 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created-positional.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces rename-item positional path plus positional newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-positional-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
      description: '检查 bash rename-item positional 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-positional-hints-1',
      metadata: {
        command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed-positional.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item positional 外部写入提示',
      },
      summary: '检查 bash rename-item positional 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed-positional.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old-positional.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps windows drive separators in new-item external write targets in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-drive-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
      description: '检查 bash new-item 裸盘符外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-drive-hints-1',
      metadata: {
        command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-drive.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item 裸盘符外部写入提示',
      },
      summary: '检查 bash new-item 裸盘符外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-drive.txt、文件命令: new-item、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps windows drive separators in rename-item external write targets in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-drive-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
      description: '检查 bash rename-item 裸盘符外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-drive-hints-1',
      metadata: {
        command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-drive.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-drive.txt'],
          externalWritePaths: ['C:\\temp\\renamed-drive.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item 裸盘符外部写入提示',
      },
      summary: '检查 bash rename-item 裸盘符外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-drive.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-drive.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces invoke-webrequest outfile write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-iwr-outfile-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
      description: '检查 bash iwr 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-iwr-outfile-external-hints-1',
      metadata: {
        command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalWritePaths: ['filesystem::C:\\temp\\install.ps1'],
          networkCommands: ['invoke-webrequest'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash iwr 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash iwr 外部写入提示 (/)；静态提示: 联网命令: invoke-webrequest、联网命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、写入命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、外部绝对路径: filesystem::C:\\temp\\install.ps1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps bash workdir and timeout semantics stable through the native tool contract', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell');
      const { conversationId, runtimeToolPermissionService, runtimeWorkspaceRoot, service } = createFixture();
      const slowServer = http.createServer(async (_request: http.IncomingMessage, response: http.ServerResponse) => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('slow-ok');
      });
      await new Promise<void>((resolve, reject) => {
        slowServer.once('error', reject);
        slowServer.listen(0, '127.0.0.1', () => resolve());
      });
      const toolSet = await service.buildToolSet({
        allowedToolNames: ['bash'],
        assistantMessageId: 'assistant-message-bash-runtime-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();
      fs.mkdirSync(path.join(runtimeWorkspaceRoot, conversationId, 'nested'), { recursive: true });

      const workdirExecution = (bashTool as any).execute({
        command: buildRuntimeShellWorkdirCommand('child.txt', 'from-workdir'),
        description: '在指定目录执行命令',
        workdir: 'nested',
      });
      const workdirRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(workdirRequest).toMatchObject({
        messageId: 'assistant-message-bash-runtime-1',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, workdirRequest.id, 'once');
      const workdirResult = await workdirExecution;

      expect(workdirResult).toEqual(expect.objectContaining({
        kind: 'tool:text',
      }));
      expect(readWrappedToolData(workdirResult)).toEqual(expect.objectContaining({
        cwd: '/nested',
        stdout: expect.stringContaining('from-workdir'),
      }));
      expect((workdirResult as { value: string }).value).toContain('from-workdir');

      try {
        const address = slowServer.address();
        if (!address || typeof address === 'string') {
          throw new Error('failed to allocate slow test server port');
        }
        const timeoutExecution = (bashTool as any).execute({
          command: buildRuntimeShellHttpReadCommand(`http://127.0.0.1:${address.port}/slow`),
          description: '触发 bash 超时',
          timeout: 50,
        });
        const timeoutRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
        expect(timeoutRequest).toMatchObject({
          messageId: 'assistant-message-bash-runtime-1',
          toolName: shellToolName,
        });
        runtimeToolPermissionService.reply(conversationId, timeoutRequest.id, 'once');
        await expect(timeoutExecution).resolves.toEqual(expect.objectContaining({
          error: `${shellToolName} 执行超时（>1 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`,
          phase: 'execute',
          recovered: true,
          tool: shellToolName,
          type: 'invalid-tool-result',
        }));
      } finally {
        await new Promise<void>((resolve, reject) => {
          slowServer.close((error?: Error | null) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes bash execution to the configured shell backend without changing tool contract', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'mock-shell';
    try {
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        runtimeBackends: [
          createMockRuntimeBackend('just-bash'),
          createMockRuntimeBackend('mock-shell'),
        ],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.bash;
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: 'echo routed',
        description: '验证 shell backend 路由',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest?.backendKind).toBe('mock-shell');
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('mock-shell:echo routed'),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('surfaces bash env path expansion in mock-shell permission requests', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'mock-shell';
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = process.platform === 'win32'
      ? 'C:\\env-root'
      : '/tmp/env-root';
    try {
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        runtimeBackends: [
          createMockRuntimeBackend('just-bash'),
          createMockRuntimeBackend('mock-shell'),
        ],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-env-expansion-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.bash;
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: 'cp "$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt" "${GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt"',
        description: '验证 bash env 路径静态提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'mock-shell',
        messageId: 'assistant-message-shell-env-expansion-1',
        metadata: {
          command: 'cp "$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt" "${GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt"',
          commandHints: {
            absolutePaths: [
              `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/source.txt`,
              `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`,
            ],
            externalAbsolutePaths: [
              `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/source.txt`,
              `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`,
            ],
            externalWritePaths: [`${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`],
            fileCommands: ['cp'],
            writesExternalPath: true,
          },
          description: '验证 bash env 路径静态提示',
        },
        summary: `验证 bash env 路径静态提示 (/)；静态提示: 写入命令涉及外部绝对路径: ${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt、文件命令: cp、外部绝对路径: ${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/source.txt, ${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('mock-shell:cp "$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt" "${GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt"'),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('surfaces bash local variable path expansion in mock-shell permission requests', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'mock-shell';
    const externalRoot = process.platform === 'win32'
      ? 'C:/local-root'
      : '/tmp/local-root';
    try {
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        runtimeBackends: [
          createMockRuntimeBackend('just-bash'),
          createMockRuntimeBackend('mock-shell'),
        ],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-local-variable-expansion-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.bash;
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: `ROOT=${externalRoot}; cp /workspace/source.txt "$ROOT/copied.txt"`,
        description: '验证 bash 本地变量路径静态提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'mock-shell',
        messageId: 'assistant-message-shell-local-variable-expansion-1',
        metadata: {
          command: `ROOT=${externalRoot}; cp /workspace/source.txt "$ROOT/copied.txt"`,
          commandHints: {
            absolutePaths: ['/workspace/source.txt', `${externalRoot}/copied.txt`],
            externalAbsolutePaths: [`${externalRoot}/copied.txt`],
            externalWritePaths: [`${externalRoot}/copied.txt`],
            fileCommands: ['cp'],
            writesExternalPath: true,
          },
          description: '验证 bash 本地变量路径静态提示',
        },
        summary: `验证 bash 本地变量路径静态提示 (/)；静态提示: 写入命令涉及外部绝对路径: ${externalRoot}/copied.txt、文件命令: cp、外部绝对路径: ${externalRoot}/copied.txt`,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining(`mock-shell:ROOT=${externalRoot}; cp /workspace/source.txt "$ROOT/copied.txt"`),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes bash execution to the real native-shell backend', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        runtimeBackends: createRealRuntimeBackendsForShellRouting(),
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-native-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: buildRuntimeShellEchoCommand('native-shell-ok'),
        description: '验证 native-shell backend 路由',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest?.backendKind).toBe('native-shell');
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('native-shell-ok'),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes bash execution through a third shell backend kind without changing tool owner', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-alias-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: buildRuntimeShellEchoCommand('native-shell-alias-ok'),
        description: '验证 native-shell-alias backend 路由',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest?.backendKind).toBe('native-shell-alias');
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('native-shell-alias-ok'),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('surfaces powershell AST hints through native-shell alias permission requests', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-alias-ast-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: 'if ($?) { Set-Content -Path C:\\temp\\alias-note.txt -Value hi }',
        description: '验证 native-shell-alias AST 静态提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-shell-route-alias-ast-1',
        metadata: {
          command: 'if ($?) { Set-Content -Path C:\\temp\\alias-note.txt -Value hi }',
          commandHints: {
            absolutePaths: ['C:\\temp\\alias-note.txt'],
            externalAbsolutePaths: ['C:\\temp\\alias-note.txt'],
            externalWritePaths: ['C:\\temp\\alias-note.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '验证 native-shell-alias AST 静态提示',
        },
        summary: '验证 native-shell-alias AST 静态提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\alias-note.txt、文件命令: set-content、外部绝对路径: C:\\temp\\alias-note.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('keeps bash permission-chain hints when AST parsing fails', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-bash-ast-fallback-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cp /workspace/input.txt ~/copied-from-fallback.txt (',
      description: '验证 bash AST 失败权限链回退',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      backendKind: 'just-bash',
      messageId: 'assistant-message-bash-ast-fallback-1',
      metadata: {
        command: 'cp /workspace/input.txt ~/copied-from-fallback.txt (',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', '~/copied-from-fallback.txt'],
          externalAbsolutePaths: ['~/copied-from-fallback.txt'],
          externalWritePaths: ['~/copied-from-fallback.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '验证 bash AST 失败权限链回退',
      },
      summary: '验证 bash AST 失败权限链回退 (/)；静态提示: 写入命令涉及外部绝对路径: ~/copied-from-fallback.txt、文件命令: cp、外部绝对路径: ~/copied-from-fallback.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps powershell permission-chain hints when AST parsing fails', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-powershell-ast-fallback-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: 'Copy-Item -Path /workspace/input.txt -Destination C:\\temp\\copied-from-fallback.txt )',
        description: '验证 powershell AST 失败权限链回退',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-powershell-ast-fallback-1',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination C:\\temp\\copied-from-fallback.txt )',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\temp\\copied-from-fallback.txt'],
            externalAbsolutePaths: ['C:\\temp\\copied-from-fallback.txt'],
            externalWritePaths: ['C:\\temp\\copied-from-fallback.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '验证 powershell AST 失败权限链回退',
        },
        summary: '验证 powershell AST 失败权限链回退 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-from-fallback.txt、文件命令: copy-item、外部绝对路径: C:\\temp\\copied-from-fallback.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('surfaces powershell local variable AST hints through native-shell alias permission requests', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-alias-local-variable-ast-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: '$root=\'C:\\temp\'; Set-Content -Path "$root\\note.txt" -Value hi',
        description: '验证 native-shell-alias 本地变量 AST 静态提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-shell-route-alias-local-variable-ast-1',
        metadata: {
          command: '$root=\'C:\\temp\'; Set-Content -Path "$root\\note.txt" -Value hi',
          commandHints: {
            absolutePaths: ['C:\\temp\\note.txt'],
            externalAbsolutePaths: ['C:\\temp\\note.txt'],
            externalWritePaths: ['C:\\temp\\note.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '验证 native-shell-alias 本地变量 AST 静态提示',
        },
        summary: '验证 native-shell-alias 本地变量 AST 静态提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('surfaces powershell simple subexpression local variable AST hints through native-shell alias permission requests', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell-alias';
    try {
      const shellToolName = readRuntimeShellToolName('native-shell-alias');
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        aliasNativeShellKinds: ['native-shell-alias'],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-alias-local-subexpression-ast-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.[shellToolName];
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: '$root=\'C:\\temp\'; Set-Content -Path "$($root)\\note.txt" -Value hi',
        description: '验证 native-shell-alias 简单子表达式 AST 静态提示',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest).toMatchObject({
        backendKind: 'native-shell-alias',
        messageId: 'assistant-message-shell-route-alias-local-subexpression-ast-1',
        metadata: {
          command: '$root=\'C:\\temp\'; Set-Content -Path "$($root)\\note.txt" -Value hi',
          commandHints: {
            absolutePaths: ['C:\\temp\\note.txt'],
            externalAbsolutePaths: ['C:\\temp\\note.txt'],
            externalWritePaths: ['C:\\temp\\note.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '验证 native-shell-alias 简单子表达式 AST 静态提示',
        },
        summary: '验证 native-shell-alias 简单子表达式 AST 静态提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note.txt',
        toolName: shellToolName,
      });
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        error: '用户拒绝了本次 runtime 权限请求',
        phase: 'execute',
        recovered: true,
        tool: shellToolName,
        type: 'invalid-tool-result',
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes filesystem tool execution to the configured filesystem backend without changing tool contract', async () => {
    const originalFilesystemBackend = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'mock-filesystem';
    try {
      const { conversationId, service } = createFixture({
        runtimeFilesystemBackends: [
          createMockFilesystemBackend('host-filesystem'),
          createMockFilesystemBackend('mock-filesystem'),
        ],
      });
      const toolSet = await service.buildToolSet({
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['read'],
      });
      const readTool = toolSet?.read;
      expect(readTool).toBeDefined();

      const result = await (readTool as any).execute({
        filePath: 'ignored.txt',
      });

      expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
        output: expect.stringContaining('/mock-filesystem.txt'),
      }));
      expect(readWrappedToolOutput(result)).toContain('1: mock-filesystem line');
      expect(readWrappedToolOutput(result)).toContain('(end of file, total lines: 2, total bytes:');
    } finally {
      if (originalFilesystemBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = originalFilesystemBackend;
      }
    }
  });

  it('routes glob, grep, write and edit to the configured filesystem backend', async () => {
    const originalFilesystemBackend = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'mock-filesystem';
    try {
      const { conversationId, service } = createFixture({
        runtimeFilesystemBackends: [
          createMockFilesystemBackend('host-filesystem'),
          createMockFilesystemBackend('mock-filesystem'),
        ],
      });
      const toolSet = await service.buildToolSet({
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['glob', 'grep', 'write', 'edit'],
      });

      const globResult = await (toolSet?.glob as any).execute({
        pattern: '*.txt',
      });
      const grepResult = await (toolSet?.grep as any).execute({
        pattern: 'mock-filesystem',
      });
      const writeResult = await (toolSet?.write as any).execute({
        content: 'created by mock filesystem backend',
        filePath: 'notes/output.txt',
      });
      const editResult = await (toolSet?.edit as any).execute({
        filePath: 'notes/output.txt',
        newString: 'updated',
        oldString: 'created',
      });

      expect(readWrappedToolOutput(globResult)).toContain('/mock-filesystem.txt');
      expect(readWrappedToolOutput(grepResult)).toContain('/mock-filesystem.txt:');
      expect(readWrappedToolOutput(grepResult)).toContain('1: mock-filesystem line');
      expect(readWrappedToolData(writeResult)).toEqual(expect.objectContaining({
        output: expect.stringContaining('/mock-filesystem/notes/output.txt'),
      }));
      expect(readWrappedToolData(editResult)).toEqual(expect.objectContaining({
        output: expect.stringContaining('/mock-filesystem/notes/output.txt'),
      }));
    } finally {
      if (originalFilesystemBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = originalFilesystemBackend;
      }
    }
  });

  it('routes filesystem tools through a third real backend kind without changing tool owner', async () => {
    const originalFilesystemBackend = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'host-filesystem-alias';
    try {
      const { conversationId, runtimeWorkspaceRoot, service } = createFixture({
        aliasHostFilesystemKinds: ['host-filesystem-alias'],
      });
      const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
      fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
      fs.writeFileSync(path.join(workspaceRoot, 'notes', 'routed.txt'), 'alias backend line\nsecond line\n', 'utf8');

      const toolSet = await service.buildToolSet({
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['read', 'glob', 'grep', 'write', 'edit'],
      });
      const readResult = await (toolSet?.read as any).execute({
        filePath: 'notes/routed.txt',
      });
      const writeResult = await (toolSet?.write as any).execute({
        content: 'created by aliased backend\n',
        filePath: 'notes/output.txt',
      });
      const editResult = await (toolSet?.edit as any).execute({
        filePath: 'notes/output.txt',
        newString: 'updated by aliased backend',
        oldString: 'created by aliased backend',
      });
      const globResult = await (toolSet?.glob as any).execute({
        path: 'notes',
        pattern: '*.txt',
      });
      const grepResult = await (toolSet?.grep as any).execute({
        path: 'notes',
        pattern: 'updated by aliased backend',
      });

      expect(readWrappedToolOutput(readResult)).toContain('/notes/routed.txt');
      expect(readWrappedToolOutput(globResult)).toContain('/notes/output.txt');
      expect(readWrappedToolOutput(globResult)).toContain('/notes/routed.txt');
      expect(readWrappedToolOutput(grepResult)).toContain('/notes/output.txt:');
      expect(readWrappedToolData(writeResult)).toEqual(expect.objectContaining({
        output: expect.stringContaining('/notes/output.txt'),
      }));
      expect(readWrappedToolData(editResult)).toEqual(expect.objectContaining({
        output: expect.stringContaining('/notes/output.txt'),
      }));
    } finally {
      if (originalFilesystemBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = originalFilesystemBackend;
      }
    }
  });

  it('dispatches native read tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'line one\nline two\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['read'],
    });
    const readTool = toolSet?.read;
    expect(readTool).toBeDefined();

    const result = await (readTool as any).execute({
      filePath: 'notes/runtime.txt',
      limit: 1,
      offset: 1,
    });
    const modelOutput = await (readTool as any).toModelOutput({
      input: { filePath: 'notes/runtime.txt', limit: 1, offset: 1 },
      output: result,
      toolCallId: 'call-read-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('/notes/runtime.txt'),
    }));
    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      loaded: [],
      output: expect.stringContaining('/notes/runtime.txt'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<read_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('1: line one');
  });

  it('includes loaded instruction paths in native read tool output data', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'AGENTS.md'), '# Local Rules\nRead carefully.\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'nested', 'runtime.txt'), 'line one\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['read'],
    });
    const readTool = toolSet?.read;
    expect(readTool).toBeDefined();

    const result = await (readTool as any).execute({
      filePath: 'notes/nested/runtime.txt',
      limit: 1,
      offset: 1,
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      loaded: ['/notes/AGENTS.md'],
      output: expect.stringContaining('该路径命中以下 AGENTS.md 指令'),
    }));
  });

  it('does not repeat loaded instruction reminders in the same assistant message through the native read tool chain', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'AGENTS.md'), '# Local Rules\nRead carefully.\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'nested', 'runtime.txt'), 'line one\n', 'utf8');

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-read-loaded-claim-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['read'],
    });
    const readTool = toolSet?.read;
    expect(readTool).toBeDefined();

    const firstResult = await (readTool as any).execute({
      filePath: 'notes/nested/runtime.txt',
      limit: 1,
      offset: 1,
    });
    const secondResult = await (readTool as any).execute({
      filePath: 'notes/nested/runtime.txt',
      limit: 1,
      offset: 1,
    });

    expect(readWrappedToolData(firstResult)).toEqual(expect.objectContaining({
      loaded: ['/notes/AGENTS.md'],
      output: expect.stringContaining('该路径命中以下 AGENTS.md 指令'),
    }));
    expect(readWrappedToolData(secondResult)).toMatchObject({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /notes/nested/runtime.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '1: line one',
        '(end of file, total lines: 1, total bytes: 9 B. Re-run read with a different offset if you need another window.)',
        '</content>',
        '</read_result>',
      ].join('\n'),
      path: '/notes/nested/runtime.txt',
      truncated: false,
      type: 'file',
    });
  });

  it('surfaces backend read offset diagnostics through the native read tool chain', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'line one\nline two\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['read'],
    });
    const readTool = toolSet?.read;
    expect(readTool).toBeDefined();

    const result = await (readTool as any).execute({
      filePath: 'notes/runtime.txt',
      limit: 1,
      offset: 5,
    });

    expect(result).toEqual({
      error: 'read.offset 超出范围: 5，文件总行数为 2',
      inputText: JSON.stringify({
        filePath: 'notes/runtime.txt',
        limit: 1,
        offset: 5,
      }, null, 2),
      phase: 'execute',
      recovered: true,
      tool: 'read',
      type: 'invalid-tool-result',
    });
  });

  it('dispatches native glob tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'packages', 'server', 'src'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'packages', 'server', 'src', 'runtime.ts'), 'smoke-workspace\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'guide.md'), '# smoke\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['glob'],
    });
    const globTool = toolSet?.glob;
    expect(globTool).toBeDefined();

    const result = await (globTool as any).execute({
      path: '/packages/server',
      pattern: '**/*.ts',
    });
    const modelOutput = await (globTool as any).toModelOutput({
      input: { path: '/packages/server', pattern: '**/*.ts' },
      output: result,
      toolCallId: 'call-glob-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('/packages/server/src/runtime.ts'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<glob_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('/packages/server/src/runtime.ts');
    expect((modelOutput as { value: string }).value).toContain('Project Base: packages/server');
    expect((modelOutput as { value: string }).value).toContain('Project Next Read: packages/server/src/runtime.ts');
    expect((modelOutput as { value: string }).value).toContain(
      'Use read on a matching path to inspect content, then edit or write if you need changes.',
    );
    expect((modelOutput as { value: string }).value).toContain(
      '(suggested next read: /packages/server/src/runtime.ts)',
    );
  });

  it('keeps glob no-match continuation hints in the native tool chain output', async () => {
    const { conversationId, service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['glob'],
    });
    const globTool = toolSet?.glob;
    expect(globTool).toBeDefined();

    const result = await (globTool as any).execute({
      path: '/',
      pattern: '**/*.missing',
    });
    const modelOutput = await (globTool as any).toModelOutput({
      input: { path: '/', pattern: '**/*.missing' },
      output: result,
      toolCallId: 'call-glob-empty-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('(total matches: 0. Refine path or pattern and retry.)'),
    }));
    expect((modelOutput as { value: string }).value).toContain(
      '(total matches: 0. Refine path or pattern and retry.)',
    );
  });

  it('surfaces missing-path suggestions through the native glob tool chain', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'readme.md'), '# smoke\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'reader-notes.md'), '# notes\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['glob'],
    });
    const globTool = toolSet?.glob;
    expect(globTool).toBeDefined();

    const result = await (globTool as any).execute({
      path: 'docs/read',
      pattern: '**/*.md',
    });

    expect(result).toEqual({
      error: [
        '路径不存在: /docs/read',
        '可选路径：',
        '/docs/readme.md',
        '/docs/reader-notes.md',
        '可继续操作：请改用上述路径之一重新 glob，或先 glob 上级目录缩小范围。',
      ].join('\n'),
      inputText: JSON.stringify({
        path: 'docs/read',
        pattern: '**/*.md',
      }, null, 2),
      phase: 'execute',
      recovered: true,
      tool: 'glob',
      type: 'invalid-tool-result',
    });
  });

  it('surfaces missing-path suggestions through the native grep tool chain', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'readme.md'), '# smoke\nneedle\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'reader-notes.md'), '# notes\nneedle\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['grep'],
    });
    const grepTool = toolSet?.grep;
    expect(grepTool).toBeDefined();

    const result = await (grepTool as any).execute({
      include: '**/*.md',
      path: 'docs/read',
      pattern: 'needle',
    });

    expect(result).toEqual({
      error: [
        '路径不存在: /docs/read',
        '可选路径：',
        '/docs/readme.md',
        '/docs/reader-notes.md',
        '可继续操作：请改用上述路径之一重新 grep，或先 glob 上级目录确认搜索范围。',
      ].join('\n'),
      inputText: JSON.stringify({
        include: '**/*.md',
        path: 'docs/read',
        pattern: 'needle',
      }, null, 2),
      phase: 'execute',
      recovered: true,
      tool: 'grep',
      type: 'invalid-tool-result',
    });
  });

  it('dispatches native grep tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'packages', 'server', 'src'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'packages', 'server', 'src', 'runtime.ts'), 'smoke-workspace\nsecondary line\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'guide.md'), '# smoke\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['grep'],
    });
    const grepTool = toolSet?.grep;
    expect(grepTool).toBeDefined();

    const result = await (grepTool as any).execute({
      include: '**/*.ts',
      path: '/packages/server',
      pattern: 'smoke-workspace',
    });
    const modelOutput = await (grepTool as any).toModelOutput({
      input: { include: '**/*.ts', path: '/packages/server', pattern: 'smoke-workspace' },
      output: result,
      toolCallId: 'call-grep-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('/packages/server/src/runtime.ts:'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<grep_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('/packages/server/src/runtime.ts:');
    expect((modelOutput as { value: string }).value).toContain('1: smoke-workspace');
    expect((modelOutput as { value: string }).value).toContain('Project Base: packages/server');
    expect((modelOutput as { value: string }).value).toContain('Project Next Read: packages/server/src/runtime.ts');
    expect((modelOutput as { value: string }).value).toContain(
      'Use read on a matching file to inspect surrounding context, then edit or write if you need changes.',
    );
    expect((modelOutput as { value: string }).value).toContain(
      '(suggested next read: /packages/server/src/runtime.ts)',
    );
  });

  it('keeps grep no-match continuation hints in the native tool chain output', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'smoke-workspace\nsecondary line\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['grep'],
    });
    const grepTool = toolSet?.grep;
    expect(grepTool).toBeDefined();

    const result = await (grepTool as any).execute({
      include: '*.txt',
      path: '/',
      pattern: 'missing-pattern',
    });
    const modelOutput = await (grepTool as any).toModelOutput({
      input: { include: '*.txt', path: '/', pattern: 'missing-pattern' },
      output: result,
      toolCallId: 'call-grep-empty-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('(total matches: 0. Refine path, include or pattern and retry.)'),
    }));
    expect((modelOutput as { value: string }).value).toContain(
      '(total matches: 0. Refine path, include or pattern and retry.)',
    );
  });

  it('dispatches native write tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'generated file\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['write'],
    });
    const writeTool = toolSet?.write;
    expect(writeTool).toBeDefined();
    expect(typeof (writeTool as any).execute).toBe('function');
    const wrappedResult = await (writeTool as any).execute({
      content: 'appended line\n',
      filePath: 'generated/output.txt',
      mode: 'append',
    });

    const modelOutput = await (writeTool as any).toModelOutput({
      input: { content: 'appended line\n', filePath: 'generated/output.txt', mode: 'append' },
      output: wrappedResult,
      toolCallId: 'call-write-1',
    });

    expect(readWrappedToolData(wrappedResult)).toEqual(expect.objectContaining({
      created: false,
      lineCount: 2,
      output: expect.stringContaining('/generated/output.txt'),
      path: '/generated/output.txt',
      postWriteSummary: expect.objectContaining({
        totalDiagnostics: 0,
      }),
      status: 'appended',
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<write_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('Status: appended');
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe('generated file\nappended line\n');
  });

  it('dispatches native edit tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'generated file\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'updated file',
      oldString: 'generated file',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: { filePath: 'generated/output.txt', newString: 'updated file', oldString: 'generated file' },
      output: result,
      toolCallId: 'call-edit-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      occurrences: 1,
      output: expect.stringContaining('/generated/output.txt'),
      path: '/generated/output.txt',
      postWriteSummary: expect.objectContaining({
        totalDiagnostics: 0,
      }),
      strategy: expect.any(String),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<edit_result>'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe('updated file\n');
  });

  it('supports create-style native edit when oldString is empty', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/created.txt',
      newString: 'created by edit\n',
      oldString: '',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: {
        filePath: 'generated/created.txt',
        newString: 'created by edit\n',
        oldString: '',
      },
      output: result,
      toolCallId: 'call-edit-empty-old-string-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('Strategy: empty-old-string'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('Strategy: empty-old-string'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'created.txt'), 'utf8')).toBe('created by edit\n');
  });

  it('keeps escape-normalized strategy visible in native edit tool output', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'alpha\nbeta\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'gamma\n',
      oldString: 'alpha\\nbeta\\n',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: {
        filePath: 'generated/output.txt',
        newString: 'gamma\n',
        oldString: 'alpha\\nbeta\\n',
      },
      output: result,
      toolCallId: 'call-edit-escape-normalized-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('Strategy: escape-normalized'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('Strategy: escape-normalized'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe('gamma\n');
  });

  it('keeps line-trimmed strategy visible when a looser anchor strategy is unnecessary', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'generated', 'output.txt'),
      [
        'const start',
        'x = 1',
        'y = 2',
        'const end',
        '',
        'const start',
        'x = 1   ',
        'y=2   ',
        'const end',
        '',
      ].join('\n'),
      'utf8',
    );

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'done\n',
      oldString: [
        'const start',
        'x = 1',
        'y=2',
        'const end',
        '',
      ].join('\n'),
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: {
        filePath: 'generated/output.txt',
        newString: 'done\n',
        oldString: [
          'const start',
          'x = 1',
          'y=2',
          'const end',
          '',
        ].join('\n'),
      },
      output: result,
      toolCallId: 'call-edit-line-trimmed-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('Strategy: line-trimmed'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('Strategy: line-trimmed'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe(
      [
        'const start',
        'x = 1',
        'y = 2',
        'const end',
        '',
        'done',
        '',
      ].join('\n'),
    );
  });

  it('keeps trailing-whitespace-trimmed strategy visible in native edit tool output', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'generated', 'output.txt'),
      '  const value = 1;\nconst value = 1;\n',
      'utf8',
    );

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'const value = 2;',
      oldString: 'const value = 1;   ',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: {
        filePath: 'generated/output.txt',
        newString: 'const value = 2;',
        oldString: 'const value = 1;   ',
      },
      output: result,
      toolCallId: 'call-edit-trailing-whitespace-trimmed-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('Strategy: trailing-whitespace-trimmed'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('Strategy: trailing-whitespace-trimmed'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe(
      '  const value = 1;\nconst value = 2;\n',
    );
  });

  it('keeps indentation-flexible strategy visible in native edit tool output and preserves block indentation', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'generated', 'output.txt'),
      'function demo() {\n    if (true) {\n      return 1;\n    }\n}\n',
      'utf8',
    );

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'if (true) {\n  return 2;\n}\n',
      oldString: 'if (true) {\n  return 1;\n}\n',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: {
        filePath: 'generated/output.txt',
        newString: 'if (true) {\n  return 2;\n}\n',
        oldString: 'if (true) {\n  return 1;\n}\n',
      },
      output: result,
      toolCallId: 'call-edit-indentation-flexible-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('Strategy: indentation-flexible'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('Strategy: indentation-flexible'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe(
      'function demo() {\n    if (true) {\n      return 2;\n    }\n}\n',
    );
  });

  it('keeps line-ending-normalized strategy visible in native edit tool output and preserves CRLF', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'generated', 'output.txt'),
      'const first = 1;\r\nconst second = 2;\r\n',
      'utf8',
    );

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'const first = 3;\nconst second = 4;\n',
      oldString: 'const first = 1;\nconst second = 2;\n',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: {
        filePath: 'generated/output.txt',
        newString: 'const first = 3;\nconst second = 4;\n',
        oldString: 'const first = 1;\nconst second = 2;\n',
      },
      output: result,
      toolCallId: 'call-edit-line-ending-normalized-1',
    });

    expect(readWrappedToolData(result)).toEqual(expect.objectContaining({
      output: expect.stringContaining('Strategy: line-ending-normalized'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('Strategy: line-ending-normalized'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe(
      'const first = 3;\r\nconst second = 4;\r\n',
    );
  });

  it('keeps post-write diagnostic summary and next-step hints in native write tool output', async () => {
    const filesystemBackend = createMockFilesystemBackend('mock-filesystem');
    filesystemBackend.writeTextFile = jest.fn().mockResolvedValue({
      created: false,
      diff: {
        additions: 1,
        afterLineCount: 2,
        beforeLineCount: 2,
        deletions: 1,
        patch: 'mock write patch',
      },
      lineCount: 2,
      path: '/mock-filesystem/generated/output.ts',
      postWrite: {
        diagnostics: [
          {
            column: 10,
            line: 1,
            message: 'Current file error',
            path: '/mock-filesystem/generated/output.ts',
            severity: 'error',
            source: 'typescript',
          },
          {
            column: 3,
            line: 7,
            message: 'Related warning',
            path: '/mock-filesystem/generated/related.ts',
            severity: 'warning',
            source: 'typescript',
          },
        ],
        formatting: null,
      },
      status: 'overwritten',
      size: 64,
    });
    const { conversationId, service } = createFixture({
      runtimeFilesystemBackends: [filesystemBackend],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['write'],
    });
    const writeTool = toolSet?.write;
    expect(writeTool).toBeDefined();

    const result = await (writeTool as any).execute({
      content: 'updated\ncontent\n',
      filePath: 'generated/output.ts',
    });
    const modelOutput = await (writeTool as any).toModelOutput({
      input: { content: 'updated\ncontent\n', filePath: 'generated/output.ts' },
      output: result,
      toolCallId: 'call-write-diagnostics-1',
    });

    expect(readWrappedToolOutput(result)).toContain(
      'Diagnostics: 2 issue(s). Current file: 1 Related files: 1 across 1 file(s)',
    );
    expect(readWrappedToolOutput(result)).toContain(
      'Next: read /mock-filesystem/generated/output.ts and fix error diagnostics before continuing edits or writes.',
    );
    expect((modelOutput as { value: string }).value).toContain(
      '<diagnostics file="/mock-filesystem/generated/output.ts">',
    );
    expect((modelOutput as { value: string }).value).toContain(
      '<diagnostics file="/mock-filesystem/generated/related.ts">',
    );
  });

  it('keeps formatting-only next-step hints in native write tool output', async () => {
    const filesystemBackend = createMockFilesystemBackend('mock-filesystem');
    filesystemBackend.writeTextFile = jest.fn().mockResolvedValue({
      created: false,
      diff: {
        additions: 1,
        afterLineCount: 2,
        beforeLineCount: 2,
        deletions: 1,
        patch: 'mock write patch',
      },
      lineCount: 2,
      path: '/mock-filesystem/generated/output.json',
      postWrite: {
        diagnostics: [],
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
      },
      status: 'overwritten',
      size: 64,
    });
    const { conversationId, service } = createFixture({
      runtimeFilesystemBackends: [filesystemBackend],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['write'],
    });
    const writeTool = toolSet?.write;
    expect(writeTool).toBeDefined();

    const result = await (writeTool as any).execute({
      content: '{"a":1}\n',
      filePath: 'generated/output.json',
    });
    const modelOutput = await (writeTool as any).toModelOutput({
      input: { content: '{"a":1}\n', filePath: 'generated/output.json' },
      output: result,
      toolCallId: 'call-write-formatting-hint-1',
    });

    expect(readWrappedToolOutput(result)).toContain('Formatting: json-pretty');
    expect(readWrappedToolOutput(result)).toContain('Diagnostics: none');
    expect(readWrappedToolOutput(result)).toContain(
      'Next: read /mock-filesystem/generated/output.json to confirm the formatted output before continuing edits or writes.',
    );
    expect((modelOutput as { value: string }).value).toContain(
      'Next: read /mock-filesystem/generated/output.json to confirm the formatted output before continuing edits or writes.',
    );
  });

  it('keeps post-write diagnostic summary and next-step hints in native edit tool output', async () => {
    const filesystemBackend = createMockFilesystemBackend('mock-filesystem');
    filesystemBackend.editTextFile = jest.fn().mockResolvedValue({
      diff: {
        additions: 1,
        afterLineCount: 2,
        beforeLineCount: 2,
        deletions: 1,
        patch: 'mock edit patch',
      },
      occurrences: 1,
      path: '/mock-filesystem/generated/output.ts',
      postWrite: {
        diagnostics: [
          {
            column: 12,
            line: 2,
            message: 'Current file error',
            path: '/mock-filesystem/generated/output.ts',
            severity: 'error',
            source: 'typescript',
          },
          {
            code: 'TS6133',
            column: 2,
            line: 1,
            message: 'Unused variable',
            path: '/mock-filesystem/generated/related.ts',
            severity: 'warning',
            source: 'typescript',
          },
        ],
        formatting: null,
      },
      strategy: 'exact',
    });
    const { conversationId, service } = createFixture({
      runtimeFilesystemBackends: [filesystemBackend],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.ts',
      newString: 'beta',
      oldString: 'alpha',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: { filePath: 'generated/output.ts', newString: 'beta', oldString: 'alpha' },
      output: result,
      toolCallId: 'call-edit-diagnostics-1',
    });

    expect(readWrappedToolOutput(result)).toContain(
      'Diagnostics: 2 issue(s). Current file: 1 Related files: 1 across 1 file(s)',
    );
    expect(readWrappedToolOutput(result)).toContain(
      'Next: read /mock-filesystem/generated/output.ts and fix error diagnostics before continuing edits or writes.',
    );
    expect((modelOutput as { value: string }).value).toContain(
      'WARNING TS6133 [1:2] Unused variable',
    );
  });

  it('keeps related-file error next-step hints in native edit tool output', async () => {
    const filesystemBackend = createMockFilesystemBackend('mock-filesystem');
    filesystemBackend.editTextFile = jest.fn().mockResolvedValue({
      diff: {
        additions: 1,
        afterLineCount: 2,
        beforeLineCount: 2,
        deletions: 1,
        patch: 'mock related error patch',
      },
      occurrences: 1,
      path: '/mock-filesystem/generated/output.ts',
      postWrite: {
        diagnostics: [
          {
            column: 6,
            line: 11,
            message: 'Related file error',
            path: '/mock-filesystem/generated/related.ts',
            severity: 'error',
            source: 'typescript',
          },
        ],
        formatting: null,
      },
      strategy: 'exact',
    });
    const { conversationId, service } = createFixture({
      runtimeFilesystemBackends: [filesystemBackend],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.ts',
      newString: 'beta',
      oldString: 'alpha',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: { filePath: 'generated/output.ts', newString: 'beta', oldString: 'alpha' },
      output: result,
      toolCallId: 'call-edit-related-error-hint-1',
    });

    expect(readWrappedToolOutput(result)).toContain(
      'Diagnostics: 1 issue(s) in related file',
    );
    expect(readWrappedToolOutput(result)).toContain(
      'Next: read related files first: /mock-filesystem/generated/related.ts. Fix error diagnostics before continuing edits or writes.',
    );
    expect((modelOutput as { value: string }).value).toContain(
      '<diagnostics file="/mock-filesystem/generated/related.ts">',
    );
  });

  it('converts recoverable tool execution errors into internal invalid results', async () => {
    const { service, webFetchService } = createFixture();
    webFetchService.fetch.mockRejectedValueOnce(new Error('request timeout'));

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['webfetch'],
    });
    const webFetchTool = toolSet?.webfetch;
    expect(webFetchTool).toBeDefined();

    const result = await (webFetchTool as any).execute({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
    const modelOutput = await (webFetchTool as any).toModelOutput({
      input: {
        format: 'markdown',
        url: 'https://example.com/smoke',
      },
      output: result,
      toolCallId: 'call-webfetch-failed-1',
    });

    expect(result).toEqual({
      error: 'request timeout',
      inputText: JSON.stringify({
        format: 'markdown',
        url: 'https://example.com/smoke',
      }, null, 2),
      phase: 'execute',
      recovered: true,
      tool: 'webfetch',
      type: 'invalid-tool-result',
    });
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<invalid_tool_result>'),
    }));
  });

  it('includes MCP tools in the executable tool set and dispatches execution through McpService', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
            },
            required: ['city'],
          },
        },
      ],
    });
    mcpService.callTool.mockResolvedValue({ forecast: 'sunny' });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const mcpTool = toolSet?.weather__get_forecast;
    expect(mcpTool).toBeDefined();
    const result = await (mcpTool as any).execute({ city: 'Shanghai' });

    expect(Object.keys(toolSet ?? {})).toContain('weather__get_forecast');
    expect(result).toEqual({
      data: { forecast: 'sunny' },
      kind: 'tool:json',
      value: { forecast: 'sunny' },
    });
    expect(mcpService.callTool).toHaveBeenCalledWith({
      arguments: { city: 'Shanghai' },
      serverName: 'weather',
      toolName: 'get_forecast',
    });
  });

  it('dispatches native skill tool execution through the skill owner', async () => {
    const { service, skillRegistryService } = createFixture();
    skillRegistryService.getSkillByName.mockResolvedValue({
      id: 'project/weather-query',
      name: 'weather-query',
      description: '查询指定地点天气。',
      content: '# weather-query\n\n请先确认地点，再查询天气。',
      entryPath: 'weather-query/SKILL.md',
      governance: { loadPolicy: 'allow' },
      promptPreview: '请先确认地点，再查询天气。',
      sourceKind: 'project',
      tags: [],
      assets: [{ path: 'scripts/weather.js', kind: 'script', textReadable: true, executable: true }],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['skill'],
    });
    const skillTool = toolSet?.skill;
    expect(skillTool).toBeDefined();
    const result = await (skillTool as any).execute({ name: 'weather-query' });
    const modelOutput = await (skillTool as any).toModelOutput({
      input: { name: 'weather-query' },
      output: result,
      toolCallId: 'call-skill-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('<skill_content name="weather-query">'),
      data: expect.objectContaining({
        name: 'weather-query',
        entryPath: 'weather-query/SKILL.md',
        modelOutput: expect.stringContaining('<skill_content name="weather-query">'),
      }),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<skill_content name="weather-query">'),
    }));
    expect(skillRegistryService.getSkillByName).toHaveBeenCalledWith('weather-query');
  });

  it('dispatches native todowrite tool execution through the session todo owner', async () => {
    const { conversationId, conversationTodoService, service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['todowrite'],
    });
    const todoTool = toolSet?.todowrite;
    expect(todoTool).toBeDefined();
    const todos = [
      { content: '分析现有实现', priority: 'high' as const, status: 'completed' as const },
      { content: '实现 todo 工具', priority: 'high' as const, status: 'in_progress' as const },
    ];
    const result = await (todoTool as any).execute({ todos });
    const modelOutput = await (todoTool as any).toModelOutput({
      input: { todos },
      output: result,
      toolCallId: 'call-todo-1',
    });

    expect(result).toEqual({
      data: {
        pendingCount: 1,
        sessionId: conversationId,
        todos,
      },
      kind: 'tool:text',
      value: expect.stringContaining('<todo_result>'),
    });
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<todo_result>'),
    }));
    expect(conversationTodoService.readSessionTodo(conversationId)).toEqual(todos);
  });

  it('wraps plugin tool execution results before they enter the model context', async () => {
    const { pluginDispatch, service } = createFixture();
    jest.spyOn(pluginDispatch, 'executeTool').mockResolvedValue({
      saved: true,
      summary: '已保存 2 条记忆',
      vectors: Array.from({ length: 30 }, (_, index) => index),
    } as never);

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['save_memory'],
    });
    const pluginTool = toolSet?.save_memory;
    expect(pluginTool).toBeDefined();

    const result = await (pluginTool as any).execute({ content: 'memory payload' });

    expect(result).toEqual({
      data: {
        saved: true,
        summary: '已保存 2 条记忆',
        vectors: Array.from({ length: 30 }, (_, index) => index),
      },
      kind: 'tool:json',
      value: {
        saved: true,
        summary: '已保存 2 条记忆',
        vectors: expect.arrayContaining([
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
          10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        ]),
      },
    });
    expect((result as { value: { vectors: unknown[] } }).value.vectors.at(-1)).toEqual(expect.stringMatching(/more item\(s\)$/));
    expect(pluginDispatch.executeTool).toHaveBeenCalledWith({
      context: expect.objectContaining({
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      }),
      params: { content: 'memory payload' },
      pluginId: 'builtin.memory',
      toolName: 'save_memory',
    });
  });

  it('re-compacts pre-wrapped plugin tool outputs before they enter the model context', async () => {
    const { pluginDispatch, service } = createFixture();
    const oversizedText = 'x'.repeat(2_400);
    jest.spyOn(pluginDispatch, 'executeTool').mockResolvedValue({
      data: {
        raw: oversizedText,
      },
      kind: 'tool:text',
      value: oversizedText,
    } as never);

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['save_memory'],
    });
    const pluginTool = toolSet?.save_memory;
    expect(pluginTool).toBeDefined();

    const result = await (pluginTool as any).execute({ content: 'memory payload' });
    const modelOutput = await (pluginTool as any).toModelOutput({
      input: { content: 'memory payload' },
      output: result,
      toolCallId: 'call-plugin-wrapped-1',
    });

    expect(result).toEqual(expect.objectContaining({
      data: {
        raw: oversizedText,
      },
      kind: 'tool:text',
      value: expect.stringContaining('[truncated 400 chars]'),
    }));
    expect((result as { value: string }).value.length).toBeLessThan(2_100);
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('[truncated'),
    }));
  });

  it('captures oversized plugin text output to a session file while only returning compact text to the model', async () => {
    const { pluginDispatch, runtimeToolsSettingsService, runtimeWorkspaceRoot, service } = createFixture();
    runtimeToolsSettingsService.updateConfig({
      toolOutputCapture: {
        enabled: true,
        maxBytes: 128,
        maxFilesPerSession: 5,
      },
    });
    const oversizedText = 'tool-output-'.repeat(900);
    jest.spyOn(pluginDispatch, 'executeTool').mockResolvedValue({
      message: oversizedText,
      summary: '已保存大文本输出',
    } as never);

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['save_memory'],
    });
    const pluginTool = toolSet?.save_memory;
    expect(pluginTool).toBeDefined();

    const result = await (pluginTool as any).execute({ content: 'memory payload' });
    const modelOutput = await (pluginTool as any).toModelOutput({
      input: { content: 'memory payload' },
      output: result,
      toolCallId: 'call-plugin-capture-text-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('[full output saved to: /.garlic-claw/tool-output/'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('[full output saved to: /.garlic-claw/tool-output/'),
    }));
    const outputPathMatch = String((result as { value: string }).value).match(/\[full output saved to: ([^\]]+)\]/);
    expect(outputPathMatch?.[1]).toBeTruthy();
    const hostPath = path.join(
      runtimeWorkspaceRoot,
      'conversation-1',
      ...String(outputPathMatch?.[1] ?? '').replace(/^\/+/, '').split('/'),
    );
    expect(fs.existsSync(hostPath)).toBe(true);
    expect(fs.readFileSync(hostPath, 'utf8')).toContain(oversizedText.slice(0, 400));
  });

  it('captures oversized plugin json output to a session file while keeping model json compact', async () => {
    const { pluginDispatch, runtimeToolsSettingsService, runtimeWorkspaceRoot, service } = createFixture();
    runtimeToolsSettingsService.updateConfig({
      toolOutputCapture: {
        enabled: true,
        maxBytes: 128,
        maxFilesPerSession: 5,
      },
    });
    jest.spyOn(pluginDispatch, 'executeTool').mockResolvedValue({
      items: Array.from({ length: 40 }, (_, index) => index),
      nested: {
        text: 'json-output-'.repeat(600),
      },
      saved: true,
    } as never);

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['save_memory'],
    });
    const pluginTool = toolSet?.save_memory;
    expect(pluginTool).toBeDefined();

    const result = await (pluginTool as any).execute({ content: 'memory payload' });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:json',
      value: expect.objectContaining({
        _fullOutputPath: expect.stringMatching(/^\/\.garlic-claw\/tool-output\//),
        items: expect.any(Array),
        nested: expect.any(Object),
        saved: true,
      }),
    }));
    const compactValue = (result as { value: Record<string, unknown> }).value;
    const hostPath = path.join(
      runtimeWorkspaceRoot,
      'conversation-1',
      ...String(compactValue._fullOutputPath ?? '').replace(/^\/+/, '').split('/'),
    );
    expect(fs.existsSync(hostPath)).toBe(true);
    expect(fs.readFileSync(hostPath, 'utf8')).toContain('"saved": true');
    expect(fs.readFileSync(hostPath, 'utf8')).toContain('json-output-json-output');
  });

  it('excludes disconnected remote plugins from the executable tool set', async () => {
    const { pluginBootstrapService, service } = createFixture();
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.memory-tools',
        name: 'Remote Memory Tools',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: '搜索远端记忆',
            name: 'remote_search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.markPluginOffline('remote.memory-tools');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(Object.keys(toolSet ?? {})).not.toContain('remote_search');
  });
});

function createFixture(options: {
  runtimeWorkspaceRoot?: string;
  aliasHostFilesystemKinds?: string[];
  aliasNativeShellKinds?: string[];
  runtimeBackends?: RuntimeBackend[];
  runtimeFilesystemBackends?: RuntimeFilesystemBackend[];
} = {}) {
  const runtimeWorkspaceRoot = options.runtimeWorkspaceRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gc-tool-registry-runtime-'));
  process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;
  process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = path.join(runtimeWorkspaceRoot, 'config', 'settings.json');
  if (!options.runtimeWorkspaceRoot) {
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
  }
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
  );
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: 'builtin.memory',
      name: '记忆',
      runtime: 'local',
    },
    manifest: {
      permissions: [],
      tools: [
        {
          description: '保存记忆',
          name: 'save_memory',
          parameters: {},
        },
        {
          description: '搜索记忆',
          name: 'search_memory',
          parameters: {},
        },
      ],
      version: '1.0.0',
    } as never,
  });

  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimeGatewayRemoteTransportService = new RuntimeGatewayRemoteTransportService(
    runtimeGatewayConnectionLifecycleService,
  );
  const conversationStore = new ConversationStoreService();
  const conversationTodoService = new ConversationTodoService(conversationStore);
  const conversationId = (conversationStore.createConversation({
    title: 'Tool Registry Todo',
    userId: 'user-1',
  }) as { id: string }).id;
  const conversationMessages = new ConversationMessageService(
    conversationStore,
  );
  const aiModelExecutionService = new AiModelExecutionService();
  const projectWorktreeRootService = new ProjectWorktreeRootService();
  const subagentRunner = new SubagentRunnerService(
    aiModelExecutionService,
    conversationMessages,
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
      listPlugins: jest.fn().mockReturnValue([]),
    } as never,
    new ProjectSubagentTypeRegistryService(projectWorktreeRootService),
    {
      get: jest.fn().mockReturnValue(undefined),
    } as never,
    conversationStore,
  );
  const automationService = new AutomationService(
    new AutomationExecutionService(
      {
        executeTool: jest.fn(),
        invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      {
        sendMessage: async () => {
          throw new Error('ConversationMessageService is not available');
        },
      } as never,
      {
        executeRegisteredTool: jest.fn(),
      } as never,
    ),
  );
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  const builtinPluginRegistryService = new BuiltinPluginRegistryService();
  const mcpService: {
    callTool: jest.Mock;
    getToolingSnapshot: jest.Mock;
    listToolSources: jest.Mock;
    runGovernanceAction: jest.Mock;
    setServerEnabled: jest.Mock;
  } = {
    callTool: jest.fn(),
    getToolingSnapshot: jest.fn().mockReturnValue({ statuses: [], tools: [] }),
    listToolSources: jest.fn(),
    runGovernanceAction: jest.fn(),
    setServerEnabled: jest.fn(),
  };
  mcpService.listToolSources.mockImplementation(() => buildMcpToolSources(mcpService.getToolingSnapshot()));
  const skillRegistryService = {
    getSkillByName: jest.fn(),
    listSkillSummaries: jest.fn().mockResolvedValue([
      {
        id: 'project/weather-query',
        name: 'weather-query',
        description: '查询指定地点天气。',
        entryPath: 'weather-query/SKILL.md',
        governance: { loadPolicy: 'allow' },
        promptPreview: '请先确认地点，再查询天气。',
        sourceKind: 'project',
        tags: [],
      },
    ]),
    resolveSkillDirectory: jest.fn().mockReturnValue(path.resolve('config', 'skills', 'definitions', 'weather-query')),
  };
  const skillToolService = new SkillToolService(skillRegistryService as unknown as SkillRegistryService);
  const runtimeOneShotShellService = new RuntimeOneShotShellService();
  runtimeOneShotShellServices.push(runtimeOneShotShellService);
  const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
  const runtimeToolsSettingsService = new RuntimeToolsSettingsService();
  const hostFilesystemBackend = new HostFilesystemBackendService(
    runtimeSessionEnvironmentService,
  );
  const projectWorktreeSearchOverlayService = new ProjectWorktreeSearchOverlayService(
    runtimeSessionEnvironmentService,
    projectWorktreeRootService,
  );
  const runtimeBackendRoutingService = new RuntimeBackendRoutingService();
  const baseRuntimeBackends = options.runtimeBackends ?? createRealRuntimeBackendsForShellRouting(
    runtimeSessionEnvironmentService,
  );
  const resolvedRuntimeBackends = options.aliasNativeShellKinds?.length
    ? [
      ...baseRuntimeBackends,
      ...options.aliasNativeShellKinds.map((kind) => (
        createKindAliasedRuntimeBackend(kind, baseRuntimeBackends)
      )),
    ]
    : baseRuntimeBackends;
  const runtimeCommandService = new RuntimeCommandService(
    resolvedRuntimeBackends,
    new RuntimeCommandCaptureService(runtimeSessionEnvironmentService, runtimeToolsSettingsService),
  );
  const resolvedFilesystemBackends = options.runtimeFilesystemBackends ?? [
    hostFilesystemBackend,
    ...(options.aliasHostFilesystemKinds ?? []).map((kind) => (
      createKindAliasedFilesystemBackend(kind, hostFilesystemBackend)
    )),
  ];
  const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService(
    resolvedFilesystemBackends,
  );
  const runtimeToolBackendService = new RuntimeToolBackendService(
    runtimeBackendRoutingService,
    runtimeCommandService,
    runtimeFilesystemBackendService,
  );
  const readInstructionClaims = new Map<string, Set<string>>();
  const runtimeFileFreshnessService = {
    assertCanWrite: jest.fn().mockResolvedValue(undefined),
    buildReadSystemReminder: jest.fn().mockReturnValue([]),
    claimReadInstructionPaths: jest.fn().mockImplementation((
      sessionId: string,
      paths: string[],
      assistantMessageId?: string,
    ) => {
      const scopeKey = assistantMessageId?.trim()
        ? `${sessionId}::${assistantMessageId.trim()}`
        : sessionId;
      let claims = readInstructionClaims.get(scopeKey);
      if (!claims) {
        claims = new Set<string>();
        readInstructionClaims.set(scopeKey, claims);
      }
      const claimed: string[] = [];
      for (const nextPath of paths) {
        if (!nextPath || claims.has(nextPath)) {
          continue;
        }
        claims.add(nextPath);
        claimed.push(nextPath);
      }
      return claimed;
    }),
    rememberRead: jest.fn().mockResolvedValue(undefined),
    withFileLock: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
  } as never;
  const runtimeToolPermissionService = new RuntimeToolPermissionService(conversationStore);
  const bashToolService = new BashToolService(
    runtimeCommandService,
    runtimeSessionEnvironmentService,
    runtimeToolBackendService,
  );
  const readToolService = new ReadToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    runtimeFileFreshnessService,
  );
  const globToolService = new GlobToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    projectWorktreeSearchOverlayService,
  );
  const grepToolService = new GrepToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    projectWorktreeSearchOverlayService,
  );
  const writeToolService = new WriteToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    runtimeFileFreshnessService,
  );
  const editToolService = new EditToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    runtimeFileFreshnessService,
  );
  const toolManagementSettingsService = new ToolManagementSettingsService();
  const toolOutputCaptureService = new ToolOutputCaptureService(
    runtimeSessionEnvironmentService,
    runtimeToolsSettingsService,
  );
  const subagentSettingsService = new SubagentSettingsService();
  const subagentToolService = new SubagentToolService(
    subagentRunner,
    subagentSettingsService,
  );
  const pluginDispatch = new PluginDispatchService(
    builtinPluginRegistryService,
    pluginBootstrapService,
    runtimeGatewayRemoteTransportService,
  );
  const toolGateway = new ToolGatewayService(
    bashToolService,
    editToolService,
    globToolService,
    grepToolService,
    readToolService,
    runtimeFileFreshnessService,
    runtimeFilesystemBackendService,
    runtimeSessionEnvironmentService,
    runtimeToolBackendService,
    runtimeToolPermissionService,
    runtimeToolsSettingsService,
    writeToolService,
    projectWorktreeSearchOverlayService,
  );
  const pluginRuntime = new PluginRuntimeService();
  const runtimePluginGovernanceService = new RuntimePluginGovernanceService(
    pluginBootstrapService,
    runtimeGatewayConnectionLifecycleService,
  );
  const pluginHost = new PluginHostService(
    pluginBootstrapService,
    automationService,
    conversationMessages,
    conversationStore,
    aiModelExecutionService as never,
    aiManagementService,
    new KnowledgeReaderService(),
    pluginDispatch,
    pluginRuntime,
    toolGateway,
    subagentRunner,
    new UserContextService(),
    new PersonaService(new PersonaStoreService(projectWorktreeRootService), conversationStore),
  );
  pluginHost.onModuleInit();
  const invalidToolService = new InvalidToolService();
  const todoToolService = new TodoToolService(conversationTodoService);
  const webFetchService = {
    fetch: jest.fn().mockResolvedValue({
      contentType: 'text/html',
      format: 'markdown',
      output: '# Smoke Example\n\nbody',
      status: 200,
      title: 'Smoke Example',
      url: 'https://example.com/smoke',
    }),
  };
  const webFetchToolService = new WebFetchToolService(webFetchService as never);
  return {
    conversationId,
    mcpService,
    pluginBootstrapService,
    conversationStore,
    pluginRuntime,
    conversationTodoService,
    pluginDispatch,
    runtimePluginGovernanceService,
    subagentRunner,
    skillRegistryService,
    runtimeToolPermissionService,
    runtimeToolsSettingsService,
    toolManagementSettingsService,
    runtimeWorkspaceRoot,
    webFetchService,
    service: new ToolRegistryService(
      bashToolService,
      editToolService,
      globToolService,
      grepToolService,
      mcpService as never,
      invalidToolService,
      readToolService,
      runtimeToolBackendService,
      runtimeToolPermissionService,
      runtimeToolsSettingsService,
      toolManagementSettingsService,
      pluginBootstrapService,
      conversationStore,
      pluginRuntime,
      subagentToolService,
      todoToolService,
      webFetchToolService,
      writeToolService,
      skillToolService,
      toolOutputCaptureService,
      pluginDispatch as never,
      runtimePluginGovernanceService as never,
    ),
  };
}

async function waitForPendingRuntimeRequest(
  runtimeToolPermissionService: RuntimeToolPermissionService,
  conversationId: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [pendingRequest] = runtimeToolPermissionService.listPendingRequests(conversationId);
    if (pendingRequest) {
      return pendingRequest;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for runtime permission request: ${conversationId}`);
}

function readWrappedToolData<T extends object = Record<string, unknown>>(value: unknown): T {
  return ((value as { data?: T } | null)?.data ?? {}) as T;
}

function readWrappedToolOutput(value: unknown): string {
  const data = readWrappedToolData<{ output?: unknown }>(value);
  return typeof data.output === 'string' ? data.output : '';
}

function createMockRuntimeBackend(kind: string): RuntimeBackend {
  return {
    async executeCommand(input) {
      return {
        backendKind: kind,
        cwd: input.workdir ?? '/',
        exitCode: 0,
        sessionId: input.sessionId,
        stderr: '',
        stdout: `${kind}:${input.command}`,
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'ask' as const,
          persistentFilesystem: 'allow' as const,
          persistentShellState: 'deny' as const,
          shellExecution: 'ask' as const,
          workspaceRead: 'allow' as const,
          workspaceWrite: 'allow' as const,
        },
      };
    },
    getKind() {
      return kind;
    },
  };
}

function createRealRuntimeBackendsForShellRouting(
  runtimeSessionEnvironmentService?: RuntimeSessionEnvironmentService,
  options: {
    includeWsl?: boolean;
  } = {},
): RuntimeBackend[] {
  const runtimeOneShotShellService = new RuntimeOneShotShellService();
  runtimeOneShotShellServices.push(runtimeOneShotShellService);
  const resolvedRuntimeSessionEnvironmentService = runtimeSessionEnvironmentService
    ?? new RuntimeSessionEnvironmentService();
  return [
    new RuntimeJustBashService(resolvedRuntimeSessionEnvironmentService),
    new RuntimeNativeShellService(
      resolvedRuntimeSessionEnvironmentService,
      runtimeOneShotShellService,
    ),
    ...(process.platform === 'win32' && (options.includeWsl ?? true)
      ? [new RuntimeWslShellService(
        resolvedRuntimeSessionEnvironmentService,
        runtimeOneShotShellService,
      )]
      : []),
  ];
}

function createKindAliasedRuntimeBackend(
  kind: string,
  backends: RuntimeBackend[],
  sourceKind: string = 'native-shell',
): RuntimeBackend {
  const sourceBackend = backends.find((backend) => backend.getKind() === sourceKind);
  if (!sourceBackend) {
    throw new Error(`${sourceKind} backend is required to create alias shell backend`);
  }
  return {
    async executeCommand(input) {
      const result = await sourceBackend.executeCommand(input);
      return {
        ...result,
        backendKind: kind,
      };
    },
    getDescriptor() {
      return {
        ...sourceBackend.getDescriptor(),
        kind,
      };
    },
    getKind() {
      return kind;
    },
  };
}

function buildRuntimeShellPersistAndReadCommand(filePath: string, content: string): string {
  if (usesRuntimePowerShellBackend()) {
    const normalizedPath = filePath.replace(/\//g, '\\');
    const directoryPath = path.dirname(normalizedPath);
    return [
      `New-Item -ItemType Directory -Force '${escapePowerShellString(directoryPath)}' > $null`,
      `Set-Content -Path '${escapePowerShellString(normalizedPath)}' -Value '${escapePowerShellString(content)}'`,
      `Get-Content '${escapePowerShellString(normalizedPath)}'`,
    ].join('; ');
  }
  return [
    `mkdir -p ${escapeBashSingleQuoted(path.posix.dirname(filePath))}`,
    `printf "${escapeBashDoubleQuoted(content)}\\n" > ${escapeBashSingleQuoted(filePath)}`,
    `cat ${escapeBashSingleQuoted(filePath)}`,
  ].join(' && ');
}

function buildRuntimeShellReadCommand(filePath: string): string {
  if (usesRuntimePowerShellBackend()) {
    return `Get-Content '${escapePowerShellString(filePath.replace(/\//g, '\\'))}'`;
  }
  return `cat ${escapeBashSingleQuoted(filePath)}`;
}

function buildRuntimeShellMultilineOutputCommand(lines: string[]): string {
  if (usesRuntimePowerShellBackend()) {
    return lines
      .map((line) => `Write-Output '${escapePowerShellString(line)}'`)
      .join('; ');
  }
  return `printf "${lines.map((line) => `${escapeBashDoubleQuoted(line)}\\n`).join('')}"`;
}

function buildRuntimeShellPwdCommand(): string {
  return usesRuntimePowerShellBackend()
    ? '(Get-Location).Path'
    : 'pwd';
}

function buildRuntimeShellWorkdirCommand(filePath: string, content: string): string {
  if (usesRuntimePowerShellBackend()) {
    const normalizedPath = filePath.replace(/\//g, '\\');
    return [
      '(Get-Location).Path',
      `Set-Content -Path '${escapePowerShellString(normalizedPath)}' -Value '${escapePowerShellString(content)}'`,
      `Get-Content '${escapePowerShellString(normalizedPath)}'`,
    ].join('; ');
  }
  return `pwd && printf "${escapeBashDoubleQuoted(content)}\\n" > ${escapeBashSingleQuoted(filePath)} && cat ${escapeBashSingleQuoted(filePath)}`;
}

function buildRuntimeShellHttpReadCommand(url: string): string {
  return usesRuntimePowerShellBackend()
    ? `(Invoke-WebRequest -UseBasicParsing '${escapePowerShellString(url)}').Content`
    : `curl -s ${escapeBashSingleQuoted(url)}`;
}

function buildRuntimeShellEchoCommand(text: string): string {
  return usesRuntimePowerShellBackend()
    ? `Write-Output '${escapePowerShellString(text)}'`
    : `printf "${escapeBashDoubleQuoted(text)}\\n"`;
}

function usesRuntimePowerShellBackend(): boolean {
  const configuredBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND?.trim();
  return process.platform === 'win32'
    && (!configuredBackend || (configuredBackend.includes('native-shell') && !configuredBackend.includes('wsl')));
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeBashSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeBashDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

function createMockFilesystemBackend(kind: string): RuntimeFilesystemBackend {
  const backendFileName = `${kind}.txt`;
  const backendVirtualPath = `/${backendFileName}`;
  const backendContent = `${kind} line\nsecond line\n`;
  return {
    async copyPath(_sessionId, fromPath, toPath) {
      return {
        fromPath: fromPath.trim() ? `/${kind}/${fromPath.replace(/^\/+/, '')}` : backendVirtualPath,
        path: toPath.trim() ? `/${kind}/${toPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async createSymlink(_sessionId, input) {
      return {
        path: input.linkPath.trim() ? `/${kind}/${input.linkPath.replace(/^\/+/, '')}` : backendVirtualPath,
        target: input.targetPath,
      };
    },
    async deletePath(_sessionId, inputPath) {
      return {
        deleted: true,
        path: inputPath.trim() ? `/${kind}/${inputPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async editTextFile(_sessionId, input) {
      return {
        diff: {
          additions: kind === 'mock-filesystem' ? 3 : 1,
          afterLineCount: kind === 'mock-filesystem' ? 7 : 2,
          beforeLineCount: kind === 'mock-filesystem' ? 7 : 2,
          deletions: 1,
          patch: `${kind} edit patch`,
        },
        occurrences: kind === 'mock-filesystem'
          ? 7
          : input.replaceAll ? 2 : 1,
        path: input.filePath.trim()
          ? `/${kind}/${input.filePath.replace(/^\/+/, '')}`
          : backendVirtualPath,
        postWrite: {
          diagnostics: [],
          formatting: null,
        },
        strategy: kind === 'mock-filesystem' ? 'indentation-flexible' : 'exact',
      };
    },
    async ensureDirectory(_sessionId, inputPath) {
      return {
        created: true,
        path: inputPath.trim() ? `/${kind}/${inputPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async globPaths(_sessionId, input) {
      const normalizedPath = input.path?.trim();
      const resolvedPath = normalizedPath
        ? `/${kind}/${normalizedPath.replace(/^\/+/, '')}`
        : '/';
      return {
        basePath: resolvedPath,
        matches: [backendVirtualPath],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
        totalMatches: 1,
        truncated: false,
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'deny' as const,
          persistentFilesystem: 'allow' as const,
          persistentShellState: 'deny' as const,
          shellExecution: 'deny' as const,
          workspaceRead: 'allow' as const,
          workspaceWrite: 'allow' as const,
        },
      };
    },
    getKind() {
      return kind;
    },
    async grepText() {
      return {
        basePath: '/',
        matches: [
          {
            line: 1,
            text: `${kind} line`,
            virtualPath: backendVirtualPath,
          },
        ],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
        totalMatches: 1,
        truncated: false,
      };
    },
    async movePath(_sessionId, fromPath, toPath) {
      return {
        fromPath: fromPath.trim() ? `/${kind}/${fromPath.replace(/^\/+/, '')}` : backendVirtualPath,
        path: toPath.trim() ? `/${kind}/${toPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async listFiles() {
      return {
        basePath: '/',
        files: [
          {
            virtualPath: backendVirtualPath,
          },
        ],
      };
    },
    async readDirectoryEntries() {
      return {
        entries: ['routed.txt'],
        path: '/',
      };
    },
    async readPathRange(_sessionId, input) {
      const normalizedPath = input.path?.trim();
      if (!normalizedPath || normalizedPath === '/' || normalizedPath === '.') {
        return {
          entries: ['routed.txt'],
          limit: input.limit,
          offset: input.offset,
          path: '/',
          totalEntries: 1,
          truncated: false,
          type: 'directory' as const,
        };
      }
      return {
        byteLimited: false,
        limit: input.limit,
        lines: backendContent
          .trimEnd()
          .split('\n')
          .slice(input.offset - 1, input.offset - 1 + input.limit),
        mimeType: 'text/plain',
        offset: input.offset,
        path: backendVirtualPath,
        totalBytes: backendContent.length,
        totalLines: 2,
        truncated: false,
        type: 'file' as const,
      };
    },
    async readSymlink(_sessionId, inputPath) {
      return {
        path: inputPath.trim() ? `/${kind}/${inputPath.replace(/^\/+/, '')}` : backendVirtualPath,
        target: backendVirtualPath,
      };
    },
    async resolvePath(_sessionId, inputPath) {
      const normalizedInputPath = typeof inputPath === 'string' ? inputPath.trim() : '';
      if (!normalizedInputPath || normalizedInputPath === '/' || normalizedInputPath === '.') {
        return {
          exists: true,
          type: 'directory' as const,
          virtualPath: '/',
        };
      }
      return {
        exists: true,
        type: 'file' as const,
        virtualPath: backendVirtualPath,
      };
    },
    async statPath(_sessionId, inputPath) {
      const resolved = await this.resolvePath(_sessionId, inputPath);
      return {
        ...resolved,
        mtime: '2026-04-21T00:00:00.000Z',
        size: resolved.type === 'file' ? backendContent.length : 0,
      };
    },
    async readTextFile() {
      return {
        content: backendContent,
        path: backendVirtualPath,
      };
    },
    async writeTextFile(_sessionId, inputPath) {
      return {
        created: true,
        diff: {
          additions: 2,
          afterLineCount: 2,
          beforeLineCount: 0,
          deletions: 0,
          patch: `${kind} write patch`,
        },
        lineCount: 2,
        path: `/${kind}/${inputPath.replace(/^\/+/, '')}`,
        postWrite: {
          diagnostics: [],
          formatting: null,
        },
        status: 'created',
        size: 33,
      };
    },
  };
}

function createKindAliasedFilesystemBackend(
  kind: string,
  backend: RuntimeFilesystemBackend,
): RuntimeFilesystemBackend {
  return new Proxy(backend as object, {
    get(target, property, receiver) {
      if (property === 'getKind') {
        return () => kind;
      }
      if (property === 'getDescriptor') {
        return () => ({
          ...backend.getDescriptor(),
          kind,
        });
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  }) as RuntimeFilesystemBackend;
}

function buildMcpToolSources(snapshot: {
  statuses: Array<{ connected: boolean; enabled: boolean; health: string; lastCheckedAt: string | null; lastError: string | null; name: string }>;
  tools: Array<{ description?: string; inputSchema?: { properties?: Record<string, { description?: string; type?: string }>; required?: string[] } | null; name: string; serverName: string }>;
}) {
  return snapshot.statuses.map((status) => {
    const tools = snapshot.tools
      .filter((tool) => tool.serverName === status.name)
      .map((tool) => ({
        toolId: `mcp:${status.name}:${tool.name}`,
        name: tool.name,
        callName: `${status.name}__${tool.name}`,
        description: tool.description ?? tool.name,
        parameters: Object.fromEntries(Object.entries(tool.inputSchema?.properties ?? {}).map(([key, schema]) => [key, { description: schema.description, required: (tool.inputSchema?.required ?? []).includes(key), type: schema.type === 'number' || schema.type === 'boolean' || schema.type === 'object' || schema.type === 'array' ? schema.type : 'string' }])),
        enabled: status.enabled,
        sourceKind: 'mcp' as const,
        sourceId: status.name,
        sourceLabel: status.name,
        health: status.health,
        lastError: status.lastError,
        lastCheckedAt: status.lastCheckedAt,
      }));
    return {
      source: {
        kind: 'mcp' as const,
        id: status.name,
        label: status.name,
        enabled: status.enabled,
        health: status.health,
        lastError: status.lastError,
        lastCheckedAt: status.lastCheckedAt,
        totalTools: tools.length,
        enabledTools: status.enabled ? tools.length : 0,
        supportedActions: ['health-check', 'reconnect', 'reload'],
      },
      tools,
    };
  });
}
