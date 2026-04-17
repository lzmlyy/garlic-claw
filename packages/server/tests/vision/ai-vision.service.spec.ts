import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';
import { AiVisionService } from '../../src/vision/ai-vision.service';

describe('AiVisionService', () => {
  const aiModelExecutionService = {
    generateText: jest.fn(),
  };

  let modelRuntimeConfigService: AiProviderSettingsService;
  let service: AiVisionService;

  beforeEach(() => {
    jest.clearAllMocks();
    modelRuntimeConfigService = {
      getVisionFallbackConfig: jest.fn().mockReturnValue({
        enabled: false,
      }),
    } as never;
    service = new AiVisionService(
      aiModelExecutionService as never,
      modelRuntimeConfigService,
    );
  });

  it('returns cached transcriptions without calling the vision model', async () => {
    modelRuntimeConfigService.getVisionFallbackConfig = jest.fn().mockReturnValue({
      enabled: true,
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
    });
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      text: '图片里是一只猫',
    });

    await service.resolveImageText(
      'conversation-1',
      'data:image/png;base64,abc123',
      'image/png',
    );
    const resolved = await service.resolveImageText(
      'conversation-1',
      'data:image/png;base64,abc123',
      'image/png',
    );

    expect(aiModelExecutionService.generateText).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({
      text: '图片里是一只猫',
      source: 'cache',
    });
  });

  it('generates transcriptions when fallback is enabled', async () => {
    modelRuntimeConfigService.getVisionFallbackConfig = jest.fn().mockReturnValue({
      enabled: true,
      maxDescriptionLength: 8,
      modelId: 'gpt-4.1-mini',
      prompt: '请描述图片',
      providerId: 'openai',
    });
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      text: '图片里是一只可爱的小猫正在看镜头',
    });

    const resolved = await service.resolveImageText(
      'conversation-1',
      'data:image/png;base64,abc123',
      'image/png',
    );

    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith({
      maxOutputTokens: 500,
      messages: [
        {
          content: [
            {
              text: '请描述图片',
              type: 'text',
            },
            {
              image: 'data:image/png;base64,abc123',
              mimeType: 'image/png',
              type: 'image',
            },
          ],
          role: 'user',
        },
      ],
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
    });
    expect(resolved).toEqual({
      text: '图片里是一只可爱...',
      source: 'generated',
    });
  });

  it('appends fallback text parts for images through the vision owner', async () => {
    modelRuntimeConfigService.getVisionFallbackConfig = jest.fn().mockReturnValue({
      enabled: true,
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
    });
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      text: '图片里是一只猫',
    });

    const resolved = await service.resolveMessageParts(
      'conversation-1',
      [
        { text: '帮我看图', type: 'text' },
        { image: 'data:image/png;base64,abc123', mimeType: 'image/png', type: 'image' },
      ],
    );

    expect(resolved).toEqual([
      { text: '帮我看图', type: 'text' },
      { image: 'data:image/png;base64,abc123', mimeType: 'image/png', type: 'image' },
      { text: '图片说明：图片里是一只猫', type: 'text' },
    ]);
  });
});
