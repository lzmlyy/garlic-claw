import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';
const mockGenerateText = jest.fn();
const mockStreamText = jest.fn();
const mockOpenAiChat = jest.fn(() => ({ id: 'mock-openai-model' }));
const mockCreateOpenAI = jest.fn(() => ({ chat: mockOpenAiChat }));
const mockAnthropicModel = jest.fn(() => ({ id: 'mock-anthropic-model' }));
const mockCreateAnthropic = jest.fn(() => mockAnthropicModel);

jest.mock('ai', () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mockCreateAnthropic,
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
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'Generated response',
      usage: {
        inputTokens: 3,
        outputTokens: 5,
      },
    });

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-openai-key',
      baseURL: 'https://api.openai.com/v1',
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
      finishReason: 'stop',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'fallback ok',
      usage: {
        inputTokens: 1,
        outputTokens: 2,
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
      maxOutputTokens: 64,
      providerOptions: {
        temperature: 0.1,
      },
      system: 'You are streaming',
    }));
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
