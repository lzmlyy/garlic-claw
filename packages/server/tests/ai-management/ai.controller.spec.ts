import { AiController } from '../../src/modules/ai-management/ai.controller';

describe('AiController', () => {
  const aiManagementService = {
    deleteModel: jest.fn(),
    deleteProvider: jest.fn(),
    discoverModels: jest.fn(),
    getDefaultProviderSelection: jest.fn(),
    getProvider: jest.fn(),
    listModels: jest.fn(),
    listProviderCatalog: jest.fn(),
    listProviders: jest.fn(),
    setDefaultProviderSelection: jest.fn(),
    setDefaultModel: jest.fn(),
    testConnection: jest.fn(),
    updateModelCapabilities: jest.fn(),
    upsertModel: jest.fn(),
    upsertProvider: jest.fn(),
  };
  const modelRuntimeConfigService = {
    getHostModelRoutingConfig: jest.fn(),
    getVisionFallbackConfig: jest.fn(),
    updateHostModelRoutingConfig: jest.fn(),
    updateVisionFallbackConfig: jest.fn(),
  };
  const runtimeToolsSettingsService = {
    getConfigSnapshot: jest.fn(),
    updateConfig: jest.fn(),
  };
  const subagentSettingsService = {
    getConfigSnapshot: jest.fn(),
    updateConfig: jest.fn(),
  };
  const contextGovernanceService = {
    getConfigSnapshot: jest.fn(),
    updateConfig: jest.fn(),
  };

  let controller: AiController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiController(
      aiManagementService as never,
      modelRuntimeConfigService as never,
      contextGovernanceService as never,
      runtimeToolsSettingsService as never,
      subagentSettingsService as never,
    );
  });

  it('returns the provider catalog', () => {
    aiManagementService.listProviderCatalog.mockReturnValue([{ id: 'openai' }]);
    expect(controller.listProviderCatalog()).toEqual([{ id: 'openai' }]);
  });

  it('reads provider list and provider detail through the management owner', () => {
    aiManagementService.listProviders.mockReturnValue([{ id: 'openai-main' }]);
    aiManagementService.getProvider.mockReturnValue({ id: 'openai-main', models: ['gpt-4o-mini'] });

    expect(controller.listProviders()).toEqual([{ id: 'openai-main' }]);
    expect(controller.getProvider('openai-main')).toEqual({ id: 'openai-main', models: ['gpt-4o-mini'] });
    expect(aiManagementService.getProvider).toHaveBeenCalledWith('openai-main');
  });

  it('reads the persisted default provider selection through the management owner', () => {
    aiManagementService.getDefaultProviderSelection.mockReturnValue({
      modelId: 'openai/gpt-oss-20b',
      providerId: 'nvidia',
      source: 'default',
    });

    expect(controller.getDefaultSelection()).toEqual({
      modelId: 'openai/gpt-oss-20b',
      providerId: 'nvidia',
      source: 'default',
    });
    expect(aiManagementService.getDefaultProviderSelection).toHaveBeenCalledTimes(1);
  });

  it('updates the persisted default provider selection through the management owner', () => {
    const dto = {
      providerId: 'nvidia',
      modelId: 'openai/gpt-oss-20b',
    };
    aiManagementService.setDefaultProviderSelection.mockReturnValue({
      ...dto,
      source: 'default',
    });

    expect(controller.setDefaultSelection(dto)).toEqual({
      ...dto,
      source: 'default',
    });
    expect(aiManagementService.setDefaultProviderSelection).toHaveBeenCalledWith(
      'nvidia',
      'openai/gpt-oss-20b',
    );
  });

  it('forwards provider upsert requests to the management service', () => {
    const dto = {
      driver: 'openai',
      name: 'OpenAI',
      models: ['gpt-4o-mini'],
    };

    controller.upsertProvider('openai-main', dto);
    expect(aiManagementService.upsertProvider).toHaveBeenCalledWith('openai-main', dto);
  });

  it('forwards provider delete requests to the management service and returns success payload', () => {
    expect(controller.deleteProvider('openai-main')).toEqual({ success: true });
    expect(aiManagementService.deleteProvider).toHaveBeenCalledWith('openai-main');
  });

  it('reads provider models through the management owner', () => {
    aiManagementService.listModels.mockReturnValue([{ id: 'gpt-4o-mini' }]);

    expect(controller.listModels('openai-main')).toEqual([{ id: 'gpt-4o-mini' }]);
    expect(aiManagementService.listModels).toHaveBeenCalledWith('openai-main');
  });

  it('forwards model upsert and default-model updates to the management service', () => {
    const modelDto = {
      contextLength: 65_536,
      name: 'Smoke Extra',
    };
    const defaultDto = {
      modelId: 'gpt-4o-mini',
    };
    aiManagementService.upsertModel.mockReturnValue({ id: 'smoke-extra' });
    aiManagementService.setDefaultModel.mockReturnValue({ defaultModel: 'gpt-4o-mini', id: 'openai-main' });

    expect(controller.upsertModel('openai-main', 'smoke-extra', modelDto)).toEqual({ id: 'smoke-extra' });
    expect(controller.setDefaultModel('openai-main', defaultDto)).toEqual({ defaultModel: 'gpt-4o-mini', id: 'openai-main' });
    expect(aiManagementService.upsertModel).toHaveBeenCalledWith('openai-main', 'smoke-extra', modelDto);
    expect(aiManagementService.setDefaultModel).toHaveBeenCalledWith('openai-main', 'gpt-4o-mini');
  });

  it('forwards model delete requests to the management service and returns success payload', () => {
    expect(controller.deleteModel('openai-main', 'smoke-extra')).toEqual({ success: true });
    expect(aiManagementService.deleteModel).toHaveBeenCalledWith('openai-main', 'smoke-extra');
  });

  it('forwards model capability updates to the management service', () => {
    const dto = {
      reasoning: true,
      input: { image: true },
    };
    controller.updateModelCapabilities('openai-main', 'gpt-4o-mini', dto);
    expect(aiManagementService.updateModelCapabilities).toHaveBeenCalledWith('openai-main', 'gpt-4o-mini', dto);
  });

  it('forwards vision fallback and host model routing updates', () => {
    const visionDto = {
      enabled: true,
      providerId: 'openai',
      modelId: 'gpt-4o',
    };
    const routingDto = {
      fallbackChatModels: [
        { providerId: 'anthropic', modelId: 'claude-3-7-sonnet' },
      ],
    };
    controller.updateVisionFallbackConfig(visionDto);
    controller.updateHostModelRoutingConfig(routingDto);
    expect(modelRuntimeConfigService.updateVisionFallbackConfig).toHaveBeenCalledWith(visionDto);
    expect(modelRuntimeConfigService.updateHostModelRoutingConfig).toHaveBeenCalledWith(routingDto);
  });

  it('reads vision fallback and host model routing through the model-runtime config owner', () => {
    modelRuntimeConfigService.getVisionFallbackConfig.mockReturnValue({
      enabled: true,
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
    });
    modelRuntimeConfigService.getHostModelRoutingConfig.mockReturnValue({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      utilityModelRoles: {},
    });

    expect(controller.getVisionFallbackConfig()).toEqual({
      enabled: true,
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
    });
    expect(controller.getHostModelRoutingConfig()).toEqual({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      utilityModelRoles: {},
    });
  });

  it('forwards model discovery and provider connection tests', async () => {
    await controller.discoverModels('ds2api');
    await controller.testConnection('ds2api', { modelId: 'deepseek-reasoner' });
    expect(aiManagementService.discoverModels).toHaveBeenCalledWith('ds2api');
    expect(aiManagementService.testConnection).toHaveBeenCalledWith('ds2api', 'deepseek-reasoner');
  });

  it('reads runtime-tools config through the internal settings owner', () => {
    runtimeToolsSettingsService.getConfigSnapshot.mockReturnValue({
      schema: { type: 'object', items: {} },
      values: { shellBackend: 'native-shell' },
    });

    expect(controller.getRuntimeToolsConfig()).toEqual({
      schema: { type: 'object', items: {} },
      values: { shellBackend: 'native-shell' },
    });
  });

  it('updates runtime-tools config through the internal settings owner', () => {
    const dto = {
      values: {
        bashOutput: {
          maxLines: 20,
        },
      },
    };
    runtimeToolsSettingsService.updateConfig.mockReturnValue(dto);

    expect(controller.updateRuntimeToolsConfig(dto)).toEqual(dto);
    expect(runtimeToolsSettingsService.updateConfig).toHaveBeenCalledWith(dto.values);
  });

  it('reads and updates subagent config through the internal settings owner', () => {
    const snapshot = {
      schema: { type: 'object', items: {} },
      values: { llm: { targetSubagentType: 'explore' } },
    };
    subagentSettingsService.getConfigSnapshot.mockReturnValue(snapshot);
    subagentSettingsService.updateConfig.mockReturnValue(snapshot);

    expect(controller.getSubagentConfig()).toEqual(snapshot);
    expect(controller.updateSubagentConfig({ values: snapshot.values })).toEqual(snapshot);
    expect(subagentSettingsService.updateConfig).toHaveBeenCalledWith(snapshot.values);
  });

  it('reads and updates context governance config through the internal settings owner', () => {
    const snapshot = {
      schema: { type: 'object', items: {} },
      values: { contextCompaction: { strategy: 'sliding' } },
    };
    contextGovernanceService.getConfigSnapshot.mockReturnValue(snapshot);
    contextGovernanceService.updateConfig.mockReturnValue(snapshot);

    expect(controller.getContextGovernanceConfig()).toEqual(snapshot);
    expect(controller.updateContextGovernanceConfig({ values: snapshot.values })).toEqual(snapshot);
    expect(contextGovernanceService.updateConfig).toHaveBeenCalledWith(snapshot.values);
  });
});
