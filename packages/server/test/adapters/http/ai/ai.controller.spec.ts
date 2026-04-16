import { AiController } from '../../../../src/adapters/http/ai/ai.controller';

describe('AiController', () => {
  const aiManagementService = {
    deleteModel: jest.fn(),
    deleteProvider: jest.fn(),
    discoverModels: jest.fn(),
    getProvider: jest.fn(),
    listModels: jest.fn(),
    listProviderCatalog: jest.fn(),
    listProviders: jest.fn(),
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

  let controller: AiController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiController(
      aiManagementService as never,
      modelRuntimeConfigService as never,
    );
  });

  it('returns the provider catalog', () => {
    aiManagementService.listProviderCatalog.mockReturnValue([{ id: 'openai' }]);
    expect(controller.listProviderCatalog()).toEqual([{ id: 'openai' }]);
  });

  it('forwards provider upsert requests to the management service', () => {
    const dto = {
      mode: 'catalog',
      driver: 'openai',
      name: 'OpenAI',
      models: ['gpt-4o-mini'],
    };

    controller.upsertProvider('openai-main', dto);
    expect(aiManagementService.upsertProvider).toHaveBeenCalledWith('openai-main', dto);
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
});
