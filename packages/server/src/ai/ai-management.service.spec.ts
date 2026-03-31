/**
 * AI 管理服务测试
 *
 * 输入:
 * - provider / model / vision fallback 的管理请求
 *
 * 输出:
 * - 断言 provider 目录会区分 core 协议族和供应商 preset
 * - 断言 provider 与 model 配置会被正确持久化和注册
 *
 * 预期行为:
 * - core 协议族固定为 openai / anthropic / gemini
 * - provider preset 可以有很多
 * - 兼容 provider 只允许 openai / anthropic / gemini
 * - 视觉转述配置通过统一管理服务读写
 */

import type { ModelConfig } from './types/provider.types';
import { AiManagementService } from './ai-management.service';

describe('AiManagementService', () => {
  const modelRegistry = {
    register: jest.fn(),
    getModel: jest.fn(),
    listModels: jest.fn(),
    unregisterModel: jest.fn(),
    updateModelCapabilities: jest.fn(),
  };

  const configManager = {
    listProviders: jest.fn(),
    getProviderConfig: jest.fn(),
    upsertProvider: jest.fn(),
    removeProvider: jest.fn(),
    getVisionFallbackConfig: jest.fn(),
    updateVisionFallbackConfig: jest.fn(),
    getHostModelRoutingConfig: jest.fn(),
    updateHostModelRoutingConfig: jest.fn(),
  };

  let service: AiManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiManagementService(
      configManager as never,
      modelRegistry as never,
    );
  });

  it('classifies the provider catalog into core protocols and presets', () => {
    const catalog = service.listOfficialProviderCatalog();

    expect(catalog.filter((item) => item.kind === 'core')).toEqual([
      expect.objectContaining({ id: 'openai', kind: 'core' }),
      expect.objectContaining({ id: 'anthropic', kind: 'core' }),
      expect.objectContaining({ id: 'gemini', kind: 'core' }),
    ]);
    expect(catalog.filter((item) => item.kind === 'preset')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'groq', kind: 'preset' }),
        expect.objectContaining({ id: 'openrouter', kind: 'preset' }),
      ]),
    );
  });

  it('stores an official provider and registers its configured models', () => {
    configManager.upsertProvider.mockImplementation((providerId, config) => ({
      id: providerId,
      ...config,
    }));

    const provider = service.upsertProvider('groq', {
      mode: 'official',
      driver: 'groq',
      name: 'Groq',
      apiKey: 'groq-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b',
      models: ['llama-3.3-70b', 'llama-3.1-8b'],
    });

    expect(configManager.upsertProvider).toHaveBeenCalledWith(
      'groq',
      expect.objectContaining({
        mode: 'official',
        driver: 'groq',
        defaultModel: 'llama-3.3-70b',
        models: ['llama-3.3-70b', 'llama-3.1-8b'],
      }),
    );
    expect(modelRegistry.register).toHaveBeenCalledTimes(2);
    expect(provider.driver).toBe('groq');
    expect(provider.mode).toBe('official');
  });

  it('rejects compatible providers that are not one of the three allowed formats', () => {
    expect(() =>
      service.upsertProvider('custom-openrouter', {
        mode: 'compatible',
        driver: 'openrouter',
        name: 'Custom OpenRouter',
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        defaultModel: 'test-model',
        models: ['test-model'],
      }),
    ).toThrow('Compatible provider driver must be one of: openai, anthropic, gemini');
  });

  it('updates model capabilities and returns the refreshed model config', () => {
    const modelConfig: ModelConfig = {
      id: 'llama-3.3-70b',
      providerId: 'groq',
      name: 'llama-3.3-70b',
      capabilities: {
        reasoning: false,
        toolCall: true,
        input: { text: true, image: false },
        output: { text: true, image: false },
      },
      api: {
        id: 'llama-3.3-70b',
        url: 'https://api.groq.com/openai/v1',
        npm: '@ai-sdk/groq',
      },
      status: 'active',
    };

    modelRegistry.updateModelCapabilities.mockReturnValue(true);
    modelRegistry.getModel.mockReturnValue(modelConfig);

    const updated = service.updateModelCapabilities('groq', 'llama-3.3-70b', {
      reasoning: true,
      input: { image: true },
    });

    expect(modelRegistry.updateModelCapabilities).toHaveBeenCalledWith(
      'groq',
      'llama-3.3-70b',
      {
        reasoning: true,
        input: { image: true },
      },
    );
    expect(updated).toBe(modelConfig);
  });

  it('reads and writes vision fallback config through the config manager', () => {
    configManager.getVisionFallbackConfig.mockReturnValue({
      enabled: false,
    });
    configManager.updateVisionFallbackConfig.mockImplementation((value) => value);

    expect(service.getVisionFallbackConfig()).toEqual({ enabled: false });

    const updated = service.updateVisionFallbackConfig({
      enabled: true,
      providerId: 'openai',
      modelId: 'gpt-4o',
      prompt: 'describe',
      maxDescriptionLength: 300,
    });

    expect(configManager.updateVisionFallbackConfig).toHaveBeenCalledWith({
      enabled: true,
      providerId: 'openai',
      modelId: 'gpt-4o',
      prompt: 'describe',
      maxDescriptionLength: 300,
    });
    expect(updated.enabled).toBe(true);
  });

  it('reads and writes host model routing config through the config manager', () => {
    configManager.getHostModelRoutingConfig.mockReturnValue({
      fallbackChatModels: [],
      utilityModelRoles: {},
    });
    configManager.updateHostModelRoutingConfig.mockImplementation((value) => value);

    expect(service.getHostModelRoutingConfig()).toEqual({
      fallbackChatModels: [],
      utilityModelRoles: {},
    });

    const updated = service.updateHostModelRoutingConfig({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      },
    });

    expect(configManager.updateHostModelRoutingConfig).toHaveBeenCalledWith({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      },
    });
    expect(updated.compressionModel?.modelId).toBe('gpt-4.1-mini');
  });

  it('marks providers as unavailable when credentials are missing', () => {
    configManager.listProviders.mockReturnValue([
      {
        id: 'openai',
        name: 'OpenAI',
        mode: 'official',
        driver: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini'],
      },
      {
        id: 'groq',
        name: 'Groq',
        mode: 'official',
        driver: 'groq',
        apiKey: 'groq-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b',
        models: ['llama-3.3-70b'],
      },
      {
        id: 'ds2api',
        name: 'ds2api',
        mode: 'compatible',
        driver: 'openai',
        apiKey: '',
        baseUrl: 'https://example.com/v1',
        defaultModel: 'deepseek-chat',
        models: ['deepseek-chat'],
      },
    ]);

    expect(service.listProviders()).toEqual([
      expect.objectContaining({
        id: 'openai',
        available: false,
      }),
      expect.objectContaining({
        id: 'groq',
        available: true,
      }),
      expect.objectContaining({
        id: 'ds2api',
        available: false,
      }),
    ]);
  });
});
