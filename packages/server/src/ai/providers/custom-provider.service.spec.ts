/**
 * CustomProviderService 兼容请求格式测试
 *
 * 输入:
 * - 自定义供应商注册参数
 *
 * 输出:
 * - 断言服务会根据 format 选择正确的 SDK 适配器和模型 npm 标识
 *
 * 预期行为:
 * - 只支持 openai / anthropic / gemini 三种兼容请求格式
 * - 未显式指定 format 时默认走 openai
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { CustomProviderService } from './custom-provider.service';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import { ModelRegistryService } from '../registry/model-registry.service';
import type { ProviderFactory } from '../types';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn((modelId: string) => ({ provider: 'openai', modelId })),
  })),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => ({
    chat: jest.fn((modelId: string) => ({ provider: 'anthropic', modelId })),
  })),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => ({
    chat: jest.fn((modelId: string) => ({ provider: 'gemini', modelId })),
  })),
}));

describe('CustomProviderService compatibility formats', () => {
  let service: CustomProviderService;
  let providerRegistry: {
    hasProvider: jest.Mock;
    registerProvider: jest.Mock;
    unregisterProvider: jest.Mock;
    getProviderConfig: jest.Mock;
  };
  let modelRegistry: {
    register: jest.Mock;
    clearProviderModels: jest.Mock;
    listModels: jest.Mock;
  };
  let capturedFactory: ProviderFactory | null;

  beforeEach(async () => {
    capturedFactory = null;

    providerRegistry = {
      hasProvider: jest.fn().mockReturnValue(false),
      registerProvider: jest.fn((config, factory) => {
        capturedFactory = factory;
        return config;
      }),
      unregisterProvider: jest.fn(),
      getProviderConfig: jest.fn(),
    };

    modelRegistry = {
      register: jest.fn(),
      clearProviderModels: jest.fn(),
      listModels: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomProviderService,
        {
          provide: ProviderRegistryService,
          useValue: providerRegistry,
        },
        {
          provide: ModelRegistryService,
          useValue: modelRegistry,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-api-key') },
        },
      ],
    }).compile();

    service = module.get<CustomProviderService>(CustomProviderService);
    jest.clearAllMocks();
  });

  it('uses the google adapter for gemini-compatible providers', async () => {
    const result = await service.registerProvider({
      id: 'gemini-proxy',
      name: 'Gemini Proxy',
      baseUrl: 'https://gemini.example.com/v1beta',
      format: 'gemini' as never,
      models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    });

    expect(result.npm).toBe('@ai-sdk/google');
    expect(modelRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          npm: '@ai-sdk/google',
        }),
      }),
    );

    const providerInstance = capturedFactory?.({ apiKey: 'gemini-key' });
    providerInstance?.createModel('gemini-2.5-flash');

    expect(createGoogleGenerativeAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'gemini-key',
        baseURL: 'https://gemini.example.com/v1beta',
        name: 'gemini-proxy',
      }),
    );
  });

  it('uses the anthropic adapter for anthropic-compatible providers', async () => {
    const result = await service.registerProvider({
      id: 'anthropic-proxy',
      name: 'Anthropic Proxy',
      baseUrl: 'https://anthropic.example.com/v1',
      format: 'anthropic',
      models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' }],
    });

    expect(result.npm).toBe('@ai-sdk/anthropic');
    expect(modelRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          npm: '@ai-sdk/anthropic',
        }),
      }),
    );

    const providerInstance = capturedFactory?.({ apiKey: 'anthropic-key' });
    providerInstance?.createModel('claude-3-7-sonnet');

    expect(createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'anthropic-key',
        baseURL: 'https://anthropic.example.com/v1',
        name: 'anthropic-proxy',
      }),
    );
  });

  it('defaults to the openai adapter when format is omitted', async () => {
    const result = await service.registerProvider({
      id: 'openai-proxy',
      name: 'OpenAI Proxy',
      baseUrl: 'https://openai.example.com/v1',
      models: [{ id: 'gpt-4.1', name: 'GPT 4.1' }],
    });

    expect(result.npm).toBe('@ai-sdk/openai');
    expect(modelRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          npm: '@ai-sdk/openai',
        }),
      }),
    );

    const providerInstance = capturedFactory?.({ apiKey: 'openai-key' });
    providerInstance?.createModel('gpt-4.1');

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'openai-key',
        baseURL: 'https://openai.example.com/v1',
        name: 'openai-proxy',
      }),
    );
  });
});
