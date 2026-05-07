import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { AiManagementService } from '../../src/modules/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../src/modules/ai-management/ai-provider-settings.service';
import * as settingsStore from '../../src/modules/ai-management/ai-settings.store';
import type { AiSettingsFile } from '../../src/modules/ai-management/ai-management.types';

jest.mock('../../src/modules/ai-management/ai-settings.store', () => {
  const settings: AiSettingsFile = {
    defaultSelection: null,
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
    cloneDefaultSelection: jest.fn((selection) => selection ? { ...selection } : null),
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
      settings.defaultSelection = next.defaultSelection ? { ...next.defaultSelection } : null;
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
    loadAiSettings().defaultSelection = null;
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
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      name: 'OpenAI',
    });

    expect(provider).toMatchObject({
      defaultModel: 'gpt-4o-mini',
      driver: 'openai',
      id: 'openai-main',
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
      models: ['gpt-4.1-mini'],
      name: 'OpenAI',
    });

    expect(providerSettings.listPersistedModels('openai-main').map((entry) => entry.id)).toEqual(['gpt-4.1-mini']);

    service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      driver: 'openai',
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
    const aiModelExecutionService = {
      generateText: jest.fn().mockResolvedValue({ text: 'Generated response' }),
    };
    const service = new AiManagementService(new AiProviderSettingsService(), aiModelExecutionService as never);
    service.upsertProvider('anthropic-main', {
      apiKey: 'anthropic-key',
      driver: 'anthropic',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
      name: 'Anthropic',
    });

    await expect(service.testConnection('anthropic-main', 'claude-3-7-sonnet-20250219')).resolves.toEqual({
      ok: true,
      providerId: 'anthropic-main',
      modelId: 'claude-3-7-sonnet-20250219',
      text: 'Generated response',
    });
    await expect(service.testConnection('anthropic-main')).resolves.toEqual({
      ok: true,
      providerId: 'anthropic-main',
      modelId: 'claude-3-5-sonnet-20241022',
      text: 'Generated response',
    });
    expect(aiModelExecutionService.generateText).toHaveBeenNthCalledWith(1, expect.objectContaining({
      modelId: 'claude-3-7-sonnet-20250219',
      providerId: 'anthropic-main',
      transportMode: 'stream-collect',
    }));
    expect(aiModelExecutionService.generateText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      modelId: 'claude-3-5-sonnet-20241022',
      providerId: 'anthropic-main',
      transportMode: 'stream-collect',
    }));
  });

  it('rejects connection tests when no model is available', async () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('empty', {
      driver: 'openai',
      models: [],
      name: 'Empty',
    });

    await expect(service.testConnection('empty')).rejects.toThrow(BadRequestException);
  });

  it('prefers a real configured provider over placeholder providers when choosing defaults', () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('anthropic', {
      apiKey: 'YOUR_ANTHROPIC_API_KEY',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-5-sonnet-20241022',
      driver: 'anthropic',
      models: ['claude-3-5-sonnet-20241022'],
      name: 'Anthropic',
    });
    service.upsertProvider('ds2api', {
      apiKey: 'sk-real-ds2api-key',
      baseUrl: 'https://dsapi.cyberlangke.dpdns.org/v1',
      defaultModel: 'deepseek-v4-flash',
      driver: 'openai',
      models: ['deepseek-v4-flash'],
      name: 'ds2api',
    });

    expect(service.getDefaultProviderSelection()).toEqual({
      modelId: 'deepseek-v4-flash',
      providerId: 'ds2api',
      source: 'default',
    });
  });

  it('pins new conversations to the explicitly changed default model', () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('openai-main', {
      apiKey: 'openai-key',
      driver: 'openai',
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      name: 'OpenAI',
    });

    service.setDefaultModel('openai-main', 'gpt-4.1-mini');

    expect(service.getDefaultProviderSelection()).toEqual({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai-main',
      source: 'default',
    });
  });

  it('writes an explicit global default selection that new conversations can reuse', () => {
    const service = new AiManagementService(new AiProviderSettingsService());
    service.upsertProvider('ds2api', {
      apiKey: 'sk-real-ds2api-key',
      driver: 'openai',
      models: ['deepseek-v4-flash'],
      name: 'ds2api',
    });
    service.upsertProvider('nvidia', {
      apiKey: 'nvapi-real-key',
      driver: 'openai',
      models: ['openai/gpt-oss-20b'],
      name: 'nvidia',
    });

    expect(service.setDefaultProviderSelection('nvidia', 'openai/gpt-oss-20b')).toEqual({
      modelId: 'openai/gpt-oss-20b',
      providerId: 'nvidia',
      source: 'default',
    });
    expect(service.getDefaultProviderSelection()).toEqual({
      modelId: 'openai/gpt-oss-20b',
      providerId: 'nvidia',
      source: 'default',
    });
  });

  it('surfaces real provider connection failures instead of returning fake success', async () => {
    const aiModelExecutionService = {
      generateText: jest.fn().mockRejectedValue(new Error('Client network socket disconnected before secure TLS connection was established')),
    };
    const service = new AiManagementService(new AiProviderSettingsService(), aiModelExecutionService as never);
    service.upsertProvider('ds2api', {
      apiKey: 'sk-real-ds2api-key',
      baseUrl: 'https://dsapi.cyberlangke.dpdns.org/v1',
      defaultModel: 'deepseek-v4-flash',
      driver: 'openai',
      models: ['deepseek-v4-flash'],
      name: 'ds2api',
    });

    await expect(service.testConnection('ds2api')).rejects.toThrow(BadGatewayException);
    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'deepseek-v4-flash',
      providerId: 'ds2api',
      transportMode: 'stream-collect',
    }));
  });
});
