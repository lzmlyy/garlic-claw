/**
 * 聊天模型统一调用服务测试
 *
 * 输入:
 * - provider/model 选择
 * - 聊天运行时消息
 * - 已模拟的模型门面与消息转换服务
 *
 * 输出:
 * - 断言服务会统一解析模型、降级消息并转换成 AI SDK 消息
 * - 断言后端一次性文本调用不再需要业务层手动串接多个步骤
 *
 * 预期行为:
 * - prepare() 负责统一准备模型和 SDK 消息
 * - generateText() 负责在准备完成后直接执行文本生成
 */

import type { ModelConfig } from '../ai/types/provider.types';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { runGenerateText, runStreamText } from '../ai/sdk-adapter';
import type { ChatRuntimeMessage } from './chat-message-session';
import { ChatModelInvocationService } from './chat-model-invocation.service';

jest.mock('../ai/sdk-adapter', () => ({
  runGenerateText: jest.fn(),
  runStreamText: jest.fn(),
}));

describe('ChatModelInvocationService', () => {
  const aiProvider = {
    getModelConfig: jest.fn(),
    getModel: jest.fn(),
  };

  const messageTransform = {
    transformMessages: jest.fn(),
  };

  const modelConfig = {
    id: 'deepseek-reasoner',
    providerId: 'ds2api',
    name: 'DeepSeek Reasoner',
    capabilities: {
      input: { text: true, image: false },
      output: { text: true, image: false },
      reasoning: true,
      toolCall: true,
    },
    api: {
      id: 'deepseek-reasoner',
      url: 'https://example.com/v1',
      npm: '@ai-sdk/openai',
    },
    limit: {
      context: 64000,
      output: 256,
    },
    options: {
      store: false,
      reasoning: {
        effort: 'low',
        budget: 256,
      },
      metadata: {
        source: 'model-default',
      },
    },
    headers: {
      'X-Provider': 'model-default',
      'X-Trace': 'base-trace',
    },
    variants: {
      reasoningHigh: {
        reasoning: {
          effort: 'high',
          budget: 1024,
        },
        mode: 'variant-high',
      },
    },
  } satisfies ModelConfig;

  const runtimeMessages: ChatRuntimeMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '请帮我总结这段日志',
        },
      ],
    },
  ];

  let service: ChatModelInvocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatModelInvocationService(
      new AiModelExecutionService(aiProvider as never),
      messageTransform as never,
    );
  });

  it('prepares transformed sdk messages from provider/model selection', async () => {
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    aiProvider.getModel.mockReturnValue({ provider: 'ds2api', modelId: 'deepseek-reasoner' });
    messageTransform.transformMessages.mockResolvedValue(runtimeMessages);

    const prepared = await service.prepare({
      conversationId: 'conversation-1',
      providerId: 'ds2api',
      modelId: 'deepseek-reasoner',
      messages: runtimeMessages,
    });

    expect(aiProvider.getModelConfig).toHaveBeenCalledWith('ds2api', 'deepseek-reasoner');
    expect(messageTransform.transformMessages).toHaveBeenCalledWith(
      'conversation-1',
      runtimeMessages,
      modelConfig,
    );
    expect(prepared).toEqual({
      modelConfig,
      model: { provider: 'ds2api', modelId: 'deepseek-reasoner' },
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请帮我总结这段日志',
            },
          ],
        },
      ],
    });
  });

  it('normalizes anthropic sdk messages before execution', async () => {
    const anthropicModelConfig = {
      ...modelConfig,
      providerId: 'anthropic',
      api: {
        ...modelConfig.api,
        id: 'claude-3-7-sonnet',
        npm: '@ai-sdk/anthropic',
      },
    } satisfies ModelConfig;

    aiProvider.getModelConfig.mockReturnValue(anthropicModelConfig);
    aiProvider.getModel.mockReturnValue({
      provider: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    messageTransform.transformMessages.mockResolvedValue([
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
    ] satisfies ChatRuntimeMessage[]);

    const prepared = await service.prepare({
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      messages: runtimeMessages,
    });

    expect(prepared.sdkMessages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '保留这段文本',
          },
        ],
      },
    ]);
  });

  it('generates text through the unified invocation pipeline with merged call options', async () => {
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    aiProvider.getModel.mockReturnValue({ provider: 'ds2api', modelId: 'deepseek-reasoner' });
    messageTransform.transformMessages.mockResolvedValue(runtimeMessages);
    (runGenerateText as jest.Mock).mockResolvedValue({ text: '总结完成' });

    const executed = await service.generateText({
      conversationId: 'conversation-1',
      providerId: 'ds2api',
      modelId: 'deepseek-reasoner',
      system: '你是一个日志分析助手',
      messages: runtimeMessages,
      variant: 'reasoningHigh',
      providerOptions: {
        reasoning: {
          budget: 2048,
        },
        explicitFlag: true,
      },
      headers: {
        'X-Trace': 'request-trace',
        'X-Request': 'req-1',
      },
      maxOutputTokens: 128,
    });

    expect(runGenerateText).toHaveBeenCalledWith({
      model: { provider: 'ds2api', modelId: 'deepseek-reasoner' },
      system: '你是一个日志分析助手',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请帮我总结这段日志',
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
        metadata: {
          source: 'model-default',
        },
        mode: 'variant-high',
        explicitFlag: true,
      },
      headers: {
        'X-Provider': 'model-default',
        'X-Trace': 'request-trace',
        'X-Request': 'req-1',
      },
      maxOutputTokens: 128,
    });
    expect(executed).toEqual({
      modelConfig,
      model: { provider: 'ds2api', modelId: 'deepseek-reasoner' },
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请帮我总结这段日志',
            },
          ],
        },
      ],
      result: { text: '总结完成' },
    });
  });

  it('streams text through the unified invocation pipeline and reuses the same option resolution', async () => {
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
        model: { provider: 'ds2api', modelId: 'deepseek-reasoner' } as never,
        sdkMessages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请帮我总结这段日志',
              },
            ],
          },
        ],
      },
      system: '你是一个日志分析助手',
      variant: 'reasoningHigh',
      stopWhen: { type: 'step-count', count: 5 } as never,
      abortSignal: new AbortController().signal,
    });

    expect(runStreamText).toHaveBeenCalledWith({
      model: { provider: 'ds2api', modelId: 'deepseek-reasoner' },
      system: '你是一个日志分析助手',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请帮我总结这段日志',
            },
          ],
        },
      ],
      providerOptions: {
        store: false,
        reasoning: {
          effort: 'high',
          budget: 1024,
        },
        metadata: {
          source: 'model-default',
        },
        mode: 'variant-high',
      },
      headers: {
        'X-Provider': 'model-default',
        'X-Trace': 'base-trace',
      },
      stopWhen: { type: 'step-count', count: 5 },
      abortSignal: expect.any(AbortSignal),
      maxOutputTokens: 256,
    });
    expect(executed).toEqual({
      modelConfig,
      model: { provider: 'ds2api', modelId: 'deepseek-reasoner' },
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请帮我总结这段日志',
            },
          ],
        },
      ],
      result: {
        fullStream,
      },
    });
  });
});
