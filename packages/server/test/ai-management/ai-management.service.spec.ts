import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { AiManagementService } from '../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';
import type { AiSettingsFile } from '../../src/ai-management/ai-management.types';

jest.mock('../../src/ai-management/ai-management-settings.store', () => {
  const settings: AiSettingsFile = {
    providers: [],
    visionFallback: {
      enabled: false,
    },
    hostModelRouting: {
      fallbackChatModels: [],
      utilityModelRoles: {},
    },
  };

  return {
    cloneRoutingConfig: jest.fn((config) => JSON.parse(JSON.stringify(config))),
    loadAiSettings: jest.fn(() => settings),
    resolveAiSettingsPath: jest.fn(() => 'memory://ai-settings.json'),
    saveAiSettings: jest.fn((_path: string, next: AiSettingsFile) => {
      settings.providers = next.providers.map((provider) => ({ ...provider, models: [...provider.models] }));
      settings.visionFallback = { ...next.visionFallback };
      settings.hostModelRouting = JSON.parse(JSON.stringify(next.hostModelRouting));
    }),
  };
});

describe('AiManagementService', () => {
  beforeEach(() => {
    const store = require('../../src/ai-management/ai-management-settings.store') as {
      loadAiSettings: jest.Mock;
    };
    store.loadAiSettings().providers = [];
    store.loadAiSettings().visionFallback = {
      enabled: false,
    };
    store.loadAiSettings().hostModelRouting = {
      fallbackChatModels: [],
      utilityModelRoles: {},
    };
    jest.restoreAllMocks();
  });

  it('classifies provider catalog entries into core protocols and presets', () => {
    const service = new AiManagementService(new AiProviderSettingsService());

    const catalog = service.listProviderCatalog();

    expect(catalog.filter((item) => item.kind === 'core')).toEqual([
      expect.objectContaining({ id: 'openai', kind: 'core', protocol: 'openai' }),
      expect.objectContaining({ id: 'anthropic', kind: 'core', protocol: 'anthropic' }),
      expect.objectContaining({ id: 'gemini', kind: 'core', protocol: 'gemini' }),
    ]);
    expect(catalog.filter((item) => item.kind === 'preset')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'groq', kind: 'preset', protocol: 'openai' }),
        expect.objectContaining({ id: 'openrouter', kind: 'preset', protocol: 'openai' }),
      ]),
    );
  });

  it('stores providers, hydrates models and updates capabilities', () => {
    const service = new AiManagementService(new AiProviderSettingsService());

    const provider = service.upsertProvider('groq', {
      apiKey: 'groq-key',
      driver: 'groq',
      mode: 'catalog',
      models: ['llama-3.3-70b', 'llama-3.1-8b'],
      name: 'Groq',
    });

    expect(provider).toMatchObject({
      defaultModel: 'llama-3.3-70b-versatile',
      driver: 'groq',
      id: 'groq',
      mode: 'catalog',
      models: ['llama-3.3-70b', 'llama-3.1-8b'],
      name: 'Groq',
    });
    expect(service.listProviders()).toEqual([
      expect.objectContaining({
        available: true,
        id: 'groq',
        modelCount: 2,
      }),
    ]);
    expect(service.listModels('groq')).toEqual([
      expect.objectContaining({ id: 'llama-3.3-70b', providerId: 'groq' }),
      expect.objectContaining({ id: 'llama-3.1-8b', providerId: 'groq' }),
    ]);
    expect(
      service.updateModelCapabilities('groq', 'llama-3.3-70b', {
        input: { image: true },
        reasoning: true,
      }),
    ).toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          input: expect.objectContaining({ image: true }),
          reasoning: true,
        }),
      }),
    );
  });

  it('returns configured models when discovery cannot call a remote provider', async () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('ds2api', {
      driver: 'openai',
      mode: 'protocol',
      models: ['deepseek-chat'],
      name: 'ds2api',
    });

    await expect(service.discoverModels('ds2api')).resolves.toEqual([
      { id: 'deepseek-chat', name: 'deepseek-chat' },
    ]);
  });

  it('surfaces provider discovery failures as bad gateway errors', async () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('groq', {
      apiKey: 'groq-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      driver: 'groq',
      mode: 'catalog',
      models: ['llama-3.3-70b'],
      name: 'Groq',
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(service.discoverModels('groq')).rejects.toThrow(BadGatewayException);

    fetchSpy.mockRestore();
  });

  it('uses explicit, default or first model when testing provider connections', async () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('openrouter', {
      apiKey: 'router-key',
      driver: 'openrouter',
      mode: 'catalog',
      models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
      name: 'OpenRouter',
    });

    await expect(service.testConnection('openrouter', 'anthropic/claude-3.5-sonnet')).resolves.toEqual({
      ok: true,
      providerId: 'openrouter',
      modelId: 'anthropic/claude-3.5-sonnet',
      text: 'OK',
    });
    await expect(service.testConnection('openrouter')).resolves.toEqual({
      ok: true,
      providerId: 'openrouter',
      modelId: 'openai/gpt-4o',
      text: 'OK',
    });
  });

  it('rejects connection tests when no model is available', async () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('empty', {
      driver: 'openai',
      mode: 'protocol',
      models: [],
      name: 'Empty',
    });

    await expect(service.testConnection('empty')).rejects.toThrow(BadRequestException);
  });
});
