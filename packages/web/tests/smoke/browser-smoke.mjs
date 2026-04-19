import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { shouldDeleteBrowserSmokeProvider } from './browser-smoke-provider-cleanup.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..', '..');
const PROJECT_ROOT = path.resolve(WEB_DIR, '..', '..');
const STATE_FILE = path.join(PROJECT_ROOT, 'other', 'dev-processes.json');

const WEB_ORIGIN = 'http://127.0.0.1:23333';
const API_ORIGIN = 'http://127.0.0.1:23330/api';
const REQUEST_TIMEOUT_MS = 20_000;
const STARTUP_TIMEOUT_MS = 120_000;
const RETRYABLE_FETCH_ATTEMPTS = 8;
const LOGIN_SECRET = process.env.GARLIC_CLAW_LOGIN_SECRET || 'smoke-login-secret';
const SMOKE_PREFIX_ROOT = 'smoke-ui-';
const PREFIX = `smoke-ui-${Date.now().toString(36)}`;
const PROVIDER_ID = `${PREFIX}-openai`;
const PROVIDER_NAME = `${PREFIX}-provider`;
const MODEL_ID = `${PREFIX}-model`;
const SHADOW_MODEL_ID = `${PREFIX}-shadow-model`;
const AUTOMATION_NAME = `${PREFIX}-automation`;
const AUTOMATION_MESSAGE = `${PREFIX} automation message`;

async function main() {
  const fakeOpenAi = await startFakeOpenAiServer();
  const serviceSession = await ensureDevServices();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: WEB_ORIGIN,
  });
  const page = await context.newPage();
  let accessToken = '';
  let createdConversationId = null;
  let initialProviderIds = new Set();

  try {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('input[type="password"]').fill(LOGIN_SECRET);
    await page.getByRole('button', { exact: true, name: '登录' }).click();
    accessToken = await waitFor(async () => {
      const token = await readAccessToken(page);
      return token || null;
    }, '等待登录 token');
    assert.ok(accessToken, '登录后未拿到 accessToken');
    initialProviderIds = new Set((await requestJson('/ai/providers', {
      headers: createAuthHeaders(accessToken),
    }).catch(() => [])).map((provider) => provider.id));
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '新对话' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });

    await cleanupSmokeArtifacts(accessToken, {
      conversationId: null,
      initialProviderIds,
      prefix: PREFIX,
      providerId: PROVIDER_ID,
    });

    await createProviderThroughUi(page, accessToken, fakeOpenAi.url);
    createdConversationId = await runChatFlow(page, accessToken);
    await verifyMcpPage(page);
    await verifyPluginsPage(page);
    await runAutomationFlow(page, accessToken, createdConversationId);
    await verifyArtifactsPresent(accessToken, createdConversationId);

    console.log('browser UI smoke passed');
  } finally {
    await Promise.allSettled([
      cleanupSmokeArtifacts(accessToken, {
        conversationId: createdConversationId,
        initialProviderIds,
        prefix: PREFIX,
        providerId: PROVIDER_ID,
      }),
      context.close(),
      browser.close(),
      fakeOpenAi.close(),
      serviceSession.stop(),
    ]);
  }
}

async function ensureDevServices() {
  if (await isManagedDevEnvironmentReady()) {
    return {
      startedBySmoke: false,
      async stop() {},
    };
  }

  await runCommand(resolvePythonCommand(), ['tools/start_launcher.py', 'restart'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      GARLIC_CLAW_LOGIN_SECRET: LOGIN_SECRET,
    },
    label: '启动开发环境',
  });
  await waitForHttpReady(`${API_ORIGIN}/health`);
  await waitForHttpReady(WEB_ORIGIN);

  return {
    startedBySmoke: true,
    async stop() {
      await runCommand(resolvePythonCommand(), ['tools/start_launcher.py', '--stop'], {
        cwd: PROJECT_ROOT,
        label: '停止开发环境',
      });
    },
  };
}

async function isManagedDevEnvironmentReady() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const payload = JSON.parse(await fsPromises.readFile(STATE_FILE, 'utf8'));
      const services = payload?.services;
      if (services && typeof services === 'object') {
        return await Promise.all([
          isPortListening(23330),
          isPortListening(23333),
        ]).then((values) => values.every(Boolean));
      }
    }

    return await Promise.all([
      isPortListening(23330),
      isPortListening(23333),
    ]).then((values) => values.every(Boolean));
  } catch {
    return false;
  }
}

async function createProviderThroughUi(page, accessToken, fakeOpenAiUrl) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('a[href="/ai"]').click();
  await page.waitForURL(/\/ai$/, { timeout: REQUEST_TIMEOUT_MS });
  await page.getByRole('heading', { name: 'AI 设置' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });
  let saveError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.getByRole('button', { exact: true, name: '新增' }).click();
    const dialog = page.locator('[data-test="provider-dialog-overlay"]');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('select').nth(0).selectOption('protocol');
    await dialog.locator('select').nth(1).selectOption('openai');
    await dialog.getByPlaceholder('openai 或 my-company').fill(PROVIDER_ID);
    await dialog.getByPlaceholder('显示名称').fill(PROVIDER_NAME);
    await dialog.getByPlaceholder('https://...').fill(fakeOpenAiUrl);
    await dialog.getByPlaceholder('gpt-4o-mini').fill(MODEL_ID);
    await dialog.getByPlaceholder('sk-...').fill('smoke-openai-key');
    await dialog.getByPlaceholder('每行一个模型 ID，或用逗号分隔').fill(MODEL_ID);

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT'
          && response.url().endsWith(`/api/ai/providers/${PROVIDER_ID}`),
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await dialog.getByRole('button', { name: '保存' }).click();
    const saveResponse = await saveResponsePromise;
    if (saveResponse.ok()) {
      saveError = null;
      break;
    }

    saveError = `provider 保存请求失败: ${saveResponse.status()} ${await saveResponse.text()}`;
    if (attempt === 3) {
      throw new Error(saveError);
    }
    await waitForHttpReady(`${API_ORIGIN}/health`);
    await page.goto('/ai', { waitUntil: 'networkidle' });
  }

  await waitFor(async () => {
    const providers = await requestJson('/ai/providers', {
      headers: createAuthHeaders(accessToken),
    }).catch(() => []);
    return providers.some((provider) => provider.id === PROVIDER_ID) ? true : null;
  }, '等待 smoke provider 创建完成');

  await page.getByText(PROVIDER_NAME, { exact: false }).first().click();
  const contextLengthInput = page.locator(`[data-test="context-length-input-${MODEL_ID}"]`);
  await contextLengthInput.waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await contextLengthInput.evaluate((node, value) => {
    node.value = value;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, '65536');
  const saveButton = page.locator(`[data-test="context-length-save-${MODEL_ID}"]`);
  await waitFor(async () => (await saveButton.isDisabled()) ? null : true, '等待上下文长度保存按钮可用');
  await saveButton.click();

  await waitFor(async () => {
    const models = await requestJson(`/ai/providers/${PROVIDER_ID}/models`, {
      headers: createAuthHeaders(accessToken),
    }).catch(() => []);
    return models.find((model) => model.id === MODEL_ID)?.contextLength === 65536 ? true : null;
  }, '等待上下文长度持久化');

  await page.getByRole('button', { name: '编辑' }).click();
  const editDialog = page.locator('[data-test="provider-dialog-overlay"]');
  await editDialog.waitFor({ state: 'visible' });
  await editDialog.getByPlaceholder('gpt-4o-mini').fill(SHADOW_MODEL_ID);
  await editDialog.getByPlaceholder('每行一个模型 ID，或用逗号分隔').fill(SHADOW_MODEL_ID);
  const removeOriginalModelResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT'
        && response.url().endsWith(`/api/ai/providers/${PROVIDER_ID}`),
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await editDialog.getByRole('button', { name: '保存' }).click();
  const removeOriginalModelResponse = await removeOriginalModelResponsePromise;
  assert.equal(removeOriginalModelResponse.ok(), true, '删除原模型的 provider 保存请求失败');

  await waitFor(async () => {
    const models = await requestJson(`/ai/providers/${PROVIDER_ID}/models`, {
      headers: createAuthHeaders(accessToken),
    }).catch(() => []);
    const originalModel = models.find((model) => model.id === MODEL_ID);
    const shadowModel = models.find((model) => model.id === SHADOW_MODEL_ID);
    return !originalModel && shadowModel ? true : null;
  }, '等待原模型从 provider 配置中移除');

  await page.getByRole('button', { name: '编辑' }).click();
  await editDialog.waitFor({ state: 'visible' });
  await editDialog.getByPlaceholder('gpt-4o-mini').fill(MODEL_ID);
  await editDialog.getByPlaceholder('每行一个模型 ID，或用逗号分隔').fill([MODEL_ID, SHADOW_MODEL_ID].join('\n'));
  const readdOriginalModelResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT'
        && response.url().endsWith(`/api/ai/providers/${PROVIDER_ID}`),
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await editDialog.getByRole('button', { name: '保存' }).click();
  const readdOriginalModelResponse = await readdOriginalModelResponsePromise;
  assert.equal(readdOriginalModelResponse.ok(), true, '重新加入原模型的 provider 保存请求失败');

  await waitFor(async () => {
    const models = await requestJson(`/ai/providers/${PROVIDER_ID}/models`, {
      headers: createAuthHeaders(accessToken),
    }).catch(() => []);
    return models.find((model) => model.id === MODEL_ID)?.contextLength === 128 * 1024 ? true : null;
  }, '等待重新加入的原模型恢复默认上下文长度');

  await waitFor(async () => {
    const currentValue = await contextLengthInput.inputValue().catch(() => '');
    return currentValue === String(128 * 1024) ? true : null;
  }, '等待前端模型面板展示重新加入模型的默认上下文长度');
}

async function runChatFlow(page, accessToken) {
  const beforeIds = new Set((await listConversations(accessToken)).map((item) => item.id));
  await page.goto('/', { waitUntil: 'networkidle' });
  const createConversationResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST'
      && response.url().endsWith('/api/chat/conversations'),
  );
  await page.getByRole('button', { name: '新对话' }).click();
  const createResponse = await createConversationResponse;
  assert.equal(createResponse.ok(), true, '新对话请求失败');
  const conversation = await waitFor(async () => {
    const conversations = await listConversations(accessToken);
    return conversations.find((item) => !beforeIds.has(item.id)) ?? null;
  }, '等待新对话创建');
  await expectConversationSelected(page, conversation.id);

  const modelInput = page.locator('.quick-input');
  await modelInput.click();
  await modelInput.fill(`${PROVIDER_ID}/${MODEL_ID}`);
  await modelInput.press('Tab');

  const composer = page.getByPlaceholder('输入消息，支持附带图片');
  await composer.fill(`${PREFIX} chat message`);
  await page.locator('.send-button').click();
  await waitFor(async () => {
    const assistantMessages = page.locator('.message.assistant .message-content');
    if (await assistantMessages.count() === 0) {
      return null;
    }
    const latestText = (await assistantMessages.last().textContent())?.trim() ?? '';
    return latestText.includes(`${PREFIX} chat message`) ? latestText : null;
  }, '等待前端展示 AI 回复');

  return conversation.id;
}

async function verifyMcpPage(page) {
  await page.goto('/mcp', { waitUntil: 'networkidle' });
  await expectText(page, 'MCP 管理');
  await expectText(page, 'MCP 工具治理');
  await expectText(page, 'MCP 配置');
  const configPath = (await page.locator('.mcp-config-path').textContent())?.trim() ?? '';
  assert.ok(configPath.length > 0, 'MCP 配置区未展示配置路径');
  await page.locator('[data-test="mcp-new-button"]').click();
  await page.locator('[data-test="mcp-name-input"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.locator('[data-test="mcp-command-input"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function verifyPluginsPage(page) {
  await page.goto('/plugins', { waitUntil: 'networkidle' });
  await expectText(page, '已接入插件');
  let pluginItems = page.locator('.plugin-item');
  if (await pluginItems.count() === 0) {
    const toggle = page.locator('[data-test="plugin-sidebar-toggle-system"]');
    if (await toggle.count() > 0) {
      await toggle.click();
      await page.waitForLoadState('networkidle');
      pluginItems = page.locator('.plugin-item');
    }
  }
  assert.ok(await pluginItems.count() > 0, '插件页未加载任何插件条目');
}

async function runAutomationFlow(page, accessToken, conversationId) {
  await page.goto('/automations', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '+ 新建自动化' }).click();
  const form = page.locator('.create-form');
  await form.locator('input[placeholder*="每5分钟检查系统信息"]').fill(AUTOMATION_NAME);
  await form.locator('select').nth(0).selectOption('manual');
  await form.locator('select').nth(1).selectOption('ai_message');
  await form.locator('textarea').fill(AUTOMATION_MESSAGE);
  await form.locator('select').nth(2).selectOption(conversationId);
  await page.getByRole('button', { name: '创建' }).click();
  await expectText(page, AUTOMATION_NAME);

  const automationCard = page.locator('.automation-card').filter({ hasText: AUTOMATION_NAME });
  await automationCard.getByRole('button', { name: '▶ 运行' }).click();
  await waitFor(async () => {
    const detail = await getConversationDetail(accessToken, conversationId);
    return detail.messages.some((message) => message.content === AUTOMATION_MESSAGE);
  }, '等待自动化消息写回会话');

  await automationCard.getByRole('button', { name: '删除' }).click();
  await waitFor(async () => {
    const automations = await listAutomations(accessToken);
    return !automations.some((item) => item.name === AUTOMATION_NAME);
  }, '等待自动化删除');
}

async function verifyArtifactsPresent(accessToken, conversationId) {
  const detail = await getConversationDetail(accessToken, conversationId);
  assert.ok(
    detail.messages.some((message) => message.content.includes(`${PREFIX} chat message`)),
    '聊天消息未写入目标会话',
  );
  assert.ok(
    detail.messages.some((message) => message.content === AUTOMATION_MESSAGE),
    '自动化消息未写入目标会话',
  );
}

async function cleanupSmokeArtifacts(accessToken, input) {
  if (!accessToken) {
    return;
  }

  const headers = createAuthHeaders(accessToken);

  try {
    const automations = await requestJson('/automations', { headers });
    for (const automation of automations.filter((item) => item.name?.startsWith(input.prefix))) {
      await requestJson(`/automations/${automation.id}`, {
        headers,
        method: 'DELETE',
      }).catch(() => undefined);
    }
  } catch {}

  try {
    if (input.conversationId) {
      await requestJson(`/chat/conversations/${input.conversationId}`, {
        headers,
        method: 'DELETE',
      }).catch(() => undefined);
    }

    const conversations = await requestJson('/chat/conversations', { headers }).catch(() => []);
    for (const conversation of conversations.filter((item) => item.title?.startsWith(input.prefix))) {
      await requestJson(`/chat/conversations/${conversation.id}`, {
        headers,
        method: 'DELETE',
      }).catch(() => undefined);
    }
  } catch {}

  try {
    const providers = await requestJson('/ai/providers', { headers }).catch(() => []);
    for (const provider of providers) {
      const detail = await requestJson(`/ai/providers/${encodeURIComponent(provider.id)}`, {
        headers,
      }).catch(() => null);
      if (!detail) {
        continue;
      }
      if (!shouldDeleteBrowserSmokeProvider({
        configuredProviderId: input.providerId,
        initialProviderIds: input.initialProviderIds,
        providerApiKey: typeof detail.apiKey === 'string' ? detail.apiKey : '',
        providerId: provider.id,
        smokePrefixRoot: SMOKE_PREFIX_ROOT,
      })) {
        continue;
      }
      await requestJson(`/ai/providers/${encodeURIComponent(provider.id)}`, {
        headers,
        method: 'DELETE',
      }).catch(() => undefined);
    } 
  } catch {}

  const [providers, automations, conversations] = await Promise.all([
    requestJson('/ai/providers', { headers }).catch(() => []),
    requestJson('/automations', { headers }).catch(() => []),
    requestJson('/chat/conversations', { headers }).catch(() => []),
  ]);
  assert.ok(
    providers.every((provider) => !provider.id?.startsWith(SMOKE_PREFIX_ROOT)),
    '清理后仍残留 smoke provider',
  );
  assert.ok(
    automations.every((automation) => !automation.name?.startsWith(input.prefix)),
    '清理后仍残留 smoke automation',
  );
  assert.ok(
    conversations.every((conversation) => !conversation.title?.startsWith(input.prefix)),
    '清理后仍残留 smoke conversation',
  );
}

async function listConversations(accessToken) {
  return requestJson('/chat/conversations', {
    headers: createAuthHeaders(accessToken),
  });
}

async function getConversationDetail(accessToken, conversationId) {
  return requestJson(`/chat/conversations/${conversationId}`, {
    headers: createAuthHeaders(accessToken),
  });
}

async function listAutomations(accessToken) {
  return requestJson('/automations', {
    headers: createAuthHeaders(accessToken),
  });
}

async function requestJson(routePath, options = {}) {
  const requestInit = {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    method: options.method ?? 'GET',
  };
  const response = await fetchWithRetry(`${API_ORIGIN}${routePath}`, requestInit);
  const text = await response.text();
  const payload = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${routePath} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function createAuthHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

async function readAccessToken(page) {
  return page.evaluate(() => localStorage.getItem('accessToken') ?? '');
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function expectConversationSelected(page, conversationId) {
  await waitFor(async () => {
    const activeItem = page.locator('.conversation-item.active');
    if (await activeItem.count() === 0) {
      return null;
    }
    return (await activeItem.getAttribute('data-id')) === conversationId ? true : null;
  }, '等待新会话选中');
}

async function waitFor(task, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < REQUEST_TIMEOUT_MS) {
    const result = await task();
    if (result) {
      return result;
    }
    await delay(300);
  }
  throw new Error(`${label}超时`);
}

async function waitForHttpReady(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error(`等待服务就绪超时: ${url}`);
}

function resolvePythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function fetchWithRetry(url, requestInit) {
  let lastError = null;
  for (let attempt = 0; attempt < RETRYABLE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, {
        ...requestInit,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt === RETRYABLE_FETCH_ATTEMPTS - 1) {
        break;
      }
      await delay(500 * (attempt + 1));
    }
  }
  throw lastError;
}

function parseMaybeJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runCommand(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${options.label}失败: ${code ?? 'unknown'}`));
    });
  });
}

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

async function startFakeOpenAiServer() {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/v1/models') {
        writeJson(response, 200, {
          data: [{ id: MODEL_ID, object: 'model' }],
        });
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/chat/completions') {
        const body = await readJsonBody(request);
        if (body.stream === true) {
          await writeStream(response, body);
          return;
        }

        writeJson(response, 200, {
          choices: [{
            finish_reason: 'stop',
            index: 0,
            message: {
              content: readAssistantText(body),
              role: 'assistant',
            },
          }],
          created: Math.floor(Date.now() / 1000),
          id: 'chatcmpl-ui-smoke',
          model: body.model ?? MODEL_ID,
          object: 'chat.completion',
        });
        return;
      }

      writeJson(response, 404, { error: 'unsupported' });
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
  assert.ok(address && typeof address !== 'string', 'fake OpenAI 地址无效');

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

async function writeStream(response, body) {
  response.writeHead(200, {
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'content-type': 'text/event-stream',
  });

  const text = readAssistantText(body);
  for (const chunk of splitIntoChunks(text, 3)) {
    response.write(`data: ${JSON.stringify({
      choices: [{
        delta: {
          content: chunk,
          role: 'assistant',
        },
        finish_reason: null,
        index: 0,
      }],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-ui-smoke',
      model: body.model ?? MODEL_ID,
    })}\n\n`);
    await delay(60);
  }

  response.write(`data: ${JSON.stringify({
    choices: [{
      delta: {},
      finish_reason: 'stop',
      index: 0,
    }],
    created: Math.floor(Date.now() / 1000),
    id: 'chatcmpl-ui-smoke',
    model: body.model ?? MODEL_ID,
  })}\n\n`);
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

function readAssistantText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const latest = [...messages].reverse().find((message) => message.role === 'user');
  const text = typeof latest?.content === 'string'
    ? latest.content
    : Array.isArray(latest?.content)
      ? latest.content.map((part) => part?.text ?? '').join('\n')
      : '';
  return text ? `本地 smoke 回复: ${text}` : '本地 smoke 回复。';
}

function splitIntoChunks(text, count) {
  const size = Math.max(1, Math.ceil(text.length / count));
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
