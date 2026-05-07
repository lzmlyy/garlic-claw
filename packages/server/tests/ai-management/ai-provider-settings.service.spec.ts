import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiProviderSettingsService } from '../../src/modules/ai-management/ai-provider-settings.service';

describe('AiProviderSettingsService runtime config', () => {
  const tempSettingsPath = path.join(
    process.cwd(),
    'tmp',
    'ai-provider-settings.service.spec',
  );
  const envKey = 'GARLIC_CLAW_AI_SETTINGS_PATH';

  afterEach(() => {
    delete process.env[envKey];

    fs.rmSync(tempSettingsPath, { force: true, recursive: true });
  });

  it('defaults to the repository root config/ai directory when no environment variable is set', () => {
    const workspaceRoot = path.join(os.tmpdir(), `ai-provider-settings.workspace-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const defaultConfigRoot = path.join(workspaceRoot, 'config', 'ai');
    const originalCwd = process.cwd();
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    fs.mkdirSync(path.join(defaultConfigRoot, 'providers'), { recursive: true });
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'ai-config-test' }), 'utf-8');
    fs.writeFileSync(path.join(nestedServerRoot, 'package.json'), JSON.stringify({ name: 'ai-config-test-server' }), 'utf-8');
    fs.writeFileSync(path.join(defaultConfigRoot, 'providers', 'openai.json'), JSON.stringify({
      id: 'openai',
      name: 'OpenAI',
      driver: 'openai',
      apiKey: 'test-openai-key',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4',
      models: ['gpt-5.4'],
      persistedModels: [],
    }, null, 2), 'utf-8');

    delete process.env[envKey];
    delete process.env.JEST_WORKER_ID;
    process.chdir(nestedServerRoot);

    try {
      const service = new AiProviderSettingsService();
      expect(service.listProviders()).toEqual([
        expect.objectContaining({
          id: 'openai',
          name: 'OpenAI',
        }),
      ]);
      expect(fs.existsSync(path.join(defaultConfigRoot, 'providers', 'openai.json'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      if (originalJestWorkerId) {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('migrates legacy ui-written providers from the old single-file storage into per-provider json files', () => {
    const workspaceRoot = path.join(os.tmpdir(), `ai-provider-settings.legacy-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const configRoot = path.join(workspaceRoot, 'config', 'ai');
    const providerRoot = path.join(configRoot, 'providers');
    const legacyFilePath = path.join(workspaceRoot, 'packages', 'server', 'tmp', 'ai-settings.server.json');
    const originalCwd = process.cwd();
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    fs.mkdirSync(providerRoot, { recursive: true });
    fs.mkdirSync(path.dirname(legacyFilePath), { recursive: true });
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'ai-config-legacy-test' }), 'utf-8');
    fs.writeFileSync(path.join(nestedServerRoot, 'package.json'), JSON.stringify({ name: 'ai-config-legacy-test-server' }), 'utf-8');
    fs.writeFileSync(path.join(providerRoot, 'openai.json'), JSON.stringify({
      id: 'openai',
      name: 'OpenAI',
      driver: 'openai',
      apiKey: 'current-openai-key',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4',
      models: ['gpt-5.4'],
      persistedModels: [],
    }, null, 2), 'utf-8');
    fs.writeFileSync(legacyFilePath, JSON.stringify({
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          driver: 'openai',
          apiKey: 'legacy-openai-key',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-5.4',
          models: ['gpt-5.4'],
        },
        {
          id: 'nvidia',
          name: 'nvidia',
          driver: 'openai',
          apiKey: 'legacy-nvidia-key',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          defaultModel: 'openai/gpt-oss-20b',
          models: ['openai/gpt-oss-20b'],
        },
      ],
      models: [
        {
          capabilities: {
            reasoning: false,
            toolCall: true,
            input: { text: true, image: false },
            output: { text: true, image: false },
          },
          contextLength: 131072,
          id: 'openai/gpt-oss-20b',
          name: 'openai/gpt-oss-20b',
          providerId: 'nvidia',
          status: 'active',
        },
      ],
      visionFallback: { enabled: false },
      hostModelRouting: { fallbackChatModels: [], utilityModelRoles: {} },
    }, null, 2), 'utf-8');

    delete process.env[envKey];
    delete process.env.JEST_WORKER_ID;
    process.chdir(nestedServerRoot);

    try {
      const service = new AiProviderSettingsService();

      expect(service.listProviders()).toEqual([
        expect.objectContaining({ id: 'nvidia', name: 'nvidia' }),
        expect.objectContaining({ id: 'openai', name: 'OpenAI' }),
      ]);
      expect(JSON.parse(fs.readFileSync(path.join(providerRoot, 'openai.json'), 'utf-8'))).toEqual(expect.objectContaining({
        id: 'openai',
        apiKey: 'current-openai-key',
        baseUrl: 'https://api.openai.com/v1',
      }));
      expect(JSON.parse(fs.readFileSync(path.join(providerRoot, 'nvidia.json'), 'utf-8'))).toEqual(expect.objectContaining({
        id: 'nvidia',
        apiKey: 'legacy-nvidia-key',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      }));
      expect(fs.existsSync(`${legacyFilePath}.migrated`)).toBe(true);
      expect(fs.existsSync(legacyFilePath)).toBe(false);
    } finally {
      process.chdir(originalCwd);
      if (originalJestWorkerId) {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('persists host model routing config into the shared ai settings file', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new AiProviderSettingsService();
    service.updateHostModelRoutingConfig({
      chatAutoRetry: {
        backoffFactor: 3,
        enabled: true,
        initialDelayMs: 1500,
        maxDelayMs: 45000,
        maxRetries: 4,
      },
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
      chatAutoRetry: {
        backoffFactor: 3,
        enabled: true,
        initialDelayMs: 1500,
        maxDelayMs: 45000,
        maxRetries: 4,
      },
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

  it('archives a legacy single-file config even when structured settings already contain the same data', () => {
    const workspaceRoot = path.join(os.tmpdir(), `ai-provider-settings.archive-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const configRoot = path.join(workspaceRoot, 'config', 'ai');
    const providerRoot = path.join(configRoot, 'providers');
    const legacyFilePath = path.join(workspaceRoot, 'packages', 'server', 'tmp', 'ai-settings.server.json');
    const originalCwd = process.cwd();
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    const providerPayload = {
      id: 'openai',
      name: 'OpenAI',
      driver: 'openai',
      apiKey: 'same-openai-key',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4',
      models: ['gpt-5.4'],
      persistedModels: [],
    };
    fs.mkdirSync(providerRoot, { recursive: true });
    fs.mkdirSync(path.dirname(legacyFilePath), { recursive: true });
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'ai-config-archive-test' }), 'utf-8');
    fs.writeFileSync(path.join(nestedServerRoot, 'package.json'), JSON.stringify({ name: 'ai-config-archive-test-server' }), 'utf-8');
    fs.writeFileSync(path.join(providerRoot, 'openai.json'), JSON.stringify(providerPayload, null, 2), 'utf-8');
    fs.writeFileSync(legacyFilePath, JSON.stringify({
      providers: [{ ...providerPayload }],
      models: [],
      visionFallback: { enabled: false },
      hostModelRouting: { fallbackChatModels: [], utilityModelRoles: {} },
    }, null, 2), 'utf-8');

    delete process.env[envKey];
    delete process.env.JEST_WORKER_ID;
    process.chdir(nestedServerRoot);

    try {
      const service = new AiProviderSettingsService();

      expect(service.listProviders()).toEqual([
        expect.objectContaining({ id: 'openai', name: 'OpenAI' }),
      ]);
      expect(fs.existsSync(`${legacyFilePath}.migrated`)).toBe(true);
      expect(fs.existsSync(legacyFilePath)).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(providerRoot, 'openai.json'), 'utf-8'))).toEqual(providerPayload);
    } finally {
      process.chdir(originalCwd);
      if (originalJestWorkerId) {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('marks placeholder api keys as unavailable and prefers real configured providers', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new AiProviderSettingsService();
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

    expect(service.listProviders()).toEqual([
      expect.objectContaining({ available: false, id: 'anthropic' }),
      expect.objectContaining({ available: true, id: 'ds2api' }),
    ]);
    expect(service.readPreferredProvider()).toEqual(expect.objectContaining({
      id: 'ds2api',
      defaultModel: 'deepseek-v4-flash',
    }));
  });
});
