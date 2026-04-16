import * as fs from 'node:fs';
import * as path from 'node:path';
import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';

describe('AiProviderSettingsService runtime config', () => {
  const tempSettingsPath = path.join(
    process.cwd(),
    'tmp',
    'ai-provider-settings.service.spec.json',
  );
  const envKey = 'GARLIC_CLAW_AI_SETTINGS_PATH';

  afterEach(() => {
    delete process.env[envKey];

    if (fs.existsSync(tempSettingsPath)) {
      fs.unlinkSync(tempSettingsPath);
    }
  });

  it('persists host model routing config into the shared ai settings file', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new AiProviderSettingsService();
    service.updateHostModelRoutingConfig({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      },
    });

    expect(service.getHostModelRoutingConfig()).toEqual({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      },
    });
  });

  it('persists vision fallback config into the shared ai settings file', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new AiProviderSettingsService();
    service.updateVisionFallbackConfig({
      enabled: true,
      maxDescriptionLength: 200,
      modelId: 'gpt-4.1-mini',
      prompt: 'describe image',
      providerId: 'openai',
    });

    expect(service.getVisionFallbackConfig()).toEqual({
      enabled: true,
      maxDescriptionLength: 200,
      modelId: 'gpt-4.1-mini',
      prompt: 'describe image',
      providerId: 'openai',
    });
  });
});
