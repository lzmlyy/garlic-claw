/**
 * AiProviderService 运行时配置测试
 *
 * 输入:
 * - 配置文件中的官方 / 兼容 provider 配置
 * - 模型注册表中的能力覆盖
 *
 * 输出:
 * - 断言运行时只读取 config/ai-settings.json 中的 provider
 * - 断言兼容 provider 会按三种请求格式映射到官方 SDK
 * - 断言模型能力优先使用注册表中的已配置结果
 *
 * 预期行为:
 * - 运行时不再从环境变量自动注入 provider
 * - 兼容 provider 只允许 openai / anthropic / gemini 三种格式
 * - 聊天运行时读取的模型配置应与管理 API 写入后的能力一致
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { ModelConfig } from './types/provider.types';
import { AiProviderService } from './ai-provider.service';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn((options?: { name?: string }) => {
    const provider = jest.fn((modelId: string) => ({
      provider: `${options?.name ?? 'openai'}.responses`,
      modelId,
    }));

    return Object.assign(provider, {
      chat: jest.fn((modelId: string) => ({
        provider: `${options?.name ?? 'openai'}.chat`,
        modelId,
      })),
    });
  }),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn((options?: { name?: string }) => ({
    chat: jest.fn((modelId: string) => ({
      provider: options?.name ?? 'anthropic',
      modelId,
    })),
  })),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn((options?: { name?: string }) => ({
    chat: jest.fn((modelId: string) => ({
      provider: options?.name ?? 'gemini',
      modelId,
    })),
  })),
}));

jest.mock('@ai-sdk/groq', () => ({
  createGroq: jest.fn((options?: { name?: string }) => ({
    chat: jest.fn((modelId: string) => ({
      provider: options?.name ?? 'groq',
      modelId,
    })),
  })),
}));

describe('AiProviderService', () => {
  type ConfiguredProvider = {
    id: string
    name: string
    mode: 'official' | 'compatible'
    driver: string
    apiKey?: string
    baseUrl?: string
    defaultModel?: string
    models: string[]
  }

  type ConfigManagerLike = {
    listProviders: () => ConfiguredProvider[]
  }

  type ModelRegistryLike = {
    getModel: () => ModelConfig | null
    register: () => void
    clearProviderModels: () => void
  }

  const createService = (
    overrides?: {
      configuredProviders?: ConfiguredProvider[];
      registeredModel?: ModelConfig | null;
    },
  ) => {
    const configManager: ConfigManagerLike = {
      listProviders: jest.fn(() => overrides?.configuredProviders ?? []),
    };

    const modelRegistry: ModelRegistryLike = {
      getModel: jest.fn(() => overrides?.registeredModel ?? null),
      register: jest.fn(),
      clearProviderModels: jest.fn(),
    };

    return {
      service: Reflect.construct(
        AiProviderService,
        [configManager, modelRegistry],
      ) as AiProviderService,
      configManager,
      modelRegistry,
    };
  };

  it('registers only configured providers from config storage', () => {
    const { service } = createService({
      configuredProviders: [
        {
          id: 'groq',
          name: 'Groq',
          mode: 'official',
          driver: 'groq',
          apiKey: 'groq-key',
          baseUrl: 'https://api.groq.com/openai/v1',
          defaultModel: 'llama-3.3-70b-versatile',
          models: ['llama-3.3-70b-versatile'],
        },
      ],
    });

    const model = service.getModel('groq', 'llama-3.3-70b-versatile');
    const modelConfig = service.getModelConfig('groq', 'llama-3.3-70b-versatile');

    expect(createGroq).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'groq-key',
        baseURL: 'https://api.groq.com/openai/v1',
      }),
    );
    expect(model).toEqual({
      provider: 'groq',
      modelId: 'llama-3.3-70b-versatile',
    });
    expect(modelConfig.providerId).toBe('groq');
    expect(modelConfig.api.npm).toBe('@ai-sdk/groq');
    expect(service.getAvailableProviders()).toEqual(['groq']);
  });

  it('maps compatible providers to the official SDK for the configured request format', () => {
    const { service } = createService({
      configuredProviders: [
        {
          id: 'team-gemini',
          name: 'Team Gemini',
          mode: 'compatible',
          driver: 'gemini',
          apiKey: 'team-key',
          baseUrl: 'https://compat.example.com/v1beta',
          defaultModel: 'gemini-2.0-flash',
          models: ['gemini-2.0-flash'],
        },
      ],
    });

    const model = service.getModel('team-gemini', 'gemini-2.0-flash');
    const modelConfig = service.getModelConfig('team-gemini', 'gemini-2.0-flash');

    expect(createGoogleGenerativeAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'team-key',
        baseURL: 'https://compat.example.com/v1beta',
        name: 'team-gemini',
      }),
    );
    expect(model).toEqual({
      provider: 'team-gemini',
      modelId: 'gemini-2.0-flash',
    });
    expect(modelConfig.providerId).toBe('team-gemini');
    expect(modelConfig.api.npm).toBe('@ai-sdk/google');
    expect(service.getAvailableProviders()).toContain('team-gemini');
  });

  it('prefers the chat factory when a callable provider also exposes chat', () => {
    const { service } = createService({
      configuredProviders: [
        {
          id: 'ds2api',
          name: 'ds2api',
          mode: 'compatible',
          driver: 'openai',
          apiKey: 'team-key',
          baseUrl: 'https://compat.example.com/v1',
          defaultModel: 'deepseek-reasoner',
          models: ['deepseek-reasoner'],
        },
      ],
    });

    const model = service.getModel('ds2api', 'deepseek-reasoner');

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'team-key',
        baseURL: 'https://compat.example.com/v1',
        name: 'ds2api',
      }),
    );
    expect(model).toEqual({
      provider: 'ds2api.chat',
      modelId: 'deepseek-reasoner',
    });
  });

  it('prefers the model registry config over inferred capabilities', () => {
    const registeredModel: ModelConfig = {
      id: 'llama-3.3-70b-versatile',
      providerId: 'groq',
      name: 'llama-3.3-70b-versatile',
      capabilities: {
        reasoning: true,
        toolCall: false,
        input: { text: true, image: true },
        output: { text: true, image: false },
      },
      api: {
        id: 'llama-3.3-70b-versatile',
        url: 'https://api.groq.com/openai/v1',
        npm: '@ai-sdk/groq',
      },
      status: 'active',
    };
    const { service, modelRegistry } = createService({
      configuredProviders: [
        {
          id: 'groq',
          name: 'Groq',
          mode: 'official',
          driver: 'groq',
          apiKey: 'groq-key',
          baseUrl: 'https://api.groq.com/openai/v1',
          defaultModel: 'llama-3.3-70b-versatile',
          models: ['llama-3.3-70b-versatile'],
        },
      ],
      registeredModel,
    });

    const modelConfig = service.getModelConfig('groq', 'llama-3.3-70b-versatile');

    expect(modelRegistry.getModel).toHaveBeenCalledWith(
      'groq',
      'llama-3.3-70b-versatile',
    );
    expect(modelConfig).toBe(registeredModel);
  });

  it('throws when no provider is configured in config storage', () => {
    const { service } = createService();

    expect(() => service.getModel()).toThrow(
      'AI provider "unset" is not configured. Available providers: ',
    );
  });
});
