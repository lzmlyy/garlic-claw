import assert from 'node:assert/strict';
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

const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:23333';
const API_ORIGIN = 'http://127.0.0.1:23330/api';
const REQUEST_TIMEOUT_MS = readBrowserSmokeTimeoutMs('GARLIC_CLAW_BROWSER_SMOKE_REQUEST_TIMEOUT_MS', 20_000);
const STARTUP_TIMEOUT_MS = readBrowserSmokeTimeoutMs('GARLIC_CLAW_BROWSER_SMOKE_STARTUP_TIMEOUT_MS', 120_000);
const COMMAND_TIMEOUT_MS = readBrowserSmokeTimeoutMs('GARLIC_CLAW_BROWSER_SMOKE_COMMAND_TIMEOUT_MS', 180_000);
// 冷启动时后端首轮编译、Nest 依赖初始化和端口稳定监听可能明显超过 30 秒。
// 这里过低只会把 launcher 的真实成功启动误判成失败。
const DEV_SERVICE_WAIT_TIMEOUT_SECONDS = readBrowserSmokeTimeoutSeconds(
  'GARLIC_CLAW_BROWSER_SMOKE_DEV_SERVICE_WAIT_TIMEOUT_SECONDS',
  90,
);
// `start_launcher.py restart` 会串行做预检、依赖校验、构建、端口探测与 HTTP 健康检查。
// 在 Windows 冷启动或 lockfile 变动后，固定 90s 很容易与真实完成时间撞线。
const DEV_RESTART_TIMEOUT_MS = readBrowserSmokeTimeoutMs(
  'GARLIC_CLAW_BROWSER_SMOKE_DEV_RESTART_TIMEOUT_MS',
  Math.max(COMMAND_TIMEOUT_MS, STARTUP_TIMEOUT_MS),
);
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
const LIVE_AUTOMATION_NAME = `${PREFIX}-automation-live`;
const LIVE_AUTOMATION_USER_MARKER = `${PREFIX} automation live weather`;
const LIVE_AUTOMATION_RESULT_TEXT = '北京当前晴朗，气温约为22摄氏度（72华氏度）。';
const LIVE_AUTOMATION_WEATHER_RESPONSE = 'beijing: ☀️  +72°F';
const REMOTE_PLUGIN_ID = `${PREFIX}-remote-iot-light`;
const SUBAGENT_NAME = '浏览器烟测分身';
const SUBAGENT_TRIGGER = '请使用 subagent 工具委派一个探索任务，并把子代理命名为 浏览器烟测分身。';
const SUBAGENT_RESULT_TEXT = 'Smoke HTTP Flow 用于后端烟测。';
let suppressExpectedTeardownConsoleErrors = false;
let browserSmokeCompleted = false;
let webOrigin = process.env.GARLIC_CLAW_WEB_ORIGIN || DEFAULT_WEB_ORIGIN;

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const tempRoot = path.join(PROJECT_ROOT, 'workspace', 'test-artifacts', 'browser-smoke');
  await fsPromises.mkdir(tempRoot, { recursive: true });
  const tempDir = await fsPromises.mkdtemp(path.join(tempRoot, 'browser-smoke-'));
  const remotePluginScriptPath = path.join(tempDir, 'remote-plugin.cjs');
  let fakeOpenAi = null;
  let serviceSession = {
    mode: 'uninitialized',
    async stop() {},
  };
  let browser = null;
  let context = null;
  let page = null;
  let tracingStarted = false;
  let runError = null;
  const pageErrors = [];
  const consoleErrors = [];
  const handlePageError = (error) => {
    pageErrors.push(serializeError(error));
    console.error('[browser-smoke:pageerror]', error);
  };
  const handlePageConsole = (message) => {
    if (
      suppressExpectedTeardownConsoleErrors
      && message.type() === 'error'
      && message.text().includes('Failed to fetch')
    ) {
      return;
    }
    if (message.type() === 'error') {
      consoleErrors.push({
        location: message.location(),
        text: message.text(),
        type: message.type(),
      });
      console.error('[browser-smoke:console]', message.text());
    }
  };
  let accessToken = '';
  let createdConversationId = null;
  const createdConversationIds = new Set();
  let initialProviderIds = new Set();
  let remotePluginHandle = null;

  try {
    fakeOpenAi = await startFakeOpenAiServer();
    await prepareRemotePluginScript(remotePluginScriptPath);
    serviceSession = await ensureDevServices();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      baseURL: webOrigin,
    });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    tracingStarted = true;
    page = await context.newPage();
    page.on('pageerror', handlePageError);
    page.on('console', handlePageConsole);

    accessToken = await loginBrowserSmokeAdmin();
    await page.addInitScript((token) => {
      try {
        window.localStorage.setItem('accessToken', token);
      } catch {}
    }, accessToken);
    initialProviderIds = new Set((await requestJson('/ai/providers', {
      headers: createAuthHeaders(accessToken),
    }).catch(() => [])).map((provider) => provider.id));
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate((token) => {
      try {
        window.localStorage.setItem('accessToken', token);
      } catch {}
    }, accessToken);
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: '新对话' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });

    await cleanupSmokeArtifacts(accessToken, {
      conversationId: null,
      conversationIds: [],
      initialProviderIds,
      prefix: PREFIX,
      providerId: PROVIDER_ID,
    });

    await createProviderThroughUi(page, accessToken, fakeOpenAi.url);
    const chatFlow = await runChatFlow(page, accessToken, createdConversationIds);
    createdConversationId = chatFlow.conversationId;
    await runAutomationLiveRefreshFlow(page, accessToken, createdConversationId, fakeOpenAi.url);
    await verifyMcpPage(page);
    await verifyPersonasPage(page);
    await verifySkillsPage(page);
    await verifyCommandsPage(page);
    await verifySubagentsPage(page, accessToken, chatFlow);
    remotePluginHandle = await verifyPluginsPage(page, accessToken, remotePluginScriptPath);
    await verifyRuntimeToolsSettingsPage(page);
    await verifyToolsPage(page, accessToken);
    await runAutomationFlow(page, accessToken, createdConversationId);
    await verifyArtifactsPresent(accessToken, createdConversationId);

    await page.goto('about:blank', { waitUntil: 'load' });
    console.log('browser UI smoke passed');
    browserSmokeCompleted = true;
    page.off('pageerror', handlePageError);
    page.off('console', handlePageConsole);
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    const keepArtifacts = shouldKeepSmokeArtifacts(cli.artifactMode, !browserSmokeCompleted);
    suppressExpectedTeardownConsoleErrors = true;
    await page?.evaluate(() => {
      window.__GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__ = true;
    }).catch(() => undefined);
    if (!browserSmokeCompleted && page) {
      page.off('pageerror', handlePageError);
      page.off('console', handlePageConsole);
    }
    if (context && tracingStarted) {
      if (keepArtifacts) {
        await context.tracing.stop({
          path: path.join(tempDir, 'playwright-trace.zip'),
        }).catch(() => undefined);
      } else {
        await context.tracing.stop().catch(() => undefined);
      }
    }
    if (keepArtifacts) {
      await persistBrowserSmokeArtifacts(tempDir, {
        consoleErrors,
        error: runError,
        page,
        pageErrors,
        serviceMode: serviceSession.mode,
        webOrigin,
      });
    }
    await Promise.allSettled([
      context?.close?.() ?? Promise.resolve(),
      browser?.close?.() ?? Promise.resolve(),
    ]);
    await Promise.allSettled([
      cleanupSmokeArtifacts(accessToken, {
        conversationId: createdConversationId,
        conversationIds: [...createdConversationIds],
        initialProviderIds,
        prefix: PREFIX,
        providerId: PROVIDER_ID,
      }),
      remotePluginHandle?.stop?.() ?? Promise.resolve(),
      fakeOpenAi?.close?.() ?? Promise.resolve(),
      keepArtifacts
        ? Promise.resolve()
        : fsPromises.rm(tempDir, { recursive: true, force: true }),
    ]);
    if (!keepArtifacts) {
      await removeEmptyDirectoryChain(tempRoot, path.join(PROJECT_ROOT, 'workspace'));
    } else {
      console.error(`[browser-smoke] 已保留${browserSmokeCompleted ? '运行' : '失败'}产物: ${tempDir}`);
    }
    await serviceSession.stop();
  }
}

async function ensureDevServices() {
  const [apiReady, webReady] = await Promise.all([
    isPortListening(23330),
    isPortListening(23333),
  ]);
  const webIsGarlic = webReady ? await isGarlicWebApp(webOrigin) : false;
  const apiAcceptsSmokeLogin = apiReady ? await canReuseBrowserSmokeBackend() : false;
  console.log(`[browser-smoke] service probe apiReady=${apiReady} webReady=${webReady} webIsGarlic=${webIsGarlic} apiAcceptsSmokeLogin=${apiAcceptsSmokeLogin}`);

  if (apiReady && webReady && webIsGarlic && apiAcceptsSmokeLogin) {
    console.log('[browser-smoke] reuse existing backend and web dev services');
    return {
      mode: 'reuse',
      async stop() {},
    };
  }

  if (apiReady && webReady && webIsGarlic && !apiAcceptsSmokeLogin) {
    console.log('[browser-smoke] existing Garlic backend does not accept smoke login secret, restart managed dev services');
  }

  if (webReady && !webIsGarlic) {
    if (apiReady && !apiAcceptsSmokeLogin) {
      throw new Error('浏览器 smoke 检测到现有后端端口被占用，但当前服务不接受 smoke 登录密钥，无法安全复用或隔离启动。');
    }
    console.log('[browser-smoke] keep external web port, start isolated Garlic services');
    const started = [];
    if (!apiReady) {
      started.push(await startBrowserSmokeBackendApp());
    }
    started.push(await startBrowserSmokeWebApp());
    await Promise.all([
      waitForHttpReady(`${API_ORIGIN}/health`),
      waitForHttpReady(webOrigin),
    ]);
    return {
      mode: 'isolated-web',
      async stop() {
        await Promise.all(started.map((entry) => entry.stop()));
      },
    };
  }

  if (webReady && !apiReady) {
    console.log('[browser-smoke] reuse existing web, start backend only');
    const backendApp = await startBrowserSmokeBackendApp();
    await waitForHttpReady(`${API_ORIGIN}/health`);
    return {
      mode: 'backend-only',
      async stop() {
        await backendApp.stop();
      },
    };
  }

  console.log('[browser-smoke] restart managed dev services through launcher');
  await runCommand(resolvePythonCommand(), ['tools/start_launcher.py', 'restart'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      GARLIC_CLAW_DEV_BACKEND_APP_PORT_WAIT_TIMEOUT_SECONDS: String(DEV_SERVICE_WAIT_TIMEOUT_SECONDS),
      GARLIC_CLAW_DEV_BACKEND_COMPILER_WAIT_TIMEOUT_SECONDS: String(DEV_SERVICE_WAIT_TIMEOUT_SECONDS),
      GARLIC_CLAW_LOGIN_SECRET: LOGIN_SECRET,
    },
    label: '启动开发环境',
    timeoutMs: DEV_RESTART_TIMEOUT_MS,
  });
  await Promise.all([
    waitForHttpReady(`${API_ORIGIN}/health`),
    waitForHttpReady(webOrigin),
  ]);

  return {
    mode: 'full-stack',
    async stop() {
      await runCommand(resolvePythonCommand(), ['tools/start_launcher.py', '--stop'], {
        cwd: PROJECT_ROOT,
        label: '停止开发环境',
      });
    },
  };
}

async function isGarlicWebApp(origin) {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
    const text = await response.text();
    return text.includes('Garlic Claw - AI 秘书') && text.includes('<div id="app"></div>');
  } catch {
    return false;
  }
}

async function startBrowserSmokeBackendApp() {
  console.log('[browser-smoke] build backend for smoke');
  await runCommand(process.execPath, [readNpmCliPath(), 'run', 'build:server'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      GARLIC_CLAW_LOGIN_SECRET: LOGIN_SECRET,
    },
    label: '构建后端',
    timeoutMs: COMMAND_TIMEOUT_MS,
  });

  console.log('[browser-smoke] start backend process');
  const child = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: path.join(PROJECT_ROOT, 'packages', 'server'),
    env: {
      ...process.env,
      GARLIC_CLAW_LOGIN_SECRET: LOGIN_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});

  return {
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

async function startBrowserSmokeWebApp() {
  const port = await getFreePort();
  webOrigin = `http://127.0.0.1:${port}`;
  console.log(`[browser-smoke] start isolated web dev server on ${webOrigin}`);
  const child = spawn(process.execPath, [readViteCliPath(), '--host', '127.0.0.1', '--port', String(port)], {
    cwd: path.join(PROJECT_ROOT, 'packages', 'web'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  await waitForHttpReady(webOrigin);
  return {
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

async function createProviderThroughUi(page, accessToken, fakeOpenAiUrl) {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('nav[aria-label="后台导航"]').getByRole('link', { exact: true, name: 'AI 设置' }).click();
  await page.waitForURL(/\/ai$/, { timeout: REQUEST_TIMEOUT_MS });
  await page.getByRole('heading', { name: 'AI 设置' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });
  let saveError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.getByRole('button', { name: /新增服务商|新增/ }).click();
    const { dialog, dialogBody } = getProviderEditorDialog(page);
    await dialogBody.waitFor({ state: 'visible' });
    await dialogBody.getByPlaceholder('openai 或 my-company').fill(PROVIDER_ID);
    await dialogBody.getByPlaceholder('显示名称').fill(PROVIDER_NAME);
    await dialogBody.getByPlaceholder('https://...').fill(fakeOpenAiUrl);
    await dialogBody.getByPlaceholder('sk-...').fill('smoke-openai-key');
    await dialogBody.getByPlaceholder('每行一个模型 ID，或用逗号分隔').fill(MODEL_ID);

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
    await page.goto('/ai', { waitUntil: 'load' });
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
  const currentContextLengthValue = Number(await contextLengthInput.inputValue());
  const targetContextLength = currentContextLengthValue === 65536 ? 65537 : 65536;
  const contextLengthSaveResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST'
      && response.url().endsWith(`/api/ai/providers/${PROVIDER_ID}/models/${MODEL_ID}`),
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await contextLengthInput.fill(String(targetContextLength));
  await contextLengthInput.press('Tab');
  await contextLengthSaveResponsePromise;

  await waitFor(async () => {
    const models = await requestJson(`/ai/providers/${PROVIDER_ID}/models`, {
      headers: createAuthHeaders(accessToken),
    }).catch(() => []);
    return models.find((model) => model.id === MODEL_ID)?.contextLength === targetContextLength ? true : null;
  }, '等待上下文长度持久化');

  await page.getByRole('button', { name: '编辑' }).click();
  const { dialog: editDialog, dialogBody: editDialogBody } = getProviderEditorDialog(page);
  await editDialogBody.waitFor({ state: 'visible' });
  await editDialogBody.getByPlaceholder('每行一个模型 ID，或用逗号分隔').fill(SHADOW_MODEL_ID);
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
  await editDialogBody.waitFor({ state: 'visible' });
  await editDialogBody.getByPlaceholder('每行一个模型 ID，或用逗号分隔').fill([MODEL_ID, SHADOW_MODEL_ID].join('\n'));
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

  const setDefaultResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT'
        && response.url().endsWith('/api/ai/default-selection'),
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await page.getByRole('button', { name: '设为当前默认' }).click();
  const setDefaultResponse = await setDefaultResponsePromise;
  assert.equal(setDefaultResponse.ok(), true, '设置当前默认模型请求失败');

  await waitFor(async () => {
    const selection = await requestJson('/ai/default-selection', {
      headers: createAuthHeaders(accessToken),
    }).catch(() => null);
    return selection?.providerId === PROVIDER_ID && selection?.modelId === MODEL_ID
      ? true
      : null;
  }, '等待当前默认模型持久化');
}

async function runChatFlow(page, accessToken, createdConversationIds) {
  const beforeIds = new Set((await listConversations(accessToken)).map((item) => item.id));
  await page.goto('/', { waitUntil: 'load' });
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
  createdConversationIds.add(conversation.id);
  await page.reload({ waitUntil: 'load' });
  await expectConversationSelected(page, conversation.id);

  await expectText(page, `${PROVIDER_ID}/${MODEL_ID}`);
  await page.getByRole('link', { name: '前往 AI 设置' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });

  const composer = page.getByPlaceholder('输入消息，支持附带图片');
  const firstSendFinished = page.waitForEvent('requestfinished', (request) =>
    request.method() === 'POST'
      && request.url().endsWith(`/api/chat/conversations/${conversation.id}/messages`),
  );
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
  await waitFor(async () => {
    const detail = await getConversationDetail(accessToken, conversation.id);
    const latestAssistantMessage = [...detail.messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (
      !latestAssistantMessage ||
      latestAssistantMessage.status === 'pending' ||
      latestAssistantMessage.status === 'streaming'
    ) {
      return null;
    }
    return await composer.isEnabled() ? true : null;
  }, '等待聊天恢复空闲');
  await firstSendFinished;

  await composer.fill('/compact');
  await page.locator('.send-button').click();
  let lastCompactDetail = null;
  try {
    await waitFor(async () => {
      const detail = await getConversationDetail(accessToken, conversation.id);
      lastCompactDetail = detail;
      const resultMessage = detail.messages.find((message) => hasDisplayMessageVariant(message, 'result'));
      return resultMessage
        ? true
        : null;
    }, '等待 /compact 的命令结果写入会话历史');
  } catch (error) {
    if (lastCompactDetail?.messages) {
      console.error('[browser-smoke:/compact:detail]', JSON.stringify(lastCompactDetail.messages.map((message) => ({
        content: message.content,
        id: message.id,
        metadata: readMessageMetadata(message),
        role: message.role,
        status: message.status,
      })), null, 2));
    }
    throw error;
  }

  await composer.fill(SUBAGENT_TRIGGER);
  await page.locator('.send-button').click();
  const subagentConversation = await waitFor(async () => {
    const subagents = await requestJson(`/chat/conversations/${conversation.id}/subagents`, {
      headers: createAuthHeaders(accessToken),
    }).catch(() => []);
    return subagents.find((item) => item.title === SUBAGENT_NAME) ?? null;
  }, '等待聊天触发命名子代理');
  createdConversationIds.add(subagentConversation.id);
  await waitFor(async () => {
    const tab = page.getByRole('button', { name: SUBAGENT_NAME });
    return await tab.count() > 0 ? true : null;
  }, '等待聊天顶部出现子代理标签');
  await waitFor(async () => {
    const toolEntries = page.locator('.message.assistant .tool-entry-summary');
    const count = await toolEntries.count();
    if (count < 2) {
      return null;
    }
    const combined = await toolEntries.allTextContents();
    return combined.some((text) => text.includes('spawn_subagent'))
      && combined.some((text) => text.includes('wait_subagent'))
      ? true
      : null;
  }, '等待聊天消息展示子代理工具时间线');
  await waitFor(async () => {
    const assistantMessages = page.locator('.message.assistant .message-content');
    if (await assistantMessages.count() === 0) {
      return null;
    }
    const latestText = (await assistantMessages.last().textContent())?.trim() ?? '';
    return latestText.includes(SUBAGENT_RESULT_TEXT) ? latestText : null;
  }, '等待主会话收到子代理总结');

  const subagentTab = page.getByRole('button', { name: SUBAGENT_NAME });
  await subagentTab.click();
  await waitFor(async () => {
    const text = await page.locator('.message.assistant .message-content').last().textContent().catch(() => '');
    return text?.includes(SUBAGENT_RESULT_TEXT) ? true : null;
  }, '等待切到子代理会话后看到子代理输出');

  const mainTab = page.getByRole('button', { exact: true, name: '对话' });
  await mainTab.click();
  await expectConversationSelected(page, conversation.id);

  return {
    conversationId: conversation.id,
    subagentConversationId: subagentConversation.id,
    subagentName: SUBAGENT_NAME,
  };
}

async function verifyMcpPage(page) {
  await page.goto('/mcp', { waitUntil: 'load' });
  await expectText(page, 'MCP 管理');
  await page.locator('button[title="MCP 配置"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.locator('button[title="事件日志"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await expectText(page, 'MCP 配置');
  await page.locator('[data-test="mcp-new-button"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.locator('[data-test="mcp-new-button"]').click();
  await page.locator('[data-test="mcp-name-input"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.locator('[data-test="mcp-command-input"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function verifyPersonasPage(page) {
  await page.goto('/personas', { waitUntil: 'load' });
  await expectText(page, '人设管理');
  await expectText(page, '人设仓库');
  await page.locator('nav[aria-label="人设管理面板切换"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.getByRole('button', { name: '新建人设' }).click();
  await page.locator('input[placeholder*="persona.writer"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.locator('input[placeholder="Writer"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.locator('textarea[placeholder="输入人设的系统提示词。"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function verifySkillsPage(page) {
  await page.goto('/skills', { waitUntil: 'load' });
  await expectText(page, '技能目录');
  await expectText(page, '已启用');
  await page.getByPlaceholder('搜索技能名称、说明、标签').waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function verifyCommandsPage(page) {
  await page.goto('/commands', { waitUntil: 'load' });
  await expectText(page, '命令管理');
  await expectText(page, '冲突触发词');
  await expectText(page, '命令目录');
  await page.getByPlaceholder('搜索插件、命令、别名或说明').waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function verifyPluginsPage(page, accessToken, remotePluginScriptPath) {
  const remotePluginHandle = await createCachedRemotePluginFixture(accessToken, remotePluginScriptPath)
  await page.goto(`/plugins?plugin=${encodeURIComponent(REMOTE_PLUGIN_ID)}`, { waitUntil: 'load' });
  await expectText(page, '插件管理');
  await page.locator('[data-test="plugin-sidebar-search"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  const pluginItems = page.locator('.plugin-item');
  assert.ok(await pluginItems.count() > 0, '插件页未加载任何插件条目');
  await page.getByRole('button', { exact: true, name: '远程摘要' }).click();
  await page.locator('[data-test="plugin-remote-summary-panel"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await expectText(page, '远程接入');
  await expectText(page, 'IoT 远程插件');
  await expectText(page, '必须 Key');
  await expectText(page, '控制型');
  await expectText(page, '已有缓存');
  await expectText(page, '高风险');

  await page.getByRole('button', { exact: true, name: '远程接入' }).click();
  await page.locator('[data-test="plugin-remote-access-panel"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await expectText(page, '远程接入配置');
  await page.locator('[data-test="plugin-remote-access-key"]').waitFor({ timeout: REQUEST_TIMEOUT_MS });
  return remotePluginHandle
}

async function verifyRuntimeToolsSettingsPage(page) {
  await page.goto('/ai', { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'AI 设置' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await page.getByRole('button', { exact: true, name: '执行工具' }).click();
  await page.getByRole('heading', { name: '执行工具' }).waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await expectText(page, 'bash 执行后端');
  await expectText(page, '执行工具审批模式');
  assert.equal(await page.locator('button.collapsed-toggle').count(), 0, '执行工具设置不应再出现高级配置折叠按钮');
  await expectText(page, 'bash 输出治理');
  await expectText(page, '长工具输出落盘');
}

async function verifyToolsPage(page, accessToken) {
  const overview = await requestJson('/tools/overview', {
    headers: createAuthHeaders(accessToken),
  });
  const visibleSectionTitles = new Set(
    (overview.sources ?? [])
      .filter((source) => Number(source.totalTools ?? 0) > 0)
      .map((source) => {
        if (source.kind === 'internal' && source.id === 'runtime-tools') {
          return '执行工具管理';
        }
        if (source.kind === 'internal' && source.id === 'subagent') {
          return '子代理工具管理';
        }
        if (source.kind === 'mcp') {
          return 'MCP 工具管理';
        }
        if (source.kind === 'plugin') {
          return '插件工具管理';
        }
        return null;
      })
      .filter(Boolean),
  );

  await page.goto('/tools', { waitUntil: 'load' });
  await expectText(page, '工具管理');
  await assertToolsPanelVisibility(page, '执行工具', '执行工具管理', visibleSectionTitles.has('执行工具管理'));
  await assertToolsPanelVisibility(page, '子代理工具', '子代理工具管理', visibleSectionTitles.has('子代理工具管理'));
  await assertToolsPanelVisibility(page, 'MCP 工具', 'MCP 工具管理', visibleSectionTitles.has('MCP 工具管理'));
  await assertToolsPanelVisibility(page, '插件工具', '插件工具管理', visibleSectionTitles.has('插件工具管理'));

  if (visibleSectionTitles.size === 0) {
    await expectText(page, '当前还没有可管理的实际工具');
  }
}

async function verifySubagentsPage(page, accessToken, chatFlow) {
  const overview = await requestJson('/subagents/overview', {
    headers: createAuthHeaders(accessToken),
  });
  const subagent = overview.subagents.find((item) => item.conversationId === chatFlow.subagentConversationId);
  assert.ok(subagent, '子代理总览没有返回浏览器 smoke 创建的子代理');
  assert.equal(subagent.title, chatFlow.subagentName, '子代理总览没有保留命名标题');
  assert.equal(subagent.resultPreview, SUBAGENT_RESULT_TEXT, '子代理总览没有返回 smoke 结果摘要');

  await page.goto('/subagents', { waitUntil: 'load' });
  await expectText(page, 'Subagent');
  await expectText(page, '会话窗口');
  await expectText(page, chatFlow.subagentName);
  await expectText(page, SUBAGENT_RESULT_TEXT);
}

async function runAutomationFlow(page, accessToken, conversationId) {
  await page.goto('/automations', { waitUntil: 'load' });
  await page.getByRole('button', { name: /新建自动化|新建/ }).click();
  const dialog = page.getByRole('dialog', { name: '新建自动化' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByPlaceholder('例如：每5分钟检查系统信息').fill(AUTOMATION_NAME);
  await selectElementPlusOptionByIndex(page, dialog, 0, 1);
  await selectElementPlusOptionByIndex(page, dialog, 1, 1);
  await dialog.locator('textarea').fill(AUTOMATION_MESSAGE);
  const conversations = await listConversations(accessToken);
  const targetConversationIndex = conversations.findIndex((conversation) => conversation.id === conversationId);
  assert.notEqual(targetConversationIndex, -1, '自动化 smoke 未找到目标会话');
  await selectElementPlusOptionByIndex(page, dialog, 2, targetConversationIndex);
  await dialog.getByRole('button', { name: '创建' }).click();
  await expectText(page, AUTOMATION_NAME);

  const automationCard = page.locator('.automation-card').filter({ hasText: AUTOMATION_NAME });
  await automationCard.getByRole('button', { name: '手动运行' }).click();
  await waitFor(async () => {
    const detail = await getConversationDetail(accessToken, conversationId);
    return detail.messages.some((message) => message.content === AUTOMATION_MESSAGE);
  }, '等待自动化消息写回会话');

  const automations = await listAutomations(accessToken);
  const created = automations.find((item) => item.name === AUTOMATION_NAME);
  assert.ok(created, '自动化创建后未能通过接口读取到记录');
  await requestJson(`/automations/${created.id}`, {
    headers: createAuthHeaders(accessToken),
    method: 'DELETE',
  });
  await waitFor(async () => {
    const automations = await listAutomations(accessToken);
    return !automations.some((item) => item.name === AUTOMATION_NAME);
  }, '等待自动化删除');
}

async function runAutomationLiveRefreshFlow(page, accessToken, conversationId, fakeOpenAiUrl) {
  await page.goto('/', { waitUntil: 'load' });
  await expectConversationSelected(page, conversationId);

  const weatherUrl = fakeOpenAiUrl.replace(/\/v1$/, '/mock-weather/beijing');
  const automation = await requestJson('/automations', {
    body: {
      actions: [{
        message: [
          LIVE_AUTOMATION_USER_MARKER,
          '请完成浏览器 smoke 外部自动化天气任务。',
          '必须调用 powershell 工具。',
          `请访问 ${weatherUrl} 并读取返回文本。`,
          '拿到结果后，用中文给出一句简短结论。',
        ].join('\n'),
        target: {
          id: conversationId,
          type: 'conversation',
        },
        type: 'ai_message',
      }],
      name: LIVE_AUTOMATION_NAME,
      trigger: {
        cron: '5s',
        type: 'cron',
      },
    },
    headers: createAuthHeaders(accessToken),
    method: 'POST',
  });

  try {
    await waitFor(async () => {
      const detail = await requestJson(`/automations/${automation.id}`, {
        headers: createAuthHeaders(accessToken),
      }).catch(() => null);
      const logs = await requestJson(`/automations/${automation.id}/logs`, {
        headers: createAuthHeaders(accessToken),
      }).catch(() => []);
      return detail?.lastRunAt || logs.length > 0 ? true : null;
    }, '等待实时自动化首次触发');

    await requestJson(`/automations/${automation.id}`, {
      headers: createAuthHeaders(accessToken),
      method: 'DELETE',
    }).catch(() => null);

    await waitFor(async () => {
      const count = await page.getByText(LIVE_AUTOMATION_USER_MARKER, { exact: false }).count();
      return count > 0 ? true : null;
    }, '等待聊天页显示外部 cron 触发消息');

    await waitFor(async () => {
      const entries = page.locator('.message.assistant .tool-entry-summary');
      const texts = await entries.allTextContents();
      return texts.some((text) => text.includes('powershell')) ? true : null;
    }, '等待聊天页显示外部 cron 的工具调用');

    await waitFor(async () => {
      const entries = page.locator('.message.assistant details.tool-entry.result');
      const texts = await entries.allTextContents();
      return texts.some((text) => text.includes('powershell')) ? true : null;
    }, '等待聊天页显示外部 cron 的工具结果');

    await waitFor(async () => {
      const assistantMessages = page.locator('.message.assistant .message-content');
      if (await assistantMessages.count() === 0) {
        return null;
      }
      const latestText = (await assistantMessages.last().textContent())?.trim() ?? '';
      return latestText.includes(LIVE_AUTOMATION_RESULT_TEXT) ? latestText : null;
    }, '等待聊天页显示外部 cron 的最终完成回复');
  } finally {
    await requestJson(`/automations/${automation.id}`, {
      headers: createAuthHeaders(accessToken),
      method: 'DELETE',
    }).catch(() => null);
  }
}

async function selectElementPlusOptionByIndex(page, container, index, optionIndex) {
  const nativeSelect = container.locator('select').nth(index);
  if (await nativeSelect.count()) {
    await nativeSelect.selectOption({ index: optionIndex });
    return;
  }

  const select = container.locator('.el-select').nth(index);
  await select.click();
  const optionCount = await page.evaluate(() => {
    const visibleDropdowns = [...document.querySelectorAll('.el-select-dropdown')]
      .filter((element) => getComputedStyle(element).display !== 'none');
    const dropdown = visibleDropdowns.at(-1);
    if (!dropdown) {
      return 0;
    }
    return [...dropdown.querySelectorAll('.el-select-dropdown__item')]
      .filter((element) => !element.classList.contains('is-disabled'))
      .length;
  });
  assert.ok(
    optionIndex >= 0 && optionIndex < optionCount,
    `自动化 smoke 目标会话索引越界: index=${optionIndex}, optionCount=${optionCount}`,
  );
  for (let step = 0; step < optionIndex; step += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
}

function getProviderEditorDialog(page) {
  const dialog = page.locator('.provider-editor-dialog').last();
  return {
    dialog,
    dialogBody: dialog.locator('[data-test="provider-dialog-overlay"]'),
  };
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
    const explicitConversationIds = Array.from(new Set([
      input.conversationId,
      ...(Array.isArray(input.conversationIds) ? input.conversationIds : []),
    ].filter(Boolean)));
    for (const conversationId of explicitConversationIds) {
      await requestJson(`/chat/conversations/${conversationId}`, {
        headers,
        method: 'DELETE',
      }).catch(() => undefined);
    }

    const smokeConversationIds = await findSmokeConversationIds(headers, SMOKE_PREFIX_ROOT);
    for (const conversationId of smokeConversationIds) {
      await requestJson(`/chat/conversations/${conversationId}`, {
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
    const plugins = await requestJson('/plugins', { headers }).catch(() => []);
    for (const plugin of plugins.filter((item) => item.name?.startsWith(input.prefix))) {
      await requestJson(`/plugins/${encodeURIComponent(plugin.name)}`, {
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

  const [providers, automations, conversations, plugins] = await Promise.all([
    requestJson('/ai/providers', { headers }).catch(() => []),
    requestJson('/automations', { headers }).catch(() => []),
    requestJson('/chat/conversations', { headers }).catch(() => []),
    requestJson('/plugins', { headers }).catch(() => []),
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
    conversations.every((conversation) => !conversation.title?.startsWith(SMOKE_PREFIX_ROOT)),
    '清理后仍残留 smoke conversation',
  );
  const lingeringSmokeConversationIds = await findSmokeConversationIds(headers, SMOKE_PREFIX_ROOT);
  assert.equal(
    lingeringSmokeConversationIds.length,
    0,
    '清理后仍残留带 smoke 消息内容的会话',
  );
  assert.ok(
    plugins.every((plugin) => !plugin.name?.startsWith(input.prefix)),
    '清理后仍残留 smoke plugin',
  );
}

async function persistBrowserSmokeArtifacts(tempDir, input) {
  const summary = {
    capturedAt: new Date().toISOString(),
    consoleErrors: input.consoleErrors,
    error: serializeError(input.error),
    pageErrors: input.pageErrors,
    pageUrl: input.page?.url?.() ?? null,
    serviceMode: input.serviceMode,
    status: input.error ? 'failed' : 'completed',
    webOrigin: input.webOrigin,
  };
  await fsPromises.writeFile(path.join(tempDir, 'smoke-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (input.page) {
    await input.page.screenshot({
      fullPage: true,
      path: path.join(tempDir, 'page.png'),
    }).catch(() => undefined);
    const pageContent = await input.page.content().catch(() => null);
    if (typeof pageContent === 'string') {
      await fsPromises.writeFile(path.join(tempDir, 'page.html'), pageContent, 'utf8');
    }
  }
}

async function removeEmptyDirectoryChain(startPath, stopPath) {
  let currentPath = path.resolve(startPath);
  const resolvedStopPath = path.resolve(stopPath);
  while (currentPath.startsWith(resolvedStopPath) && currentPath !== resolvedStopPath) {
    try {
      const entries = await fsPromises.readdir(currentPath);
      if (entries.length > 0) {
        return;
      }
      await fsPromises.rmdir(currentPath);
      currentPath = path.dirname(currentPath);
    } catch {
      return;
    }
  }
}

async function findSmokeConversationIds(headers, smokePrefixRoot) {
  const conversations = await requestJson('/chat/conversations', { headers }).catch(() => []);
  const conversationIds = new Set();

  for (const conversation of conversations) {
    if (conversation.title?.startsWith(smokePrefixRoot)) {
      conversationIds.add(conversation.id);
      continue;
    }
    const detail = await requestJson(`/chat/conversations/${conversation.id}`, {
      headers,
    }).catch(() => null);
    if (detail?.messages?.some((message) => conversationMessageContainsSmokePrefix(message, smokePrefixRoot))) {
      conversationIds.add(conversation.id);
    }
  }

  return [...conversationIds];
}

function conversationMessageContainsSmokePrefix(message, smokePrefixRoot) {
  if (typeof message?.content === 'string') {
    return message.content.includes(smokePrefixRoot);
  }

  if (typeof message?.content === 'undefined' || message?.content === null) {
    return false;
  }

  return JSON.stringify(message.content).includes(smokePrefixRoot);
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

async function loginBrowserSmokeAdmin() {
  const payload = await requestBrowserSmokeLoginPayload();
  assert.equal(typeof payload?.accessToken, 'string', '浏览器 smoke 登录未返回 accessToken');
  return payload.accessToken;
}

async function canReuseBrowserSmokeBackend() {
  try {
    const payload = await requestBrowserSmokeLoginPayload();
    return typeof payload?.accessToken === 'string';
  } catch {
    return false;
  }
}

async function requestBrowserSmokeLoginPayload() {
  const response = await fetchWithRetry(`${API_ORIGIN}/auth/login`, {
    body: JSON.stringify({ secret: LOGIN_SECRET }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  return response.json();
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
  const response = await fetch(`${API_ORIGIN}${routePath}`, {
    ...requestInit,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
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

async function assertToolsSectionVisibility(page, title, shouldExist) {
  const matches = page.getByText(title, { exact: true });
  if (shouldExist) {
    await matches.first().waitFor({ timeout: REQUEST_TIMEOUT_MS });
    return;
  }

  await delay(200);
  assert.equal(await matches.count(), 0, `工具页不应展示 ${title}`);
}

async function assertToolsPanelVisibility(page, buttonTitle, sectionTitle, shouldExist) {
  const panelButtons = page.locator(`button[title="${buttonTitle}"]`);
  if (!shouldExist) {
    await delay(200);
    assert.equal(await panelButtons.count(), 0, `工具页不应展示 ${buttonTitle} 面板入口`);
    return;
  }

  await panelButtons.first().waitFor({ timeout: REQUEST_TIMEOUT_MS });
  await panelButtons.first().click();
  await page.getByText(sectionTitle, { exact: true }).first().waitFor({ timeout: REQUEST_TIMEOUT_MS });
}

async function expectConversationSelected(page, conversationId) {
  const targetItem = page.locator(`.conversation-item[data-id="${conversationId}"]`);
  await targetItem.waitFor({ timeout: REQUEST_TIMEOUT_MS });
  if (!(await targetItem.getAttribute('class'))?.includes('active')) {
    await targetItem.click();
  }
  await waitFor(async () => {
    const className = await targetItem.getAttribute('class');
    return className?.includes('active') ? true : null;
  }, '等待新会话选中');
}

async function waitFor(task, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < REQUEST_TIMEOUT_MS) {
    const result = await task();
    if (result) {
      return result;
    }
    await delay(100);
  }
  throw new Error(`${label}超时`);
}

function hasDisplayMessageVariant(message, variant) {
  const metadata = readMessageMetadata(message);
  if (!metadata || !Array.isArray(metadata.annotations)) {
    return false;
  }
  return metadata.annotations.some((annotation) =>
    annotation?.type === 'display-message'
    && annotation?.owner === 'conversation.display-message'
    && annotation?.data?.variant === variant,
  );
}

function readMessageMetadata(message) {
  if (message?.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)) {
    return message.metadata;
  }
  if (typeof message?.metadataJson !== 'string' || message.metadataJson.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(message.metadataJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    await delay(200);
  }
  throw new Error(`等待服务就绪超时: ${url}`);
}

function parseCliArgs(args) {
  const config = {
    artifactMode: normalizeSmokeArtifactMode(
      process.env.GARLIC_CLAW_BROWSER_SMOKE_ARTIFACT_MODE ?? process.env.GARLIC_CLAW_SMOKE_ARTIFACT_MODE,
    ),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--artifact-mode') {
      config.artifactMode = normalizeSmokeArtifactMode(args[index + 1]);
      index += 1;
    }
  }

  return config;
}

function normalizeSmokeArtifactMode(value) {
  const normalizedValue = (value ?? 'on-failure').trim().toLowerCase();
  if (normalizedValue === 'always' || normalizedValue === 'on-failure' || normalizedValue === 'never') {
    return normalizedValue;
  }
  throw new Error('browser smoke artifact mode must be always, on-failure, or never');
}

function shouldKeepSmokeArtifacts(artifactMode, smokeFailed) {
  if (artifactMode === 'always') {
    return true;
  }
  if (artifactMode === 'never') {
    return false;
  }
  return smokeFailed;
}

function resolvePythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

function readNpmCliPath() {
  if (typeof process.env.npm_execpath === 'string' && process.env.npm_execpath.trim()) {
    return process.env.npm_execpath;
  }
  throw new Error('当前环境缺少 npm_execpath，无法从浏览器 smoke 补启动后端');
}

function readViteCliPath() {
  return path.join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
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

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack ?? null,
    };
  }
  return {
    message: error ? String(error) : null,
    name: error ? 'NonError' : null,
    stack: null,
  };
}

async function runCommand(command, args, options) {
  await new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
    const timeoutHandle = options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
        void stopSmokeCommandProcess(child.pid);
        finish(() => reject(new Error(`${options.label}超时: ${options.timeoutMs}ms`)));
      }, options.timeoutMs)
      : null;
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      callback();
    };
    child.once('error', (error) => finish(() => reject(error)));
    child.once('exit', (code) => {
      if (code === 0) {
        finish(resolve);
        return;
      }
      finish(() => reject(new Error(`${options.label}失败: ${code ?? 'unknown'}`)));
    });
  });
}

async function stopSmokeCommandProcess(pid) {
  if (!pid || pid <= 0) {
    return;
  }
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => resolve(undefined));
      killer.once('exit', () => resolve(undefined));
    });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

function readBrowserSmokeTimeoutMs(envName, fallback) {
  const raw = process.env[envName]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readBrowserSmokeTimeoutSeconds(envName, fallback) {
  const raw = process.env[envName]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('无法分配临时端口')));
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

async function createCachedRemotePluginFixture(accessToken, remotePluginScriptPath) {
  const headers = createAuthHeaders(accessToken)
  await requestJson(`/plugins/${encodeURIComponent(REMOTE_PLUGIN_ID)}/remote-access`, {
    body: {
      access: {
        accessKey: 'smoke-remote-access-key',
        serverUrl: 'ws://127.0.0.1:23331',
      },
      displayName: 'Smoke UI Remote Light',
      remote: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'actuate',
        remoteEnvironment: 'iot',
      },
      version: '1.0.0',
    },
    headers,
    method: 'PUT',
  })

  const remoteConnection = await requestJson(`/plugins/${encodeURIComponent(REMOTE_PLUGIN_ID)}/remote-connection`, {
    headers,
  })
  const remotePluginHandle = await startRemotePluginFixture(remotePluginScriptPath, remoteConnection)
  await waitForPluginHealthStatus(accessToken, REMOTE_PLUGIN_ID, 'healthy')
  await remotePluginHandle.stop()
  await waitForPluginHealthStatus(accessToken, REMOTE_PLUGIN_ID, 'offline')
  return remotePluginHandle
}

async function waitForPluginHealthStatus(accessToken, pluginId, expectedStatus) {
  return waitFor(async () => {
    const health = await requestJson(`/plugins/${encodeURIComponent(pluginId)}/health`, {
      headers: createAuthHeaders(accessToken),
    }).catch(() => null)
    return health?.status === expectedStatus ? health : null
  }, `等待插件健康状态切换为 ${expectedStatus}`)
}

async function prepareRemotePluginScript(filePath) {
  await fsPromises.writeFile(filePath, [
    "const { PluginClient } = require('@garlic-claw/plugin-sdk/client');",
    '',
    "const remoteConnection = JSON.parse(process.env.SMOKE_REMOTE_CONNECTION || '{}');",
    'const client = PluginClient.fromRemoteAccess(remoteConnection, {',
    '  autoReconnect: false,',
    '  manifest: {',
    "    name: 'Smoke UI Remote Light',",
    "    version: '1.0.0',",
    "    description: 'Temporary remote IoT light plugin for browser smoke verification.',",
    "    permissions: ['conversation:write'],",
    '    tools: [',
    '      {',
    "        name: 'light.turnOn',",
    "        description: 'Turn on the smoke UI light.',",
    '        parameters: {},',
    '      },',
    '    ],',
    '    hooks: [],',
    '    routes: [',
    '      {',
    "        path: 'inspect/context',",
    "        methods: ['GET'],",
    "        description: 'Inspect route for browser smoke verification.',",
    '      },',
    '    ],',
    '  },',
    '});',
    '',
    "client.onCommand('light.turnOn', async () => ({ isOn: true }));",
    "client.onRoute('inspect/context', async () => ({ status: 200, body: { ok: true } }));",
    '',
    'client.connect();',
    '',
    'const shutdown = async () => {',
    '  await client.disconnect();',
    '  setTimeout(() => process.exit(0), 10);',
    '};',
    '',
    "process.on('SIGINT', shutdown);",
    "process.on('SIGTERM', shutdown);",
  ].join('\n'), 'utf8')
}

async function startRemotePluginFixture(scriptPath, remoteConnection) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SMOKE_REMOTE_CONNECTION: JSON.stringify(remoteConnection),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return {
    child,
    async stop() {
      if (child.exitCode !== null) {
        return
      }
      child.kill()
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(5_000).then(() => undefined),
      ])
    },
  }
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

      if (request.method === 'GET' && request.url === '/mock-weather/beijing') {
        response.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
        });
        response.end(LIVE_AUTOMATION_WEATHER_RESPONSE);
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/chat/completions') {
        const body = await readJsonBody(request);
        if (body.stream === true) {
          await writeStream(response, body);
          return;
        }

        writeJson(response, 200, createChatCompletion(body));
        return;
      }

      writeJson(response, 404, { error: 'unsupported' });
    } catch (error) {
      if (response.headersSent || response.writableEnded || response.destroyed) {
        if (!response.writableEnded && !response.destroyed) {
          response.end();
        }
        return;
      }
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

  const plannedResponse = planBrowserSmokeChatResponse(body);
  if (plannedResponse.kind === 'tool-call') {
    response.write(`data: ${JSON.stringify({
      choices: [{
        delta: {
          role: 'assistant',
          tool_calls: [{
            function: {
              arguments: JSON.stringify(plannedResponse.arguments),
              name: plannedResponse.toolName,
            },
            id: plannedResponse.toolCallId,
            index: 0,
            type: 'function',
          }],
        },
        finish_reason: null,
        index: 0,
      }],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-ui-smoke',
      model: body.model ?? MODEL_ID,
    })}\n\n`);
    await delay(0);
    response.write(`data: ${JSON.stringify({
      choices: [{
        delta: {},
        finish_reason: 'tool_calls',
        index: 0,
      }],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-ui-smoke',
      model: body.model ?? MODEL_ID,
    })}\n\n`);
    response.write('data: [DONE]\n\n');
    response.end();
    return;
  }

  const text = plannedResponse.text;
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
    await delay(0);
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

function createChatCompletion(body) {
  const plannedResponse = planBrowserSmokeChatResponse(body);
  const model = body.model ?? MODEL_ID;
  if (plannedResponse.kind === 'tool-call') {
    return {
      choices: [{
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          content: '',
          role: 'assistant',
          tool_calls: [{
            function: {
              arguments: JSON.stringify(plannedResponse.arguments),
              name: plannedResponse.toolName,
            },
            id: plannedResponse.toolCallId,
            type: 'function',
          }],
        },
      }],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-ui-smoke',
      model,
      object: 'chat.completion',
    };
  }
  return {
    choices: [{
      finish_reason: 'stop',
      index: 0,
      message: {
        content: plannedResponse.text,
        role: 'assistant',
      },
    }],
    created: Math.floor(Date.now() / 1000),
    id: 'chatcmpl-ui-smoke',
    model,
    object: 'chat.completion',
  };
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

function planBrowserSmokeChatResponse(body) {
  if (shouldTriggerLiveAutomationWeatherTool(body)) {
    return {
      arguments: {
        command: readLiveAutomationWeatherCommand(body),
        description: '查询浏览器 smoke 本地天气',
      },
      kind: 'tool-call',
      toolCallId: 'call_browser_smoke_live_weather_0',
      toolName: 'powershell',
    };
  }
  if (shouldTriggerSpawnSubagentTool(body)) {
    return {
      arguments: {
        description: '浏览器 smoke 子代理任务',
        modelId: MODEL_ID,
        name: SUBAGENT_NAME,
        prompt: '请总结 smoke-http-flow 技能的用途',
        providerId: PROVIDER_ID,
        subagentType: 'general',
      },
      kind: 'tool-call',
      toolCallId: 'call_browser_smoke_subagent_0',
      toolName: 'spawn_subagent',
    };
  }
  if (shouldTriggerWaitSubagentTool(body)) {
    return {
      arguments: {
        conversationId: readLatestSubagentConversationId(body),
      },
      kind: 'tool-call',
      toolCallId: 'call_browser_smoke_subagent_wait_0',
      toolName: 'wait_subagent',
    };
  }
  return {
    kind: 'text',
    text: readPlannedAssistantText(body),
  };
}

function readPlannedAssistantText(body) {
  const latestUserText = readLatestUserText(body);
  if (requestContainsToolResult(body, 'powershell') && latestUserText.includes(LIVE_AUTOMATION_USER_MARKER)) {
    return LIVE_AUTOMATION_RESULT_TEXT;
  }
  if (latestUserText.includes('请总结 smoke-http-flow 技能的用途')) {
    return SUBAGENT_RESULT_TEXT;
  }
  if (requestContainsToolResult(body, 'wait_subagent')) {
    return `子代理已完成：${SUBAGENT_RESULT_TEXT}`;
  }
  return readAssistantText(body);
}

function shouldTriggerSpawnSubagentTool(body) {
  return requestIncludesToolName(body, 'spawn_subagent')
    && !requestContainsToolResult(body, 'spawn_subagent')
    && readLatestUserText(body).includes(SUBAGENT_TRIGGER);
}

function shouldTriggerLiveAutomationWeatherTool(body) {
  return requestIncludesToolName(body, 'powershell')
    && !requestContainsToolResult(body, 'powershell')
    && readLatestUserText(body).includes(LIVE_AUTOMATION_USER_MARKER);
}

function shouldTriggerWaitSubagentTool(body) {
  return requestIncludesToolName(body, 'wait_subagent')
    && requestContainsToolResult(body, 'spawn_subagent')
    && !requestContainsToolResult(body, 'wait_subagent')
    && readLatestUserText(body).includes(SUBAGENT_TRIGGER);
}

function requestIncludesToolName(body, toolName) {
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  return tools.some((tool) => tool?.function?.name === toolName);
}

function requestContainsToolResult(body, toolName) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) => {
    if (message?.role !== 'tool') {
      return false;
    }
    const toolCallId = typeof message?.tool_call_id === 'string'
      ? message.tool_call_id
      : typeof message?.toolCallId === 'string'
        ? message.toolCallId
        : '';
    return (toolName === 'spawn_subagent' && toolCallId === 'call_browser_smoke_subagent_0')
      || (toolName === 'wait_subagent' && toolCallId === 'call_browser_smoke_subagent_wait_0')
      || (toolName === 'powershell' && toolCallId === 'call_browser_smoke_live_weather_0');
  });
}

function readLiveAutomationWeatherCommand(body) {
  const latestUserText = readLatestUserText(body);
  const weatherUrlMatch = latestUserText.match(/https?:\/\/\S+/u);
  const weatherUrl = weatherUrlMatch?.[0] ?? 'http://127.0.0.1/mock-weather/beijing';
  return [
    `try {`,
    `  (Invoke-WebRequest -Uri "${weatherUrl}" -UseBasicParsing -TimeoutSec 10).Content.Trim()`,
    `} catch {`,
    `  throw "Request failed: $($_.Exception.Message)"`,
    `}`,
  ].join('\n');
}

function readLatestUserText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content.map((part) => part?.text ?? '').join('\n');
    }
  }
  return '';
}

function readLatestSubagentConversationId(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'tool') {
      continue;
    }
    const content = readTextContent(message);
    const jsonMatch = content.match(/"conversationId"\s*:\s*"([^"]+)"/);
    if (jsonMatch?.[1]) {
      return jsonMatch[1];
    }
  }
  throw new Error('浏览器 smoke 未从 spawn_subagent 结果中读到 conversationId');
}

function readTextContent(message) {
  if (typeof message?.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => part?.text ?? '').join('\n');
  }
  return '';
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
