/**
 * ImageToTextService 配置优先级测试
 *
 * 输入:
 * - 配置文件中的 vision fallback 配置
 *
 * 输出:
 * - 断言运行时优先读取 ConfigManagerService
 * - 断言未配置管理项时不再回退到 env
 *
 * 预期行为:
 * - 管理 API 写入的 vision fallback 可以立即影响运行时
 * - 视觉转述配置完全由 config/ai-settings.json 驱动
 */

import { ImageToTextService } from './image-to-text.service';

describe('ImageToTextService', () => {
  type AiModelExecutionLike = {
    generateText: (input: {
      providerId: string;
      modelId: string;
      sdkMessages: Array<{
        role: string;
        content: unknown;
      }>;
      maxOutputTokens: number;
    }) => Promise<{
      result: {
        text: string;
      };
    }>;
  }

  type ConfigManagerLike = {
    getVisionFallbackConfig: () => {
      enabled: boolean
      providerId?: string
      modelId?: string
      prompt?: string
      maxDescriptionLength?: number
    }
  }

  const createService = (overrides?: {
    managedConfig?: {
      enabled: boolean;
      providerId?: string;
      modelId?: string;
      prompt?: string;
      maxDescriptionLength?: number;
    };
  }) => {
    const aiModelExecution: AiModelExecutionLike = {
      generateText: jest.fn(async () => ({
        result: {
          text: '这是一张包含文字和图表的测试图片描述',
        },
      })),
    };
    const configManager: ConfigManagerLike = {
      getVisionFallbackConfig: jest.fn(() => overrides?.managedConfig ?? { enabled: false }),
    };

    return {
      service: Reflect.construct(
        ImageToTextService,
        [aiModelExecution, configManager],
      ) as ImageToTextService,
      aiModelExecution,
      configManager,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers the managed vision fallback config over env values', async () => {
    const { service, aiModelExecution } = createService({
      managedConfig: {
        enabled: true,
        providerId: 'groq',
        modelId: 'llama-4-vision-preview',
        prompt: 'managed prompt',
        maxDescriptionLength: 20,
      },
    });

    const description = await service.imageToText('data:image/png;base64,AAAA');

    expect(aiModelExecution.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'groq',
        modelId: 'llama-4-vision-preview',
        sdkMessages: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: 'text',
                text: 'managed prompt',
              }),
              expect.objectContaining({
                type: 'image',
                image: expect.any(ArrayBuffer),
              }),
            ],
          }),
        ],
        maxOutputTokens: 500,
      }),
    );
    expect(description).toBe('这是一张包含文字和图表的测试图片描述');
  });

  it('returns null when the managed config is still empty', () => {
    const { service } = createService({
      managedConfig: {
        enabled: false,
      },
    });

    expect(service.getConfig()).toBeNull();
  });

  it('treats maxDescriptionLength = 0 as unlimited', async () => {
    const { service } = createService({
      managedConfig: {
        enabled: true,
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
        maxDescriptionLength: 0,
      },
    });

    const description = await service.imageToText('data:image/png;base64,BBBB');

    expect(description).toBe('这是一张包含文字和图表的测试图片描述');
  });
});
