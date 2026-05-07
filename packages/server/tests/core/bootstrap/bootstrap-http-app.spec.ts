jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('../../../src/app/app.module', () => ({
  AppModule: class AppModule {},
}));

import { NestFactory } from '@nestjs/core';
import { bootstrapHttpApp } from '../../../src/bootstrap/bootstrap-http-app';

describe('bootstrapHttpApp', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('enables shutdown hooks before listening', async () => {
    const pluginBootstrapService = {
      bootstrapBuiltins: jest.fn(),
      bootstrapProjectPlugins: jest.fn((onDrop?: (pluginId: string) => void) => {
        onDrop?.('local.removed');
      }),
    };
    const pluginRuntime = {
      deletePluginRuntimeState: jest.fn(),
    };
    const conversationStore = {
      deletePluginConversationSessions: jest.fn(),
    };
    const runtimePluginGovernanceService = {
      deletePluginRuntimeState: jest.fn(),
    };
    const toolManagementSettingsService = {
      deleteSourceOverrides: jest.fn(),
    };
    const bootstrapUserService = { runStartupWarmup: jest.fn(), validateStartupAuthConfig: jest.fn() };
    const app = {
      enableShutdownHooks: jest.fn(),
      get: jest.fn((token: { name?: string }) => {
        if (token?.name === 'PluginBootstrapService') {
          return pluginBootstrapService;
        }
        if (token?.name === 'PluginRuntimeService') {
          return pluginRuntime;
        }
        if (token?.name === 'ConversationStoreService') {
          return conversationStore;
        }
        if (token?.name === 'RuntimePluginGovernanceService') {
          return runtimePluginGovernanceService;
        }
        if (token?.name === 'ToolManagementSettingsService') {
          return toolManagementSettingsService;
        }
        if (token?.name === 'BootstrapUserService') {
          return bootstrapUserService;
        }
        throw new Error(`unexpected token: ${token?.name ?? 'unknown'}`);
      }),
      listen: jest.fn().mockResolvedValue(undefined),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
    };
    jest.mocked(NestFactory.create).mockResolvedValue(app as never);

    await bootstrapHttpApp();

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(pluginBootstrapService.bootstrapBuiltins).toHaveBeenCalledTimes(1);
    expect(pluginBootstrapService.bootstrapProjectPlugins).toHaveBeenCalledTimes(1);
    expect(pluginRuntime.deletePluginRuntimeState).toHaveBeenCalledWith('local.removed');
    expect(conversationStore.deletePluginConversationSessions).toHaveBeenCalledWith('local.removed');
    expect(runtimePluginGovernanceService.deletePluginRuntimeState).toHaveBeenCalledWith('local.removed');
    expect(toolManagementSettingsService.deleteSourceOverrides).toHaveBeenCalledWith('plugin:local.removed');
    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(bootstrapUserService.runStartupWarmup).toHaveBeenCalledTimes(1);
  });
});

