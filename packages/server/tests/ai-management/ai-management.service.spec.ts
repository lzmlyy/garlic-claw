import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { AiManagementService } from '../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';
import * as settingsStore from '../../src/ai-management/ai-management-settings.store';
import type { AiSettingsFile } from '../../src/ai-management/ai-management.types';

jest.mock('../../src/ai-management/ai-management-settings.store', () => {
  const settings: AiSettingsFile = {
    models: [],
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
      settings.models = next.models.map((model) => ({
        ...model,
        capabilities: {
          ...model.capabilities,
          input: { ...model.capabilities.input },
          output: { ...model.capabilities.output },
        },
      }));
      settings.providers = next.providers.map((provider) => ({ ...provider, models: [...provider.models] }));
      settings.visionFallback = { ...next.visionFallback };
      settings.hostModelRouting = JSON.parse(JSON.stringify(next.hostModelRouting));
    }),
  };
});

describe('AiManagementService', () => {
  beforeEach(() => {
    const loadAiSettings = settingsStore.loadAiSettings as unknown as jest.Mock<AiSettingsFile, []>;
    loadAiSettings().models = [];
    loadAiSettings().providers = [];
    loadAiSettings().visionFallback = {
      enabled: false,
    };
    loadAiSettings().hostModelRouting = {
      fallbackChatModels: [],
      utilityModelRoles: {},
    };
    jest.restoreAllMocks();
  });

  it('keeps only the three core protocol catalog entries', () => {
    const service = new AiManagementService(new AiProviderSettingsService());

    const catalog = service.listProviderCatalog();

    expect(catalog).toEqual([
      expect.objectContaining({ id: 'openai', kind: 'core', protocol: 'openai' }),
      expect.objectContaining({ id: 'anthropic', kind: 'core', protocol: 'anthropic' }),
      expect.objectContaining({ id: 'gemini', kind: 'core', protocol: 'gemini' }),
    ]);
  });

  it('stores model metadata persistently, including capabilities and context length', () => {
    const service = new AiManagementService(new AiProviderSettingsService());

    const provider = service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      driver: 'openai',
      mode: 'catalog',
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      name: 'OpenAI',
    });

    expect(provider).toMatchObject({
      defaultModel: 'gpt-4o-mini',
      driver: 'openai',
      id: 'openai-main',
      mode: 'catalog',
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      name: 'OpenAI',
    });
    expect(service.listProviders()).toEqual([
      expect.objectContaining({
        available: true,
        id: 'openai-main',
        modelCount: 2,
      }),
    ]);
    expect(service.listModels('openai-main')).toEqual([
      expect.objectContaining({ contextLength: 128 * 1024, id: 'gpt-4o-mini', providerId: 'openai-main' }),
      expect.objectContaining({ contextLength: 128 * 1024, id: 'gpt-4.1-mini', providerId: 'openai-main' }),
    ]);
    expect(
      service.upsertModel('openai-main', 'gpt-4o-mini', {
        capabilities: {
          input: { image: true },
          reasoning: true,
        },
        contextLength: 256 * 1024,
      }),
    ).toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          input: expect.objectContaining({ image: true }),
          reasoning: true,
        }),
        contextLength: 256 * 1024,
      }),
    );

    const reloaded = new AiManagementService(new AiProviderSettingsService());
    expect(reloaded.getProviderModel('openai-main', 'gpt-4o-mini')).toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          input: expect.objectContaining({ image: true }),
          reasoning: true,
        }),
        contextLength: 256 * 1024,
        id: 'gpt-4o-mini',
        providerId: 'openai-main',
      }),
    );
  });

  it('removes stale persisted model metadata when a provider model list is replaced', () => {
    const providerSettings = new AiProviderSettingsService();
    const service = new AiManagementService(providerSettings);

    service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      driver: 'openai',
      mode: 'catalog',
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      name: 'OpenAI',
    });
    service.listModels('openai-main');
    service.upsertModel('openai-main', 'gpt-4o-mini', {
      contextLength: 256 * 1024,
    });

    service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      driver: 'openai',
      mode: 'catalog',
      models: ['gpt-4.1-mini'],
      name: 'OpenAI',
    });

    expect(providerSettings.listPersistedModels('openai-main').map((entry) => entry.id)).toEqual(['gpt-4.1-mini']);

    service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      driver: 'openai',
      mode: 'catalog',
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      name: 'OpenAI',
    });

    expect(service.getProviderModel('openai-main', 'gpt-4o-mini')).toEqual(
      expect.objectContaining({
        contextLength: 128 * 1024,
        id: 'gpt-4o-mini',
        providerId: 'openai-main',
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
    service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      baseUrl: 'https://api.openai.com/v1',
      driver: 'openai',
      mode: 'catalog',
      models: ['gpt-4o-mini'],
      name: 'OpenAI',
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(service.discoverModels('openai-main')).rejects.toThrow(BadGatewayException);

    fetchSpy.mockRestore();
  });

  it('uses explicit, default or first model when testing provider connections', async () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('anthropic-main', {
      apiKey: 'anthropic-key',
      driver: 'anthropic',
      mode: 'catalog',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
      name: 'Anthropic',
    });

    await expect(service.testConnection('anthropic-main', 'claude-3-7-sonnet-20250219')).resolves.toEqual({
      ok: true,
      providerId: 'anthropic-main',
      modelId: 'claude-3-7-sonnet-20250219',
      text: 'OK',
    });
    await expect(service.testConnection('anthropic-main')).resolves.toEqual({
      ok: true,
      providerId: 'anthropic-main',
      modelId: 'claude-3-5-sonnet-20241022',
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
