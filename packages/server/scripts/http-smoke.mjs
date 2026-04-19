import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const SERVER_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(SERVER_DIR, '..', '..');
const DEFAULT_TIMEOUT_MS = 20_000;
const STARTUP_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const LOGIN_SECRET = process.env.GARLIC_CLAW_LOGIN_SECRET || 'smoke-login-secret';
const API_PREFIX = '/api';
const SKILL_DIR_NAME = '.smoke-http-flow';
const {
  collectServerHttpRoutes,
  collectWebHttpRoutes,
  describeRoutes,
  findUncoveredServerRoutes,
  findUnmatchedWebRoutes,
} = require('./http-route-contract.cjs');

process.env.NO_PROXY = [
  process.env.NO_PROXY,
  '127.0.0.1',
  'localhost',
  '::1',
]
  .filter(Boolean)
  .join(',');

const visitedHttpRoutes = [];

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const serverRoutes = collectServerHttpRoutes(PROJECT_ROOT);
  const webRoutes = collectWebHttpRoutes(PROJECT_ROOT);
  const tempRoot = path.join(SERVER_DIR, 'tmp');
  await fsPromises.mkdir(tempRoot, { recursive: true });
  const tempDir = await fsPromises.mkdtemp(path.join(tempRoot, 'http-smoke-'));
  const databasePath = cli.proxyOrigin ? null : path.join(tempDir, 'smoke.sqlite');
  const databaseUrl = databasePath ? buildRelativeSqliteUrl(databasePath) : null;
  const port = cli.proxyOrigin ? null : await getFreePort();
  const wsPort = cli.proxyOrigin ? null : await getFreePort();
  const skillRoot = path.join(SERVER_DIR, 'skills', SKILL_DIR_NAME);
  const fakeOpenAi = await startFakeOpenAiServer();
  const smokeSkillId = 'project/.smoke-http-flow';
  const mcpScriptPath = path.join(tempDir, 'working-mcp.cjs');
  const remotePluginScriptPath = path.join(tempDir, 'remote-route-plugin.cjs');
  const serverFiles = {
    aiSettingsPath: path.join(tempDir, 'ai-settings.server.json'),
    automationsPath: path.join(tempDir, 'automations.server.json'),
    conversationsPath: path.join(tempDir, 'conversations.server.json'),
    mcpConfigPath: path.join(tempDir, 'mcp', 'mcp.json'),
    personasPath: path.join(tempDir, 'persona'),
    subagentTasksPath: path.join(tempDir, 'subagent-tasks.server.json'),
  };
  const state = {
    adminTokens: null,
    automationId: null,
    automationSubagentTaskId: null,
    bootstrapTokens: null,
    conversationId: null,
    defaultPersonaId: null,
    firstAssistantMessageId: null,
    firstUserMessageId: null,
    managedPersonaId: 'smoke-persona',
    memoryId: null,
    mcpName: 'smoke-mcp',
    modelId: 'smoke-model',
    personaId: null,
    providerId: 'smoke-openai',
    remotePluginId: 'remote.smoke-http',
    remotePluginHandle: null,
    remotePluginCronId: null,
    retriedAssistantMessageId: null,
    skillId: smokeSkillId,
    toolId: null,
    toolSourceId: null,
    userAlias: `smoke-user-${Date.now().toString(36)}`,
    userUpdatedEmail: null,
    proxyHostModelRoutingBackup: undefined,
    proxyOpenAiProviderBackup: undefined,
    proxyOpenAiProviderManaged: false,
    proxyVisionFallbackBackup: undefined,
  };
  let backend = null;
  let apiBase = '';

  try {
    await runStep('contracts.web-alignment', async () => {
      assertWebRoutesMatchServerRoutes(serverRoutes, webRoutes);
    });
    await prepareProjectSkill(skillRoot);
    await prepareWorkingMcpScript(mcpScriptPath);
    await prepareRemoteRoutePluginScript(remotePluginScriptPath);

    if (cli.proxyOrigin) {
      console.log(`-> use frontend proxy ${cli.proxyOrigin}`);
      apiBase = `${normalizeOrigin(cli.proxyOrigin)}${API_PREFIX}`;
      await prepareProxyOpenAiProvider(apiBase, state, fakeOpenAi.url);
    } else {
      console.log('-> build server');
      await runTypescriptBuild();
      await verifyRequiredBuildArtifacts();

      console.log('-> prisma db push');
      await runCommand(process.execPath, [
        resolvePrismaCliEntry(),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        'prisma/schema.prisma',
      ], {
        cwd: SERVER_DIR,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        label: 'prisma db push',
      });

      console.log('-> start backend');
      backend = await startBackend(port, wsPort, databaseUrl, serverFiles);
      apiBase = `http://127.0.0.1:${port}${API_PREFIX}`;
    }

    await runStep('health.get', async () => {
      await verifyHealth(apiBase, backend);
    });
    state.adminTokens = cli.proxyOrigin
      ? await loginDevelopmentAdmin(apiBase)
      : await waitForBootstrapAdminLogin(apiBase);
    state.bootstrapTokens = state.adminTokens;

    await runHttpFlow(apiBase, state, {
      fakeOpenAiUrl: fakeOpenAi.url,
      flowSuffix: state.userAlias,
      mcpCommand: process.execPath,
      mcpScriptPath,
      personasPath: serverFiles.personasPath,
      remotePluginScriptPath,
      smokeSkillId,
    });
    await runStep('contracts.server-route-coverage', async () => {
      assertAllServerRoutesCovered(serverRoutes);
    });

    console.log(`server HTTP smoke passed: ${getCompletedStepCount()} checks`);
  } catch (error) {
    if (backend?.logs.length) {
      console.error('--- server logs ---');
      console.error(backend.logs.join(''));
      console.error('--- end server logs ---');
    }
    throw error;
  } finally {
    await Promise.allSettled([
      cli.proxyOrigin && state.proxyOpenAiProviderManaged
        ? restoreProxyOpenAiProvider(apiBase, state)
        : Promise.resolve(),
      state.remotePluginHandle?.stop?.() ?? Promise.resolve(),
      backend?.stop?.() ?? Promise.resolve(),
      fakeOpenAi.close(),
      fsPromises.rm(skillRoot, { recursive: true, force: true }),
      fsPromises.rm(tempDir, { recursive: true, force: true }),
    ]);
  }
}

async function runHttpFlow(apiBase, state, input) {
  const adminHeaders = () => createBearerHeaders(readTokens(state.adminTokens).accessToken);
  const userHeaders = adminHeaders;
  const managedPersonaDirectory = path.join(input.personasPath, encodeURIComponent(state.managedPersonaId));
  const managedPersonaAvatarPath = path.join(managedPersonaDirectory, 'avatar.svg');

  await runStep('ai.provider-catalog', async () => {
    const catalog = await getJson(apiBase, '/ai/provider-catalog');
    ensure(Array.isArray(catalog) && catalog.length > 0, 'Expected provider catalog to be non-empty');
  });

  await runStep('ai.providers.list.initial', async () => {
    const providers = await getJson(apiBase, '/ai/providers');
    ensure(Array.isArray(providers), 'Expected providers list to be an array');
  });

  await runStep('ai.provider.upsert', async () => {
    const provider = await putJson(apiBase, `/ai/providers/${state.providerId}`, {
      body: {
        apiKey: 'smoke-openai-key',
        baseUrl: input.fakeOpenAiUrl,
        defaultModel: state.modelId,
        driver: 'openai',
        mode: 'protocol',
        models: [state.modelId, 'smoke-vision'],
        name: 'Smoke OpenAI',
      },
    });
    ensure(provider.id === state.providerId, 'Expected upserted provider id to match');
  });

  await runStep('ai.providers.list', async () => {
    const providers = await getJson(apiBase, '/ai/providers');
    ensure(providers.some((entry) => entry.id === state.providerId), 'Expected providers list to include smoke provider');
  });

  await runStep('ai.provider.get', async () => {
    const provider = await getJson(apiBase, `/ai/providers/${state.providerId}`);
    ensure(provider.id === state.providerId, 'Expected provider detail to match smoke provider');
  });

  await runStep('ai.models.list', async () => {
    const models = await getJson(apiBase, `/ai/providers/${state.providerId}/models`);
    ensure(Array.isArray(models) && models.some((entry) => entry.id === state.modelId), 'Expected models list to include default model');
  });

  await runStep('ai.discover-models', async () => {
    const models = await postJson(apiBase, `/ai/providers/${state.providerId}/discover-models`);
    ensure(Array.isArray(models) && models.some((entry) => entry.id === state.modelId), 'Expected discovered models to include fake model');
  });

  await runStep('ai.model.upsert', async () => {
    const model = await postJson(apiBase, `/ai/providers/${state.providerId}/models/smoke-extra`, {
      body: {
        capabilities: {
          input: {
            image: true,
          },
        },
        contextLength: 65_536,
        name: 'Smoke Extra',
      },
    });
    ensure(model.id === 'smoke-extra', 'Expected extra model to be created');
    ensure(model.contextLength === 65_536, 'Expected explicit context length to persist on model upsert');
  });

  await runStep('ai.model.context-length', async () => {
    const models = await getJson(apiBase, `/ai/providers/${state.providerId}/models`);
    const extraModel = models.find((entry) => entry.id === 'smoke-extra');
    ensure(extraModel?.contextLength === 65_536, 'Expected model list to expose persisted context length');
  });

  await runStep('ai.default-model', async () => {
    const provider = await putJson(apiBase, `/ai/providers/${state.providerId}/default-model`, {
      body: {
        modelId: state.modelId,
      },
    });
    ensure(provider.defaultModel === state.modelId, 'Expected default model update to persist');
  });

  await runStep('ai.model.capabilities', async () => {
    const model = await putJson(apiBase, `/ai/providers/${state.providerId}/models/${state.modelId}/capabilities`, {
      body: {
        input: {
          image: true,
        },
        reasoning: true,
      },
    });
    ensure(model.capabilities.reasoning === true, 'Expected model capability update to persist');
  });

  await runStep('ai.test-connection', async () => {
    const result = await postJson(apiBase, `/ai/providers/${state.providerId}/test-connection`, {
      body: {
        modelId: state.modelId,
      },
    });
    ensure(result.ok === true && result.modelId === state.modelId, 'Expected connection test to succeed');
  });

  await runStep('ai.vision-fallback.get', async () => {
    const config = await getJson(apiBase, '/ai/vision-fallback');
    ensure(typeof config.enabled === 'boolean', 'Expected vision fallback config');
  });

  await runStep('ai.vision-fallback.put', async () => {
    const config = await putJson(apiBase, '/ai/vision-fallback', {
      body: {
        enabled: true,
        maxDescriptionLength: 120,
        modelId: 'smoke-vision',
        prompt: 'Describe this image for smoke',
        providerId: state.providerId,
      },
    });
    ensure(config.enabled === true, 'Expected vision fallback update to persist');
  });

  await runStep('ai.host-model-routing.get', async () => {
    const routing = await getJson(apiBase, '/ai/host-model-routing');
    ensure(Array.isArray(routing.fallbackChatModels), 'Expected host routing config');
  });

  await runStep('ai.host-model-routing.put', async () => {
    const routing = await putJson(apiBase, '/ai/host-model-routing', {
      body: {
        fallbackChatModels: [{ modelId: state.modelId, providerId: state.providerId }],
        utilityModelRoles: {
          conversationTitle: { modelId: state.modelId, providerId: state.providerId },
        },
      },
    });
    ensure(Array.isArray(routing.fallbackChatModels) && routing.fallbackChatModels.length === 1, 'Expected host routing update to persist');
  });

  await runStep('skills.list', async () => {
    const skills = await getJson(apiBase, '/skills');
    ensure(Array.isArray(skills) && skills.some((entry) => entry.id === input.smokeSkillId), 'Expected smoke skill to be discoverable');
  });

  await runStep('skills.refresh', async () => {
    const skills = await postJson(apiBase, '/skills/refresh');
    ensure(Array.isArray(skills) && skills.some((entry) => entry.id === input.smokeSkillId), 'Expected refresh to retain smoke skill');
  });

  await runStep('skills.governance', async () => {
    const detail = await putJson(apiBase, `/skills/${encodeURIComponent(input.smokeSkillId)}/governance`, {
      body: {
        trustLevel: 'asset-read',
      },
    });
    ensure(detail.governance?.trustLevel === 'asset-read', 'Expected skill governance update to persist');
  });

  await runStep('chat.conversation.create', async () => {
    const conversation = await postJson(apiBase, '/chat/conversations', {
      body: {
        title: 'Smoke Chat',
      },
      headers: userHeaders(),
    });
    state.conversationId = conversation.id;
    ensure(typeof state.conversationId === 'string', 'Expected conversation id');
  });

  await runStep('chat.conversation.list', async () => {
    const conversations = await getJson(apiBase, '/chat/conversations', { headers: userHeaders() });
    ensure(Array.isArray(conversations) && conversations.some((entry) => entry.id === state.conversationId), 'Expected conversation list to include smoke conversation');
  });

  await runStep('chat.conversation.get', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    ensure(conversation.id === state.conversationId, 'Expected conversation detail to match');
  });

  await runStep('chat.services.get', async () => {
    const services = await getJson(apiBase, `/chat/conversations/${state.conversationId}/services`, { headers: userHeaders() });
    ensure(typeof services.llmEnabled === 'boolean', 'Expected conversation services payload');
  });

  await runStep('chat.services.put', async () => {
    const services = await putJson(apiBase, `/chat/conversations/${state.conversationId}/services`, {
      body: {
        llmEnabled: true,
        sessionEnabled: true,
        ttsEnabled: false,
      },
      headers: userHeaders(),
    });
    ensure(services.ttsEnabled === false, 'Expected conversation services update to persist');
  });

  await runStep('chat.skills.get', async () => {
    const skillState = await getJson(apiBase, `/chat/conversations/${state.conversationId}/skills`, { headers: userHeaders() });
    ensure(Array.isArray(skillState.activeSkillIds), 'Expected conversation skills payload');
  });

  await runStep('chat.skills.put', async () => {
    const skillState = await putJson(apiBase, `/chat/conversations/${state.conversationId}/skills`, {
      body: {
        activeSkillIds: [input.smokeSkillId],
      },
      headers: userHeaders(),
    });
    ensure(skillState.activeSkillIds.includes(input.smokeSkillId), 'Expected conversation to activate smoke skill');
  });

  await runStep('personas.list', async () => {
    const personas = await getJson(apiBase, '/personas');
    ensure(Array.isArray(personas) && personas.length > 0, 'Expected personas list to be non-empty');
    state.defaultPersonaId = personas.find((entry) => entry.isDefault)?.id ?? personas[0].id;
    state.personaId = state.defaultPersonaId;
  });

  await runStep('personas.current.get', async () => {
    const persona = await getJson(apiBase, `/personas/current?conversationId=${state.conversationId}`, { headers: userHeaders() });
    ensure(typeof persona.personaId === 'string', 'Expected current persona payload');
    ensure(persona.personaId === state.defaultPersonaId, 'Expected conversation to use default persona before custom activation');
  });

  await runStep('personas.create', async () => {
    const persona = await postJson(apiBase, '/personas', {
      body: {
        beginDialogs: [
          { content: '先给出结构化提纲。', role: 'assistant' },
        ],
        customErrorMessage: '烟测 persona 暂时不可用',
        description: '用于后端烟测的人设',
        id: state.managedPersonaId,
        name: 'Smoke Persona',
        prompt: '你是一个用于后端烟测的 persona。',
        skillIds: [input.smokeSkillId],
        toolNames: [],
      },
      headers: userHeaders(),
    });
    ensure(persona.id === state.managedPersonaId, 'Expected persona create to persist requested id');
  });

  await runStep('personas.avatar.prepare', async () => {
    await fsPromises.mkdir(managedPersonaDirectory, { recursive: true });
    await fsPromises.writeFile(
      managedPersonaAvatarPath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#111"/><text x="8" y="11" fill="#fff" font-size="8" text-anchor="middle">S</text></svg>',
      'utf8',
    );
  });

  await runStep('personas.avatar.get', async () => {
    const avatar = await getJson(apiBase, `/personas/${state.managedPersonaId}/avatar`);
    ensure(typeof avatar === 'string' && avatar.includes('<svg'), 'Expected persona avatar endpoint to return svg content');
  });

  await runStep('personas.get', async () => {
    const persona = await getJson(apiBase, `/personas/${state.managedPersonaId}`);
    ensure(persona.id === state.managedPersonaId, 'Expected persona detail to match created persona');
    ensure(persona.beginDialogs?.[0]?.content === '先给出结构化提纲。', 'Expected persona detail to include begin dialogs');
  });

  await runStep('personas.update', async () => {
    const persona = await putJson(apiBase, `/personas/${state.managedPersonaId}`, {
      body: {
        beginDialogs: [
          { content: '先列出两个候选方案。', role: 'assistant' },
        ],
        customErrorMessage: '更新后的烟测 persona 暂时不可用',
        description: '更新后的烟测 persona',
        name: 'Smoke Persona Updated',
        prompt: '你是更新后的后端烟测 persona。',
        skillIds: [],
        toolNames: [input.smokeSkillId],
      },
      headers: userHeaders(),
    });
    ensure(persona.name === 'Smoke Persona Updated', 'Expected persona update to persist latest name');
    ensure(persona.toolNames?.includes(input.smokeSkillId), 'Expected persona update to persist latest tool names');
  });

  await runStep('personas.current.put', async () => {
    const persona = await putJson(apiBase, '/personas/current', {
      body: {
        conversationId: state.conversationId,
        personaId: state.managedPersonaId,
      },
      headers: userHeaders(),
    });
    state.personaId = persona.personaId;
    ensure(persona.personaId === state.managedPersonaId, 'Expected persona activation to persist');
    ensure(persona.source === 'conversation', 'Expected persona activation to report conversation source');
  });

  await runStep('personas.delete', async () => {
    const result = await deleteJson(apiBase, `/personas/${state.managedPersonaId}`, { headers: userHeaders() });
    ensure(result.deletedPersonaId === state.managedPersonaId, 'Expected persona delete response to include deleted id');
    ensure(result.fallbackPersonaId === state.defaultPersonaId, 'Expected persona delete to report default fallback');
    ensure(result.reassignedConversationCount >= 1, 'Expected persona delete to reassign the smoke conversation');
    state.personaId = result.fallbackPersonaId;
  });

  await runStep('personas.current.get.after-delete', async () => {
    const persona = await getJson(apiBase, `/personas/current?conversationId=${state.conversationId}`, { headers: userHeaders() });
    ensure(persona.personaId === state.defaultPersonaId, 'Expected current persona to fall back to default after delete');
  });

  await runStep('chat.messages.send', async () => {
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '烟测第一条消息',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.firstAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    state.firstUserMessageId = startEvent?.userMessage?.id ?? null;
    ensure(typeof state.firstAssistantMessageId === 'string', 'Expected message-start assistant id');
    ensure(typeof state.firstUserMessageId === 'string', 'Expected message-start user id');
    state.firstAssistantText = assertCompletedSse(events, '本地 smoke 回复: 烟测第一条消息');
    ensure(finishEvent?.status === 'completed', 'Expected send message SSE to finish');
  });

  await runStep('chat.conversation.get.after-send', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const firstAssistant = conversation.messages.find((entry) => entry.id === state.firstAssistantMessageId);
    ensure(firstAssistant?.content === state.firstAssistantText, 'Expected first assistant message to persist generated content');
  });

  await runStep('chat.messages.patch', async () => {
    const message = await patchJson(apiBase, `/chat/conversations/${state.conversationId}/messages/${state.firstUserMessageId}`, {
      body: {
        content: '更新后的用户消息',
      },
      headers: userHeaders(),
    });
    ensure(message.content === '更新后的用户消息', 'Expected user message patch to persist');
  });

  await runStep('chat.messages.retry', async () => {
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages/${state.firstAssistantMessageId}/retry`, {
      body: {
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.retriedAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.retriedAssistantMessageId === 'string', 'Expected retry to create assistant message');
    state.retriedAssistantText = assertCompletedSse(events);
    ensure(finishEvent?.status === 'completed', 'Expected retry SSE to finish');
  });

  await runStep('chat.conversation.get.after-retry', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const updatedUser = conversation.messages.find((entry) => entry.id === state.firstUserMessageId);
    const retriedAssistant = conversation.messages.find((entry) => entry.id === state.retriedAssistantMessageId);
    ensure(updatedUser?.content === '更新后的用户消息', 'Expected patched user message to persist in conversation detail');
    ensure(typeof state.retriedAssistantText === 'string' && state.retriedAssistantText.length > 0, 'Expected retry SSE to produce assistant text');
    ensure(retriedAssistant?.content === state.retriedAssistantText, 'Expected retried assistant message to persist generated content');
  });

  await runStep('chat.messages.stop', async () => {
    const result = await postJson(apiBase, `/chat/conversations/${state.conversationId}/messages/${state.retriedAssistantMessageId}/stop`, {
      headers: userHeaders(),
    });
    ensure(typeof result.message === 'string', 'Expected stop endpoint response');
  });

  await runStep('chat.messages.delete', async () => {
    const result = await deleteJson(apiBase, `/chat/conversations/${state.conversationId}/messages/${state.firstAssistantMessageId}`, { headers: userHeaders() });
    ensure(result.success === true, 'Expected message delete to succeed');
  });

  await runStep('memories.list.recent', async () => {
    const memories = await getJson(apiBase, '/memories', { headers: userHeaders() });
    ensure(Array.isArray(memories), 'Expected memories list payload');
  });

  await runStep('memories.list.search', async () => {
    const memories = await getJson(apiBase, '/memories?q=coffee&limit=10', { headers: userHeaders() });
    ensure(Array.isArray(memories), 'Expected memory search payload');
  });

  await runStep('memories.list.category', async () => {
    const memories = await getJson(apiBase, '/memories?category=general&limit=10', { headers: userHeaders() });
    ensure(Array.isArray(memories), 'Expected memory category payload');
  });

  await runStep('memories.delete', async () => {
    const result = await deleteJson(apiBase, '/memories/memory-missing', { headers: userHeaders() });
    ensure(result.count === 0, 'Expected deleting missing memory to be a no-op');
  });

  await runStep('plugins.list', async () => {
    const plugins = await getJson(apiBase, '/plugins');
    ensure(Array.isArray(plugins) && plugins.some((entry) => entry.id === 'builtin.memory-context'), 'Expected builtin plugin list');
  });

  await runStep('plugins.connected', async () => {
    const plugins = await getJson(apiBase, '/plugins/connected');
    ensure(Array.isArray(plugins) && plugins.some((entry) => entry.name === 'builtin.memory-context'), 'Expected builtin connected plugin list');
  });

  await runStep('plugins.health', async () => {
    const health = await getJson(apiBase, '/plugins/builtin.memory-context/health');
    ensure(health?.status === 'healthy', 'Expected plugin health response');
  });

  await runStep('plugins.config.get', async () => {
    const config = await getJson(apiBase, '/plugins/builtin.memory-context/config');
    ensure(typeof config === 'object' && config !== null, 'Expected plugin config snapshot');
  });

  await runStep('plugins.config.put', async () => {
    const config = await putJson(apiBase, '/plugins/builtin.memory-context/config', {
      body: {
        values: {
          limit: 6,
          promptPrefix: 'Smoke Memory',
        },
      },
    });
    ensure(config.values.limit === 6, 'Expected plugin config update to persist');
  });

  await runStep('plugins.llm-preference.get', async () => {
    const preference = await getJson(apiBase, '/plugins/builtin.memory-context/llm-preference');
    ensure(preference.mode === 'inherit', 'Expected plugin llm preference to default to inherit');
  });

  await runStep('plugins.llm-preference.put', async () => {
    const preference = await putJson(apiBase, '/plugins/builtin.memory-context/llm-preference', {
      body: {
        mode: 'override',
        modelId: state.modelId,
        providerId: state.providerId,
      },
    });
    ensure(preference.mode === 'override', 'Expected plugin llm preference update to persist');
    ensure(preference.providerId === state.providerId && preference.modelId === state.modelId, 'Expected plugin llm preference to store provider/model');
  });

  await runStep('plugins.scopes.get', async () => {
    const scope = await getJson(apiBase, '/plugins/builtin.memory-context/scopes');
    ensure(typeof scope.defaultEnabled === 'boolean', 'Expected plugin scope payload');
  });

  await runStep('plugins.events.get.initial', async () => {
    const events = await getJson(apiBase, '/plugins/builtin.memory-context/events?limit=20');
    ensure(Array.isArray(events.items), 'Expected plugin events payload');
  });

  await runStep('plugins.scopes.put', async () => {
    const scope = await putJson(apiBase, '/plugins/builtin.memory-context/scopes', {
      body: {
        conversations: {
          [state.conversationId]: true,
        },
        defaultEnabled: true,
      },
    });
    ensure(scope.conversations[state.conversationId] === true, 'Expected plugin scope update to persist');
  });

  await runStep('plugins.events.get.filtered', async () => {
    const events = await getJson(apiBase, '/plugins/builtin.memory-context/events?limit=10&type=plugin:scope.updated');
    ensure(Array.isArray(events.items), 'Expected filtered plugin events payload');
  });

  await runStep('plugins.action.health-check', async () => {
    const result = await postJson(apiBase, '/plugins/builtin.memory-context/actions/health-check');
    ensure(result.accepted === true, 'Expected plugin health-check action to succeed');
  });

  await runStep('plugins.action.reload', async () => {
    const result = await postJson(apiBase, '/plugins/builtin.memory-context/actions/reload');
    ensure(result.accepted === true, 'Expected builtin plugin reload to succeed');
  });

  await runStep('plugins.storage.list', async () => {
    const entries = await getJson(apiBase, '/plugins/builtin.memory-context/storage');
    ensure(Array.isArray(entries), 'Expected plugin storage list');
  });

  await runStep('plugins.storage.put', async () => {
    const entry = await putJson(apiBase, '/plugins/builtin.memory-context/storage', {
      body: {
        key: 'smoke.flag',
        value: { ok: true },
      },
    });
    ensure(entry.key === 'smoke.flag', 'Expected plugin storage update to persist');
  });

  await runStep('plugins.storage.delete', async () => {
    const deleted = await deleteJson(apiBase, '/plugins/builtin.memory-context/storage?key=smoke.flag');
    ensure(deleted === true, 'Expected plugin storage delete to succeed');
  });

  await runStep('plugins.crons.list', async () => {
    const crons = await getJson(apiBase, '/plugins/builtin.memory-context/crons');
    ensure(Array.isArray(crons), 'Expected plugin cron list');
  });

  await runStep('plugins.crons.delete', async () => {
    const deleted = await deleteJson(apiBase, '/plugins/builtin.memory-context/crons/cron-missing');
    ensure(deleted === false, 'Expected deleting missing plugin cron to return false');
  });

  await runStep('plugins.sessions.list', async () => {
    const sessions = await getJson(apiBase, '/plugins/builtin.memory-context/sessions');
    ensure(Array.isArray(sessions), 'Expected plugin session list');
  });

  await runStep('plugins.sessions.delete', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/builtin.memory-context/sessions/${state.conversationId}`);
    ensure(deleted === false, 'Expected deleting missing plugin session to return false');
  });

  await runStep('plugins.command-overview', async () => {
    const overview = await getJson(apiBase, '/plugin-commands/overview');
    ensure(Array.isArray(overview.commands), 'Expected plugin command overview payload');
  });

  await runStep('plugins.subagent-overview', async () => {
    const overview = await getJson(apiBase, '/plugin-subagent-tasks/overview');
    ensure(Array.isArray(overview.tasks), 'Expected subagent task overview payload');
  });

  await runStep('plugins.subagent-detail.missing', async () => {
    await getJson(apiBase, '/plugin-subagent-tasks/subagent-task-missing', {
      expectedStatus: 404,
    });
  });

  await runStep('plugins.routes.missing', async () => {
    await requestJson(apiBase, '/plugin-routes/builtin.memory-context/inspect/context', {
      expectedStatus: 404,
      headers: userHeaders(),
      method: 'GET',
    });
  });

  await runStep('plugins.remote.bootstrap', async () => {
    const bootstrap = await postJson(apiBase, '/plugins/remote/bootstrap', {
      body: {
        deviceType: 'pc',
        pluginName: state.remotePluginId,
      },
    });
    state.remoteBootstrap = bootstrap;
    ensure(bootstrap.pluginName === state.remotePluginId, 'Expected remote bootstrap payload');
  });

  await runStep('plugins.remote.health.offline', async () => {
    const health = await getJson(apiBase, `/plugins/${state.remotePluginId}/health`);
    ensure(health?.status === 'offline', 'Expected unconnected remote plugin health to be offline');
  });

  await runStep('plugins.remote.connect', async () => {
    state.remotePluginHandle = await startRemoteRoutePlugin(input.remotePluginScriptPath, state.remoteBootstrap);
    await waitForPluginHealth(apiBase, state.remotePluginId, true);
  });

  await runStep('plugins.remote.health.online', async () => {
    const health = await getJson(apiBase, `/plugins/${state.remotePluginId}/health`);
    ensure(health?.status === 'healthy', 'Expected connected remote plugin health to be healthy');
  });

  await runStep('plugins.routes.get.success', async () => {
    const result = await requestJson(apiBase, `/plugin-routes/${state.remotePluginId}/inspect/context?conversationId=${encodeURIComponent(state.conversationId)}&via=query`, {
      headers: userHeaders(),
      method: 'GET',
    });
    ensure(result.method === 'GET', 'Expected plugin route GET response');
    ensure(result.context?.conversationId === state.conversationId, 'Expected plugin route GET to read conversationId from query');
    ensure(result.query?.via === 'query', 'Expected plugin route GET query echo');
    ensure(result.body === null, 'Expected plugin route GET body to be null');
  });

  await runStep('plugins.routes.post.success', async () => {
    const result = await postJson(apiBase, `/plugin-routes/${state.remotePluginId}/inspect/context`, {
      body: {
        conversationId: state.conversationId,
        payload: 'from-post',
      },
      headers: userHeaders(),
    });
    ensure(result.method === 'POST', 'Expected plugin route POST response');
    ensure(result.context?.conversationId === state.conversationId, 'Expected plugin route POST to read conversationId from body');
    ensure(result.body?.payload === 'from-post', 'Expected plugin route POST body echo');
  });

  await runStep('plugins.routes.put.success', async () => {
    const result = await requestJson(apiBase, `/plugin-routes/${state.remotePluginId}/inspect/context`, {
      body: {
        conversationId: state.conversationId,
        payload: 'from-put',
      },
      headers: userHeaders(),
      method: 'PUT',
    });
    ensure(result.method === 'PUT', 'Expected plugin route PUT response');
    ensure(result.body?.payload === 'from-put', 'Expected plugin route PUT body echo');
  });

  await runStep('plugins.routes.delete.success', async () => {
    const result = await requestJson(apiBase, `/plugin-routes/${state.remotePluginId}/inspect/context?conversationId=${encodeURIComponent(state.conversationId)}&via=delete`, {
      headers: userHeaders(),
      method: 'DELETE',
    });
    ensure(result.method === 'DELETE', 'Expected plugin route DELETE response');
    ensure(result.query?.via === 'delete', 'Expected plugin route DELETE query echo');
  });

  await runStep('plugins.host.memory.create', async () => {
    const result = await postJson(apiBase, `/plugin-routes/${state.remotePluginId}/host/ops`, {
      body: {
        action: 'save-memory',
        content: 'smoke deletable memory',
      },
      headers: userHeaders(),
    });
    state.memoryId = result.memory?.id ?? null;
    ensure(typeof state.memoryId === 'string', 'Expected remote plugin host op to create memory');
  });

  await runStep('memories.delete.success', async () => {
    const deleted = await deleteJson(apiBase, `/memories/${state.memoryId}`, { headers: userHeaders() });
    ensure(deleted.count === 1, 'Expected deleting created memory to remove one record');
  });

  await runStep('plugins.host.cron.create', async () => {
    const result = await postJson(apiBase, `/plugin-routes/${state.remotePluginId}/host/ops`, {
      body: {
        action: 'register-cron',
      },
      headers: userHeaders(),
    });
    state.remotePluginCronId = result.cron?.id ?? null;
    ensure(typeof state.remotePluginCronId === 'string', 'Expected remote plugin host op to register cron');
  });

  await runStep('plugins.crons.delete.success', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/${state.remotePluginId}/crons/${state.remotePluginCronId}`);
    ensure(deleted === true, 'Expected deleting created plugin cron to succeed');
  });

  await runStep('plugins.host.session.create', async () => {
    const result = await postJson(apiBase, `/plugin-routes/${state.remotePluginId}/host/ops`, {
      body: {
        action: 'start-session',
        conversationId: state.conversationId,
      },
      headers: userHeaders(),
    });
    ensure(result.session?.conversationId === state.conversationId, 'Expected remote plugin host op to start conversation session');
  });

  await runStep('plugins.sessions.list.active', async () => {
    const sessions = await getJson(apiBase, `/plugins/${state.remotePluginId}/sessions`);
    ensure(sessions.some((entry) => entry.conversationId === state.conversationId), 'Expected plugin session list to include created session');
  });

  await runStep('plugins.sessions.delete.success', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/${state.remotePluginId}/sessions/${state.conversationId}`);
    ensure(deleted === true, 'Expected deleting created plugin session to succeed');
  });

  await runStep('plugins.remote.action', async () => {
    const result = await postJson(apiBase, `/plugins/${state.remotePluginId}/actions/reconnect`);
    ensure(result.accepted === true, 'Expected remote plugin reconnect action to be accepted');
  });

  await runStep('plugins.remote.health.disconnected', async () => {
    await waitForPluginHealth(apiBase, state.remotePluginId, false);
    const health = await getJson(apiBase, `/plugins/${state.remotePluginId}/health`);
    ensure(health?.status === 'offline', 'Expected reconnect action to disconnect remote plugin');
  });

  await runStep('plugins.remote.stop-client', async () => {
    await state.remotePluginHandle?.stop?.();
    state.remotePluginHandle = null;
  });

  await runStep('plugins.remote.delete', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/${state.remotePluginId}`);
    ensure(deleted.pluginId === state.remotePluginId, 'Expected remote plugin deletion to succeed');
  });

  await runStep('tools.overview', async () => {
    const overview = await getJson(apiBase, '/tools/overview');
    ensure(Array.isArray(overview.sources), 'Expected tool overview sources');
    const pluginSource = overview.sources.find((entry) => entry.kind === 'plugin');
    const tool = overview.tools[0];
    ensure(pluginSource, 'Expected at least one plugin tool source');
    ensure(tool, 'Expected at least one tool');
    state.toolSourceId = pluginSource.id;
    state.toolId = tool.toolId;
  });

  await runStep('tools.source.enabled.false', async () => {
    const source = await putJson(apiBase, `/tools/sources/plugin/${encodeURIComponent(state.toolSourceId)}/enabled`, {
      body: {
        enabled: false,
      },
    });
    ensure(source.enabled === false, 'Expected tool source to disable');
  });

  await runStep('tools.source.enabled.true', async () => {
    const source = await putJson(apiBase, `/tools/sources/plugin/${encodeURIComponent(state.toolSourceId)}/enabled`, {
      body: {
        enabled: true,
      },
    });
    ensure(source.enabled === true, 'Expected tool source to re-enable');
  });

  await runStep('tools.tool.enabled.false', async () => {
    const tool = await putJson(apiBase, `/tools/${encodeURIComponent(state.toolId)}/enabled`, {
      body: {
        enabled: false,
      },
    });
    ensure(tool.enabled === false, 'Expected tool to disable');
  });

  await runStep('tools.tool.enabled.true', async () => {
    const tool = await putJson(apiBase, `/tools/${encodeURIComponent(state.toolId)}/enabled`, {
      body: {
        enabled: true,
      },
    });
    ensure(tool.enabled === true, 'Expected tool to re-enable');
  });

  await runStep('tools.source.action', async () => {
    const result = await postJson(apiBase, `/tools/sources/plugin/${encodeURIComponent(state.toolSourceId)}/actions/health-check`);
    ensure(result.accepted === true, 'Expected tool source health-check to succeed');
  });

  await runStep('mcp.servers.get.initial', async () => {
    const snapshot = await getJson(apiBase, '/mcp/servers');
    ensure(Array.isArray(snapshot.servers), 'Expected MCP snapshot');
  });

  await runStep('mcp.servers.post', async () => {
    const server = await postJson(apiBase, '/mcp/servers', {
      body: {
        args: [input.mcpScriptPath],
        command: input.mcpCommand,
        env: {},
        name: state.mcpName,
      },
    });
    ensure(server.name === state.mcpName, 'Expected MCP create response');
  });

  await runStep('mcp.servers.get.after-create', async () => {
    const snapshot = await getJson(apiBase, '/mcp/servers');
    ensure(snapshot.servers.some((entry) => entry.name === state.mcpName), 'Expected MCP list to include created server');
  });

  await runStep('tools.overview.after-mcp-create', async () => {
    const overview = await getJson(apiBase, '/tools/overview');
    ensure(
      overview.sources.some((entry) => entry.kind === 'mcp' && entry.id === state.mcpName && entry.health === 'healthy' && entry.totalTools > 0),
      'Expected tools overview to include a healthy MCP source with discovered tools',
    );
    ensure(
      overview.tools.some((entry) => entry.sourceKind === 'mcp' && entry.sourceId === state.mcpName && entry.callName === `${state.mcpName}__echo_weather`),
      'Expected tools overview to include the discovered MCP tool',
    );
  });

  await runStep('tools.source.action.mcp.health-check', async () => {
    const result = await postJson(apiBase, `/tools/sources/mcp/${encodeURIComponent(state.mcpName)}/actions/health-check`);
    ensure(result.accepted === true && result.message.includes('passed'), 'Expected MCP source health-check to succeed');
  });

  await runStep('mcp.servers.put', async () => {
    const server = await putJson(apiBase, `/mcp/servers/${state.mcpName}`, {
      body: {
        args: [input.mcpScriptPath, '--updated'],
        command: input.mcpCommand,
        env: {},
        name: state.mcpName,
      },
    });
    ensure(server.name === state.mcpName, 'Expected MCP update response');
  });

  await runStep('mcp.servers.get.after-update', async () => {
    const snapshot = await getJson(apiBase, '/mcp/servers');
    const server = snapshot.servers.find((entry) => entry.name === state.mcpName);
    ensure(server?.args?.includes('--updated'), 'Expected MCP list to reflect updated args');
  });

  await runStep('mcp.servers.delete', async () => {
    const deleted = await deleteJson(apiBase, `/mcp/servers/${state.mcpName}`);
    ensure(deleted.deleted === true, 'Expected MCP delete response');
  });

  await runStep('mcp.servers.get.after-delete', async () => {
    const snapshot = await getJson(apiBase, '/mcp/servers');
    ensure(!snapshot.servers.some((entry) => entry.name === state.mcpName), 'Expected MCP list to exclude deleted server');
  });

  await runStep('automations.list.initial', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    ensure(Array.isArray(automations), 'Expected automations list payload');
  });

  await runStep('automations.create', async () => {
    const automation = await postJson(apiBase, '/automations', {
      body: {
        actions: [
          {
            message: '自动化烟测消息',
            target: {
              id: state.conversationId,
              type: 'conversation',
            },
            type: 'ai_message',
          },
          {
            capability: 'delegate_summary_background',
            params: {
              prompt: '请输出 smoke automation task',
              writeBack: false,
            },
            plugin: 'builtin.subagent-delegate',
            type: 'device_command',
          },
        ],
        name: 'Smoke Automation',
        trigger: {
          type: 'manual',
        },
      },
      headers: userHeaders(),
    });
    state.automationId = automation.id;
    ensure(typeof state.automationId === 'string', 'Expected automation id');
  });

  await runStep('automations.list.after-create', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    ensure(automations.some((entry) => entry.id === state.automationId), 'Expected automation list to include created automation');
  });

  await runStep('automations.get', async () => {
    const automation = await getJson(apiBase, `/automations/${state.automationId}`, { headers: userHeaders() });
    ensure(automation.id === state.automationId, 'Expected automation detail');
  });

  await runStep('automations.toggle.false', async () => {
    const toggle = await patchJson(apiBase, `/automations/${state.automationId}/toggle`, {
      headers: userHeaders(),
    });
    ensure(toggle.enabled === false, 'Expected automation to disable');
  });

  await runStep('automations.list.after-toggle.false', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    const automation = automations.find((entry) => entry.id === state.automationId);
    ensure(automation?.enabled === false, 'Expected automation list to reflect disabled state');
  });

  await runStep('automations.toggle.true', async () => {
    const toggle = await patchJson(apiBase, `/automations/${state.automationId}/toggle`, {
      headers: userHeaders(),
    });
    ensure(toggle.enabled === true, 'Expected automation to re-enable');
  });

  await runStep('automations.list.after-toggle.true', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    const automation = automations.find((entry) => entry.id === state.automationId);
    ensure(automation?.enabled === true, 'Expected automation list to reflect enabled state');
  });

  await runStep('automations.run', async () => {
    const result = await postJson(apiBase, `/automations/${state.automationId}/run`, {
      headers: userHeaders(),
    });
    const taskAction = result.results.find((entry) => entry.plugin === 'builtin.subagent-delegate');
    state.automationSubagentTaskId = taskAction?.result?.id ?? null;
    ensure(typeof state.automationSubagentTaskId === 'string', 'Expected automation run to create subagent task');
    ensure(result.status === 'success', 'Expected automation run to succeed');
  });

  await runStep('automations.list.after-run', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    const automation = automations.find((entry) => entry.id === state.automationId);
    ensure(typeof automation?.lastRunAt === 'string', 'Expected automation list to reflect last run timestamp');
  });

  await runStep('plugins.subagent-overview.with-task', async () => {
    const overview = await getJson(apiBase, '/plugin-subagent-tasks/overview');
    ensure(overview.tasks.some((entry) => entry.id === state.automationSubagentTaskId), 'Expected subagent overview to include automation-created task');
  });

  await runStep('plugins.subagent-detail.success', async () => {
    const task = await waitForSubagentTaskCompletion(apiBase, state.automationSubagentTaskId);
    ensure(task.id === state.automationSubagentTaskId, 'Expected subagent task detail to load');
    ensure(task.pluginId === 'builtin.subagent-delegate', 'Expected subagent task detail plugin id');
    ensure(task.status === 'completed', 'Expected subagent task detail status to be completed');
    ensure(typeof task.result?.text === 'string' && task.result.text.length > 0, 'Expected subagent task detail result text');
  });

  await runStep('automations.logs', async () => {
    const logs = await getJson(apiBase, `/automations/${state.automationId}/logs`, { headers: userHeaders() });
    ensure(Array.isArray(logs) && logs.length > 0, 'Expected automation logs');
  });

  await runStep('automations.delete', async () => {
    const deleted = await deleteJson(apiBase, `/automations/${state.automationId}`, { headers: userHeaders() });
    ensure(deleted.count === 1, 'Expected automation deletion count');
  });

  await runStep('automations.list.after-delete', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    ensure(!automations.some((entry) => entry.id === state.automationId), 'Expected automation list to exclude deleted automation');
  });

  await runStep('ai.model.delete', async () => {
    const result = await deleteJson(apiBase, `/ai/providers/${state.providerId}/models/smoke-extra`);
    ensure(result.success === true, 'Expected model delete response');
  });

  await runStep('chat.conversation.delete', async () => {
    const result = await deleteJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    ensure(result.message === 'Conversation deleted', 'Expected conversation deletion response');
  });

  await runStep('ai.provider.delete', async () => {
    const result = await deleteJson(apiBase, `/ai/providers/${state.providerId}`);
    ensure(result.success === true, 'Expected provider delete response');
  });
}

async function prepareProxyOpenAiProvider(apiBase, state, fakeOpenAiUrl) {
  state.proxyVisionFallbackBackup = await readVisionFallbackConfig(apiBase);
  state.proxyHostModelRoutingBackup = await readHostModelRoutingConfig(apiBase);
  state.proxyOpenAiProviderBackup = await readOptionalProviderConfig(apiBase, 'openai');
  await writeProviderConfig(apiBase, 'openai', {
    apiKey: 'smoke-openai-key',
    baseUrl: fakeOpenAiUrl,
    defaultModel: state.modelId,
    driver: 'openai',
    mode: 'protocol',
    models: [state.modelId, 'smoke-vision'],
    name: state.proxyOpenAiProviderBackup?.name ?? 'OpenAI',
  });
  state.proxyOpenAiProviderManaged = true;
}

async function restoreProxyOpenAiProvider(apiBase, state) {
  if (state.proxyVisionFallbackBackup) {
    await writeVisionFallbackConfig(apiBase, state.proxyVisionFallbackBackup);
  }

  if (state.proxyHostModelRoutingBackup) {
    await writeHostModelRoutingConfig(apiBase, state.proxyHostModelRoutingBackup);
  }

  if (state.proxyOpenAiProviderBackup) {
    const { id: _id, ...provider } = state.proxyOpenAiProviderBackup;
    await writeProviderConfig(apiBase, 'openai', provider);
    return;
  }

  await deleteOptionalProviderConfig(apiBase, 'openai');
}

async function prepareProjectSkill(skillRoot) {
  await fsPromises.mkdir(skillRoot, { recursive: true });
  await fsPromises.writeFile(path.join(skillRoot, 'SKILL.md'), [
    '---',
    'name: smoke-http-flow',
    'description: temporary skill for backend smoke verification',
    'tools:',
    '  allow: []',
    '  deny: []',
    'tags:',
    '  - smoke',
    '---',
    '',
    '# Smoke HTTP Flow',
    '',
    'This temporary skill exists only for the reusable HTTP smoke flow.',
    '',
  ].join('\n'), 'utf8');
}

async function prepareWorkingMcpScript(filePath) {
  await fsPromises.writeFile(filePath, [
    "const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');",
    "const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');",
    "const z = require('zod/v4');",
    "const server = new McpServer({ name: 'smoke-working-mcp', version: '1.0.0' });",
    "server.registerTool('echo_weather', {",
    "  description: 'Echo weather city for smoke verification',",
    "  inputSchema: { city: z.string() },",
    "}, async ({ city }) => ({",
    "  content: [{ type: 'text', text: `weather:${city}` }],",
    '}));',
    'const transport = new StdioServerTransport();',
    'transport.onerror = (error) => {',
    "  if (error && (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED')) { process.exit(0); }",
    '};',
    'server.connect(transport).catch((error) => {',
    '  console.error(error);',
    '  process.exit(1);',
    '});',
  ].join('\n'), 'utf8');
}

async function verifyRequiredBuildArtifacts() {
  const requiredFiles = [
    path.join(SERVER_DIR, 'dist', 'src', 'main.js'),
    path.join(SERVER_DIR, 'dist', 'src', 'execution', 'mcp', 'mcp-stdio-launcher.js'),
  ];

  for (const filePath of requiredFiles) {
    const exists = await fsPromises.stat(filePath).then(() => true).catch(() => false);
    ensure(exists, `Expected build artifact to exist: ${path.relative(SERVER_DIR, filePath)}`);
  }
}

async function prepareRemoteRoutePluginScript(filePath) {
  await fsPromises.writeFile(filePath, [
    "const { PluginClient } = require('@garlic-claw/plugin-sdk/client');",
    '',
    "const bootstrap = JSON.parse(process.env.SMOKE_REMOTE_BOOTSTRAP || '{}');",
    '',
    'const client = PluginClient.fromBootstrap(bootstrap, {',
    '  autoReconnect: false,',
    '  manifest: {',
    "    name: 'Smoke Route Plugin',",
    "    version: '1.0.0',",
    "    description: 'Temporary remote route plugin for HTTP smoke verification.',",
    "    permissions: ['memory:write', 'cron:write', 'conversation:write'],",
    '    tools: [],',
    '    hooks: [],',
    '    routes: [',
    '      {',
    "        path: 'inspect/context',",
    "        methods: ['GET', 'POST', 'PUT', 'DELETE'],",
    "        description: 'Echo request and resolved context for smoke verification.',",
    '      },',
    '      {',
    "        path: 'host/ops',",
    "        methods: ['POST'],",
    "        description: 'Exercise host facade flows needed by HTTP smoke verification.',",
    '      },',
    '    ],',
    '  },',
    '});',
    '',
    "client.onRoute('inspect/context', async (request, context) => ({",
    '  status: 200,',
    "  headers: { 'x-smoke-route-plugin': 'remote' },",
    '  body: {',
    '    body: request.body,',
    '    context: context.callContext,',
    '    headers: request.headers,',
    '    method: request.method,',
    '    path: request.path,',
    '    query: request.query,',
    '  },',
    '}));',
    '',
    "client.onRoute('host/ops', async (request, context) => {",
    "  const action = request.body && typeof request.body === 'object' ? request.body.action : undefined;",
    "  if (action === 'save-memory') {",
    '    const memory = await context.host.saveMemory({',
    "      content: typeof request.body.content === 'string' ? request.body.content : 'smoke memory',",
    "      category: 'general',",
    '    });',
    '    return { status: 200, body: { memory } };',
    '  }',
    "  if (action === 'register-cron') {",
    '    const cron = await context.host.registerCron({',
    "      cron: '*/5 * * * *',",
    "      description: 'smoke cron job',",
    "      name: 'smoke-route-cron',",
    '    });',
    '    return { status: 200, body: { cron } };',
    '  }',
    "  if (action === 'start-session') {",
    '    const session = await context.host.startConversationSession({',
    '      captureHistory: true,',
    '      timeoutMs: 60000,',
    '    });',
    '    return { status: 200, body: { session } };',
    '  }',
    "  return { status: 400, body: { error: 'unsupported host op' } };",
    '});',
    '',
    'client.connect();',
    '',
    "const shutdown = () => {",
    '  client.disconnect();',
    '  setTimeout(() => process.exit(0), 10);',
    '};',
    '',
    "process.on('SIGINT', shutdown);",
    "process.on('SIGTERM', shutdown);",
  ].join('\n'), 'utf8');
}

async function runTypescriptBuild() {
  await runCommand(process.execPath, [resolveTscCliEntry(), '-p', 'tsconfig.build.json'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
    },
    label: 'server build',
  });
}

async function verifyHealth(apiBase, backend) {
  recordVisitedRoute('GET', '/health');
  const response = await waitForJson(`${apiBase}/health`, backend, STARTUP_TIMEOUT_MS);
  ensure(response.status === 'ok', 'Expected health status to be ok');
  ensure(response.service === 'server', 'Expected service name to be server');
}

async function loginDevelopmentAdmin(apiBase) {
  const payload = await postJson(apiBase, '/auth/login', {
    body: {
      secret: LOGIN_SECRET,
    },
  });
  ensure(typeof payload.accessToken === 'string', 'Expected login access token');
  return payload;
}

async function startBackend(port, wsPort, databaseUrl, files) {
  const logs = [];
  const child = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      GARLIC_CLAW_AI_SETTINGS_PATH: files.aiSettingsPath,
      GARLIC_CLAW_LOGIN_SECRET: LOGIN_SECRET,
      GARLIC_CLAW_AUTOMATIONS_PATH: files.automationsPath,
      GARLIC_CLAW_CONVERSATIONS_PATH: files.conversationsPath,
      GARLIC_CLAW_MCP_CONFIG_PATH: files.mcpConfigPath,
      GARLIC_CLAW_PERSONAS_PATH: files.personasPath,
      GARLIC_CLAW_SUBAGENT_TASKS_PATH: files.subagentTasksPath,
      JWT_SECRET: 'smoke-jwt-secret',
      NODE_ENV: 'test',
      PORT: String(port),
      WS_PORT: String(wsPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => pushLog(logs, chunk));
  child.stderr?.on('data', (chunk) => pushLog(logs, chunk));

  return {
    child,
    logs,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(5_000).then(() => undefined),
      ]);
    },
  };
}

async function waitForJson(url, backend, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (backend && backend.child.exitCode !== null) {
      throw new Error(`server exited before becoming ready: ${backend.child.exitCode}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return response.json();
      }
    } catch {
      // keep polling
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function readOptionalProviderConfig(apiBase, providerId) {
  const response = await fetch(`${apiBase}/ai/providers/${providerId}`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) {
    return null;
  }

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`GET /ai/providers/${providerId} failed: ${response.status} (${formatPayload(body)})`);
  }

  return body;
}

async function writeProviderConfig(apiBase, providerId, body) {
  const response = await fetch(`${apiBase}/ai/providers/${providerId}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`PUT /ai/providers/${providerId} failed: ${response.status} (${formatPayload(payload)})`);
  }

  return payload;
}

async function deleteOptionalProviderConfig(apiBase, providerId) {
  const response = await fetch(`${apiBase}/ai/providers/${providerId}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) {
    return { success: true };
  }

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`DELETE /ai/providers/${providerId} failed: ${response.status} (${formatPayload(body)})`);
  }

  return body;
}

async function readVisionFallbackConfig(apiBase) {
  const response = await fetch(`${apiBase}/ai/vision-fallback`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`GET /ai/vision-fallback failed: ${response.status} (${formatPayload(body)})`);
  }

  return body;
}

async function writeVisionFallbackConfig(apiBase, body) {
  const response = await fetch(`${apiBase}/ai/vision-fallback`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`PUT /ai/vision-fallback failed: ${response.status} (${formatPayload(payload)})`);
  }

  return payload;
}

async function readHostModelRoutingConfig(apiBase) {
  const response = await fetch(`${apiBase}/ai/host-model-routing`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`GET /ai/host-model-routing failed: ${response.status} (${formatPayload(body)})`);
  }

  return body;
}

async function writeHostModelRoutingConfig(apiBase, body) {
  const response = await fetch(`${apiBase}/ai/host-model-routing`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`PUT /ai/host-model-routing failed: ${response.status} (${formatPayload(payload)})`);
  }

  return payload;
}

function parseCliArgs(args) {
  const config = {
    proxyOrigin: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--proxy-origin') {
      config.proxyOrigin = args[index + 1] ?? null;
      index += 1;
    }
  }

  return config;
}

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, '');
}

async function waitForBootstrapAdminLogin(apiBase) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      recordVisitedRoute('POST', '/auth/login');
      const response = await fetch(`${apiBase}/auth/login`, {
        body: JSON.stringify({
          secret: LOGIN_SECRET,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const payload = await response.json();
        ensure(typeof payload.accessToken === 'string', 'Expected bootstrap access token');
        return payload;
      }
    } catch {
      // keep polling
    }

    await delay(250);
  }

  throw new Error('Timed out waiting for bootstrap admin login');
}

async function waitForPluginHealth(apiBase, pluginId, expectedOk) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DEFAULT_TIMEOUT_MS) {
    try {
      const health = await getJson(apiBase, `/plugins/${pluginId}/health`);
      if (readPluginHealthOk(health) === expectedOk) {
        return health;
      }
    } catch {
      // keep polling
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for plugin ${pluginId} health=${expectedOk}`);
}

function readPluginHealthOk(health) {
  return health?.status === 'healthy';
}

async function waitForSubagentTaskCompletion(apiBase, taskId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DEFAULT_TIMEOUT_MS) {
    const task = await getJson(apiBase, `/plugin-subagent-tasks/${taskId}`);
    if (task?.status === 'completed') {
      return task;
    }
    if (task?.status === 'error') {
      throw new Error(`Subagent task ${taskId} failed: ${task.error ?? 'unknown error'}`);
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for subagent task ${taskId} to complete`);
}

async function startRemoteRoutePlugin(scriptPath, bootstrap) {
  const logs = [];
  const child = spawn(process.execPath, [scriptPath], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      SMOKE_REMOTE_BOOTSTRAP: JSON.stringify(bootstrap),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => pushLog(logs, chunk));
  child.stderr?.on('data', (chunk) => pushLog(logs, chunk));

  return {
    child,
    logs,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(5_000).then(() => undefined),
      ]);
    },
  };
}

async function requestJson(apiBase, routePath, options = {}) {
  const method = options.method ?? 'GET';
  const expectedStatuses = options.expectedStatuses ?? [options.expectedStatus ?? 200];
  const headers = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
  recordVisitedRoute(method, routePath);
  const response = await fetch(`${apiBase}${routePath}`, {
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers,
    method,
    signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
  const body = await parseResponseBody(response);

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${method} ${routePath} failed: expected ${expectedStatuses.join('/')} , received ${response.status} (${formatPayload(body)})`);
  }

  return body;
}

async function postSse(apiBase, routePath, options = {}) {
  recordVisitedRoute('POST', routePath);
  const response = await fetch(`${apiBase}${routePath}`, {
    body: JSON.stringify(options.body ?? {}),
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    method: 'POST',
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`POST ${routePath} SSE failed: ${response.status} (${await response.text()})`);
  }

  const text = await response.text();
  const events = parseSseEvents(text);
  const errorEvent = events.find((entry) => entry.type === 'error');
  if (errorEvent) {
    throw new Error(`SSE error from ${routePath}: ${formatPayload(errorEvent)}`);
  }
  return events;
}

function getJson(apiBase, routePath, options = {}) {
  return requestJson(apiBase, routePath, { ...options, method: 'GET' });
}

function postJson(apiBase, routePath, options = {}) {
  return requestJson(apiBase, routePath, {
    ...options,
    expectedStatuses: options.expectedStatuses ?? [200, 201],
    method: 'POST',
  });
}

function putJson(apiBase, routePath, options = {}) {
  return requestJson(apiBase, routePath, { ...options, expectedStatus: options.expectedStatus ?? 200, method: 'PUT' });
}

function patchJson(apiBase, routePath, options = {}) {
  return requestJson(apiBase, routePath, { ...options, expectedStatus: options.expectedStatus ?? 200, method: 'PATCH' });
}

function deleteJson(apiBase, routePath, options = {}) {
  return requestJson(apiBase, routePath, { ...options, expectedStatus: options.expectedStatus ?? 200, method: 'DELETE' });
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Keep non-JSON text responses as-is.
  }
  return raw;
}

function parseSseEvents(text) {
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => {
      const dataLine = chunk
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));
      if (!dataLine) {
        return [];
      }

      const payload = dataLine.slice('data:'.length).trim();
      if (payload === '[DONE]') {
        return [{ type: 'done' }];
      }

      return [JSON.parse(payload)];
    });
}

let completedStepCount = 0;

async function runStep(name, task) {
  console.log(`-> ${name}`);
  await task();
  completedStepCount += 1;
}

function readTokens(value) {
  ensure(value && typeof value.accessToken === 'string', 'Expected auth tokens');
  return value;
}

function assertCompletedSse(events, expectedText) {
  const startIndex = events.findIndex((entry) => entry.type === 'message-start');
  const finishIndex = events.findIndex((entry) => entry.type === 'finish');
  const doneIndex = events.findIndex((entry) => entry.type === 'done');
  const deltas = events.filter((entry) => entry.type === 'text-delta').map((entry) => entry.text ?? '').join('');
  ensure(startIndex >= 0, 'Expected SSE message-start event');
  ensure(finishIndex > startIndex, 'Expected SSE finish after message-start');
  ensure(doneIndex > finishIndex, 'Expected SSE [DONE] after finish');
  ensure(deltas.length > 0, 'Expected SSE text-delta content');
  if (typeof expectedText === 'string') {
    ensure(deltas === expectedText, `Expected SSE text to equal "${expectedText}"`);
  }
  return deltas;
}

function getCompletedStepCount() {
  return completedStepCount;
}

function assertWebRoutesMatchServerRoutes(serverRoutes, webRoutes) {
  const unmatchedRoutes = findUnmatchedWebRoutes(serverRoutes, webRoutes);
  ensure(unmatchedRoutes.length === 0, [
    `Expected web API routes to match backend routes (${webRoutes.length} checked, ${serverRoutes.length} backend routes).`,
    ...describeRoutes(unmatchedRoutes),
  ].join('\n'));
}

function assertAllServerRoutesCovered(serverRoutes) {
  const uncoveredRoutes = findUncoveredServerRoutes(serverRoutes, visitedHttpRoutes);
  ensure(uncoveredRoutes.length === 0, [
    `Expected smoke flow to cover every backend route (${visitedHttpRoutes.length} requests, ${serverRoutes.length} backend routes).`,
    ...describeRoutes(uncoveredRoutes),
  ].join('\n'));
}

function recordVisitedRoute(method, routePath) {
  const normalizedPath = routePath.split('?')[0] || routePath;
  visitedHttpRoutes.push({
    method: method.toUpperCase(),
    path: `${API_PREFIX}${normalizedPath}`,
  });
}

function resolvePrismaCliEntry() {
  return resolveNodeCliEntry('prisma', 'build', 'index.js');
}

function resolveTscCliEntry() {
  return resolveNodeCliEntry('typescript', 'bin', 'tsc');
}

function resolveNodeCliEntry(pkg, ...segments) {
  const candidates = [
    path.join(SERVER_DIR, 'node_modules', pkg, ...segments),
    path.join(PROJECT_ROOT, 'node_modules', pkg, ...segments),
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Unable to resolve CLI entry for ${pkg}`);
  }
  return match;
}

async function runCommand(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${options.label} failed with exit code ${code ?? 'unknown'}`));
    });
    child.once('error', reject);
  });
}

function buildRelativeSqliteUrl(databasePath) {
  const relativePath = path.relative(SERVER_DIR, databasePath).replace(/\\/g, '/');
  return `file:${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}`;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate a free port'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function pushLog(logs, chunk) {
  logs.push(chunk.toString());
  if (logs.length > 200) {
    logs.shift();
  }
}

function formatPayload(payload) {
  if (typeof payload === 'string') {
    return payload.slice(0, 400);
  }
  try {
    return JSON.stringify(payload).slice(0, 400);
  } catch {
    return String(payload);
  }
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function startFakeOpenAiServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (request.method === 'GET' && requestUrl.pathname === '/v1/models') {
        writeJson(response, 200, {
          data: [
            { id: 'smoke-model', object: 'model' },
            { id: 'smoke-vision', object: 'model' },
          ],
        });
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/v1/chat/completions') {
        const body = await readJsonBody(request);
        if (body.stream === true) {
          await writeStreamResponse(request, response, body);
          return;
        }

        writeJson(response, 200, createChatCompletion(body));
        return;
      }

      writeJson(response, 404, {
        error: `Unsupported smoke route: ${request.method} ${requestUrl.pathname}`,
      });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start fake OpenAI smoke server');
  }

  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function createChatCompletion(body) {
  const text = resolveAssistantText(body);
  const model = body.model ?? 'smoke-model';
  return {
    choices: [
      {
        finish_reason: 'stop',
        index: 0,
        message: {
          content: text,
          role: 'assistant',
        },
      },
    ],
    created: Math.floor(Date.now() / 1000),
    id: 'chatcmpl-smoke',
    model,
    object: 'chat.completion',
    usage: {
      completion_tokens: Math.max(1, text.length),
      prompt_tokens: 12,
      total_tokens: 12 + Math.max(1, text.length),
    },
  };
}

async function writeStreamResponse(request, response, body) {
  response.writeHead(200, {
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'content-type': 'text/event-stream',
  });

  const text = resolveAssistantText(body);
  const model = body.model ?? 'smoke-model';
  const chunks = splitIntoChunks(text, 6);

  for (const chunk of chunks) {
    if (request.aborted || response.destroyed || response.writableEnded) {
      return;
    }

    writeSse(response, {
      choices: [
        {
          delta: {
            content: chunk,
            role: 'assistant',
          },
          finish_reason: null,
          index: 0,
        },
      ],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-smoke',
      model,
    });
    await delay(80);
  }

  if (request.aborted || response.destroyed || response.writableEnded) {
    return;
  }

  writeSse(response, {
    choices: [
      {
        delta: {},
        finish_reason: 'stop',
        index: 0,
      },
    ],
    created: Math.floor(Date.now() / 1000),
    id: 'chatcmpl-smoke',
    model,
    usage: {
      completion_tokens: Math.max(1, text.length),
      prompt_tokens: 12,
      total_tokens: 12 + Math.max(1, text.length),
    },
  });
  response.write('data: [DONE]\n\n');
  response.end();
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function resolveAssistantText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (containsText(messages, '请只回复 OK')) {
    return 'OK';
  }
  if (containsText(messages, '你是一个对话标题生成器')) {
    return '烟测会话标题';
  }
  if (containsImage(messages)) {
    return '这是一张用于后端烟测的图片。';
  }

  const latestUserText = findLatestUserText(messages);
  if (latestUserText.includes('更新后')) {
    return '这是重试后的烟测回复。';
  }
  return latestUserText ? `本地 smoke 回复: ${latestUserText}` : '本地 smoke 回复。';
}

function containsText(messages, needle) {
  return messages.some((message) => readTextContent(message).includes(needle));
}

function containsImage(messages) {
  return messages.some((message) =>
    Array.isArray(message?.content)
    && message.content.some((part) => part?.type === 'image_url' || part?.type === 'input_image'));
}

function findLatestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }
    const text = readTextContent(message).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function readTextContent(message) {
  if (typeof message?.content === 'string') {
    return message.content;
  }
  if (!Array.isArray(message?.content)) {
    return '';
  }
  return message.content
    .map((part) => (part?.type === 'text' || part?.type === 'input_text' ? part.text ?? '' : ''))
    .join('\n');
}

function splitIntoChunks(text, chunkCount) {
  const normalized = text || ' ';
  const size = Math.max(1, Math.ceil(normalized.length / chunkCount));
  const chunks = [];
  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [normalized];
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createBearerHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
