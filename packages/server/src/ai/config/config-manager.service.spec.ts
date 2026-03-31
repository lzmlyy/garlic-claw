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

  it('migrates legacy settings files to the current schema and drops invalid field types', () => {
    fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
    fs.writeFileSync(
      tempSettingsPath,
      JSON.stringify(
        {
          version: 2,
          updatedAt: '2026-03-31T10:00:00.000Z',
          providers: [
            {
              id: 'legacy-openai',
              name: 'Legacy OpenAI',
              mode: 'compatible',
              driver: 'openai',
              apiKey: 12345,
              baseUrl: 67890,
              defaultModel: 111,
              models: ['legacy-model', 42],
            },
            {
              id: 999,
              name: 'Broken Provider',
              mode: 'official',
              driver: 'openai',
              models: ['should-drop'],
            },
          ],
          visionFallback: {
            enabled: true,
            providerId: 123,
            modelId: 'gpt-4.1-mini',
            prompt: false,
            maxDescriptionLength: '512',
          },
          hostModelRouting: {
            fallbackChatModels: [
              {
                providerId: 'anthropic',
                modelId: 'claude-3-7-sonnet',
              },
              {
                providerId: 'openai',
                modelId: 123,
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
              pluginGenerateText: {
                providerId: 'gemini',
                modelId: false,
              },
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    process.env[envKey] = tempSettingsPath;

    const service = new ConfigManagerService();

    expect(service.listProviders()).toEqual([
      {
        id: 'legacy-openai',
        name: 'Legacy OpenAI',
        mode: 'compatible',
        driver: 'openai',
        models: ['legacy-model'],
      },
    ]);
    expect(service.getVisionFallbackConfig()).toEqual({
      enabled: true,
      modelId: 'gpt-4.1-mini',
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

    const persisted = JSON.parse(fs.readFileSync(tempSettingsPath, 'utf-8')) as {
      version: number;
      providers: Array<{
        id: string;
        apiKey?: string;
        baseUrl?: string;
        defaultModel?: string;
        models: string[];
      }>;
      visionFallback: {
        enabled: boolean;
        providerId?: string;
        modelId?: string;
        prompt?: string;
        maxDescriptionLength?: number;
      };
      hostModelRouting: {
        fallbackChatModels: Array<{ providerId: string; modelId: string }>;
        compressionModel?: { providerId: string; modelId: string };
        utilityModelRoles: Record<string, { providerId: string; modelId: string }>;
      };
    };

    expect(persisted.version).toBe(3);
    expect(persisted.providers).toEqual([
      {
        id: 'legacy-openai',
        name: 'Legacy OpenAI',
        mode: 'compatible',
        driver: 'openai',
        models: ['legacy-model'],
      },
    ]);
    expect(persisted.visionFallback).toEqual({
      enabled: true,
      modelId: 'gpt-4.1-mini',
    });
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
