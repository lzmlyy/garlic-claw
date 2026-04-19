import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';
const mockGenerateText = jest.fn();
const mockIsLoopFinished = jest.fn(() => 'loop-finished-stop');
const mockStreamText = jest.fn();
const mockOpenAiChat = jest.fn(() => ({ id: 'mock-openai-model' }));
const mockCreateOpenAI = jest.fn(() => ({ chat: mockOpenAiChat }));
const mockAnthropicModel = jest.fn(() => ({ id: 'mock-anthropic-model' }));
const mockCreateAnthropic = jest.fn(() => mockAnthropicModel);
const mockGeminiModel = jest.fn(() => ({ id: 'mock-gemini-model' }));
const mockCreateGoogleGenerativeAI = jest.fn(() => mockGeminiModel);

jest.mock('ai', () => ({
  generateText: mockGenerateText,
  isLoopFinished: mockIsLoopFinished,
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
import { AiModelExecutionService } from '../../src/ai/ai-model-execution.service';

describe('AiModelExecutionService', () => {
  let settingsPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    settingsPath = path.join(os.tmpdir(), `gc-server-ai-${Date.now()}-${Math.random()}.json`);
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
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
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

    expect(mockIsLoopFinished).toHaveBeenCalledTimes(1);
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      stopWhen: 'loop-finished-stop',
      tools: {
        weather_search: {},
      },
    }));
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
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  settingsService.upsertProvider('anthropic', {
    apiKey: 'test-anthropic-key',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet',
    driver: 'anthropic',
    mode: 'protocol',
    models: ['claude-3-7-sonnet'],
    name: 'Anthropic',
  });
  settingsService.upsertProvider('gemini', {
    apiKey: 'test-gemini-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-pro',
    driver: 'gemini',
    mode: 'protocol',
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
