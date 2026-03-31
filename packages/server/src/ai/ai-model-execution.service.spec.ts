/**
 * AI 模型统一执行服务测试
 *
 * 输入:
 * - provider/model 选择
 * - 已转换好的 AI SDK 消息
 * - 模型默认 options / headers / variants / limit
 *
 * 输出:
 * - 断言统一执行服务会解析模型、规范化消息并执行 SDK 调用
 * - 断言流式与非流式都复用同一套请求参数归一逻辑
 *
 * 预期行为:
 * - provider 特异的消息规范化在执行前统一完成
 * - 模型默认请求参数与显式覆盖项都由统一执行服务收口
 */

import {
  runGenerateText,
  runStreamText,
  type AiSdkMessage,
} from './sdk-adapter';
import type { ModelConfig } from './types/provider.types';
import { AiModelExecutionService } from './ai-model-execution.service';

jest.mock('./sdk-adapter', () => ({
  runGenerateText: jest.fn(),
  runStreamText: jest.fn(),
}));

describe('AiModelExecutionService', () => {
  const aiProvider = {
    getModelConfig: jest.fn(),
    getModel: jest.fn(),
  };
  const configManager = {
    getHostModelRoutingConfig: jest.fn(),
  };

  const modelConfig = {
    id: 'claude-3-7-sonnet',
    providerId: 'anthropic',
    name: 'Claude 3.7 Sonnet',
    capabilities: {
      input: { text: true, image: true },
      output: { text: true, image: false },
      reasoning: true,
      toolCall: true,
    },
    api: {
      id: 'claude-3-7-sonnet',
      url: 'https://api.anthropic.com/v1',
      npm: '@ai-sdk/anthropic',
    },
    limit: {
      context: 200000,
      output: 4096,
    },
    options: {
      store: false,
      reasoning: {
        effort: 'low',
      },
    },
    headers: {
      'X-Model': 'claude-default',
    },
    variants: {
      reasoningHigh: {
        reasoning: {
          effort: 'high',
        },
      },
    },
  } satisfies ModelConfig;

  let service: AiModelExecutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    configManager.getHostModelRoutingConfig.mockReturnValue({
      fallbackChatModels: [],
      utilityModelRoles: {},
    });
    service = new AiModelExecutionService(
      aiProvider as never,
      configManager as never,
    );
  });

  it('generates text with normalized messages and merged request options', async () => {
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    aiProvider.getModel.mockReturnValue({
      provider: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    (runGenerateText as jest.Mock).mockResolvedValue({ text: 'OK' });

    const executed = await service.generateText({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      system: '你是一个测试助手',
      variant: 'reasoningHigh',
      providerOptions: {
        reasoning: {
          budget: 2048,
        },
      },
      headers: {
        'X-Request': 'req-1',
      },
      sdkMessages: [
        {
          role: 'assistant',
          content: '',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '',
            },
            {
              type: 'text',
              text: '保留这段文本',
            },
          ],
        },
      ] satisfies AiSdkMessage[],
      maxOutputTokens: 128,
    });

    expect(runGenerateText).toHaveBeenCalledWith({
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet',
      },
      system: '你是一个测试助手',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '保留这段文本',
            },
          ],
        },
      ],
      providerOptions: {
        store: false,
        reasoning: {
          effort: 'high',
          budget: 2048,
        },
      },
      headers: {
        'X-Model': 'claude-default',
        'X-Request': 'req-1',
      },
      maxOutputTokens: 128,
    });
    expect(executed.result).toEqual({ text: 'OK' });
  });

  it('streams prepared executions and falls back to the model output limit', () => {
    const fullStream = (async function* () {
      yield {
        type: 'finish',
      } as const;
    })();

    (runStreamText as jest.Mock).mockReturnValue({
      fullStream,
    });

    const executed = service.streamPrepared({
      prepared: {
        modelConfig,
        model: {
          provider: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        } as never,
        sdkMessages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '测试消息',
              },
            ],
          },
        ],
        sourceSdkMessages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '测试消息',
              },
            ],
          },
        ],
      },
      system: '你是一个测试助手',
      stopWhen: { type: 'step-count', count: 5 } as never,
    });

    expect(runStreamText).toHaveBeenCalledWith({
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet',
      },
      system: '你是一个测试助手',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '测试消息',
            },
          ],
        },
      ],
      providerOptions: {
        store: false,
        reasoning: {
          effort: 'low',
        },
      },
      headers: {
        'X-Model': 'claude-default',
      },
      stopWhen: { type: 'step-count', count: 5 },
      abortSignal: undefined,
      maxOutputTokens: 4096,
    });
    expect(executed.result).toEqual({
      fullStream,
    });
  });

  it('retries chat generation with configured fallback chat models when the primary call fails', async () => {
    const fallbackModelConfig = {
      ...modelConfig,
      id: 'gpt-4.1-mini',
      providerId: 'openai',
      api: {
        id: 'gpt-4.1-mini',
        url: 'https://api.openai.com/v1',
        npm: '@ai-sdk/openai',
      },
    } satisfies ModelConfig;

    configManager.getHostModelRoutingConfig.mockReturnValue({
      fallbackChatModels: [
        {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      ],
      utilityModelRoles: {},
    });
    aiProvider.getModel.mockImplementation((providerId: string, modelId: string) => ({
      provider: providerId,
      modelId,
    }));
    aiProvider.getModelConfig.mockImplementation((providerId?: string, modelId?: string) => {
      if (providerId === 'openai' && modelId === 'gpt-4.1-mini') {
        return fallbackModelConfig;
      }

      return modelConfig;
    });
    (runGenerateText as jest.Mock)
      .mockRejectedValueOnce(new Error('primary provider down'))
      .mockResolvedValueOnce({ text: 'fallback ok' });

    const executed = await service.generatePrepared({
      prepared: {
        modelConfig,
        model: {
          provider: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        } as never,
        sdkMessages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello' }],
          },
        ],
        sourceSdkMessages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello' }],
          },
        ],
      },
      system: 'retry me',
      allowFallbackChatModels: true,
    });

    expect(runGenerateText).toHaveBeenCalledTimes(2);
    expect(executed.modelConfig.providerId).toBe('openai');
    expect(executed.modelConfig.id).toBe('gpt-4.1-mini');
    expect(executed.result.text).toBe('fallback ok');
  });

  it('retries chat streaming with configured fallback chat models when the primary stream fails before start', () => {
    const fallbackStream = (async function* () {
      yield {
        type: 'finish',
      } as const;
    })();
    const fallbackModelConfig = {
      ...modelConfig,
      id: 'gpt-4.1-mini',
      providerId: 'openai',
      api: {
        id: 'gpt-4.1-mini',
        url: 'https://api.openai.com/v1',
        npm: '@ai-sdk/openai',
      },
    } satisfies ModelConfig;

    configManager.getHostModelRoutingConfig.mockReturnValue({
      fallbackChatModels: [
        {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      ],
      utilityModelRoles: {},
    });
    aiProvider.getModel.mockImplementation((providerId: string, modelId: string) => ({
      provider: providerId,
      modelId,
    }));
    aiProvider.getModelConfig.mockImplementation((providerId?: string, modelId?: string) => {
      if (providerId === 'openai' && modelId === 'gpt-4.1-mini') {
        return fallbackModelConfig;
      }

      return modelConfig;
    });
    (runStreamText as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('primary stream setup failed');
      })
      .mockReturnValueOnce({
        fullStream: fallbackStream,
      });

    const executed = service.streamPrepared({
      prepared: {
        modelConfig,
        model: {
          provider: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        } as never,
        sdkMessages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello' }],
          },
        ],
        sourceSdkMessages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello' }],
          },
        ],
      },
      system: 'retry me',
      allowFallbackChatModels: true,
    });

    expect(runStreamText).toHaveBeenCalledTimes(2);
    expect(executed.modelConfig.providerId).toBe('openai');
    expect(executed.modelConfig.id).toBe('gpt-4.1-mini');
    expect(executed.result.fullStream).toBe(fallbackStream);
  });
});
