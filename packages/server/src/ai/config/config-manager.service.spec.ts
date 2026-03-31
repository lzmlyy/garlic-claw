import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigManagerService } from './config-manager.service';

describe('ConfigManagerService', () => {
  const tempSettingsPath = path.join(
    process.cwd(),
    'tmp',
    'config-manager.service.spec.json',
  );
  const envKey = 'GARLIC_CLAW_AI_SETTINGS_PATH';

  afterEach(() => {
    delete process.env[envKey];

    if (fs.existsSync(tempSettingsPath)) {
      fs.unlinkSync(tempSettingsPath);
    }
  });

  it('uses the custom settings path from environment variables', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new ConfigManagerService();
    service.upsertProvider('spec-openai', {
      name: 'Spec OpenAI',
      mode: 'compatible',
      driver: 'openai',
      apiKey: 'spec-key',
      baseUrl: 'https://spec.example.com/v1',
      defaultModel: 'spec-model',
      models: ['spec-model'],
    });

    expect(fs.existsSync(tempSettingsPath)).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(tempSettingsPath, 'utf-8')) as {
      providers: Array<{ id: string; defaultModel?: string }>;
    };

    expect(persisted.providers).toEqual([
      expect.objectContaining({
        id: 'spec-openai',
        defaultModel: 'spec-model',
      }),
    ]);
  });

  it('persists host model routing config into the same settings file', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new ConfigManagerService();
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

    const persisted = JSON.parse(fs.readFileSync(tempSettingsPath, 'utf-8')) as {
      hostModelRouting?: {
        fallbackChatModels?: Array<{ providerId: string; modelId: string }>;
        compressionModel?: { providerId: string; modelId: string };
        utilityModelRoles?: Record<string, { providerId: string; modelId: string }>;
      };
    };

    expect(persisted.hostModelRouting).toEqual({
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
});
