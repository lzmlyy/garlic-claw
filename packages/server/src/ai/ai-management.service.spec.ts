/**
 * AI 管理服务测试
 *
 * 输入:
 * - provider / model / vision fallback 的管理请求
 *
 * 输出:
 * - 断言官方 provider 目录包含多家供应商
 * - 断言 provider 与 model 配置会被正确持久化和注册
 *
 * 预期行为:
 * - 官方 provider 不应只剩三家
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
  };

  let service: AiManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiManagementService(
      configManager as never,
      modelRegistry as never,
    );
  });

  it('exposes more than three official providers in the catalog', () => {
    const catalog = service.listOfficialProviderCatalog();

    expect(catalog.length).toBeGreaterThan(3);
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'openai' }),
        expect.objectContaining({ id: 'anthropic' }),
        expect.objectContaining({ id: 'gemini' }),
        expect.objectContaining({ id: 'groq' }),
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
