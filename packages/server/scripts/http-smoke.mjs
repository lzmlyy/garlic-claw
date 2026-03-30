import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startFakeOpenAiServer } from './fake-openai-smoke-server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(SERVER_DIR, '..', '..');
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0eQAAAAASUVORK5CYII=';
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_SSE_TIMEOUT_MS = 40_000;

async function main() {
  const tempDir = await fsPromises.mkdtemp(path.join(SERVER_DIR, 'tmp', 'http-smoke-'));
  const databasePath = path.join(tempDir, 'smoke.sqlite');
  const relativeDatabasePath = path.relative(SERVER_DIR, databasePath).replace(/\\/g, '/');
  const databaseUrl = `file:${relativeDatabasePath.startsWith('.') ? relativeDatabasePath : `./${relativeDatabasePath}`}`;
  const isolatedConfig = await prepareConfigIsolation(tempDir);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  let fakeServer;
  let backend;

  try {
    await runCommand(process.execPath, [resolvePrismaCliEntry(), 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      label: 'prisma db push',
    });

    await prisma.$connect();
    await prisma.plugin.create({
      data: {
        name: 'offline.smoke-plugin',
        displayName: 'Offline Smoke Plugin',
        deviceType: 'smoke',
        runtimeKind: 'remote',
        status: 'offline',
        healthStatus: 'offline',
      },
    });

    fakeServer = await startFakeOpenAiServer();
    const httpPort = await getFreePort();
    const pluginWsPort = await getFreePort();

    backend = await startBackend({
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'smoke-jwt-secret',
      JWT_REFRESH_SECRET: 'smoke-jwt-refresh-secret',
      BOOTSTRAP_ADMIN_USERNAME: 'smoke-admin',
      BOOTSTRAP_ADMIN_PASSWORD: 'SmokePass123!',
      BOOTSTRAP_ADMIN_EMAIL: 'smoke-admin@example.com',
      BOOTSTRAP_ADMIN_ROLE: 'super_admin',
      NODE_ENV: 'test',
      PORT: String(httpPort),
      WS_PORT: String(pluginWsPort),
      CORS_ORIGIN: '*',
      GARLIC_CLAW_AI_SETTINGS_PATH: isolatedConfig.aiSettingsPath,
      GARLIC_CLAW_MODEL_CAPABILITIES_PATH: isolatedConfig.modelCapabilitiesPath,
    });

    const apiBase = `http://127.0.0.1:${backend.port}/api`;
    await waitForServerReady(`${apiBase}/__smoke_ready__`, backend);
    await runSmokeFlow({ apiBase, fakeBaseUrl: fakeServer.url, prisma });
    console.log('HTTP smoke passed');
  } catch (error) {
    if (backend?.logs.length) {
      console.error('--- backend logs ---');
      console.error(backend.logs.join(''));
      console.error('--- end backend logs ---');
    }
    throw error;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    if (backend) {
      await backend.stop();
    }
    if (fakeServer) {
      await fakeServer.close().catch(() => undefined);
    }
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
}

async function runSmokeFlow(context) {
  const adminLogin = await waitForBootstrapAdminLogin(context, {
    username: 'smoke-admin',
    password: 'SmokePass123!',
  });
  const userRegister = await apiRequest(context, 'POST', '/auth/register', {
    body: {
      username: 'smoke-user',
      email: 'smoke-user@example.com',
      password: 'SmokePass123!',
    },
    expectedStatus: 201,
  });
  const userLogin = await apiRequest(context, 'POST', '/auth/login', {
    body: {
      username: 'smoke-user',
      password: 'SmokePass123!',
    },
    expectedStatus: 200,
  });
  await apiRequest(context, 'POST', '/auth/refresh', {
    body: { refreshToken: userLogin.refreshToken },
    expectedStatus: 200,
  });
  await apiRequest(context, 'POST', '/auth/register', {
    body: {
      username: 'smoke-user-delete',
      email: 'smoke-user-delete@example.com',
      password: 'SmokePass123!',
    },
    expectedStatus: 201,
  });

  const adminToken = adminLogin.accessToken;
  const userToken = userRegister.accessToken;
  const me = await apiRequest(context, 'GET', '/users/me', { token: userToken });
  await context.prisma.memory.create({
    data: {
      userId: me.id,
      content: 'smoke memory item',
      category: 'general',
      keywords: 'smoke,test',
    },
  });

  const users = await apiRequest(context, 'GET', '/users?page=1&pageSize=20', { token: adminToken });
  const userToDelete = users.data.find((user) => user.username === 'smoke-user-delete');
  ensure(userToDelete, 'Expected smoke-user-delete to exist');

  await apiRequest(context, 'GET', `/users/${userToDelete.id}`, { token: adminToken });
  await apiRequest(context, 'PATCH', `/users/${userToDelete.id}`, {
    token: adminToken,
    body: { email: 'smoke-user-delete+updated@example.com' },
  });
  await apiRequest(context, 'PATCH', `/users/${userToDelete.id}/role`, {
    token: adminToken,
    body: { role: 'admin' },
  });

  await apiRequest(context, 'GET', '/ai/provider-catalog', { token: adminToken });
  await apiRequest(context, 'GET', '/ai/providers', { token: adminToken });
  await apiRequest(context, 'PUT', '/ai/providers/local-openai', {
    token: adminToken,
    body: {
      mode: 'compatible',
      driver: 'openai',
      name: 'Local OpenAI Smoke',
      apiKey: 'smoke-key',
      baseUrl: context.fakeBaseUrl,
      defaultModel: 'smoke-model',
      models: ['smoke-model', 'smoke-vision'],
    },
  });
  await apiRequest(context, 'GET', '/ai/providers/local-openai', { token: adminToken });
  await apiRequest(context, 'POST', '/ai/providers/local-openai/models/smoke-model', {
    token: adminToken,
    body: { name: 'Smoke Model' },
    expectedStatus: [200, 201],
  });
  await apiRequest(context, 'POST', '/ai/providers/local-openai/models/smoke-vision', {
    token: adminToken,
    body: { name: 'Smoke Vision' },
    expectedStatus: [200, 201],
  });
  await apiRequest(context, 'GET', '/ai/providers/local-openai/models', { token: adminToken });
  await apiRequest(context, 'POST', '/ai/providers/local-openai/discover-models', {
    token: adminToken,
    body: {},
  });
  await apiRequest(context, 'PUT', '/ai/providers/local-openai/default-model', {
    token: adminToken,
    body: { modelId: 'smoke-model' },
  });
  await apiRequest(context, 'PUT', '/ai/providers/local-openai/models/smoke-model/capabilities', {
    token: adminToken,
    body: {
      reasoning: false,
      toolCall: false,
      input: { text: true, image: false },
      output: { text: true, image: false },
    },
  });
  await apiRequest(context, 'PUT', '/ai/providers/local-openai/models/smoke-vision/capabilities', {
    token: adminToken,
    body: {
      reasoning: false,
      toolCall: false,
      input: { text: true, image: true },
      output: { text: true, image: false },
    },
  });
  const connectionResult = await apiRequest(context, 'POST', '/ai/providers/local-openai/test-connection', {
    token: adminToken,
    body: { modelId: 'smoke-model' },
  });
  ensure(connectionResult.text === 'OK', 'Expected AI test-connection to return OK');
  await apiRequest(context, 'GET', '/ai/vision-fallback', { token: adminToken });
  await apiRequest(context, 'PUT', '/ai/vision-fallback', {
    token: adminToken,
    body: {
      enabled: true,
      providerId: 'local-openai',
      modelId: 'smoke-vision',
      prompt: '请描述这张图片',
      maxDescriptionLength: 120,
    },
  });

  const conversation = await apiRequest(context, 'POST', '/chat/conversations', {
    token: userToken,
    body: {},
    expectedStatus: 201,
  });
  await apiRequest(context, 'GET', '/chat/conversations', { token: userToken });
  await apiRequest(context, 'GET', `/chat/conversations/${conversation.id}`, { token: userToken });

  const sendEvents = await requestSse(context, `/chat/conversations/${conversation.id}/messages`, {
    token: userToken,
    body: {
      content: '烟测首条消息',
      provider: 'local-openai',
      model: 'smoke-model',
    },
  });
  ensure(sendEvents.some((event) => event.type === 'finish' && event.status === 'completed'), 'Expected first chat message to complete');

  let conversationDetail = await apiRequest(context, 'GET', `/chat/conversations/${conversation.id}`, {
    token: userToken,
  });
  const firstUserMessage = conversationDetail.messages.find((message) => message.role === 'user');
  const firstAssistantMessage = [...conversationDetail.messages].reverse().find((message) => message.role === 'assistant');
  ensure(firstUserMessage, 'Expected a user message after first send');
  ensure(firstAssistantMessage, 'Expected an assistant message after first send');

  await apiRequest(context, 'PATCH', `/chat/conversations/${conversation.id}/messages/${firstUserMessage.id}`, {
    token: userToken,
    body: { content: '烟测更新后的消息' },
  });

  const retryPromise = requestSse(context, `/chat/conversations/${conversation.id}/messages/${firstAssistantMessage.id}/retry`, {
    token: userToken,
    body: {
      provider: 'local-openai',
      model: 'smoke-model',
    },
  });
  await delay(150);
  await apiRequest(context, 'POST', `/chat/conversations/${conversation.id}/messages/${firstAssistantMessage.id}/stop`, {
    token: userToken,
    body: {},
    expectedStatus: [200, 201],
  });
  const retryEvents = await retryPromise;
  ensure(retryEvents.some((event) => event.type === 'finish'), 'Expected retry SSE to finish');

  conversationDetail = await apiRequest(context, 'GET', `/chat/conversations/${conversation.id}`, {
    token: userToken,
  });
  const stoppedAssistantMessage = conversationDetail.messages.find((message) => message.id === firstAssistantMessage.id);
  ensure(stoppedAssistantMessage?.status === 'stopped', 'Expected retried assistant message to stop');

  await apiRequest(context, 'DELETE', `/chat/conversations/${conversation.id}/messages/${firstAssistantMessage.id}`, {
    token: userToken,
  });

  const imageSendEvents = await requestSse(context, `/chat/conversations/${conversation.id}/messages`, {
    token: userToken,
    body: {
      provider: 'local-openai',
      model: 'smoke-model',
      parts: [
        { type: 'text', text: '请描述这张图' },
        { type: 'image', image: TINY_PNG_DATA_URL, mimeType: 'image/png' },
      ],
    },
  });
  ensure(imageSendEvents.some((event) => event.type === 'finish' && event.status === 'completed'), 'Expected image chat message to complete');

  const memories = await apiRequest(context, 'GET', '/memories?limit=10', { token: userToken });
  ensure(Array.isArray(memories) && memories.length > 0, 'Expected seeded memories to be listed');
  await apiRequest(context, 'DELETE', `/memories/${memories[0].id}`, { token: userToken });

  const automation = await apiRequest(context, 'POST', '/automations', {
    token: userToken,
    body: {
      name: 'Smoke automation',
      trigger: { type: 'manual' },
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.core-tools',
          capability: 'getCurrentTime',
          params: {},
        },
      ],
    },
    expectedStatus: 201,
  });
  await apiRequest(context, 'GET', '/automations', { token: userToken });
  await apiRequest(context, 'GET', `/automations/${automation.id}`, { token: userToken });
  await apiRequest(context, 'POST', `/automations/${automation.id}/run`, {
    token: userToken,
    body: {},
    expectedStatus: [200, 201],
  });
  const messageAutomation = await apiRequest(context, 'POST', '/automations', {
    token: userToken,
    body: {
      name: 'Smoke automation message',
      trigger: { type: 'manual' },
      actions: [
        {
          type: 'ai_message',
          message: 'Smoke automation ping',
          target: {
            type: 'conversation',
            id: conversation.id,
          },
        },
      ],
    },
    expectedStatus: 201,
  });
  await apiRequest(context, 'POST', `/automations/${messageAutomation.id}/run`, {
    token: userToken,
    body: {},
    expectedStatus: [200, 201],
  });
  conversationDetail = await apiRequest(context, 'GET', `/chat/conversations/${conversation.id}`, {
    token: userToken,
  });
  ensure(
    conversationDetail.messages.some(
      (message) =>
        message.role === 'assistant'
        && message.content === 'Smoke automation ping',
    ),
    'Expected ai_message automation to append an assistant message',
  );
  await apiRequest(context, 'GET', `/automations/${automation.id}/logs`, { token: userToken });
  await apiRequest(context, 'PATCH', `/automations/${automation.id}/toggle`, {
    token: userToken,
    body: {},
    expectedStatus: [200, 201],
  });

  const plugins = await apiRequest(context, 'GET', '/plugins', { token: adminToken });
  ensure(plugins.some((plugin) => plugin.name === 'builtin.provider-router'), 'Expected builtin.provider-router in plugin list');
  await apiRequest(context, 'GET', '/plugins/connected', { token: adminToken });
  await apiRequest(context, 'GET', '/plugins/builtin.provider-router/config', { token: adminToken });
  await apiRequest(context, 'PUT', '/plugins/builtin.provider-router/config', {
    token: adminToken,
    body: {
      values: {
        targetProviderId: 'local-openai',
        targetModelId: 'smoke-model',
      },
    },
  });
  await apiRequest(context, 'GET', '/plugins/builtin.provider-router/storage', { token: adminToken });
  await apiRequest(context, 'PUT', '/plugins/builtin.provider-router/storage', {
    token: adminToken,
    body: {
      key: 'smoke.key',
      value: { ok: true },
    },
  });
  await apiRequest(context, 'GET', '/plugins/builtin.provider-router/storage?prefix=smoke', {
    token: adminToken,
  });
  await apiRequest(context, 'DELETE', '/plugins/builtin.provider-router/storage?key=smoke.key', {
    token: adminToken,
  });
  await apiRequest(context, 'GET', '/plugins/builtin.provider-router/scopes', { token: adminToken });
  await apiRequest(context, 'PUT', '/plugins/builtin.provider-router/scopes', {
    token: adminToken,
    body: {
      defaultEnabled: true,
      conversations: {
        [conversation.id]: true,
      },
    },
  });
  await apiRequest(context, 'GET', '/plugins/builtin.provider-router/health', { token: adminToken });
  await apiRequest(context, 'POST', '/plugins/builtin.provider-router/actions/health-check', {
    token: adminToken,
    body: {},
    expectedStatus: [200, 201],
  });
  await apiRequest(context, 'GET', '/plugins/builtin.provider-router/events?limit=10', { token: adminToken });
  const pluginSessions = await apiRequest(context, 'GET', '/plugins/builtin.provider-router/sessions', {
    token: adminToken,
  });
  ensure(Array.isArray(pluginSessions), 'Expected plugin session governance endpoint to return an array');
  const sessionFinishResult = await apiRequest(
    context,
    'DELETE',
    `/plugins/builtin.provider-router/sessions/${conversation.id}`,
    { token: adminToken },
  );
  ensure(typeof sessionFinishResult === 'boolean', 'Expected finishing plugin session to return a boolean');

  const cronJobs = await apiRequest(context, 'GET', '/plugins/builtin.cron-heartbeat/crons', {
    token: adminToken,
  });
  ensure(Array.isArray(cronJobs) && cronJobs.length > 0, 'Expected builtin.cron-heartbeat to expose cron jobs');
  const cronDeleteResult = await apiRequest(context, 'DELETE', `/plugins/builtin.cron-heartbeat/crons/${cronJobs[0].id}`, {
    token: adminToken,
    expectedStatus: 400,
  });
  ensure(
    typeof cronDeleteResult?.message === 'string'
    && cronDeleteResult.message.includes('manifest cron'),
    'Expected manifest cron deletion to be rejected by design',
  );

  await apiRequest(context, 'GET', `/plugin-routes/builtin.route-inspector/inspect/context?conversationId=${conversation.id}`, {
    token: userToken,
  });
  await apiRequest(context, 'DELETE', '/plugins/offline.smoke-plugin', { token: adminToken });

  await apiRequest(context, 'DELETE', `/automations/${automation.id}`, { token: userToken });
  await apiRequest(context, 'DELETE', `/automations/${messageAutomation.id}`, { token: userToken });
  await apiRequest(context, 'DELETE', `/users/${userToDelete.id}`, { token: adminToken });
  await apiRequest(context, 'DELETE', `/chat/conversations/${conversation.id}`, { token: userToken });
  await apiRequest(context, 'DELETE', '/ai/providers/local-openai/models/smoke-vision', {
    token: adminToken,
  });
  await apiRequest(context, 'DELETE', '/ai/providers/local-openai', { token: adminToken });
}

async function waitForBootstrapAdminLogin(context, credentials, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 250;
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await apiRequest(context, 'POST', '/auth/login', {
        body: credentials,
        expectedStatus: 200,
      });
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw new Error(
    `Timed out waiting for bootstrap admin login: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function prepareConfigIsolation(tempDir) {
  const configDir = path.join(tempDir, 'config');
  const aiSettingsPath = path.join(configDir, 'ai-settings.json');
  const modelCapabilitiesPath = path.join(configDir, 'model-capabilities.json');

  await fsPromises.mkdir(configDir, { recursive: true });

  await fsPromises.writeFile(
    aiSettingsPath,
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      providers: [],
      visionFallback: { enabled: false },
    }, null, 2),
    'utf8',
  );
  await fsPromises.writeFile(
    modelCapabilitiesPath,
    JSON.stringify({
      version: 1,
      lastUpdated: new Date().toISOString(),
      models: [],
    }, null, 2),
    'utf8',
  );

  return {
    aiSettingsPath,
    modelCapabilitiesPath,
  };
}

function resolvePrismaCliEntry() {
  const candidates = [
    path.join(SERVER_DIR, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(PROJECT_ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error('Unable to resolve Prisma CLI entry');
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

async function startBackend(env) {
  const logs = [];
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => pushLog(logs, chunk));
  child.stderr?.on('data', (chunk) => pushLog(logs, chunk));

  return {
    child,
    logs,
    port: Number(env.PORT),
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(5000).then(() => undefined),
      ]);
    },
  };
}

async function waitForServerReady(url, backend) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 20000) {
    if (backend.child.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready: ${backend.child.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // keep polling
    }

    await delay(250);
  }

  throw new Error('Timed out waiting for backend to become ready');
}

async function apiRequest(context, method, routePath, options = {}) {
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const headers = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(`${context.apiBase}${routePath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal,
  });
  const defaultExpectedStatuses = method === 'POST' ? [200, 201] : [200];
  const expectedStatuses = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : options.expectedStatus !== undefined
      ? [options.expectedStatus]
      : defaultExpectedStatuses;

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${method} ${routePath} failed with ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function requestSse(context, routePath, options) {
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SSE_TIMEOUT_MS);
  const response = await fetch(`${context.apiBase}${routePath}`, {
    method: options.method ?? 'POST',
    headers: {
      authorization: `Bearer ${options.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(options.body ?? {}),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`SSE ${routePath} failed with ${response.status}: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (!data) {
        continue;
      }
      if (data === '[DONE]') {
        return events;
      }

      events.push(JSON.parse(data));
    }
  }

  return events;
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

function ensure(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
