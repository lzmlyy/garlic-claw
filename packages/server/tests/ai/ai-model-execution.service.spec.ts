import { AiProviderSettingsService } from '../../src/modules/ai-management/ai-provider-settings.service';
const mockGenerateText = jest.fn();
const mockStepCountIs = jest.fn(() => 'step-count-stop');
const mockStreamText = jest.fn();
const mockOpenAiChat = jest.fn(() => ({ id: 'mock-openai-model' }));
const mockCreateOpenAI = jest.fn(() => ({ chat: mockOpenAiChat }));
const mockAnthropicModel = jest.fn(() => ({ id: 'mock-anthropic-model' }));
const mockCreateAnthropic = jest.fn(() => mockAnthropicModel);
const mockGeminiModel = jest.fn(() => ({ id: 'mock-gemini-model' }));
const mockCreateGoogleGenerativeAI = jest.fn(() => mockGeminiModel);

jest.mock('ai', () => ({
  generateText: mockGenerateText,
  stepCountIs: mockStepCountIs,
  streamText: mockStreamText,
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mockCreateAnthropic,
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mockCreateGoogleGenerativeAI,
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiModelExecutionService } from '../../src/modules/ai/ai-model-execution.service';

describe('AiModelExecutionService', () => {
  let settingsPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockStepCountIs.mockClear();
    mockOpenAiChat.mockClear();
    mockCreateOpenAI.mockClear();
    mockAnthropicModel.mockClear();
    mockCreateAnthropic.mockClear();
    mockGeminiModel.mockClear();
    mockCreateGoogleGenerativeAI.mockClear();
    settingsPath = path.join(os.tmpdir(), `gc-server-ai-${Date.now()}-${Math.random()}`);
    process.env.GARLIC_CLAW_AI_SETTINGS_PATH = settingsPath;
    mockGenerateText.mockResolvedValue({
      finishReason: 'stop',
      text: 'Generated response',
      usage: {
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
        source: 'provider',
      },
    });
    mockStreamText.mockReturnValue({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          text: 'Generated response',
          type: 'text-delta',
        };
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
        source: 'provider',
      }),
    });
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_AI_SETTINGS_PATH;
    fs.rmSync(settingsPath, { force: true, recursive: true });
  });

  it('passes request options through to the ai sdk and preserves image parts', async () => {
    const service = createService();

    await expect(service.generateText({
      headers: {
        'x-trace-id': 'trace-1',
      },
      maxOutputTokens: 128,
      messages: [
        {
          content: [
            { text: 'describe image', type: 'text' },
            {
              image: 'data:image/png;base64,AAAA',
              mimeType: 'image/png',
              type: 'image',
            },
          ],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      providerOptions: {
        temperature: 0.2,
      },
      system: 'You are a vision assistant',
      variant: 'reasoning-high',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.response-body',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'Generated response',
      usage: {
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
        source: 'provider',
      },
    });

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-openai-key',
      baseURL: 'https://api.openai.com/v1',
      fetch: expect.any(Function),
      name: 'openai',
    });
    expect(mockOpenAiChat).toHaveBeenCalledWith('gpt-5.4');
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      headers: {
        'x-trace-id': 'trace-1',
      },
      maxOutputTokens: 128,
      providerOptions: {
        temperature: 0.2,
        variant: 'reasoning-high',
      },
      system: 'You are a vision assistant',
    }));
    expect(mockGenerateText.mock.calls[0][0].messages).toEqual([
      {
        content: [
          { text: 'describe image', type: 'text' },
          {
            image: expect.any(ArrayBuffer),
            mimeType: 'image/png',
            type: 'image',
          },
        ],
        role: 'user',
      },
    ]);
  });

  it('extracts non-stream custom blocks from the provider response body', async () => {
    const service = createService();
    mockGenerateText.mockResolvedValueOnce({
      finishReason: 'stop',
      response: {
        body: {
          choices: [
            {
              finish_reason: 'stop',
              index: 0,
              message: {
                content: '你好',
                reasoning_content: '先输出问候语',
                role: 'assistant',
              },
            },
          ],
          id: 'chatcmpl-1',
          model: 'deepseek-reasoner',
          object: 'chat.completion',
        },
      },
      text: '你好',
      usage: {
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
        source: 'provider',
      },
    });

    await expect(service.generateText({
      messages: [
        {
          content: '你好',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.response-body',
      customBlocks: [
        {
          key: 'reasoning_content',
          kind: 'text',
          value: '先输出问候语',
        },
      ],
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: '你好',
      usage: {
        inputTokens: 3,
        outputTokens: 5,
        source: 'provider',
        totalTokens: 8,
      },
    });
  });

  it('preserves cached input tokens from provider usage', async () => {
    const service = createService();
    mockGenerateText.mockResolvedValueOnce({
      finishReason: 'stop',
      text: 'cached response',
      usage: {
        cachedInputTokens: 11,
        inputTokens: 21,
        outputTokens: 5,
        totalTokens: 26,
      },
    });

    await expect(service.generateText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.response-body',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'cached response',
      usage: {
        cachedInputTokens: 11,
        inputTokens: 21,
        outputTokens: 5,
        source: 'provider',
        totalTokens: 26,
      },
    });
  });

  it('estimates usage from text content when the provider does not return token counts', async () => {
    const service = createService();
    mockGenerateText.mockResolvedValueOnce({
      finishReason: 'stop',
      text: 'world!',
      usage: undefined,
    });

    await expect(service.generateText({
      messages: [
        {
          content: [
            { text: 'hello', type: 'text' },
            { image: 'https://example.com/cat.png', type: 'image' },
          ],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      system: 'sys',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.response-body',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'world!',
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        source: 'estimated',
        totalTokens: 5,
      },
    });
  });

  it('derives total tokens from input and output when the provider omits totalTokens in generate mode', async () => {
    const service = createService();
    mockGenerateText.mockResolvedValueOnce({
      finishReason: 'stop',
      text: 'partial usage response',
      usage: {
        inputTokens: 12,
        outputTokens: 7,
      },
    });

    await expect(service.generateText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.response-body',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'partial usage response',
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        source: 'provider',
        totalTokens: 19,
      },
    });
  });

  it.each([
    ['openai', 'deepseek-reasoner'],
    ['anthropic', 'claude-3-7-sonnet'],
    ['gemini', 'gemini-2.5-pro'],
  ] as const)('collects streamed text, usage and custom blocks for %s when transportMode=stream-collect', async (providerId, modelId) => {
    const service = createService();
    mockStreamText.mockReturnValueOnce({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          rawValue: {
            choices: [
              {
                delta: {
                  reasoning_content: '先分析问题，',
                },
              },
            ],
          },
          type: 'raw',
        };
        yield {
          rawValue: {
            choices: [
              {
                delta: {
                  reasoning_content: '再组织答案',
                },
              },
            ],
          },
          type: 'raw',
        };
        yield {
          text: 'streamed ',
          type: 'text-delta',
        };
        yield {
          text: 'response',
          type: 'text-delta',
        };
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 10,
        source: 'provider',
      }),
    });

    await expect(service.generateText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId,
      providerId,
      transportMode: 'stream-collect',
    } as any)).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.raw',
      customBlocks: [
        {
          key: 'reasoning_content',
          kind: 'text',
          value: '先分析问题，再组织答案',
        },
      ],
      finishReason: 'stop',
      modelId,
      providerId,
      text: 'streamed response',
      usage: {
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 10,
        source: 'provider',
      },
    });

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it('estimates usage for stream-collect when the provider does not return totalUsage', async () => {
    const service = createService();
    mockStreamText.mockReturnValueOnce({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          text: 'world!',
          type: 'text-delta',
        };
      })(),
      totalUsage: Promise.resolve(undefined),
    });

    await expect(service.generateText({
      messages: [
        {
          content: [
            { text: 'hello', type: 'text' },
            { image: 'https://example.com/cat.png', type: 'image' },
          ],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      system: 'sys',
      transportMode: 'stream-collect',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.raw',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'world!',
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        source: 'estimated',
        totalTokens: 5,
      },
    });
  });

  it('derives total tokens from input and output for stream-collect when the provider omits totalTokens', async () => {
    const service = createService();
    mockStreamText.mockReturnValueOnce({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          text: 'streamed partial usage',
          type: 'text-delta',
        };
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 12,
        outputTokens: 7,
      }),
    });

    await expect(service.generateText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      transportMode: 'stream-collect',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.raw',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'streamed partial usage',
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        source: 'provider',
        totalTokens: 19,
      },
    });
  });

  it('normalizes nested snake_case usage fields from openai-compatible stream responses', async () => {
    const service = createService();
    mockStreamText.mockReturnValueOnce({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          text: 'streamed nested usage',
          type: 'text-delta',
        };
      })(),
      totalUsage: Promise.resolve({
        usage: {
          completion_tokens: 34,
          prompt_tokens: 123,
          prompt_tokens_details: {
            cached_tokens: 17,
          },
          total_tokens: 157,
        },
      }),
    });

    const streamed = service.streamText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    await expect(streamed.usage).resolves.toEqual({
      cachedInputTokens: 17,
      inputTokens: 123,
      outputTokens: 34,
      source: 'provider',
      totalTokens: 157,
    });
  });

  it('retries chat generation with configured fallback chat models when the primary call fails', async () => {
    const service = createService();
    mockGenerateText
      .mockRejectedValueOnce(new Error('primary provider down'))
      .mockResolvedValueOnce({
        finishReason: 'stop',
        text: 'fallback ok',
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          source: 'provider',
        },
      });

    await expect(service.generateText({
      allowFallbackChatModels: true,
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
    })).resolves.toEqual({
      customBlockOrigin: 'ai-sdk.response-body',
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'fallback ok',
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        source: 'provider',
      },
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(2);
    expect(mockAnthropicModel).toHaveBeenCalledWith('claude-3-7-sonnet');
    expect(mockOpenAiChat).toHaveBeenCalledWith('gpt-5.4');
  });

  it('creates a stream with request options and falls back to the next chat model when the primary stream fails synchronously', async () => {
    const service = createService();
    mockStreamText
      .mockImplementationOnce(() => {
        throw new Error('primary stream unavailable');
      })
      .mockReturnValueOnce({
        finishReason: Promise.resolve('stop'),
        fullStream: (async function* () {
          yield {
            text: 'streamed fallback response',
            type: 'text-delta',
          };
        })(),
        totalUsage: Promise.resolve({
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          source: 'provider',
        }),
      });

    const streamed = service.streamText({
      allowFallbackChatModels: true,
      headers: {
        'x-trace-id': 'trace-stream-1',
      },
      maxOutputTokens: 64,
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      providerOptions: {
        temperature: 0.1,
      },
      system: 'You are streaming',
    });

    expect(streamed.modelId).toBe('gpt-5.4');
    expect(streamed.providerId).toBe('openai');
    await expect(streamed.finishReason).resolves.toBe('stop');
    await expect(streamed.usage).resolves.toEqual({
      inputTokens: 1,
      outputTokens: 2,
      source: 'provider',
      totalTokens: 3,
    });

    const parts: unknown[] = [];
    for await (const part of streamed.fullStream) {
      parts.push(part);
    }

    expect(parts).toEqual([
      {
        text: 'streamed fallback response',
        type: 'text-delta',
      },
    ]);
    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(mockStreamText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      headers: {
        'x-trace-id': 'trace-stream-1',
      },
      includeRawChunks: true,
      maxOutputTokens: 64,
      providerOptions: {
        temperature: 0.1,
      },
      system: 'You are streaming',
    }));
  });

  it('normalizes rejected finishReason and totalUsage promises when a stream later fails', async () => {
    const service = createService();
    const streamFailure = new Error('invalid x-api-key');
    mockStreamText.mockReturnValueOnce({
      finishReason: Promise.reject(streamFailure),
      fullStream: (async function* () {
        throw streamFailure;
      })(),
      totalUsage: Promise.reject(streamFailure),
    });

    const streamed = service.streamText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'claude-3-5-sonnet-20241022',
      providerId: 'anthropic',
    });

    await expect((async () => {
      for await (const _part of streamed.fullStream) {
        // noop
      }
    })()).rejects.toThrow('invalid x-api-key');
    await expect(streamed.finishReason).resolves.toBeUndefined();
    await expect(streamed.usage).resolves.toBeUndefined();
  });

  it('preserves stream getters when the ai sdk exposes them as non-enumerable properties', async () => {
    const service = createService();
    const rawStream = {} as {
      finishReason?: Promise<string>;
      fullStream?: AsyncIterable<unknown>;
      totalUsage?: Promise<{ inputTokens: number; outputTokens: number; totalTokens: number }>;
    };
    Object.defineProperty(rawStream, 'finishReason', {
      configurable: true,
      enumerable: false,
      value: Promise.resolve('stop'),
      writable: true,
    });
    Object.defineProperty(rawStream, 'fullStream', {
      configurable: true,
      enumerable: false,
      value: (async function* () {
        yield {
          text: 'non-enumerable stream',
          type: 'text-delta' as const,
        };
      })(),
      writable: true,
    });
    Object.defineProperty(rawStream, 'totalUsage', {
      configurable: true,
      enumerable: false,
      value: Promise.resolve({
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      }),
      writable: true,
    });
    mockStreamText.mockReturnValueOnce(rawStream as never);

    const streamed = service.streamText({
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    const parts: unknown[] = [];
    for await (const part of streamed.fullStream) {
      parts.push(part);
    }

    await expect(streamed.finishReason).resolves.toBe('stop');
    await expect(streamed.usage).resolves.toEqual({
      inputTokens: 1,
      outputTokens: 1,
      source: 'provider',
      totalTokens: 2,
    });
    expect(parts).toEqual([
      {
        text: 'non-enumerable stream',
        type: 'text-delta',
      },
    ]);
  });

  it('enables multi-step tool loops for tool-enabled streams through the ai sdk stop condition', async () => {
    const service = createService();

    service.streamText({
      messages: [
        {
          content: '帮我先查天气再总结',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      tools: {
        weather_search: {} as never,
      },
    } as never);

    expect(mockStepCountIs).toHaveBeenCalledTimes(1);
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      stopWhen: 'step-count-stop',
      tools: {
        weather_search: {},
      },
    }));
  });

  it('repairs invalid tool calls into the internal invalid tool when tools are enabled', async () => {
    const service = createService();

    service.streamText({
      messages: [
        {
          content: '帮我先查天气再总结',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      tools: {
        invalid: {} as never,
        weather_search: {} as never,
      },
    } as never);

    const repairToolCall = mockStreamText.mock.calls[0][0].experimental_repairToolCall as
      | ((input: {
          error: { message?: string; name?: string };
          toolCall: { input: string; toolCallId: string; toolName: string };
        }) => Promise<{ input: string; toolCallId: string; toolName: string } | null>)
      | undefined;
    expect(typeof repairToolCall).toBe('function');

    await expect(repairToolCall?.({
      error: {
        message: 'city is required',
        name: 'AI_InvalidToolInputError',
      },
      toolCall: {
        input: '{"city":""}',
        toolCallId: 'tool-call-1',
        toolName: 'weather_search',
      },
    })).resolves.toEqual({
      input: JSON.stringify({
        error: 'city is required',
        inputText: '{"city":""}',
        phase: 'validate',
        tool: 'weather_search',
      }),
      toolCallId: 'tool-call-1',
      toolName: 'invalid',
    });
  });

  it('repairs polluted tool names back to known tools before falling back to invalid', async () => {
    const service = createService();

    service.streamText({
      messages: [
        {
          content: '先加载 skill 再继续',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      tools: {
        invalid: {} as never,
        skill: {} as never,
      },
    } as never);

    const repairToolCall = mockStreamText.mock.calls[0][0].experimental_repairToolCall as
      | ((input: {
          error: { message?: string; name?: string };
          toolCall: { input: string; toolCallId: string; toolName: string };
        }) => Promise<{ input: string; toolCallId: string; toolName: string } | null>)
      | undefined;

    await expect(repairToolCall?.({
      error: {
        message: 'Model tried to call unavailable tool',
        name: 'AI_NoSuchToolError',
      },
      toolCall: {
        input: '{"name":"weather-query"}',
        toolCallId: 'tool-call-2',
        toolName: 'skill<|channel|>commentary',
      },
    })).resolves.toEqual({
      input: '{"name":"weather-query"}',
      toolCallId: 'tool-call-2',
      toolName: 'skill',
    });
  });

  it('normalizes streamed tool calls for openai-compatible providers when the endpoint omits id and type', async () => {
    const service = createService();
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => new Response(
      [
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"","tool_calls":[{"function":{"name":"weather_search","arguments":""}}]}}]}\n',
        '\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":\\"Shanghai\\"}"}}]}}]}\n',
        '\n',
        'data: [DONE]\n',
        '\n',
      ].join(''),
      {
        headers: {
          'content-type': 'text/event-stream',
        },
        status: 200,
      },
    )) as typeof fetch;

    try {
      await service.streamText({
        messages: [
          {
            content: '帮我查天气',
            role: 'user',
          },
        ],
        modelId: 'gpt-5.4',
        providerId: 'openai',
      });

      const createOpenAiCalls = mockCreateOpenAI.mock.calls as unknown as Array<
        [{ fetch?: typeof fetch }]
      >;
      const openAiOptions = createOpenAiCalls[0]?.[0] as
        | { fetch?: typeof fetch }
        | undefined;
      expect(typeof openAiOptions?.fetch).toBe('function');

      const response = await openAiOptions?.fetch?.('https://example.com/v1/chat/completions');
      const content = await response?.text();

      expect(content).toContain('"type":"function"');
      expect(content).toContain('"name":"weather_search"');
      expect(content).toContain('"arguments":"{\\"city\\":\\"Shanghai\\"}"');
      expect(content).toContain('"index":0');
      expect(content).toMatch(/"id":"gc-openai-tool-call-[^"]+"/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

function createService(): AiModelExecutionService {
  const settingsService = new AiProviderSettingsService();
  settingsService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  settingsService.upsertProvider('anthropic', {
    apiKey: 'test-anthropic-key',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet',
    driver: 'anthropic',
    models: ['claude-3-7-sonnet'],
    name: 'Anthropic',
  });
  settingsService.upsertProvider('gemini', {
    apiKey: 'test-gemini-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-pro',
    driver: 'gemini',
    models: ['gemini-2.5-pro'],
    name: 'Google Gemini',
  });
  settingsService.updateHostModelRoutingConfig({
    fallbackChatModels: [
      {
        providerId: 'openai',
        modelId: 'gpt-5.4',
      },
    ],
    utilityModelRoles: {},
  });

  return new AiModelExecutionService(settingsService);
}
