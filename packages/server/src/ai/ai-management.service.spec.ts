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
 * - 协议接入只允许 openai / anthropic / gemini
 * - 视觉转述配置通过统一管理服务读写
 */

import type { ModelConfig } from './types/provider.types';
import { AiManagementService } from './ai-management.service';

describe('AiManagementService', () => {
  const modelRegistry = {
    register: jest.fn(),
    getModel: jest.fn(),
    getOrRegisterModel: jest.fn((_providerId, _modelId, buildConfig) => buildConfig()),
    listModels: jest.fn(),
    unregisterModel: jest.fn(),
    updateModelCapabilities: jest.fn(),
  };

  const configManager = {
    listProviders: jest.fn(),
    getProviderConfig: jest.fn(),
    upsertProvider: jest.fn(),
    removeProvider: jest.fn(),
  };
  const cacheService = {
    deleteByPrefix: jest.fn(),
    getOrSet: jest.fn(async ({ factory }: { factory: () => Promise<unknown> | unknown }) => factory()),
  };

  let service: AiManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiManagementService(
      configManager as never,
      modelRegistry as never,
      cacheService as never,
    );
  });

  it('classifies the provider catalog into core protocols and presets', () => {
    const catalog = service.listProviderCatalog();

    expect(catalog.filter((item) => item.kind === 'core')).toEqual([
      expect.objectContaining({ id: 'openai', kind: 'core', protocol: 'openai' }),
      expect.objectContaining({ id: 'anthropic', kind: 'core', protocol: 'anthropic' }),
      expect.objectContaining({ id: 'gemini', kind: 'core', protocol: 'gemini' }),
    ]);
    expect(catalog.filter((item) => item.kind === 'preset')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'groq', kind: 'preset', protocol: 'openai' }),
        expect.objectContaining({ id: 'openrouter', kind: 'preset', protocol: 'openai' }),
      ]),
    );
  });

  it('stores a catalog provider and registers its configured models', () => {
    configManager.upsertProvider.mockImplementation((providerId, config) => ({
      id: providerId,
      ...config,
    }));

    const provider = service.upsertProvider('groq', {
      mode: 'catalog',
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
        mode: 'catalog',
        driver: 'groq',
        defaultModel: 'llama-3.3-70b',
        models: ['llama-3.3-70b', 'llama-3.1-8b'],
      }),
    );
    expect(modelRegistry.register).toHaveBeenCalledTimes(2);
    expect(provider.driver).toBe('groq');
    expect(provider.mode).toBe('catalog');
  });

  it('rejects protocol providers that are not one of the three allowed protocol families', () => {
    expect(() =>
      service.upsertProvider('custom-openrouter', {
        mode: 'protocol',
        driver: 'openrouter',
        name: 'Custom OpenRouter',
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        defaultModel: 'test-model',
        models: ['test-model'],
      }),
    ).toThrow('Protocol provider driver must be one of: openai, anthropic, gemini');
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
        npm: '@ai-sdk/openai',
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

  it('hydrates provider models through the model registry when listing models', () => {
    configManager.getProviderConfig.mockReturnValue({
      id: 'groq',
      name: 'Groq',
      mode: 'catalog',
      driver: 'groq',
      apiKey: 'groq-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b',
      models: ['llama-3.3-70b', 'llama-3.1-8b'],
    });

    const models = service.listModels('groq');

    expect(modelRegistry.getOrRegisterModel).toHaveBeenCalledTimes(2);
    expect(modelRegistry.getOrRegisterModel).toHaveBeenNthCalledWith(
      1,
      'groq',
      'llama-3.3-70b',
      expect.any(Function),
    );
    expect(modelRegistry.getOrRegisterModel).toHaveBeenNthCalledWith(
      2,
      'groq',
      'llama-3.1-8b',
      expect.any(Function),
    );
    expect(models).toEqual([
      expect.objectContaining({
        id: 'llama-3.3-70b',
        providerId: 'groq',
      }),
      expect.objectContaining({
        id: 'llama-3.1-8b',
        providerId: 'groq',
      }),
    ]);
  });

  it('returns a provider model through the management boundary', () => {
    const modelConfig: ModelConfig = {
      id: 'llama-3.3-70b',
      providerId: 'groq',
      name: 'llama-3.3-70b',
      capabilities: {
        reasoning: true,
        toolCall: true,
        input: { text: true, image: false },
        output: { text: true, image: false },
      },
      api: {
        id: 'llama-3.3-70b',
        url: 'https://api.groq.com/openai/v1',
        npm: '@ai-sdk/openai',
      },
      status: 'active',
    };
    configManager.getProviderConfig.mockReturnValue({
      id: 'groq',
      name: 'Groq',
      mode: 'catalog',
      driver: 'groq',
      apiKey: 'groq-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b',
      models: ['llama-3.3-70b'],
    });
    modelRegistry.getModel.mockReturnValue(modelConfig);

    const model = service.getProviderModel('groq', 'llama-3.3-70b');

    expect(modelRegistry.getModel).toHaveBeenCalledWith('groq', 'llama-3.3-70b');
    expect(model).toBe(modelConfig);
  });

  it('marks providers as unavailable when credentials are missing', async () => {
    configManager.listProviders.mockReturnValue([
      {
        id: 'openai',
        name: 'OpenAI',
        mode: 'catalog',
        driver: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini'],
      },
      {
        id: 'groq',
        name: 'Groq',
        mode: 'catalog',
        driver: 'groq',
        apiKey: 'groq-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b',
        models: ['llama-3.3-70b'],
      },
      {
        id: 'ds2api',
        name: 'ds2api',
        mode: 'protocol',
        driver: 'openai',
        apiKey: '',
        baseUrl: 'https://example.com/v1',
        defaultModel: 'deepseek-chat',
        models: ['deepseek-chat'],
      },
    ]);

    await expect(service.listProviders()).resolves.toEqual([
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
