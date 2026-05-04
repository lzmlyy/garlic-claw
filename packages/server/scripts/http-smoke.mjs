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
const SMOKE_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0p8AAAAASUVORK5CYII=';
const AUTO_COMPACTION_SUBAGENT_TEXT = '子代理长程压缩 smoke 已整理背景、限制、行动项和待办，并展开较长说明用于自动压缩验证。'.repeat(8);
const AUTO_COMPACTION_MAIN_TEXT = '主代理长程压缩 smoke 已整合子代理结果、当前限制、下一步动作和验证结论，并保留较长汇总用于自动压缩验证。'.repeat(8);
const AUTO_COMPACTION_CONTINUATION_TEXT = '本地 smoke 回复: Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.';
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
let smokeWebFetchUrl = '';
let smokeBashTimeoutUrl = '';
let currentStepName = 'bootstrap';

function readSmokeShellToolName() {
  return usesNativePowerShellBackend() ? 'powershell' : 'bash';
}

function readSmokeShellResultTagName() {
  return `${readSmokeShellToolName()}_result`;
}

function buildSmokeShellInstruction(instruction) {
  return instruction.replaceAll('{shellToolName}', readSmokeShellToolName());
}

function readSmokeShellBackendKind() {
  return process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND || 'just-bash';
}

function readSmokeRuntimeToolsShellBackendKind() {
  if (process.platform === 'win32') {
    return readSmokeShellBackendKind() === 'wsl-shell' ? 'wsl-shell' : 'native-shell';
  }
  return 'native-shell';
}

function usesNativePowerShellBackend() {
  return readSmokeRuntimeToolsShellBackendKind() === 'native-shell' && process.platform === 'win32';
}

function buildSmokeShellCommand({ bash, powershell }) {
  if (usesNativePowerShellBackend()) {
    return powershell;
  }
  return bash;
}

function buildSmokeBashWriteCommand() {
  return buildSmokeShellCommand({
    bash: 'mkdir -p notes nested && echo smoke-workspace > notes/runtime.txt && cat notes/runtime.txt',
    powershell: [
      'New-Item -ItemType Directory -Force notes, nested > $null',
      "Set-Content -Path notes/runtime.txt -Value 'smoke-workspace'",
      'Get-Content notes/runtime.txt',
    ].join('; '),
  });
}

function buildSmokeBashConfigCommand() {
  return buildSmokeShellCommand({
    bash: 'printf "line-1\\nline-2\\nline-3\\nline-4\\n"',
    powershell: [
      "Write-Output 'line-1'",
      "Write-Output 'line-2'",
      "Write-Output 'line-3'",
      "Write-Output 'line-4'",
    ].join('; '),
  });
}

function buildSmokeBashReadCommand() {
  return buildSmokeShellCommand({
    bash: 'cat notes/runtime.txt',
    powershell: 'Get-Content notes/runtime.txt',
  });
}

function buildSmokeBashWorkdirCommand() {
  return buildSmokeShellCommand({
    bash: 'pwd && printf "from-workdir\\n" > child.txt && cat child.txt',
    powershell: [
      "Set-Content -Path child.txt -Value 'from-workdir'",
      'Get-Content child.txt',
    ].join('; '),
  });
}

function buildSmokeBashTarCommand() {
  return buildSmokeShellCommand({
    bash: 'mkdir -p tree/a tree/b && printf "one\\n" > tree/a/one.txt && printf "two\\n" > tree/b/two.txt && tar -cf bundle.tar tree && mkdir -p restored && tar -xf bundle.tar -C restored && find restored -type f | sort && cat restored/tree/a/one.txt && cat restored/tree/b/two.txt',
    powershell: [
      'New-Item -ItemType Directory -Force tree/a, tree/b > $null',
      "Set-Content -Path tree/a/one.txt -Value 'one'",
      "Set-Content -Path tree/b/two.txt -Value 'two'",
      'tar -cf bundle.tar tree',
      'New-Item -ItemType Directory -Force restored > $null',
      'tar -xf bundle.tar -C restored',
      "$root = (Resolve-Path restored).Path",
      "Get-ChildItem restored -File -Recurse | ForEach-Object { \"restored/$($_.FullName.Substring($root.Length + 1) -replace '\\\\', '/')\" } | Sort-Object",
      'Get-Content restored/tree/a/one.txt',
      'Get-Content restored/tree/b/two.txt',
    ].join('; '),
  });
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const serverRoutes = collectServerHttpRoutes(PROJECT_ROOT);
  const webRoutes = collectWebHttpRoutes(PROJECT_ROOT);
  const tempRoot = path.join(PROJECT_ROOT, 'workspace', 'test-artifacts', 'http-smoke');
  await fsPromises.mkdir(tempRoot, { recursive: true });
  const tempDir = await fsPromises.mkdtemp(path.join(tempRoot, 'http-smoke-'));
  const projectLocalPluginRootPath = path.join(
    PROJECT_ROOT,
    'config',
    'plugins',
    'smoke-local-echo',
  );
  let smokeFailed = false;
  let port = null;
  let wsPort = null;
  const skillRoot = path.join(PROJECT_ROOT, 'config', 'skills', 'definitions', SKILL_DIR_NAME);
  let fakeOpenAi = null;
  smokeWebFetchUrl = '';
  smokeBashTimeoutUrl = '';
  const smokeSkillId = 'project/.smoke-http-flow';
  const mcpScriptPath = path.join(tempDir, 'working-mcp.cjs');
  const remotePluginScriptPath = path.join(tempDir, 'remote-route-plugin.cjs');
  const serverFiles = {
    aiSettingsPath: path.join(tempDir, 'config', 'ai'),
    automationsPath: path.join(tempDir, 'automations.server.json'),
    conversationsPath: path.join(tempDir, 'conversations.server.json'),
    mcpConfigPath: path.join(tempDir, 'config', 'mcp', 'servers'),
    personasPath: path.join(tempDir, 'config', 'personas'),
    pluginStatePath: path.join(tempDir, 'plugins.server.json'),
    settingsConfigPath: path.join(tempDir, 'config', 'settings.json'),
    runtimeWorkspacesPath: path.join(tempDir, 'runtime-workspaces'),
    skillGovernancePath: path.join(tempDir, 'config', 'skills', 'settings.json'),
    subagentPath: path.join(tempDir, 'config', 'subagent'),
    subagentsPath: path.join(tempDir, 'subagents.server.json'),
    userHomePath: path.join(tempDir, 'user-home'),
  };
  await fsPromises.mkdir(serverFiles.userHomePath, { recursive: true });
  const state = {
    adminTokens: null,
    automationId: null,
    automationSubagentSessionId: null,
    bootstrapTokens: null,
    commandAssistantMessageId: null,
    commandAssistantText: null,
    commandUserMessageId: null,
    conversationId: null,
    defaultPersonaId: null,
    firstAssistantMessageId: null,
    firstAssistantText: null,
    firstUserMessageId: null,
    bashReadAssistantMessageId: null,
    bashReadAssistantText: null,
    bashTarAssistantMessageId: null,
    bashTarAssistantText: null,
    bashTimeoutAssistantMessageId: null,
    bashTimeoutAssistantText: null,
    bashWorkdirAssistantMessageId: null,
    bashWorkdirAssistantText: null,
    bashWriteAssistantMessageId: null,
    bashWriteAssistantText: null,
    globLoopAssistantMessageId: null,
    globLoopAssistantText: null,
    managedPersonaId: 'smoke-persona',
    memoryId: null,
    mcpName: 'smoke-mcp',
    modelId: 'smoke-model',
    personaId: null,
    providerId: 'smoke-openai',
    remotePluginAutomationId: null,
    remotePluginId: 'remote.smoke-iot-light',
    remotePluginHandle: null,
    remotePluginCronId: null,
    remotePluginInitialManifestHash: null,
    remotePluginInitialSyncedAt: null,
    retriedAssistantMessageId: null,
    retriedAssistantText: null,
    skillLoopAssistantMessageId: null,
    skillLoopAssistantText: null,
    subagentLoopAssistantMessageId: null,
    subagentLoopAssistantText: null,
    todoLoopAssistantMessageId: null,
    todoLoopAssistantText: null,
    webFetchLoopAssistantMessageId: null,
    webFetchLoopAssistantText: null,
    skillId: smokeSkillId,
    toolId: null,
    toolSourceId: null,
    userAlias: `smoke-user-${Date.now().toString(36)}`,
    userUpdatedEmail: null,
    proxyHostModelRoutingBackup: undefined,
    proxyOpenAiProviderBackup: undefined,
    proxyOpenAiProviderManaged: false,
    proxyVisionFallbackBackup: undefined,
    grepLoopAssistantMessageId: null,
    grepLoopAssistantText: null,
    editLoopAssistantMessageId: null,
    editLoopAssistantText: null,
    editCreateLoopAssistantMessageId: null,
    editCreateLoopAssistantText: null,
    staleEditAssistantMessageId: null,
    staleEditAssistantText: null,
    readLoopAssistantMessageId: null,
    readLoopAssistantText: null,
    writeOverwriteAssistantMessageId: null,
    writeOverwriteAssistantText: null,
    writeLoopAssistantMessageId: null,
    writeLoopAssistantText: null,
  };
  let backend = null;
  let apiBase = '';

  try {
    fakeOpenAi = cli.realProviderId ? null : await startFakeOpenAiServer();
    smokeWebFetchUrl = fakeOpenAi ? `${fakeOpenAi.url.replace(/\/v1$/, '')}/mock-webfetch/article` : '';
    smokeBashTimeoutUrl = fakeOpenAi ? `${fakeOpenAi.url.replace(/\/v1$/, '')}/mock-bash-timeout` : '';
    await runStep('contracts.web-alignment', async () => {
      assertWebRoutesMatchServerRoutes(serverRoutes, webRoutes);
    });
    if (cli.realProviderId) {
      await prepareRealProviderSmokeSettings(serverFiles.aiSettingsPath, cli.realProviderId);
    } else {
      await prepareProjectSkill(skillRoot);
      await prepareCustomSubagentType(serverFiles.subagentPath);
      await prepareWorkingMcpScript(mcpScriptPath);
      await prepareRemoteRoutePluginScript(remotePluginScriptPath);
      await prepareProjectLocalPlugin(projectLocalPluginRootPath);
    }

    if (cli.proxyOrigin) {
      ensure(!cli.realProviderId, 'Real provider smoke does not support proxy mode');
      console.log(`-> use frontend proxy ${cli.proxyOrigin}`);
      apiBase = `${normalizeOrigin(cli.proxyOrigin)}${API_PREFIX}`;
      ensure(fakeOpenAi, 'Expected fake OpenAI for proxy smoke');
      await prepareProxyOpenAiProvider(apiBase, state, fakeOpenAi.url);
    } else {
      console.log('-> build server');
      await runTypescriptBuild();
      await verifyRequiredBuildArtifacts();

      console.log('-> start backend');
      port = await getFreePort();
      wsPort = await getFreePort();
      backend = await startBackend(port, wsPort, serverFiles, {
        runtimeApprovalMode: cli.runtimeApprovalMode,
      });
      apiBase = `http://127.0.0.1:${port}${API_PREFIX}`;
    }

    await runStep('health.get', async () => {
      await verifyHealth(apiBase, backend);
    });
    state.adminTokens = cli.proxyOrigin
      ? await loginDevelopmentAdmin(apiBase)
      : await waitForBootstrapAdminLogin(apiBase);
    state.bootstrapTokens = state.adminTokens;

    if (cli.realProviderId) {
      await runRealProviderHttpFlow(apiBase, state, {
        profile: cli.profile,
        realModelId: cli.realModelId,
        realProviderId: cli.realProviderId,
      });
      console.log(`server real-provider smoke (${cli.profile}) passed: ${getCompletedStepCount()} checks`);
    } else {
      ensure(fakeOpenAi, 'Expected fake OpenAI for default smoke flow');
      await runHttpFlow(apiBase, state, {
        profile: cli.profile,
        fakeOpenAi,
        fakeOpenAiUrl: fakeOpenAi.url,
        flowSuffix: state.userAlias,
        mcpCommand: process.execPath,
        mcpScriptPath,
        personasPath: serverFiles.personasPath,
        remotePluginServerUrl: cli.proxyOrigin ? 'ws://127.0.0.1:23331' : `ws://127.0.0.1:${wsPort}`,
        remotePluginScriptPath,
        runtimeApprovalMode: cli.runtimeApprovalMode,
        runtimeWorkspacesPath: serverFiles.runtimeWorkspacesPath,
        smokeSkillId,
      });
      if (cli.profile === 'full') {
        await runStep('contracts.server-route-coverage', async () => {
          assertAllServerRoutesCovered(serverRoutes);
        });
      }

      console.log(`server HTTP smoke (${cli.profile}) passed: ${getCompletedStepCount()} checks`);
    }
  } catch (error) {
    smokeFailed = true;
    if (shouldKeepSmokeArtifacts(cli.artifactMode, true)) {
      await persistHttpSmokeArtifacts(tempDir, {
        artifactMode: cli.artifactMode,
        backendLogs: backend?.logs ?? [],
        completedStepCount: getCompletedStepCount(),
        currentStepName,
        error,
        fakeOpenAiRequests: fakeOpenAi?.readChatCompletions?.() ?? [],
        profile: cli.profile,
        visitedHttpRoutes,
      });
      console.error(`[http-smoke] 已保留失败产物: ${tempDir}`);
    }
    if (backend?.logs.length) {
      console.error('--- server logs ---');
      console.error(backend.logs.join(''));
      console.error('--- end server logs ---');
    }
    throw error;
  } finally {
    const keepArtifacts = shouldKeepSmokeArtifacts(cli.artifactMode, smokeFailed);
    await Promise.allSettled([
      cli.proxyOrigin && state.proxyOpenAiProviderManaged
        ? restoreProxyOpenAiProvider(apiBase, state)
        : Promise.resolve(),
      state.remotePluginHandle?.stop?.() ?? Promise.resolve(),
      backend?.stop?.() ?? Promise.resolve(),
      fakeOpenAi?.close?.() ?? Promise.resolve(),
      fsPromises.rm(projectLocalPluginRootPath, { recursive: true, force: true }),
      fsPromises.rm(skillRoot, { recursive: true, force: true }),
      keepArtifacts
        ? Promise.resolve()
        : fsPromises.rm(tempDir, { recursive: true, force: true }),
    ]);
    if (!keepArtifacts) {
      await removeEmptyDirectoryChain(tempRoot, path.join(PROJECT_ROOT, 'workspace'));
    } else if (!smokeFailed) {
      console.log(`[http-smoke] 已保留运行产物: ${tempDir}`);
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

async function persistHttpSmokeArtifacts(tempDir, input) {
  const summary = {
    artifactMode: input.artifactMode,
    completedStepCount: input.completedStepCount,
    currentStepName: input.currentStepName,
    error: serializeError(input.error),
    failedAt: new Date().toISOString(),
    profile: input.profile,
    visitedHttpRoutes: input.visitedHttpRoutes,
  };
  await fsPromises.writeFile(path.join(tempDir, 'failure-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (input.backendLogs.length > 0) {
    await fsPromises.writeFile(path.join(tempDir, 'server.log'), input.backendLogs.join(''), 'utf8');
  }

  if (input.fakeOpenAiRequests.length > 0) {
    await fsPromises.writeFile(
      path.join(tempDir, 'fake-openai-chat-completions.json'),
      `${JSON.stringify(input.fakeOpenAiRequests, null, 2)}\n`,
      'utf8',
    );
  }
}

async function runSmokeProviderSelectionSteps(apiBase, state, input) {
  if (input.listStepName) {
    await runStep(input.listStepName, async () => {
      const providers = await getJson(apiBase, '/ai/providers');
      ensure(Array.isArray(providers) && providers.some((entry) => entry.id === input.providerId), `Expected providers list to include smoke provider "${input.providerId}"`);
    });
  }

  await runStep(input.detailStepName, async () => {
    const provider = await getJson(apiBase, `/ai/providers/${input.providerId}`);
    state.providerId = provider.id;
    state.modelId = input.modelId ?? provider.defaultModel ?? provider.models?.[0] ?? null;
    ensure(typeof state.modelId === 'string' && state.modelId.length > 0, `Expected provider "${input.providerId}" to expose a testable model`);
  });

  await runStep(input.modelsStepName, async () => {
    const models = await getJson(apiBase, `/ai/providers/${state.providerId}/models`);
    ensure(Array.isArray(models) && models.some((entry) => entry.id === state.modelId), 'Expected provider model list to include selected model');
  });
}

async function runSmokeConnectionCheck(apiBase, state, input) {
  await runStep(input.stepName, async () => {
    const result = await postJson(apiBase, `/ai/providers/${state.providerId}/test-connection`, {
      body: {
        modelId: state.modelId,
      },
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    });
    ensure(result.ok === true, 'Expected provider connection test to succeed');
    ensure(typeof result.text === 'string' && result.text.trim().length > 0, 'Expected provider connection test to return non-empty text');
  });
}

async function runSmokeConversationCreate(apiBase, state, input) {
  await runStep(input.stepName, async () => {
    const conversation = await postJson(apiBase, '/chat/conversations', {
      body: input.title === undefined ? {} : { title: input.title },
      headers: input.headers(),
    });
    state.conversationId = conversation.id;
    ensure(typeof state.conversationId === 'string', 'Expected smoke conversation id');
  });
}

async function runSmokeTextChatRoundTrip(apiBase, state, input) {
  return runStep(input.stepName, async () => {
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        model: state.modelId,
        ...(input.parts ? { parts: input.parts } : {}),
        provider: state.providerId,
      },
      headers: input.headers(),
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    if (input.assistantMessageStateKey) {
      state[input.assistantMessageStateKey] = startEvent?.assistantMessage?.id ?? null;
      ensure(typeof state[input.assistantMessageStateKey] === 'string', `Expected ${input.stepName} assistant message id`);
    }
    if (input.userMessageStateKey) {
      state[input.userMessageStateKey] = startEvent?.userMessage?.id ?? null;
      ensure(typeof state[input.userMessageStateKey] === 'string', `Expected ${input.stepName} user message id`);
    }
    const responseText = input.expectedText ? assertCompletedSse(events, input.expectedText) : assertCompletedSse(events);
    if (input.responseTextStateKey) {
      state[input.responseTextStateKey] = responseText;
    }
    ensure(finishEvent?.status === 'completed', `Expected ${input.stepName} SSE to finish`);
    if (input.expectDisplayOnly === true) {
      ensure(startEvent?.assistantMessage?.role === 'display', `Expected ${input.stepName} assistant to persist as display`);
      ensure(startEvent?.userMessage?.role === 'display', `Expected ${input.stepName} user to persist as display`);
    }
    return { events, finishEvent, responseText, startEvent };
  });
}

async function runSmokeConversationDelete(apiBase, state, input) {
  await runStep(input.stepName, async () => {
    const result = await deleteJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: input.headers() });
    ensure(typeof result?.message === 'string' && result.message.includes('deleted'), 'Expected smoke conversation delete to succeed');
  });
}

async function runSmokeConversationDeleteVerification(apiBase, state, input) {
  await runStep(input.detailStepName, async () => {
    await getJson(apiBase, `/chat/conversations/${state.conversationId}`, {
      expectedStatus: 404,
      headers: input.headers(),
    });
  });
  await runStep(input.listStepName, async () => {
    const conversations = await getJson(apiBase, '/chat/conversations', {
      headers: input.headers(),
    });
    ensure(Array.isArray(conversations) && !conversations.some((entry) => entry.id === state.conversationId), 'Expected deleted conversation to disappear from list');
  });
}

async function runSmokeProviderDelete(apiBase, state, input) {
  await runStep(input.stepName, async () => {
    const result = await deleteJson(apiBase, `/ai/providers/${state.providerId}`);
    ensure(result.success === true, 'Expected provider delete response');
  });
}

async function runSmokeProviderDeleteVerification(apiBase, state, input) {
  await runStep(input.detailStepName, async () => {
    await getJson(apiBase, `/ai/providers/${state.providerId}`, {
      expectedStatus: 404,
    });
  });

  await runStep(input.listStepName, async () => {
    const providers = await getJson(apiBase, '/ai/providers');
    ensure(!providers.some((entry) => entry.id === state.providerId), 'Expected provider list to exclude deleted provider');
  });
}

async function runContextCompactionModelSmoke(apiBase, state, input) {
  const originalConversationId = state.conversationId;
  let isolatedConversationId = null;
  if (input.isolateConversation) {
    await runStep(`${input.commandStepName}.conversation.create`, async () => {
      const conversation = await postJson(apiBase, '/chat/conversations', {
        body: { title: 'Context Compaction Smoke' },
        headers: input.headers(),
      });
      isolatedConversationId = conversation.id;
      ensure(typeof isolatedConversationId === 'string' && isolatedConversationId.length > 0, 'Expected isolated context compaction conversation id');
      state.conversationId = isolatedConversationId;
    });
    await runSmokeTextChatRoundTrip(apiBase, state, {
      content: '第一轮压缩预热消息，记录技能与工具 smoke。',
      headers: input.headers,
      stepName: `${input.commandStepName}.prefill.first`,
    });
    await runSmokeTextChatRoundTrip(apiBase, state, {
      content: '第二轮压缩预热消息，记录子代理与上下文摘要 smoke。',
      headers: input.headers,
      stepName: `${input.commandStepName}.prefill.second`,
    });
  }

  await runStep(input.configStepName, async () => {
    const config = await putJson(apiBase, '/ai/context-governance-config', {
      body: {
        values: {
          contextCompaction: {
            enabled: true,
            keepRecentMessages: input.keepRecentMessages ?? 1,
            strategy: 'summary',
            summaryPrompt: '请把下面这段历史对话整理成可供后续继续回答的上下文摘要。',
          },
          conversationTitle: {
            enabled: true,
            maxMessages: 3,
          },
        },
      },
    });
    ensure(config.values.contextCompaction.strategy === 'summary', 'Expected summary compaction strategy to persist');
  });

  input.beforeCommand?.();
  const commandResult = await runSmokeTextChatRoundTrip(apiBase, state, {
    assistantMessageStateKey: input.assistantMessageStateKey,
    content: '/compact',
    expectDisplayOnly: true,
    headers: input.headers,
    responseTextStateKey: input.responseTextStateKey,
    stepName: input.commandStepName,
    userMessageStateKey: input.userMessageStateKey,
  });
  ensure(commandResult.responseText.includes('已压缩上下文'), 'Expected /compact to report successful compaction');

  if (input.verifyModelRequestStepName && input.verifyModelRequest) {
    await runStep(input.verifyModelRequestStepName, async () => {
      await input.verifyModelRequest();
    });
  }

  await runStep(input.verifySummaryStepName, async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: input.headers() });
    const summaryMessage = findContextCompactionSummaryMessage(conversation.messages);
    ensure(summaryMessage, 'Expected conversation detail to include one context compaction summary message');
    ensure(summaryMessage.model === state.modelId, 'Expected context compaction summary to record model id');
    ensure(summaryMessage.provider === state.providerId, 'Expected context compaction summary to record provider id');
    if (input.expectedSummaryText) {
      ensure(summaryMessage.content === input.expectedSummaryText, 'Expected context compaction summary content to match fake model output');
    } else {
      ensure(typeof summaryMessage.content === 'string' && summaryMessage.content.trim().length > 0, 'Expected context compaction summary content to be non-empty');
    }
  });

  if (isolatedConversationId) {
    await runStep(`${input.commandStepName}.conversation.delete`, async () => {
      const result = await deleteJson(apiBase, `/chat/conversations/${isolatedConversationId}`, { headers: input.headers() });
      ensure(typeof result?.message === 'string' && result.message.includes('deleted'), 'Expected isolated context compaction conversation delete to succeed');
    });
    state.conversationId = originalConversationId;
  }
}

async function runSubagentAutoCompactionSmoke(apiBase, state, input) {
  const originalConversationId = state.conversationId;
  const originalModelId = state.modelId;
  const compactionModelId = 'smoke-auto-compaction';
  let isolatedConversationId = null;
  try {
    await runStep('ai.model.upsert.auto-compaction', async () => {
      const model = await postJson(apiBase, `/ai/providers/${state.providerId}/models/${compactionModelId}`, {
        body: {
          contextLength: 256,
          name: 'Smoke Auto Compaction',
        },
      });
      ensure(model.id === compactionModelId, 'Expected auto compaction smoke model to be created');
      ensure(model.contextLength === 256, 'Expected auto compaction smoke model to expose small context length');
    });

    await runStep('chat.conversation.create.auto-compaction', async () => {
      const conversation = await postJson(apiBase, '/chat/conversations', {
        body: { title: 'Subagent Auto Compaction Smoke' },
        headers: input.headers(),
      });
      isolatedConversationId = conversation.id;
      ensure(typeof isolatedConversationId === 'string' && isolatedConversationId.length > 0, 'Expected auto compaction smoke conversation id');
      state.conversationId = isolatedConversationId;
      state.modelId = compactionModelId;
    });

    await runStep('ai.context-governance.put.auto-compaction', async () => {
      const config = await putJson(apiBase, '/ai/context-governance-config', {
        body: {
          values: {
            contextCompaction: {
              compressionThreshold: 60,
              enabled: true,
              keepRecentMessages: 0,
              strategy: 'summary',
              summaryPrompt: '请把下面这段历史对话整理成可供后续继续回答的上下文摘要。',
            },
            conversationTitle: {
              enabled: false,
              maxMessages: 3,
            },
          },
        },
      });
      ensure(config.values.contextCompaction.keepRecentMessages === 0, 'Expected auto compaction smoke config to keep zero recent messages');
      ensure(config.values.contextCompaction.strategy === 'summary', 'Expected auto compaction smoke to use summary strategy');
    });

    input.fakeOpenAi.resetChatCompletions();
    const { events } = await runSmokeTextChatRoundTrip(apiBase, state, {
      content: '请使用 subagent 工具委派一个探索任务，并在子代理长程压缩 smoke 完成后，继续完成主代理长程压缩 smoke 的最终汇总。',
      headers: input.headers,
      stepName: 'chat.messages.subagent-auto-compaction',
    });
    assertAutoCompactionSse(events);

    await runStep('chat.messages.subagent-auto-compaction.verify-model', async () => {
      const requests = input.fakeOpenAi.readChatCompletions();
      ensure(requests.length >= 5, 'Expected auto compaction smoke to issue multiple fake model requests');
      ensure(requests.every((entry) => entry.body?.stream === true), 'Expected auto compaction smoke to use streamed requests only');
      const summaryRequests = requests.filter((entry) => containsText(entry.body?.messages ?? [], '历史对话：'));
      ensure(summaryRequests.some((entry) => containsText(entry.body?.messages ?? [], '子代理长程压缩 smoke')), 'Expected subagent auto compaction summary request');
      ensure(summaryRequests.some((entry) => containsText(entry.body?.messages ?? [], '主代理长程压缩 smoke')), 'Expected main conversation auto compaction summary request');
    });

    await runStep('chat.messages.subagent-auto-compaction.verify-history', async () => {
      const subagents = await getJson(apiBase, `/chat/conversations/${state.conversationId}/subagents`, { headers: input.headers() });
      ensure(Array.isArray(subagents) && subagents.length === 1, 'Expected one subagent in auto compaction smoke conversation');
      const subagentConversationId = subagents[0]?.conversationId ?? subagents[0]?.id;
      ensure(typeof subagentConversationId === 'string' && subagentConversationId.length > 0, 'Expected auto compaction smoke subagent conversation id');
      const [mainConversation, subagentConversation] = await Promise.all([
        getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: input.headers() }),
        getJson(apiBase, `/chat/conversations/${subagentConversationId}`, { headers: input.headers() }),
      ]);
      const mainSummary = findContextCompactionSummaryMessage(mainConversation.messages);
      const subagentSummary = findContextCompactionSummaryMessage(subagentConversation.messages);
      ensure(mainSummary?.content === 'Smoke 压缩摘要。', 'Expected main conversation to persist auto compaction summary');
      ensure(subagentSummary?.content === 'Smoke 压缩摘要。', 'Expected subagent conversation to persist auto compaction summary');
    });

    await runStep('chat.conversation.delete.auto-compaction', async () => {
      const result = await deleteJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: input.headers() });
      ensure(typeof result?.message === 'string' && result.message.includes('deleted'), 'Expected auto compaction smoke conversation delete to succeed');
    });
    state.conversationId = originalConversationId;
    isolatedConversationId = null;

    await runStep('ai.model.delete.auto-compaction', async () => {
      const result = await deleteJson(apiBase, `/ai/providers/${state.providerId}/models/${compactionModelId}`);
      ensure(result.success === true, 'Expected auto compaction smoke model delete response');
    });
    state.modelId = originalModelId;
  } finally {
    state.conversationId = originalConversationId;
    state.modelId = originalModelId;
  }
}

async function runRealProviderHttpFlow(apiBase, state, input) {
  const userHeaders = () => createBearerHeaders(readTokens(state.adminTokens).accessToken);

  await runSmokeProviderSelectionSteps(apiBase, state, {
    detailStepName: 'ai.provider.get.real',
    listStepName: 'ai.providers.list.real',
    modelId: input.realModelId,
    modelsStepName: 'ai.models.list.real',
    providerId: input.realProviderId,
  });

  await runSmokeConnectionCheck(apiBase, state, {
    stepName: 'ai.test-connection.real',
    timeoutMs: 60_000,
  });

  await runSmokeConversationCreate(apiBase, state, {
    headers: userHeaders,
    stepName: 'chat.conversation.create.real',
  });

  await runSmokeTextChatRoundTrip(apiBase, state, {
    content: '请只用一句简短中文回复，证明真实 provider smoke 已连通。',
    headers: userHeaders,
    stepName: 'chat.messages.send.real',
    timeoutMs: 90_000,
  });

  if (input.profile === 'core') {
    await runSmokeConversationDelete(apiBase, state, {
      headers: userHeaders,
      stepName: 'chat.conversation.delete.real',
    });
    await runSmokeConversationDeleteVerification(apiBase, state, {
      detailStepName: 'chat.conversation.get.after-delete.real',
      headers: userHeaders,
      listStepName: 'chat.conversation.list.after-delete.real',
    });
    return;
  }

  await runSmokeTextChatRoundTrip(apiBase, state, {
    content: '请再用一句不同的简短中文回复，确认上下文压缩前已有两轮真实对话。',
    headers: userHeaders,
    stepName: 'chat.messages.send.real.second-round',
    timeoutMs: 90_000,
  });

  await runStep('chat.conversation.title.generated.real', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    ensure(typeof conversation.title === 'string' && conversation.title.trim().length > 0, 'Expected real smoke conversation title to be non-empty');
    ensure(conversation.title !== '新的对话', 'Expected real smoke conversation title to be generated by model');
  });

  await runContextCompactionModelSmoke(apiBase, state, {
    assistantMessageStateKey: 'compactModelAssistantMessageId',
    commandStepName: 'chat.messages.command.compact.real',
    configStepName: 'ai.context-governance.put.summary.real',
    headers: userHeaders,
    keepRecentMessages: 2,
    responseTextStateKey: 'compactModelAssistantText',
    userMessageStateKey: 'compactModelUserMessageId',
    verifySummaryStepName: 'chat.conversation.get.after-command.compact.real',
  });

  await runSmokeConversationDelete(apiBase, state, {
    headers: userHeaders,
    stepName: 'chat.conversation.delete.real',
  });
  await runSmokeConversationDeleteVerification(apiBase, state, {
    detailStepName: 'chat.conversation.get.after-delete.real',
    headers: userHeaders,
    listStepName: 'chat.conversation.list.after-delete.real',
  });
}

async function runCoreHttpFlow(apiBase, state, input) {
  await runSmokeConversationCreate(apiBase, state, {
    headers: input.headers,
    stepName: 'chat.conversation.create',
    title: 'Smoke Chat',
  });

  await runStep('chat.conversation.list', async () => {
    const conversations = await getJson(apiBase, '/chat/conversations', { headers: input.headers() });
    ensure(Array.isArray(conversations) && conversations.some((entry) => entry.id === state.conversationId), 'Expected conversation list to include smoke conversation');
  });

  await runStep('chat.conversation.get', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: input.headers() });
    ensure(conversation.id === state.conversationId, 'Expected conversation detail to match');
  });

  await runSmokeTextChatRoundTrip(apiBase, state, {
    content: '请用一句中文确认 smoke core 已连通。',
    headers: input.headers,
    stepName: 'chat.messages.basic',
  });

  await runContextCompactionModelSmoke(apiBase, state, {
    commandStepName: 'chat.messages.compact',
    configStepName: 'ai.context-governance.put.core',
    headers: input.headers,
    verifySummaryStepName: 'chat.messages.compact.verify',
  });

  await runSmokeConversationDelete(apiBase, state, {
    headers: input.headers,
    stepName: 'chat.conversation.delete',
  });

  await runSmokeConversationDeleteVerification(apiBase, state, {
    detailStepName: 'chat.conversation.get.after-delete',
    headers: input.headers,
    listStepName: 'chat.conversation.list.after-delete',
  });

  await runSmokeProviderDelete(apiBase, state, {
    stepName: 'ai.provider.delete',
  });

  await runSmokeProviderDeleteVerification(apiBase, state, {
    detailStepName: 'ai.provider.get.after-delete',
    listStepName: 'ai.providers.list.after-delete',
  });
}

async function runHttpFlow(apiBase, state, input) {
  const usesYoloApproval = input.runtimeApprovalMode === 'yolo';
  const adminHeaders = () => createBearerHeaders(readTokens(state.adminTokens).accessToken);
  const userHeaders = adminHeaders;
  const managedPersonaDirectory = path.join(input.personasPath, encodeURIComponent(state.managedPersonaId));
  const managedPersonaAvatarPath = path.join(managedPersonaDirectory, 'avatar.svg');
  const runtimeCommandCapturePaths = [];
  const readSessionWorkspaceRoot = () => {
    ensure(typeof state.conversationId === 'string', 'Expected conversation id before reading runtime workspace');
    return path.join(input.runtimeWorkspacesPath, encodeURIComponent(state.conversationId));
  };
  const readSessionRuntimeCommandCaptureRoot = () => path.join(
    readSessionWorkspaceRoot(),
    '.garlic-claw',
    'runtime-command-output',
  );
  const readVisibleRuntimeCommandCaptureHostPath = (visiblePath) => path.join(
    readSessionWorkspaceRoot(),
    ...String(visiblePath).replace(/^\/+/, '').split('/'),
  );
  const approveRuntimePermissionRequest = async (event, decision = 'once') => {
    ensure(typeof state.conversationId === 'string', 'Expected conversation id before replying runtime permission');
    const pending = await getJson(apiBase, `/chat/conversations/${state.conversationId}/runtime-permissions/pending`, {
      headers: userHeaders(),
    });
    ensure(
      Array.isArray(pending) && pending.some((entry) => entry.id === event.request?.id),
      'Expected runtime pending permission list to include current request',
    );
    const reply = await postJson(
      apiBase,
      `/chat/conversations/${state.conversationId}/runtime-permissions/${event.request.id}/reply`,
      {
        body: {
          decision,
        },
        headers: userHeaders(),
      },
    );
    ensure(reply?.requestId === event.request.id, 'Expected runtime permission reply to match request');
    ensure(reply?.resolution === 'approved', 'Expected runtime permission reply to approve the request');
  };
  const readPendingRuntimePermissions = async () => {
    ensure(typeof state.conversationId === 'string', 'Expected conversation id before reading runtime permissions');
    return getJson(apiBase, `/chat/conversations/${state.conversationId}/runtime-permissions/pending`, {
      headers: userHeaders(),
    });
  };
  const ensureRuntimePermissionExpectation = async (events, expected, label) => {
    const hasRequest = events.some((entry) => entry.type === 'permission-request');
    if (expected === 'requested') {
      ensure(hasRequest, `Expected ${label} to include runtime permission request`);
      return;
    }
    ensure(!hasRequest, `Expected ${label} not to include runtime permission request`);
    const pending = await readPendingRuntimePermissions();
    ensure(Array.isArray(pending) && pending.length === 0, `Expected ${label} to leave no pending runtime permission request`);
  };

  await runStep('ai.provider-catalog+providers.list.initial', async () => {
    const [catalog, providers] = await Promise.all([
      getJson(apiBase, '/ai/provider-catalog'),
      getJson(apiBase, '/ai/providers'),
    ]);
    ensure(Array.isArray(catalog) && catalog.length > 0, 'Expected provider catalog to be non-empty');
    ensure(Array.isArray(providers), 'Expected providers list to be an array');
  });

  await runStep('ai.provider.upsert', async () => {
    const provider = await putJson(apiBase, `/ai/providers/${state.providerId}`, {
      body: {
        apiKey: 'smoke-openai-key',
        baseUrl: input.fakeOpenAiUrl,
        defaultModel: state.modelId,
        driver: 'openai',
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

  await runStep('ai.default-selection.put', async () => {
    const selection = await putJson(apiBase, '/ai/default-selection', {
      body: {
        providerId: state.providerId,
        modelId: state.modelId,
      },
    });
    ensure(selection?.providerId === state.providerId, 'Expected updated default selection to point at smoke provider');
    ensure(selection?.modelId === state.modelId, 'Expected updated default selection to point at smoke model');
    ensure(selection?.source === 'default', 'Expected updated default selection source to be default');
  });

  await runStep('ai.default-selection.get', async () => {
    const selection = await getJson(apiBase, '/ai/default-selection');
    ensure(selection?.providerId === state.providerId, 'Expected default selection to point at smoke provider');
    ensure(selection?.modelId === state.modelId, 'Expected default selection to point at smoke model');
    ensure(selection?.source === 'default', 'Expected default selection source to be default');
  });

  await runSmokeProviderSelectionSteps(apiBase, state, {
    detailStepName: 'ai.provider.get',
    listStepName: null,
    modelId: state.modelId,
    modelsStepName: 'ai.models.list',
    providerId: state.providerId,
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

  await runSmokeConnectionCheck(apiBase, state, {
    stepName: 'ai.test-connection',
  });

  if (input.profile === 'core') {
    await runCoreHttpFlow(apiBase, state, {
      headers: userHeaders,
    });
    return;
  }

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

  const visionState = { conversationId: null, modelId: state.modelId, providerId: state.providerId };
  input.fakeOpenAi.resetChatCompletions();
  await runSmokeConversationCreate(apiBase, visionState, {
    headers: userHeaders,
    stepName: 'chat.vision.conversation.create',
    title: 'Vision Smoke',
  });
  await runSmokeTextChatRoundTrip(apiBase, visionState, {
    content: '请描述这张图片',
    expectedText: '这是一张用于后端烟测的图片。',
    headers: userHeaders,
    parts: [
      { text: '请描述这张图片', type: 'text' },
      { image: SMOKE_IMAGE_DATA_URL, mimeType: 'image/png', type: 'image' },
    ],
    stepName: 'chat.messages.vision-fallback',
  });
  await runStep('chat.messages.vision-fallback.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const matchingRequest = requests.find((entry) =>
      containsImage(entry.body?.messages ?? [])
      && readLatestUserText(entry.body?.messages).includes('请描述这张图片'));
    ensure(matchingRequest, 'Expected vision fallback smoke message to reach fake OpenAI with image parts');
  });
  await runSmokeConversationDelete(apiBase, visionState, {
    headers: userHeaders,
    stepName: 'chat.vision.conversation.delete',
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
    ensure(skills.some((entry) =>
      entry.id === 'project/weather-query'
      && entry.entryPath === 'weather-query/SKILL.md'
      && Array.isArray(entry.assets)
      && entry.assets.some((asset) => asset.path === 'scripts/weather.js' && asset.executable === true)
    ), 'Expected repository weather skill to be discoverable with executable JavaScript asset');
  });

  await runStep('skills.refresh', async () => {
    const skills = await postJson(apiBase, '/skills/refresh');
    ensure(Array.isArray(skills) && skills.some((entry) => entry.id === input.smokeSkillId), 'Expected refresh to retain smoke skill');
  });

  await runStep('skills.governance', async () => {
    const skills = await getJson(apiBase, '/skills');
    ensure(Array.isArray(skills) && skills.length > 0, 'Expected discovered skills before updating governance');
    for (const skill of skills) {
      const detail = await putJson(apiBase, `/skills/${encodeURIComponent(skill.id)}/governance`, {
        body: {
          loadPolicy: 'deny',
        },
      });
      ensure(detail.governance?.loadPolicy === 'deny', `Expected skill governance update to persist for ${skill.id}`);
    }
  });

  await runStep('skills.events.get', async () => {
    const events = await getJson(apiBase, `/skills/${encodeURIComponent(input.smokeSkillId)}/events?limit=20`);
    ensure(Array.isArray(events.items), 'Expected skill events payload');
  });

  await runSmokeConversationCreate(apiBase, state, {
    headers: userHeaders,
    stepName: 'chat.conversation.create',
    title: 'Smoke Chat',
  });

  if (usesYoloApproval) {
    await runStep('chat.runtime-permissions.reply.missing', async () => {
      ensure(typeof state.conversationId === 'string', 'Expected conversation id before covering runtime reply route');
      const reply = await postJson(
        apiBase,
        `/chat/conversations/${state.conversationId}/runtime-permissions/missing-request/reply`,
        {
          body: {
            decision: 'reject',
          },
          expectedStatuses: [404],
          headers: userHeaders(),
        },
      );
      ensure(
        typeof reply?.message === 'string' && reply.message.includes('Runtime permission request not found'),
        'Expected missing runtime permission reply to return not found payload',
      );
    });
  }

  await runStep('chat.conversation.list', async () => {
    const conversations = await getJson(apiBase, '/chat/conversations', { headers: userHeaders() });
    ensure(Array.isArray(conversations) && conversations.some((entry) => entry.id === state.conversationId), 'Expected conversation list to include smoke conversation');
  });

  await runStep('chat.conversation.get', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    ensure(conversation.id === state.conversationId, 'Expected conversation detail to match');
  });

  await runStep('chat.context-window.get', async () => {
    const preview = await getJson(
      apiBase,
      `/chat/conversations/${state.conversationId}/context-window?providerId=${encodeURIComponent(state.providerId)}&modelId=${encodeURIComponent(state.modelId)}`,
      { headers: userHeaders() },
    );
    ensure(Array.isArray(preview.includedMessageIds), 'Expected context window preview to include includedMessageIds');
    ensure(Array.isArray(preview.excludedMessageIds), 'Expected context window preview to include excludedMessageIds');
    ensure(typeof preview.frontendMessageWindowSize === 'number', 'Expected context window preview to include frontendMessageWindowSize');
    ensure(typeof preview.contextLength === 'number', 'Expected context window preview to include contextLength');
  });

  await runStep('chat.todo.get.initial', async () => {
    const todos = await getJson(apiBase, `/chat/sessions/${state.conversationId}/todo`, { headers: userHeaders() });
    ensure(Array.isArray(todos), 'Expected session todo payload to be an array');
    ensure(todos.length === 0, 'Expected new session todo list to be empty');
  });

  await runStep('chat.todo.put', async () => {
    const todos = await putJson(apiBase, `/chat/sessions/${state.conversationId}/todo`, {
      body: {
        todos: [
          {
            content: '校对 smoke 路由覆盖',
            priority: 'medium',
            status: 'completed',
          },
          {
            content: '补 todo 工具主链',
            priority: 'high',
            status: 'in_progress',
          },
        ],
      },
      headers: userHeaders(),
    });
    ensure(Array.isArray(todos) && todos.length === 2, 'Expected session todo update to persist');
    ensure(todos[1]?.content === '补 todo 工具主链', 'Expected updated todo content to persist');
  });

  await runStep('chat.todo.get.after-put', async () => {
    const todos = await getJson(apiBase, `/chat/sessions/${state.conversationId}/todo`, { headers: userHeaders() });
    ensure(Array.isArray(todos) && todos.length === 2, 'Expected session todo list to include updated items');
    ensure(todos.some((entry) => entry.content === '补 todo 工具主链' && entry.status === 'in_progress'), 'Expected session todo list to expose updated items');
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

  await runStep('personas.avatar.upload', async () => {
    const formData = new FormData();
    const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#181"/></svg>'], { type: 'image/svg+xml' });
    formData.append('file', blob, 'avatar.svg');
    const url = `/personas/${state.managedPersonaId}/avatar`;
    recordVisitedRoute('POST', url);
    const resp = await fetch(`${apiBase}${url}`, { method: 'POST', headers: userHeaders(), body: formData });
    ensure(resp.ok, `Expected avatar upload to succeed, got ${resp.status}`);
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

  input.fakeOpenAi.resetChatCompletions();
  await runSmokeTextChatRoundTrip(apiBase, state, {
    assistantMessageStateKey: 'firstAssistantMessageId',
    content: '烟测第一条消息',
    expectedText: '本地 smoke 回复: 烟测第一条消息',
    headers: userHeaders,
    responseTextStateKey: 'firstAssistantText',
    stepName: 'chat.messages.send',
    userMessageStateKey: 'firstUserMessageId',
  });

  await runStep('chat.messages.send.denied-skill-tool', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const matchingRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('烟测第一条消息'));
    ensure(matchingRequest, 'Expected denied-skill send to reach fake OpenAI');
    ensure(!requestIncludesToolName(matchingRequest.body, 'skill'), 'Expected denied skill governance to remove native skill tool from model request');
  });

  await runStep('chat.conversation.get.after-send', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const firstAssistant = conversation.messages.find((entry) => entry.id === state.firstAssistantMessageId);
    ensure(firstAssistant?.content === state.firstAssistantText, 'Expected first assistant message to persist generated content');
  });

  input.fakeOpenAi.resetChatCompletions();
  await runSmokeTextChatRoundTrip(apiBase, state, {
    assistantMessageStateKey: 'commandAssistantMessageId',
    content: '/compact',
    expectDisplayOnly: true,
    headers: userHeaders,
    responseTextStateKey: 'commandAssistantText',
    stepName: 'chat.messages.command',
    userMessageStateKey: 'commandUserMessageId',
  });

  await runStep('chat.messages.command.no-model', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    ensure(requests.every((entry) => !containsText(entry.body?.messages ?? [], '/compact')), 'Expected slash command display messages to stay out of model context');
  });

  await runStep('chat.conversation.get.after-command', async () => {
    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const commandUser = conversation.messages.find((entry) => entry.id === state.commandUserMessageId);
    const commandAssistant = conversation.messages.find((entry) => entry.id === state.commandAssistantMessageId);
    ensure(commandUser?.role === 'display', 'Expected slash command input to persist as display in conversation detail');
    ensure(commandUser?.content === '/compact', 'Expected slash command input content to persist for display');
    ensure(commandAssistant?.role === 'display', 'Expected slash command result to persist as display in conversation detail');
    ensure(commandAssistant?.content === state.commandAssistantText, 'Expected slash command result content to persist');
  });

  await runStep('skills.governance.allow', async () => {
    const detail = await putJson(apiBase, `/skills/${encodeURIComponent(input.smokeSkillId)}/governance`, {
      body: {
        loadPolicy: 'allow',
      },
    });
    ensure(detail.governance?.loadPolicy === 'allow', 'Expected skill governance allow update to persist');
  });

  await runStep('chat.messages.skill-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请加载 smoke-http-flow 技能，并用一句话说明技能加载结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.skillLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.skillLoopAssistantMessageId === 'string', 'Expected skill loop to create assistant message');
    state.skillLoopAssistantText = assertCompletedSse(events, '已加载技能 smoke-http-flow，可继续执行 Smoke HTTP Flow。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'skill'), 'Expected skill loop SSE to include native skill tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'skill'), 'Expected skill loop SSE to include native skill tool result');
    ensure(finishEvent?.status === 'completed', 'Expected skill loop SSE to finish');
  });

  await runStep('chat.messages.skill-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请加载 smoke-http-flow 技能'));
    ensure(firstRequest, 'Expected first skill loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'skill'), 'Expected allowed skill governance to expose native skill tool');
    ensure(!containsText(firstRequest.body?.messages ?? [], '/compact'), 'Expected slash command display messages to stay out of model context');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'skill'));
    ensure(toolResultRequest, 'Expected skill loop to issue a follow-up request with tool results');
    ensure(requestContainsSkillContent(toolResultRequest.body, 'smoke-http-flow'), 'Expected skill loop follow-up request to include rendered skill content');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const skillAssistant = conversation.messages.find((entry) => entry.id === state.skillLoopAssistantMessageId);
    const skillToolCalls = parseSerializedJsonValue(skillAssistant?.toolCalls);
    const skillToolResults = parseSerializedJsonValue(skillAssistant?.toolResults);
    ensure(skillAssistant?.content === state.skillLoopAssistantText, 'Expected skill loop assistant message to persist generated content');
    ensure(Array.isArray(skillToolCalls) && skillToolCalls.some((entry) => entry?.toolName === 'skill'), 'Expected skill loop assistant message to persist native skill tool call');
    ensure(Array.isArray(skillToolResults) && skillToolResults.some((entry) => entry?.toolName === 'skill'), 'Expected skill loop assistant message to persist native skill tool result');
  });

  await runStep('ai.subagent-config.get', async () => {
    const config = await getJson(apiBase, '/ai/subagent-config');
    ensure(typeof config === 'object' && config !== null, 'Expected subagent config snapshot');
    ensure(config.schema?.items?.llm?.type === 'object', 'Expected subagent llm schema');
    ensure(config.schema?.items?.session?.type === 'object', 'Expected subagent session schema');
  });

  await runStep('ai.subagent-config.put', async () => {
    const config = await putJson(apiBase, '/ai/subagent-config', {
      body: {
        values: {
          llm: {
            targetSubagentType: 'general',
          },
          session: {
            maxConversationSubagents: 6,
          },
        },
      },
    });
    ensure(config.values?.llm?.targetSubagentType === 'general', 'Expected subagent targetSubagentType to persist');
    ensure(config.values?.session?.maxConversationSubagents === 6, 'Expected subagent maxConversationSubagents to persist');
  });

  await runStep('chat.messages.subagent-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 subagent 工具委派一个探索任务，并总结结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.subagentLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.subagentLoopAssistantMessageId === 'string', 'Expected subagent loop to create assistant message');
    state.subagentLoopAssistantText = assertCompletedSse(events, '子代理已完成：Smoke HTTP Flow 用于后端烟测。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'spawn_subagent'), 'Expected subagent loop SSE to include spawn_subagent tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'spawn_subagent'), 'Expected subagent loop SSE to include spawn_subagent tool result');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'wait_subagent'), 'Expected subagent loop SSE to include wait_subagent tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'wait_subagent'), 'Expected subagent loop SSE to include wait_subagent tool result');
    ensure(finishEvent?.status === 'completed', 'Expected subagent loop SSE to finish');
  });

  await runStep('chat.messages.subagent-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 subagent 工具委派一个探索任务'));
    ensure(firstRequest, 'Expected first subagent loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'spawn_subagent'), 'Expected subagent loop request to expose spawn_subagent');
    ensure(requestIncludesToolName(firstRequest.body, 'wait_subagent'), 'Expected subagent loop request to expose wait_subagent');
    const spawnResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'spawn_subagent'));
    ensure(spawnResultRequest, 'Expected subagent loop to issue a follow-up request with spawn_subagent results');
    ensure(requestContainsSubagentSessionId(spawnResultRequest.body), 'Expected spawn_subagent follow-up request to include conversation id');
    const waitResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'wait_subagent'));
    ensure(waitResultRequest, 'Expected subagent loop to issue a follow-up request with wait_subagent results');
    ensure(requestContainsSubagentResult(waitResultRequest.body, 'Smoke HTTP Flow 用于后端烟测。'), 'Expected wait_subagent follow-up request to include rendered subagent result');
    ensure(!JSON.stringify(waitResultRequest.body).includes('provider:'), 'Expected wait_subagent follow-up request not to leak provider details');
    ensure(!JSON.stringify(waitResultRequest.body).includes('model:'), 'Expected wait_subagent follow-up request not to leak model details');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const subagentAssistant = conversation.messages.find((entry) => entry.id === state.subagentLoopAssistantMessageId);
    const subagentToolCalls = parseSerializedJsonValue(subagentAssistant?.toolCalls);
    const subagentToolResults = parseSerializedJsonValue(subagentAssistant?.toolResults);
    ensure(subagentAssistant?.content === state.subagentLoopAssistantText, 'Expected subagent loop assistant message to persist generated content');
    ensure(Array.isArray(subagentToolCalls) && subagentToolCalls.some((entry) => entry?.toolName === 'spawn_subagent'), 'Expected subagent loop assistant message to persist spawn_subagent tool call');
    ensure(Array.isArray(subagentToolCalls) && subagentToolCalls.some((entry) => entry?.toolName === 'wait_subagent'), 'Expected subagent loop assistant message to persist wait_subagent tool call');
    ensure(Array.isArray(subagentToolResults) && subagentToolResults.some((entry) => entry?.toolName === 'spawn_subagent'), 'Expected subagent loop assistant message to persist spawn_subagent tool result');
    ensure(Array.isArray(subagentToolResults) && subagentToolResults.some((entry) => entry?.toolName === 'wait_subagent'), 'Expected subagent loop assistant message to persist wait_subagent tool result');
  });

  await runSubagentAutoCompactionSmoke(apiBase, state, {
    fakeOpenAi: input.fakeOpenAi,
    headers: userHeaders,
  });

  await runStep('chat.messages.todo-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请更新当前待办列表，并用一句话说明剩余任务数。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.todoLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.todoLoopAssistantMessageId === 'string', 'Expected todo loop to create assistant message');
    state.todoLoopAssistantText = assertCompletedSse(events, '已更新当前待办，当前剩余 2 项。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'todowrite'), 'Expected todo loop SSE to include native todowrite tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'todowrite'), 'Expected todo loop SSE to include native todowrite tool result');
    ensure(finishEvent?.status === 'completed', 'Expected todo loop SSE to finish');
  });

  await runStep('chat.messages.todo-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请更新当前待办列表'));
    ensure(firstRequest, 'Expected first todo loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'todowrite'), 'Expected todo loop request to expose native todowrite tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'todowrite'));
    ensure(toolResultRequest, 'Expected todo loop to issue a follow-up request with todowrite tool results');
    ensure(requestContainsTodoResult(toolResultRequest.body, '继续补 todo smoke'), 'Expected todo loop follow-up request to include rendered todo result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const todoAssistant = conversation.messages.find((entry) => entry.id === state.todoLoopAssistantMessageId);
    const todoToolCalls = parseSerializedJsonValue(todoAssistant?.toolCalls);
    const todoToolResults = parseSerializedJsonValue(todoAssistant?.toolResults);
    ensure(todoAssistant?.content === state.todoLoopAssistantText, 'Expected todo loop assistant message to persist generated content');
    ensure(Array.isArray(todoToolCalls) && todoToolCalls.some((entry) => entry?.toolName === 'todowrite'), 'Expected todo loop assistant message to persist native todowrite tool call');
    ensure(Array.isArray(todoToolResults) && todoToolResults.some((entry) => entry?.toolName === 'todowrite'), 'Expected todo loop assistant message to persist native todowrite tool result');

    const todos = await getJson(apiBase, `/chat/sessions/${state.conversationId}/todo`, { headers: userHeaders() });
    ensure(Array.isArray(todos) && todos.length === 3, 'Expected todo loop to overwrite session todo list');
    ensure(todos.some((entry) => entry.content === '继续补 todo smoke' && entry.status === 'in_progress'), 'Expected todo loop to persist latest in-progress item');
  });

  await runStep('chat.messages.webfetch-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请抓取 smoke web 页面，并用一句话说明标题。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.webFetchLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.webFetchLoopAssistantMessageId === 'string', 'Expected webfetch loop to create assistant message');
    state.webFetchLoopAssistantText = assertCompletedSse(events, '已抓取 smoke 页面，并整理成 markdown。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'webfetch'), 'Expected webfetch loop SSE to include native webfetch tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'webfetch'), 'Expected webfetch loop SSE to include native webfetch tool result');
    ensure(finishEvent?.status === 'completed', 'Expected webfetch loop SSE to finish');
  });

  await runStep('chat.messages.webfetch-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请抓取 smoke web 页面'));
    ensure(firstRequest, 'Expected first webfetch loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'webfetch'), 'Expected webfetch loop request to expose native webfetch tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'webfetch'));
    ensure(toolResultRequest, 'Expected webfetch loop to issue a follow-up request with webfetch tool results');
    ensure(requestContainsWebFetchResult(toolResultRequest.body, 'Smoke Article'), 'Expected webfetch loop follow-up request to include rendered webfetch result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const webFetchAssistant = conversation.messages.find((entry) => entry.id === state.webFetchLoopAssistantMessageId);
    const webFetchToolCalls = parseSerializedJsonValue(webFetchAssistant?.toolCalls);
    const webFetchToolResults = parseSerializedJsonValue(webFetchAssistant?.toolResults);
    ensure(webFetchAssistant?.content === state.webFetchLoopAssistantText, 'Expected webfetch loop assistant message to persist generated content');
    ensure(Array.isArray(webFetchToolCalls) && webFetchToolCalls.some((entry) => entry?.toolName === 'webfetch'), 'Expected webfetch loop assistant message to persist native webfetch tool call');
    ensure(Array.isArray(webFetchToolResults) && webFetchToolResults.some((entry) => entry?.toolName === 'webfetch'), 'Expected webfetch loop assistant message to persist native webfetch tool result');
  });

  await runStep('ai.runtime-tools-config.get', async () => {
    const config = await getJson(apiBase, '/ai/runtime-tools-config');
    ensure(typeof config === 'object' && config !== null, 'Expected runtime tools config snapshot');
    ensure(config.schema?.items?.shellBackend?.type === 'string', 'Expected runtime tools shell backend schema');
    ensure(Array.isArray(config.schema?.items?.shellBackend?.options), 'Expected runtime tools shell backend options');
    ensure(config.schema?.items?.bashOutput?.type === 'object', 'Expected runtime tools bash output schema');
    ensure(config.schema?.items?.toolOutputCapture?.type === 'object', 'Expected runtime tools tool output capture schema');
    ensure(config.schema?.items?.toolOutputCapture?.items?.maxBytes?.type === 'int', 'Expected runtime tools tool output capture maxBytes schema');
    ensure(config.schema?.items?.toolOutputCapture?.items?.maxFilesPerSession?.type === 'int', 'Expected runtime tools tool output capture maxFilesPerSession schema');
  });

  await runStep('ai.runtime-tools-config.put.compact', async () => {
    const config = await putJson(apiBase, '/ai/runtime-tools-config', {
      body: {
        values: {
          shellBackend: readSmokeRuntimeToolsShellBackendKind(),
          bashOutput: {
            maxBytes: 16 * 1024,
            maxLines: 2,
            showTruncationDetails: false,
          },
          toolOutputCapture: {
            enabled: true,
            maxBytes: 24,
            maxFilesPerSession: 5,
          },
        },
      },
    });
    ensure(config.values?.shellBackend === readSmokeRuntimeToolsShellBackendKind(), 'Expected runtime tools shell backend to persist');
    ensure(config.values?.bashOutput?.maxLines === 2, 'Expected runtime tools config maxLines to persist');
    ensure(config.values?.bashOutput?.showTruncationDetails === false, 'Expected runtime tools config truncation details toggle to persist');
    ensure(config.values?.toolOutputCapture?.enabled === true, 'Expected runtime tools config tool output capture toggle to persist');
    ensure(config.values?.toolOutputCapture?.maxBytes === 24, 'Expected runtime tools config tool output capture maxBytes to persist');
    ensure(config.values?.toolOutputCapture?.maxFilesPerSession === 5, 'Expected runtime tools config tool output capture maxFilesPerSession to persist');
  });

  await runStep('chat.messages.bash-config-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: buildSmokeShellInstruction('请使用 {shellToolName} 工具生成多行输出，并确认最后两行内容。'),
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
      onEvent: async (event) => {
        if (event.type === 'permission-request') {
          await approveRuntimePermissionRequest(event);
        }
      },
    });
    await ensureRuntimePermissionExpectation(
      events,
      usesYoloApproval ? 'skipped' : 'requested',
      'bash config loop SSE',
    );
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === readSmokeShellToolName()), 'Expected bash config loop SSE to include native shell tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === readSmokeShellToolName()), 'Expected bash config loop SSE to include native shell tool result');
    assertCompletedSse(events, '已读取 smoke workspace 文件。');
  });

  await runStep('chat.messages.bash-config-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具生成多行输出')));
    ensure(firstRequest, 'Expected first bash config loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, readSmokeShellToolName()), 'Expected bash config loop request to expose native shell tool');
    const toolResultRequest = requests.find((entry) => requestContainsShellToolResult(entry.body));
    ensure(toolResultRequest, 'Expected bash config loop to issue a follow-up request with bash tool results');
    const bashToolContent = readLatestShellToolContent(toolResultRequest.body);
    ensure(typeof bashToolContent === 'string', 'Expected bash config loop follow-up request to include bash tool content');
    ensure(readBashStreamSection(bashToolContent, 'stdout') === 'line-3\nline-4', 'Expected bash config loop follow-up request to keep only the bounded stdout tail');
    ensure(!bashToolContent.includes('output truncated'), 'Expected bash config loop follow-up request to hide truncation details');
    const outputPathMatch = bashToolContent.match(/Full output saved to: ([^\n]+)/);
    ensure(outputPathMatch?.[1], 'Expected bash config loop follow-up request to expose captured full output path even when truncation details are hidden');
    ensure(fs.existsSync(readVisibleRuntimeCommandCaptureHostPath(outputPathMatch[1])), 'Expected bash config loop captured full output file to exist');
  });

  await runStep('ai.runtime-tools-config.put.capture', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const config = await putJson(apiBase, '/ai/runtime-tools-config', {
      body: {
        values: {
          shellBackend: readSmokeRuntimeToolsShellBackendKind(),
          bashOutput: {
            maxBytes: 16,
            maxLines: 200,
            showTruncationDetails: true,
          },
          toolOutputCapture: {
            enabled: true,
            maxBytes: 16,
            maxFilesPerSession: 2,
          },
        },
      },
    });
    ensure(config.values?.bashOutput?.maxBytes === 16, 'Expected runtime tools config capture maxBytes to persist');
    ensure(config.values?.bashOutput?.maxLines === 200, 'Expected runtime tools config capture maxLines to persist');
    ensure(config.values?.bashOutput?.showTruncationDetails === true, 'Expected runtime tools config capture truncation details toggle to persist');
    ensure(config.values?.toolOutputCapture?.enabled === true, 'Expected runtime tools config capture toggle to persist');
    ensure(config.values?.toolOutputCapture?.maxBytes === 16, 'Expected runtime tools config capture maxBytes to persist');
    ensure(config.values?.toolOutputCapture?.maxFilesPerSession === 2, 'Expected runtime tools config capture maxFilesPerSession to persist');
  });

  for (const index of [1, 2, 3]) {
    const prompt = buildSmokeShellInstruction(`请使用 {shellToolName} 工具生成多行输出，并确认最后两行内容，同时验证长输出全文文件 ${index}。`);
    await runStep(`chat.messages.bash-capture-loop.${index}`, async () => {
      const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
        body: {
          content: prompt,
          model: state.modelId,
          provider: state.providerId,
        },
        headers: userHeaders(),
        onEvent: async (event) => {
          if (event.type === 'permission-request') {
            await approveRuntimePermissionRequest(event);
          }
        },
      });
      await ensureRuntimePermissionExpectation(
        events,
        usesYoloApproval ? 'skipped' : 'requested',
        `bash capture loop ${index} SSE`,
      );
      assertCompletedSse(events, '已读取 smoke workspace 文件。');
    });

    await runStep(`chat.messages.bash-capture-loop.${index}.verify`, async () => {
      const requests = input.fakeOpenAi.readChatCompletions();
      const toolResultRequest = [...requests].reverse().find((entry) =>
        requestContainsShellToolResult(entry.body)
        && readLatestUserText(entry.body?.messages).includes(prompt));
      ensure(toolResultRequest, `Expected bash capture loop ${index} to issue a follow-up request with shell tool results`);
      const bashToolContent = readLatestShellToolContent(toolResultRequest.body);
      ensure(typeof bashToolContent === 'string', `Expected bash capture loop ${index} follow-up request to include shell tool content`);
      ensure(bashToolContent.includes('Full output saved to: /.garlic-claw/runtime-command-output/'), `Expected bash capture loop ${index} to expose captured full output path`);
      const outputPathMatch = bashToolContent.match(/Full output saved to: ([^\n]+)/);
      ensure(outputPathMatch?.[1], `Expected bash capture loop ${index} full output path`);
      runtimeCommandCapturePaths.push(outputPathMatch[1]);
      const hostPath = readVisibleRuntimeCommandCaptureHostPath(outputPathMatch[1]);
      ensure(fs.existsSync(hostPath), `Expected bash capture loop ${index} full output file to exist`);
      ensure(readNormalizedFileContent(hostPath).includes('line-1'), `Expected bash capture loop ${index} captured file to keep full stdout head`);
      ensure(readNormalizedFileContent(hostPath).includes('line-4'), `Expected bash capture loop ${index} captured file to keep full stdout tail`);
    });
  }

  await runStep('chat.messages.bash-capture-loop.cleanup.verify', async () => {
    const captureDirectory = readSessionRuntimeCommandCaptureRoot();
    ensure(fs.existsSync(captureDirectory), 'Expected runtime command capture directory to exist');
    const files = fs.readdirSync(captureDirectory);
    ensure(files.length === 2, 'Expected runtime command capture cleanup to keep only the newest two files');
    ensure(runtimeCommandCapturePaths.length === 3, 'Expected three runtime command capture paths');
    ensure(fs.existsSync(readVisibleRuntimeCommandCaptureHostPath(runtimeCommandCapturePaths[0])) === false, 'Expected oldest runtime command capture file to be cleaned up');
    ensure(fs.existsSync(readVisibleRuntimeCommandCaptureHostPath(runtimeCommandCapturePaths[1])), 'Expected second runtime command capture file to remain');
    ensure(fs.existsSync(readVisibleRuntimeCommandCaptureHostPath(runtimeCommandCapturePaths[2])), 'Expected newest runtime command capture file to remain');
  });

  await runStep('ai.runtime-tools-config.put.default', async () => {
    const config = await putJson(apiBase, '/ai/runtime-tools-config', {
      body: {
        values: {
          shellBackend: readSmokeRuntimeToolsShellBackendKind(),
          bashOutput: {
            maxBytes: 16 * 1024,
            maxLines: 200,
            showTruncationDetails: true,
          },
          toolOutputCapture: {
            enabled: true,
            maxBytes: 8 * 1024,
            maxFilesPerSession: 20,
          },
        },
      },
    });
    ensure(config.values?.shellBackend === readSmokeRuntimeToolsShellBackendKind(), 'Expected runtime tools shell backend to restore');
    ensure(config.values?.bashOutput?.maxLines === 200, 'Expected runtime tools config maxLines to restore');
    ensure(config.values?.bashOutput?.showTruncationDetails === true, 'Expected runtime tools config truncation details toggle to restore');
    ensure(config.values?.toolOutputCapture?.enabled === true, 'Expected runtime tools config tool output capture toggle to restore');
    ensure(config.values?.toolOutputCapture?.maxBytes === 8 * 1024, 'Expected runtime tools config tool output capture maxBytes to restore');
    ensure(config.values?.toolOutputCapture?.maxFilesPerSession === 20, 'Expected runtime tools config tool output capture maxFilesPerSession to restore');
  });

  await runStep('chat.messages.bash-write-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: buildSmokeShellInstruction('请使用 {shellToolName} 工具在 smoke workspace 中写入文件，并确认写入结果。'),
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
      onEvent: async (event) => {
        if (event.type === 'permission-request') {
          await approveRuntimePermissionRequest(event, 'always');
        }
      },
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.bashWriteAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.bashWriteAssistantMessageId === 'string', 'Expected bash write loop to create assistant message');
    state.bashWriteAssistantText = assertCompletedSse(events, '已写入 smoke workspace 文件。');
    await ensureRuntimePermissionExpectation(
      events,
      usesYoloApproval ? 'skipped' : 'requested',
      'bash write loop SSE',
    );
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === readSmokeShellToolName()), 'Expected bash write loop SSE to include native shell tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === readSmokeShellToolName()), 'Expected bash write loop SSE to include native shell tool result');
    ensure(finishEvent?.status === 'completed', 'Expected bash write loop SSE to finish');
  });

  await runStep('chat.messages.bash-write-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具在 smoke workspace 中写入文件')));
    ensure(firstRequest, 'Expected first bash write loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, readSmokeShellToolName()), 'Expected bash write loop request to expose native shell tool');
    const toolResultRequest = requests.find((entry) => requestContainsShellToolResult(entry.body));
    ensure(toolResultRequest, 'Expected bash write loop to issue a follow-up request with bash tool results');
    ensure(requestContainsShellResult(toolResultRequest.body, 'smoke-workspace'), 'Expected bash write loop follow-up request to include rendered shell result');
    ensure(fs.existsSync(path.join(readSessionWorkspaceRoot(), 'notes', 'runtime.txt')), 'Expected bash write loop to persist file in runtime workspace');
    ensure(readNormalizedFileContent(path.join(readSessionWorkspaceRoot(), 'notes', 'runtime.txt')) === 'smoke-workspace\n', 'Expected persisted runtime workspace file content');
  });

  await runStep('chat.messages.bash-read-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: buildSmokeShellInstruction('请使用 {shellToolName} 工具读取刚才写入的 smoke workspace 文件，并确认读取结果。'),
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
      onEvent: async (event) => {
        if (event.type === 'permission-request') {
          await approveRuntimePermissionRequest(event);
        }
      },
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.bashReadAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.bashReadAssistantMessageId === 'string', 'Expected bash read loop to create assistant message');
    state.bashReadAssistantText = assertCompletedSse(events, '已读取 smoke workspace 文件。');
    await ensureRuntimePermissionExpectation(events, 'skipped', 'bash read loop SSE');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === readSmokeShellToolName()), 'Expected bash read loop SSE to include native shell tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === readSmokeShellToolName()), 'Expected bash read loop SSE to include native shell tool result');
    ensure(finishEvent?.status === 'completed', 'Expected bash read loop SSE to finish');
  });

  await runStep('chat.messages.bash-read-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具读取刚才写入的 smoke workspace 文件')));
    ensure(firstRequest, 'Expected first bash read loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, readSmokeShellToolName()), 'Expected bash read loop request to expose native shell tool');
    const toolResultRequest = requests.find((entry) => requestContainsShellToolResult(entry.body));
    ensure(toolResultRequest, 'Expected bash read loop to issue a follow-up request with bash tool results');
    ensure(requestContainsShellResult(toolResultRequest.body, 'smoke-workspace'), 'Expected bash read loop follow-up request to include rendered shell result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const bashAssistant = conversation.messages.find((entry) => entry.id === state.bashReadAssistantMessageId);
    const bashToolCalls = parseSerializedJsonValue(bashAssistant?.toolCalls);
    const bashToolResults = parseSerializedJsonValue(bashAssistant?.toolResults);
    ensure(bashAssistant?.content === state.bashReadAssistantText, 'Expected bash read loop assistant message to persist generated content');
    ensure(Array.isArray(bashToolCalls) && bashToolCalls.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash read loop assistant message to persist native shell tool call');
    ensure(Array.isArray(bashToolResults) && bashToolResults.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash read loop assistant message to persist native shell tool result');
  });

  await runStep('chat.messages.bash-workdir-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: buildSmokeShellInstruction('请使用 {shellToolName} 工具在 nested 子目录中执行命令，并确认当前工作目录。'),
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
      onEvent: async (event) => {
        if (event.type === 'permission-request') {
          await approveRuntimePermissionRequest(event);
        }
      },
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.bashWorkdirAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.bashWorkdirAssistantMessageId === 'string', 'Expected bash workdir loop to create assistant message');
    state.bashWorkdirAssistantText = assertCompletedSse(events, `已在指定 ${readSmokeShellToolName()} 工作目录中完成执行。`);
    await ensureRuntimePermissionExpectation(events, 'skipped', 'bash workdir loop SSE');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === readSmokeShellToolName()), 'Expected bash workdir loop SSE to include native shell tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === readSmokeShellToolName()), 'Expected bash workdir loop SSE to include native shell tool result');
    ensure(finishEvent?.status === 'completed', 'Expected bash workdir loop SSE to finish');
  });

  await runStep('chat.messages.bash-workdir-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具在 nested 子目录中执行命令')));
    ensure(firstRequest, 'Expected first bash workdir loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, readSmokeShellToolName()), 'Expected bash workdir loop request to expose native shell tool');
    const toolResultRequest = requests.find((entry) => requestContainsShellToolResult(entry.body));
    ensure(toolResultRequest, 'Expected bash workdir loop to issue a follow-up request with bash tool results');
    ensure(requestContainsShellResult(toolResultRequest.body, 'from-workdir'), 'Expected bash workdir loop follow-up request to include rendered workdir output');
    ensure(readNormalizedFileContent(path.join(readSessionWorkspaceRoot(), 'nested', 'child.txt')) === 'from-workdir\n', 'Expected bash workdir loop to persist file under nested workdir');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const bashAssistant = conversation.messages.find((entry) => entry.id === state.bashWorkdirAssistantMessageId);
    const bashToolCalls = parseSerializedJsonValue(bashAssistant?.toolCalls);
    const bashToolResults = parseSerializedJsonValue(bashAssistant?.toolResults);
    ensure(bashAssistant?.content === state.bashWorkdirAssistantText, 'Expected bash workdir loop assistant message to persist generated content');
    ensure(Array.isArray(bashToolCalls) && bashToolCalls.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash workdir loop assistant message to persist native shell tool call');
    ensure(Array.isArray(bashToolResults) && bashToolResults.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash workdir loop assistant message to persist native shell tool result');
  });

  await runStep('chat.messages.bash-timeout-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: buildSmokeShellInstruction('请使用很短超时触发 {shellToolName} 超时，并说明已收到超时错误。'),
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
      onEvent: async (event) => {
        if (event.type === 'permission-request') {
          await approveRuntimePermissionRequest(event);
        }
      },
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.bashTimeoutAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.bashTimeoutAssistantMessageId === 'string', 'Expected bash timeout loop to create assistant message');
    state.bashTimeoutAssistantText = assertCompletedSse(events, `已收到 ${readSmokeShellToolName()} 超时错误。`);
    await ensureRuntimePermissionExpectation(
      events,
      usesYoloApproval ? 'skipped' : 'requested',
      'bash timeout loop SSE',
    );
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === readSmokeShellToolName()), 'Expected bash timeout loop SSE to include native shell tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === readSmokeShellToolName()), 'Expected bash timeout loop SSE to include native shell tool result');
    ensure(finishEvent?.status === 'completed', 'Expected bash timeout loop SSE to finish');
  });

  await runStep('chat.messages.bash-timeout-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes(buildSmokeShellInstruction('请使用很短超时触发 {shellToolName} 超时')));
    ensure(firstRequest, 'Expected first bash timeout loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, readSmokeShellToolName()), 'Expected bash timeout loop request to expose native shell tool');
    const toolResultRequest = requests.find((entry) => requestContainsShellToolResult(entry.body));
    ensure(toolResultRequest, 'Expected bash timeout loop to issue a follow-up request with bash tool results');
    ensure(requestContainsInvalidToolResult(toolResultRequest.body, readSmokeShellToolName(), `${readSmokeShellToolName()} 执行超时`), 'Expected bash timeout loop follow-up request to include invalid bash timeout result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const bashAssistant = conversation.messages.find((entry) => entry.id === state.bashTimeoutAssistantMessageId);
    const bashToolCalls = parseSerializedJsonValue(bashAssistant?.toolCalls);
    const bashToolResults = parseSerializedJsonValue(bashAssistant?.toolResults);
    ensure(bashAssistant?.content === state.bashTimeoutAssistantText, 'Expected bash timeout loop assistant message to persist generated content');
    ensure(Array.isArray(bashToolCalls) && bashToolCalls.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash timeout loop assistant message to persist native shell tool call');
    ensure(Array.isArray(bashToolResults) && bashToolResults.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash timeout loop assistant message to persist native shell tool result');
  });

  await runStep('chat.messages.bash-tar-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: buildSmokeShellInstruction('请使用 {shellToolName} 工具打包并还原一个 nested 目录树，并确认结果。'),
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
      onEvent: async (event) => {
        if (event.type === 'permission-request') {
          await approveRuntimePermissionRequest(event);
        }
      },
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.bashTarAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.bashTarAssistantMessageId === 'string', 'Expected bash tar loop to create assistant message');
    state.bashTarAssistantText = assertCompletedSse(events, `已完成 ${readSmokeShellToolName()} 打包与还原验证。`);
    await ensureRuntimePermissionExpectation(events, 'skipped', 'bash tar loop SSE');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === readSmokeShellToolName()), 'Expected bash tar loop SSE to include native shell tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === readSmokeShellToolName()), 'Expected bash tar loop SSE to include native shell tool result');
    ensure(finishEvent?.status === 'completed', 'Expected bash tar loop SSE to finish');
  });

  await runStep('chat.messages.bash-tar-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具打包并还原一个 nested 目录树')));
    ensure(firstRequest, 'Expected first bash tar loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, readSmokeShellToolName()), 'Expected bash tar loop request to expose native shell tool');
    const toolResultRequest = requests.find((entry) => requestContainsShellToolResult(entry.body));
    ensure(toolResultRequest, 'Expected bash tar loop to issue a follow-up request with bash tool results');
    ensure(requestContainsShellResult(toolResultRequest.body, 'restored/tree/a/one.txt'), 'Expected bash tar loop follow-up request to include restored file list');
    ensure(requestContainsShellResult(toolResultRequest.body, 'restored/tree/b/two.txt'), 'Expected bash tar loop follow-up request to include nested restored file list');
    ensure(requestContainsShellResult(toolResultRequest.body, 'one'), 'Expected bash tar loop follow-up request to include first restored content');
    ensure(requestContainsShellResult(toolResultRequest.body, 'two'), 'Expected bash tar loop follow-up request to include second restored content');
    ensure(fs.existsSync(path.join(readSessionWorkspaceRoot(), 'bundle.tar')), 'Expected bash tar loop to persist archive file');
    ensure(readNormalizedFileContent(path.join(readSessionWorkspaceRoot(), 'restored', 'tree', 'a', 'one.txt')) === 'one\n', 'Expected bash tar loop to restore first file');
    ensure(readNormalizedFileContent(path.join(readSessionWorkspaceRoot(), 'restored', 'tree', 'b', 'two.txt')) === 'two\n', 'Expected bash tar loop to restore second file');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const bashAssistant = conversation.messages.find((entry) => entry.id === state.bashTarAssistantMessageId);
    const bashToolCalls = parseSerializedJsonValue(bashAssistant?.toolCalls);
    const bashToolResults = parseSerializedJsonValue(bashAssistant?.toolResults);
    ensure(bashAssistant?.content === state.bashTarAssistantText, 'Expected bash tar loop assistant message to persist generated content');
    ensure(Array.isArray(bashToolCalls) && bashToolCalls.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash tar loop assistant message to persist native shell tool call');
    ensure(Array.isArray(bashToolResults) && bashToolResults.some((entry) => entry?.toolName === readSmokeShellToolName()), 'Expected bash tar loop assistant message to persist native shell tool result');
  });

  await runStep('chat.messages.read-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 read 工具读取刚才写入的 smoke workspace 文件，并确认首行内容。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.readLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.readLoopAssistantMessageId === 'string', 'Expected read loop to create assistant message');
    state.readLoopAssistantText = assertCompletedSse(events, '已通过 read 工具读取 smoke workspace 文件。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'read'), 'Expected read loop SSE to include native read tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'read'), 'Expected read loop SSE to include native read tool result');
    ensure(finishEvent?.status === 'completed', 'Expected read loop SSE to finish');
  });

  await runStep('chat.messages.read-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 read 工具读取刚才写入的 smoke workspace 文件'));
    ensure(firstRequest, 'Expected first read loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'read'), 'Expected read loop request to expose native read tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'read'));
    ensure(toolResultRequest, 'Expected read loop to issue a follow-up request with read tool results');
    ensure(requestContainsReadResult(toolResultRequest.body, '/notes/runtime.txt', 'smoke-workspace'), 'Expected read loop follow-up request to include rendered read result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const readAssistant = conversation.messages.find((entry) => entry.id === state.readLoopAssistantMessageId);
    const readToolCalls = parseSerializedJsonValue(readAssistant?.toolCalls);
    const readToolResults = parseSerializedJsonValue(readAssistant?.toolResults);
    ensure(readAssistant?.content === state.readLoopAssistantText, 'Expected read loop assistant message to persist generated content');
    ensure(Array.isArray(readToolCalls) && readToolCalls.some((entry) => entry?.toolName === 'read'), 'Expected read loop assistant message to persist native read tool call');
    ensure(Array.isArray(readToolResults) && readToolResults.some((entry) => entry?.toolName === 'read'), 'Expected read loop assistant message to persist native read tool result');
  });

  await runStep('chat.messages.glob-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 glob 工具列出 smoke workspace 中的 txt 文件，并确认结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.globLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.globLoopAssistantMessageId === 'string', 'Expected glob loop to create assistant message');
    state.globLoopAssistantText = assertCompletedSse(events, '已通过 glob 工具列出 smoke workspace 文件。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'glob'), 'Expected glob loop SSE to include native glob tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'glob'), 'Expected glob loop SSE to include native glob tool result');
    ensure(finishEvent?.status === 'completed', 'Expected glob loop SSE to finish');
  });

  await runStep('chat.messages.glob-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 glob 工具列出 smoke workspace 中的 txt 文件'));
    ensure(firstRequest, 'Expected first glob loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'glob'), 'Expected glob loop request to expose native glob tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'glob'));
    ensure(toolResultRequest, 'Expected glob loop to issue a follow-up request with glob tool results');
    ensure(requestContainsGlobResult(toolResultRequest.body, '/notes/runtime.txt'), 'Expected glob loop follow-up request to include rendered glob result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const globAssistant = conversation.messages.find((entry) => entry.id === state.globLoopAssistantMessageId);
    const globToolCalls = parseSerializedJsonValue(globAssistant?.toolCalls);
    const globToolResults = parseSerializedJsonValue(globAssistant?.toolResults);
    ensure(globAssistant?.content === state.globLoopAssistantText, 'Expected glob loop assistant message to persist generated content');
    ensure(Array.isArray(globToolCalls) && globToolCalls.some((entry) => entry?.toolName === 'glob'), 'Expected glob loop assistant message to persist native glob tool call');
    ensure(Array.isArray(globToolResults) && globToolResults.some((entry) => entry?.toolName === 'glob'), 'Expected glob loop assistant message to persist native glob tool result');
  });

  await runStep('chat.messages.grep-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 grep 工具搜索 smoke workspace 中的 smoke-workspace 文本，并确认结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.grepLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.grepLoopAssistantMessageId === 'string', 'Expected grep loop to create assistant message');
    state.grepLoopAssistantText = assertCompletedSse(events, '已通过 grep 工具找到 smoke workspace 文本。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'grep'), 'Expected grep loop SSE to include native grep tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'grep'), 'Expected grep loop SSE to include native grep tool result');
    ensure(finishEvent?.status === 'completed', 'Expected grep loop SSE to finish');
  });

  await runStep('chat.messages.grep-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 grep 工具搜索 smoke workspace 中的 smoke-workspace 文本'));
    ensure(firstRequest, 'Expected first grep loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'grep'), 'Expected grep loop request to expose native grep tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'grep'));
    ensure(toolResultRequest, 'Expected grep loop to issue a follow-up request with grep tool results');
    ensure(requestContainsGrepResult(toolResultRequest.body, '/notes/runtime.txt', 'smoke-workspace'), 'Expected grep loop follow-up request to include rendered grep result');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const grepAssistant = conversation.messages.find((entry) => entry.id === state.grepLoopAssistantMessageId);
    const grepToolCalls = parseSerializedJsonValue(grepAssistant?.toolCalls);
    const grepToolResults = parseSerializedJsonValue(grepAssistant?.toolResults);
    ensure(grepAssistant?.content === state.grepLoopAssistantText, 'Expected grep loop assistant message to persist generated content');
    ensure(Array.isArray(grepToolCalls) && grepToolCalls.some((entry) => entry?.toolName === 'grep'), 'Expected grep loop assistant message to persist native grep tool call');
    ensure(Array.isArray(grepToolResults) && grepToolResults.some((entry) => entry?.toolName === 'grep'), 'Expected grep loop assistant message to persist native grep tool result');
  });

  await runStep('chat.messages.write-overwrite-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 write 工具覆盖刚才读取的 smoke workspace 文件，并确认结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.writeOverwriteAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.writeOverwriteAssistantMessageId === 'string', 'Expected overwrite write loop to create assistant message');
    state.writeOverwriteAssistantText = assertCompletedSse(events, '已通过 write 工具覆盖 smoke workspace 已有文件。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'write'), 'Expected overwrite write loop SSE to include native write tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'write'), 'Expected overwrite write loop SSE to include native write tool result');
    ensure(finishEvent?.status === 'completed', 'Expected overwrite write loop SSE to finish');
  });

  await runStep('chat.messages.write-overwrite-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 write 工具覆盖刚才读取的 smoke workspace 文件'));
    ensure(firstRequest, 'Expected first overwrite write loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'write'), 'Expected overwrite write loop request to expose native write tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'write'));
    ensure(toolResultRequest, 'Expected overwrite write loop to issue a follow-up request with write tool results');
    ensure(requestContainsWriteResult(toolResultRequest.body, '/notes/runtime.txt'), 'Expected overwrite write loop follow-up request to include rendered write result');
    ensure(fs.readFileSync(path.join(readSessionWorkspaceRoot(), 'notes', 'runtime.txt'), 'utf8') === 'overwritten workspace\n', 'Expected overwrite write loop to replace existing file content');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const writeAssistant = conversation.messages.find((entry) => entry.id === state.writeOverwriteAssistantMessageId);
    const writeToolCalls = parseSerializedJsonValue(writeAssistant?.toolCalls);
    const writeToolResults = parseSerializedJsonValue(writeAssistant?.toolResults);
    ensure(writeAssistant?.content === state.writeOverwriteAssistantText, 'Expected overwrite write loop assistant message to persist generated content');
    ensure(Array.isArray(writeToolCalls) && writeToolCalls.some((entry) => entry?.toolName === 'write'), 'Expected overwrite write loop assistant message to persist native write tool call');
    ensure(Array.isArray(writeToolResults) && writeToolResults.some((entry) => entry?.toolName === 'write'), 'Expected overwrite write loop assistant message to persist native write tool result');
  });

  await runStep('chat.messages.write-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 write 工具在 smoke workspace 中创建一个 generated 文件，并确认结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.writeLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.writeLoopAssistantMessageId === 'string', 'Expected write loop to create assistant message');
    state.writeLoopAssistantText = assertCompletedSse(events, '已通过 write 工具写入 smoke workspace 文件。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'write'), 'Expected write loop SSE to include native write tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'write'), 'Expected write loop SSE to include native write tool result');
    ensure(finishEvent?.status === 'completed', 'Expected write loop SSE to finish');
  });

  await runStep('chat.messages.write-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 write 工具在 smoke workspace 中创建一个 generated 文件'));
    ensure(firstRequest, 'Expected first write loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'write'), 'Expected write loop request to expose native write tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'write'));
    ensure(toolResultRequest, 'Expected write loop to issue a follow-up request with write tool results');
    ensure(requestContainsWriteResult(toolResultRequest.body, '/generated/output.txt'), 'Expected write loop follow-up request to include rendered write result');
    ensure(fs.existsSync(path.join(readSessionWorkspaceRoot(), 'generated', 'output.txt')), 'Expected write loop to persist generated file in runtime workspace');
    ensure(fs.readFileSync(path.join(readSessionWorkspaceRoot(), 'generated', 'output.txt'), 'utf8') === 'generated file\n', 'Expected write loop to persist generated file content');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const writeAssistant = conversation.messages.find((entry) => entry.id === state.writeLoopAssistantMessageId);
    const writeToolCalls = parseSerializedJsonValue(writeAssistant?.toolCalls);
    const writeToolResults = parseSerializedJsonValue(writeAssistant?.toolResults);
    ensure(writeAssistant?.content === state.writeLoopAssistantText, 'Expected write loop assistant message to persist generated content');
    ensure(Array.isArray(writeToolCalls) && writeToolCalls.some((entry) => entry?.toolName === 'write'), 'Expected write loop assistant message to persist native write tool call');
    ensure(Array.isArray(writeToolResults) && writeToolResults.some((entry) => entry?.toolName === 'write'), 'Expected write loop assistant message to persist native write tool result');
  });

  await runStep('chat.messages.edit-create-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 edit 工具在 smoke workspace 中直接创建一个 generated/create-via-edit.txt 文件，并确认结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.editCreateLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.editCreateLoopAssistantMessageId === 'string', 'Expected create-style edit loop to create assistant message');
    state.editCreateLoopAssistantText = assertCompletedSse(events, '已通过 edit 工具创建 smoke workspace 文件。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'edit'), 'Expected create-style edit loop SSE to include native edit tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'edit'), 'Expected create-style edit loop SSE to include native edit tool result');
    ensure(finishEvent?.status === 'completed', 'Expected create-style edit loop SSE to finish');
  });

  await runStep('chat.messages.edit-create-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 edit 工具在 smoke workspace 中直接创建一个 generated/create-via-edit.txt 文件'));
    ensure(firstRequest, 'Expected first create-style edit loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'edit'), 'Expected create-style edit loop request to expose native edit tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'edit'));
    ensure(toolResultRequest, 'Expected create-style edit loop to issue a follow-up request with edit tool results');
    ensure(requestContainsEditResult(toolResultRequest.body, '/generated/create-via-edit.txt'), 'Expected create-style edit loop follow-up request to include rendered edit result');
    ensure(
      readToolMessages(toolResultRequest.body).some((content) => content.includes('Strategy: empty-old-string')),
      'Expected create-style edit loop follow-up request to keep empty-old-string strategy visible',
    );
    ensure(
      fs.readFileSync(path.join(readSessionWorkspaceRoot(), 'generated', 'create-via-edit.txt'), 'utf8') === 'created via edit\n',
      'Expected create-style edit loop to persist created file content',
    );

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const editAssistant = conversation.messages.find((entry) => entry.id === state.editCreateLoopAssistantMessageId);
    const editToolCalls = parseSerializedJsonValue(editAssistant?.toolCalls);
    const editToolResults = parseSerializedJsonValue(editAssistant?.toolResults);
    ensure(editAssistant?.content === state.editCreateLoopAssistantText, 'Expected create-style edit loop assistant message to persist generated content');
    ensure(Array.isArray(editToolCalls) && editToolCalls.some((entry) => entry?.toolName === 'edit'), 'Expected create-style edit loop assistant message to persist native edit tool call');
    ensure(Array.isArray(editToolResults) && editToolResults.some((entry) => entry?.toolName === 'edit'), 'Expected create-style edit loop assistant message to persist native edit tool result');
  });

  await runStep('chat.messages.edit-loop', async () => {
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 edit 工具修改刚才生成的 generated 文件，并确认结果。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.editLoopAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.editLoopAssistantMessageId === 'string', 'Expected edit loop to create assistant message');
    state.editLoopAssistantText = assertCompletedSse(events, '已通过 edit 工具修改 smoke workspace 文件。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'edit'), 'Expected edit loop SSE to include native edit tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'edit'), 'Expected edit loop SSE to include native edit tool result');
    ensure(finishEvent?.status === 'completed', 'Expected edit loop SSE to finish');
  });

  await runStep('chat.messages.edit-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 edit 工具修改刚才生成的 generated 文件'));
    ensure(firstRequest, 'Expected first edit loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'edit'), 'Expected edit loop request to expose native edit tool');
    const toolResultRequest = requests.find((entry) => requestContainsToolResult(entry.body, 'edit'));
    ensure(toolResultRequest, 'Expected edit loop to issue a follow-up request with edit tool results');
    ensure(requestContainsEditResult(toolResultRequest.body, '/generated/output.txt'), 'Expected edit loop follow-up request to include rendered edit result');
    ensure(fs.readFileSync(path.join(readSessionWorkspaceRoot(), 'generated', 'output.txt'), 'utf8') === 'updated file\n', 'Expected edit loop to persist updated file content');

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const editAssistant = conversation.messages.find((entry) => entry.id === state.editLoopAssistantMessageId);
    const editToolCalls = parseSerializedJsonValue(editAssistant?.toolCalls);
    const editToolResults = parseSerializedJsonValue(editAssistant?.toolResults);
    ensure(editAssistant?.content === state.editLoopAssistantText, 'Expected edit loop assistant message to persist generated content');
    ensure(Array.isArray(editToolCalls) && editToolCalls.some((entry) => entry?.toolName === 'edit'), 'Expected edit loop assistant message to persist native edit tool call');
    ensure(Array.isArray(editToolResults) && editToolResults.some((entry) => entry?.toolName === 'edit'), 'Expected edit loop assistant message to persist native edit tool result');
  });

  await runStep('chat.messages.edit-stale-loop', async () => {
    fs.writeFileSync(path.join(readSessionWorkspaceRoot(), 'generated', 'output.txt'), 'externally changed\n', 'utf8');
    input.fakeOpenAi.resetChatCompletions();
    const events = await postSse(apiBase, `/chat/conversations/${state.conversationId}/messages`, {
      body: {
        content: '请使用 edit 工具再次修改刚才生成的 generated 文件，并说明文件已在读取后变化，需要重新读取。',
        model: state.modelId,
        provider: state.providerId,
      },
      headers: userHeaders(),
    });
    const startEvent = events.find((entry) => entry.type === 'message-start');
    const finishEvent = events.find((entry) => entry.type === 'finish');
    state.staleEditAssistantMessageId = startEvent?.assistantMessage?.id ?? null;
    ensure(typeof state.staleEditAssistantMessageId === 'string', 'Expected stale edit loop to create assistant message');
    state.staleEditAssistantText = assertCompletedSse(events, '已确认文件在读取后发生变化，需要重新读取。');
    ensure(events.some((entry) => entry.type === 'tool-call' && entry.toolName === 'edit'), 'Expected stale edit loop SSE to include native edit tool call');
    ensure(events.some((entry) => entry.type === 'tool-result' && entry.toolName === 'edit'), 'Expected stale edit loop SSE to include native edit tool result');
    ensure(finishEvent?.status === 'completed', 'Expected stale edit loop SSE to finish');
  });

  await runStep('chat.messages.edit-stale-loop.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions();
    const firstRequest = requests.find((entry) =>
      requestHasToolList(entry.body)
      && readLatestUserText(entry.body?.messages).includes('请使用 edit 工具再次修改刚才生成的 generated 文件'));
    ensure(firstRequest, 'Expected first stale edit loop request to reach fake OpenAI');
    ensure(requestIncludesToolName(firstRequest.body, 'edit'), 'Expected stale edit loop request to expose native edit tool');
    const toolResultRequest = requests.find((entry) =>
      requestContainsInvalidToolResult(entry.body, 'edit', '文件在上次读取后已被修改'));
    ensure(toolResultRequest, 'Expected stale edit loop to issue a follow-up request with invalid edit tool result');
    ensure(
      fs.readFileSync(path.join(readSessionWorkspaceRoot(), 'generated', 'output.txt'), 'utf8') === 'externally changed\n',
      'Expected stale edit loop to keep externally changed file content untouched',
    );

    const conversation = await getJson(apiBase, `/chat/conversations/${state.conversationId}`, { headers: userHeaders() });
    const editAssistant = conversation.messages.find((entry) => entry.id === state.staleEditAssistantMessageId);
    const editToolCalls = parseSerializedJsonValue(editAssistant?.toolCalls);
    const editToolResults = parseSerializedJsonValue(editAssistant?.toolResults);
    ensure(editAssistant?.content === state.staleEditAssistantText, 'Expected stale edit loop assistant message to persist generated content');
    ensure(Array.isArray(editToolCalls) && editToolCalls.some((entry) => entry?.toolName === 'edit'), 'Expected stale edit loop assistant message to persist native edit tool call');
    ensure(Array.isArray(editToolResults) && editToolResults.some((entry) => entry?.toolName === 'edit'), 'Expected stale edit loop assistant message to persist native edit tool result');
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
    ensure(Array.isArray(plugins), 'Expected plugin list payload');
    const projectPlugin = plugins.find((entry) => entry.id === 'project.smoke-local-echo');
    ensure(projectPlugin, 'Expected project local plugin from config/plugins to appear in plugin list');
    ensure(projectPlugin.runtimeKind === 'local', 'Expected project local plugin to register as local runtime');
    ensure(Array.isArray(projectPlugin.supportedActions) && projectPlugin.supportedActions.includes('reload'), 'Expected project local plugin to expose reload governance action');
  });

  await runStep('plugins.connected', async () => {
    const plugins = await getJson(apiBase, '/plugins/connected');
    ensure(Array.isArray(plugins), 'Expected connected plugin list payload');
  });

  await runStep('plugins.project-local.health', async () => {
    const health = await getJson(apiBase, '/plugins/project.smoke-local-echo/health');
    ensure(typeof health === 'object' && health !== null, 'Expected project local plugin health payload');
  });

  await runStep('plugins.project-local.reload', async () => {
    const result = await postJson(apiBase, '/plugins/project.smoke-local-echo/actions/reload');
    ensure(result.accepted === true, 'Expected project local plugin reload action to succeed');
    const plugins = await getJson(apiBase, '/plugins');
    ensure(plugins.some((entry) => entry.id === 'project.smoke-local-echo'), 'Expected project local plugin to remain registered after reload');
  });

  await runStep('ai.context-governance.get', async () => {
    const config = await getJson(apiBase, '/ai/context-governance-config');
    ensure(typeof config === 'object' && config !== null, 'Expected context governance config snapshot');
  });

  await runStep('ai.context-governance.put', async () => {
    const config = await putJson(apiBase, '/ai/context-governance-config', {
      body: {
        values: {
          contextCompaction: {
            keepRecentMessages: 5,
            strategy: 'sliding',
          },
          conversationTitle: {
            enabled: true,
            maxMessages: 3,
          },
        },
      },
    });
    ensure(!('memoryContext' in config.values), 'Expected context governance config to exclude memory settings');
    ensure(config.values.contextCompaction.strategy === 'sliding', 'Expected context governance compaction strategy to persist');
  });

  await runStep('commands.overview+version', async () => {
    const [overview, version] = await Promise.all([
      getJson(apiBase, '/command-catalog/overview'),
      getJson(apiBase, '/command-catalog/version'),
    ]);
    ensure(Array.isArray(overview.commands), 'Expected command overview payload');
    ensure(overview.commands.some((entry) => entry.commandId === 'internal.context-governance:/compact:command'), 'Expected internal context governance command');
    ensure(typeof overview.version === 'string' && overview.version.length > 0, 'Expected command overview version');
    ensure(typeof version.version === 'string' && version.version.length > 0, 'Expected command catalog version payload');
  });

  await runContextCompactionModelSmoke(apiBase, state, {
    assistantMessageStateKey: 'compactModelAssistantMessageId',
    beforeCommand: () => input.fakeOpenAi.resetChatCompletions(),
    commandStepName: 'chat.messages.command.compact-with-summary',
    configStepName: 'ai.context-governance.put.summary',
    expectedSummaryText: 'Smoke 压缩摘要。',
    headers: userHeaders,
    isolateConversation: true,
    responseTextStateKey: 'compactModelAssistantText',
    userMessageStateKey: 'compactModelUserMessageId',
    verifyModelRequest: async () => {
      const requests = input.fakeOpenAi.readChatCompletions();
      const summaryRequest = requests.find((entry) => containsText(entry.body?.messages ?? [], '历史对话：'));
      ensure(summaryRequest, 'Expected summary compaction to issue one model request');
    },
    verifyModelRequestStepName: 'chat.messages.command.compact-with-summary.verify-model',
    verifySummaryStepName: 'chat.conversation.get.after-command.compact-with-summary',
  });

  await runStep('plugins.subagent-overview', async () => {
    const overview = await getJson(apiBase, '/subagents/overview');
    ensure(Array.isArray(overview.subagents), 'Expected subagent overview payload');
  });

  await runStep('chat.conversation-subagents', async () => {
    const subagents = await getJson(apiBase, `/chat/conversations/${state.conversationId}/subagents`, { headers: userHeaders() });
    ensure(Array.isArray(subagents), 'Expected conversation subagents list');
  });

  await runStep('plugins.subagents.types', async () => {
    const subagentTypes = await getJson(apiBase, '/subagents/types');
    ensure(Array.isArray(subagentTypes), 'Expected subagent type list payload');
    ensure(subagentTypes.some((entry) => entry.id === 'general'), 'Expected general subagent type');
    ensure(subagentTypes.some((entry) => entry.id === 'explore'), 'Expected explore subagent type');
    ensure(subagentTypes.some((entry) => entry.id === 'review'), 'Expected user-defined review subagent type');
  });

  await runStep('plugins.subagent-detail.missing', async () => {
    await getJson(apiBase, '/subagents/subagent-session-missing', {
      expectedStatus: 404,
    });
  });

  await runStep('plugins.routes.missing', async () => {
    await requestJson(apiBase, '/plugin-routes/plugin-missing/inspect/context', {
      expectedStatus: 404,
      headers: userHeaders(),
      method: 'GET',
    });
  });

  await runStep('plugins.remote.access', async () => {
    const plugin = await putJson(apiBase, `/plugins/${state.remotePluginId}/remote-access`, {
      body: {
        access: {
          accessKey: 'smoke-remote-access-key',
          serverUrl: input.remotePluginServerUrl,
        },
        displayName: 'Smoke IoT Light',
        remote: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'actuate',
          remoteEnvironment: 'iot',
        },
        version: '1.0.0',
      },
    });
    ensure(plugin.id === state.remotePluginId, 'Expected remote plugin slot to be upserted');
  });

  await runStep('plugins.remote.connection', async () => {
    const remoteConnection = await getJson(apiBase, `/plugins/${state.remotePluginId}/remote-connection`);
    state.remoteConnection = remoteConnection;
    ensure(remoteConnection.pluginName === state.remotePluginId, 'Expected remote connection payload');
    ensure(remoteConnection.accessKey === 'smoke-remote-access-key', 'Expected remote connection to expose persisted access key');
  });

  await runStep('plugins.remote.health.offline', async () => {
    const health = await getJson(apiBase, `/plugins/${state.remotePluginId}/health`);
    ensure(health?.status === 'offline', 'Expected unconnected remote plugin health to be offline');
  });

  await runStep('plugins.remote.connect', async () => {
    state.remotePluginHandle = await startRemoteRoutePlugin(input.remotePluginScriptPath, state.remoteConnection);
    await waitForPluginHealth(apiBase, state.remotePluginId, true);
  });

  await runStep('plugins.remote.health.online', async () => {
    const health = await getJson(apiBase, `/plugins/${state.remotePluginId}/health`);
    ensure(health?.status === 'healthy', 'Expected connected remote plugin health to be healthy');
  });

  await runStep('plugins.config.get', async () => {
    const config = await getJson(apiBase, `/plugins/${state.remotePluginId}/config`);
    ensure(typeof config === 'object' && config !== null, 'Expected plugin config snapshot payload');
  });

  await runStep('plugins.config.put.rejected-without-schema', async () => {
    const result = await putJson(apiBase, `/plugins/${state.remotePluginId}/config`, {
      body: {
        values: {
          mode: 'smoke',
        },
      },
      expectedStatus: 400,
    });
    ensure(String(result?.message ?? '').includes('未声明配置 schema'), 'Expected plugin config update without schema to be rejected');
  });

  await runStep('plugins.llm-preference.get', async () => {
    const preference = await getJson(apiBase, `/plugins/${state.remotePluginId}/llm-preference`);
    ensure(preference.mode === 'inherit', 'Expected plugin llm preference to default to inherit');
  });

  await runStep('plugins.llm-preference.put', async () => {
    const preference = await putJson(apiBase, `/plugins/${state.remotePluginId}/llm-preference`, {
      body: {
        mode: 'override',
        modelId: state.modelId,
        providerId: state.providerId,
      },
    });
    ensure(preference.mode === 'override', 'Expected plugin llm preference override to persist');
    ensure(preference.modelId === state.modelId, 'Expected plugin llm preference model to persist');
    ensure(preference.providerId === state.providerId, 'Expected plugin llm preference provider to persist');
  });

  await runStep('plugins.scopes.get', async () => {
    const scope = await getJson(apiBase, `/plugins/${state.remotePluginId}/scopes`);
    ensure(typeof scope.defaultEnabled === 'boolean', 'Expected plugin scope payload');
  });

  await runStep('plugins.scopes.put', async () => {
    const scope = await putJson(apiBase, `/plugins/${state.remotePluginId}/scopes`, {
      body: {
        conversations: {
          [state.conversationId]: true,
        },
        defaultEnabled: true,
      },
    });
    ensure(scope.defaultEnabled === true, 'Expected plugin default scope to remain enabled');
    ensure(scope.conversations?.[state.conversationId] === true, 'Expected plugin conversation scope update to persist');
  });

  await runStep('plugins.event-log.get', async () => {
    const settings = await getJson(apiBase, `/plugins/${state.remotePluginId}/event-log`);
    ensure(typeof settings.maxFileSizeMb === 'number', 'Expected plugin event log settings payload');
  });

  await runStep('plugins.event-log.put', async () => {
    const settings = await putJson(apiBase, `/plugins/${state.remotePluginId}/event-log`, {
      body: {
        maxFileSizeMb: 2,
      },
    });
    ensure(settings.maxFileSizeMb === 2, 'Expected plugin event log settings update to persist');
  });

  await runStep('plugins.events.get', async () => {
    const events = await getJson(apiBase, `/plugins/${state.remotePluginId}/events?limit=20`);
    ensure(Array.isArray(events.items), 'Expected plugin events list payload');
    ensure(events.items.length > 0, 'Expected plugin events list to contain governance records');
  });

  await runStep('plugins.storage.list.initial', async () => {
    const entries = await getJson(apiBase, `/plugins/${state.remotePluginId}/storage`);
    ensure(Array.isArray(entries), 'Expected plugin storage list payload');
  });

  await runStep('plugins.storage.put', async () => {
    const entry = await putJson(apiBase, `/plugins/${state.remotePluginId}/storage`, {
      body: {
        key: 'smoke/runtime',
        value: {
          enabled: true,
          source: 'http-smoke',
        },
      },
    });
    ensure(entry.key === 'smoke/runtime', 'Expected plugin storage key to persist');
    ensure(entry.value?.enabled === true, 'Expected plugin storage value to persist');
  });

  await runStep('plugins.storage.list.after-put', async () => {
    const entries = await getJson(apiBase, `/plugins/${state.remotePluginId}/storage?prefix=smoke/`);
    ensure(entries.some((entry) => entry.key === 'smoke/runtime'), 'Expected plugin storage list to include stored key');
  });

  await runStep('plugins.storage.delete', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/${state.remotePluginId}/storage?key=${encodeURIComponent('smoke/runtime')}`);
    ensure(deleted === true, 'Expected plugin storage deletion to succeed');
  });

  await runStep('plugins.storage.list.after-delete', async () => {
    const entries = await getJson(apiBase, `/plugins/${state.remotePluginId}/storage?prefix=smoke/`);
    ensure(!entries.some((entry) => entry.key === 'smoke/runtime'), 'Expected plugin storage list to exclude deleted key');
  });

  await runStep('plugins.remote.metadata.cached.initial', async () => {
    const plugins = await getJson(apiBase, '/plugins');
    const plugin = plugins.find((entry) => entry.name === state.remotePluginId);
    ensure(plugin?.remote?.metadataCache?.status === 'cached', 'Expected remote plugin metadata cache to be cached after first registration');
    ensure(typeof plugin.remote.metadataCache.lastSyncedAt === 'string', 'Expected remote plugin metadata cache lastSyncedAt');
    ensure(typeof plugin.remote.metadataCache.manifestHash === 'string', 'Expected remote plugin metadata cache manifestHash');
    state.remotePluginInitialSyncedAt = plugin.remote.metadataCache.lastSyncedAt;
    state.remotePluginInitialManifestHash = plugin.remote.metadataCache.manifestHash;
  });

  await runStep('plugins.remote.automation.create', async () => {
    const automation = await postJson(apiBase, '/automations', {
      body: {
        actions: [
          {
            capability: 'light.turnOn',
            params: {},
            plugin: state.remotePluginId,
            type: 'device_command',
          },
          {
            capability: 'light.getState',
            params: {},
            plugin: state.remotePluginId,
            type: 'device_command',
          },
          {
            capability: 'light.turnOff',
            params: {},
            plugin: state.remotePluginId,
            type: 'device_command',
          },
        ],
        name: 'Smoke Remote IoT Light Automation',
        trigger: {
          type: 'manual',
        },
      },
      headers: userHeaders(),
    });
    state.remotePluginAutomationId = automation.id;
    ensure(typeof state.remotePluginAutomationId === 'string', 'Expected remote plugin automation id');
  });

  await runStep('plugins.remote.tool.run', async () => {
    const result = await postJson(apiBase, `/automations/${state.remotePluginAutomationId}/run`, {
      headers: userHeaders(),
    });
    ensure(result.status === 'success', 'Expected remote IoT automation run to succeed');
    const turnOn = result.results.find((entry) => entry.plugin === state.remotePluginId && entry.capability === 'light.turnOn');
    const getState = result.results.find((entry) => entry.plugin === state.remotePluginId && entry.capability === 'light.getState');
    const turnOff = result.results.find((entry) => entry.plugin === state.remotePluginId && entry.capability === 'light.turnOff');
    ensure(turnOn?.result?.isOn === true, 'Expected remote IoT light.turnOn result');
    ensure(getState?.result?.isOn === true, 'Expected remote IoT light.getState to observe on state');
    ensure(turnOff?.result?.isOn === false, 'Expected remote IoT light.turnOff result');
  });

  await runStep('plugins.remote.automation.delete', async () => {
    const deleted = await deleteJson(apiBase, `/automations/${state.remotePluginAutomationId}`, { headers: userHeaders() });
    ensure(deleted.count === 1, 'Expected remote IoT automation deletion count');
    state.remotePluginAutomationId = null;
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

  input.fakeOpenAi.resetChatCompletions();
  await runStep('plugins.host.llm.generate-text', async () => {
    const result = await postJson(apiBase, `/plugin-routes/${state.remotePluginId}/host/ops`, {
      body: {
        action: 'generate-text',
        modelId: state.modelId,
        prompt: '请用一句话说明 smoke host llm.generate-text 已执行。',
        providerId: state.providerId,
      },
      headers: userHeaders(),
    });
    ensure(result.result?.providerId === state.providerId, 'Expected plugin host llm.generate-text to keep selected provider');
    ensure(result.result?.modelId === state.modelId, 'Expected plugin host llm.generate-text to keep selected model');
    ensure(result.result?.text === '本地 smoke 回复: 请用一句话说明 smoke host llm.generate-text 已执行。', 'Expected plugin host llm.generate-text result text');
  });

  await runStep('plugins.host.llm.generate', async () => {
    const result = await postJson(apiBase, `/plugin-routes/${state.remotePluginId}/host/ops`, {
      body: {
        action: 'generate-message',
        modelId: state.modelId,
        prompt: '请用一句话说明 smoke host llm.generate 已执行。',
        providerId: state.providerId,
      },
      headers: userHeaders(),
    });
    ensure(result.result?.providerId === state.providerId, 'Expected plugin host llm.generate to keep selected provider');
    ensure(result.result?.modelId === state.modelId, 'Expected plugin host llm.generate to keep selected model');
    ensure(result.result?.text === '本地 smoke 回复: 请用一句话说明 smoke host llm.generate 已执行。', 'Expected plugin host llm.generate result text');
    ensure(result.result?.message?.role === 'assistant', 'Expected plugin host llm.generate to return assistant message');
    ensure(result.result?.message?.content === '本地 smoke 回复: 请用一句话说明 smoke host llm.generate 已执行。', 'Expected plugin host llm.generate assistant content');
  });

  await runStep('plugins.host.llm.default-stream.verify', async () => {
    const requests = input.fakeOpenAi.readChatCompletions().filter((entry) => (
      JSON.stringify(entry.body ?? {}).includes('smoke host llm.generate')
    ));
    ensure(requests.length === 2, 'Expected two host llm smoke requests to reach fake OpenAI');
    ensure(requests.every((entry) => entry.body?.stream === true), 'Expected host llm smoke requests to use stream collect by default');
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

  await runStep('plugins.crons.list', async () => {
    const crons = await getJson(apiBase, `/plugins/${state.remotePluginId}/crons`);
    ensure(crons.some((entry) => entry.id === state.remotePluginCronId), 'Expected plugin cron list to include created cron');
  });

  await runStep('plugins.crons.delete.success', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/${state.remotePluginId}/crons/${state.remotePluginCronId}`);
    ensure(deleted === true, 'Expected deleting created plugin cron to succeed');
  });

  await runStep('plugins.crons.list.after-delete', async () => {
    const crons = await getJson(apiBase, `/plugins/${state.remotePluginId}/crons`);
    ensure(!crons.some((entry) => entry.id === state.remotePluginCronId), 'Expected plugin cron list to exclude deleted cron');
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

  await runStep('plugins.sessions.list.after-delete', async () => {
    const sessions = await getJson(apiBase, `/plugins/${state.remotePluginId}/sessions`);
    ensure(!sessions.some((entry) => entry.conversationId === state.conversationId), 'Expected plugin session list to exclude deleted session');
  });

  await runStep('plugins.remote.action.refresh-metadata', async () => {
    const result = await postJson(apiBase, `/plugins/${state.remotePluginId}/actions/refresh-metadata`);
    ensure(result.accepted === true, 'Expected remote plugin refresh-metadata action to be accepted');
  });

  await runStep('plugins.remote.health.disconnected', async () => {
    await waitForPluginHealth(apiBase, state.remotePluginId, false);
    const health = await getJson(apiBase, `/plugins/${state.remotePluginId}/health`);
    ensure(health?.status === 'offline', 'Expected refresh-metadata action to disconnect remote plugin before re-register');
  });

  await runStep('plugins.remote.stop-client', async () => {
    await state.remotePluginHandle?.stop?.();
    state.remotePluginHandle = null;
  });

  await runStep('plugins.remote.reconnect.after-refresh', async () => {
    state.remotePluginHandle = await startRemoteRoutePlugin(
      input.remotePluginScriptPath,
      state.remoteConnection,
      'refresh-v2',
    );
    await waitForPluginHealth(apiBase, state.remotePluginId, true);
  });

  await runStep('plugins.remote.metadata.cached.refreshed', async () => {
    const plugins = await getJson(apiBase, '/plugins');
    const plugin = plugins.find((entry) => entry.name === state.remotePluginId);
    ensure(plugin?.remote?.metadataCache?.status === 'cached', 'Expected remote plugin metadata cache to remain cached after refresh');
    ensure(typeof plugin.remote.metadataCache.lastSyncedAt === 'string', 'Expected refreshed metadata cache lastSyncedAt');
    ensure(typeof plugin.remote.metadataCache.manifestHash === 'string', 'Expected refreshed metadata cache manifestHash');
    ensure(plugin.remote.metadataCache.lastSyncedAt !== state.remotePluginInitialSyncedAt, 'Expected refresh-metadata to update lastSyncedAt');
    ensure(plugin.remote.metadataCache.manifestHash !== state.remotePluginInitialManifestHash, 'Expected refresh-metadata to update manifestHash');
  });

  await runStep('plugins.remote.stop-client.after-refresh', async () => {
    await state.remotePluginHandle?.stop?.();
    state.remotePluginHandle = null;
    await waitForPluginHealth(apiBase, state.remotePluginId, false);
  });

  await runStep('plugins.remote.delete', async () => {
    const deleted = await deleteJson(apiBase, `/plugins/${state.remotePluginId}`);
    ensure(deleted.pluginId === state.remotePluginId, 'Expected remote plugin deletion to succeed');
  });

  await runStep('plugins.list.after-remote-delete', async () => {
    const plugins = await getJson(apiBase, '/plugins');
    ensure(!plugins.some((entry) => entry.pluginId === state.remotePluginId), 'Expected plugin list to exclude deleted remote plugin');
  });

  await runStep('tools.overview', async () => {
    const overview = await getJson(apiBase, '/tools/overview');
    ensure(Array.isArray(overview.sources), 'Expected tool overview sources');
    const runtimeSource = overview.sources.find((entry) => entry.kind === 'internal' && entry.id === 'runtime-tools');
    const subagentSource = overview.sources.find((entry) => entry.kind === 'internal' && entry.id === 'subagent');
    const tool = overview.tools.find((entry) => entry.sourceKind === 'internal' && entry.sourceId === 'runtime-tools');
    ensure(runtimeSource, 'Expected internal runtime-tools source');
    ensure(subagentSource, 'Expected internal subagent source');
    ensure(tool, 'Expected at least one tool');
    state.toolSourceId = runtimeSource.id;
    state.toolId = tool.toolId;
  });

  await runStep('tools.source.enabled.false', async () => {
    const source = await putJson(apiBase, `/tools/sources/internal/${encodeURIComponent(state.toolSourceId)}/enabled`, {
      body: {
        enabled: false,
      },
    });
    ensure(source.enabled === false, 'Expected tool source to disable');
  });

  await runStep('tools.source.enabled.true', async () => {
    const source = await putJson(apiBase, `/tools/sources/internal/${encodeURIComponent(state.toolSourceId)}/enabled`, {
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

  await runStep('mcp.servers.events.get', async () => {
    const events = await getJson(apiBase, `/mcp/servers/${encodeURIComponent(state.mcpName)}/events?limit=20`);
    ensure(Array.isArray(events.items), 'Expected MCP events payload');
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
            capability: 'spawn_subagent',
            params: {
              description: '自动化烟测任务',
              prompt: '请输出 smoke automation task',
            },
            sourceId: 'subagent',
            sourceKind: 'internal',
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

  await runStep('automations.update', async () => {
    const automation = await putJson(apiBase, `/automations/${state.automationId}`, {
      body: {
        actions: [
          {
            message: '自动化烟测消息（已更新）',
            target: {
              id: state.conversationId,
              type: 'conversation',
            },
            type: 'ai_message',
          },
          {
            capability: 'spawn_subagent',
            params: {
              description: '自动化烟测任务（已更新）',
              prompt: '请输出 smoke automation task after update',
            },
            sourceId: 'subagent',
            sourceKind: 'internal',
            type: 'device_command',
          },
        ],
        name: 'Smoke Automation Updated',
        trigger: {
          type: 'manual',
        },
      },
      headers: userHeaders(),
    });
    ensure(automation.id === state.automationId, 'Expected automation update to keep the same id');
    ensure(automation.name === 'Smoke Automation Updated', 'Expected automation update to replace name');
    ensure(automation.actions[0]?.message === '自动化烟测消息（已更新）', 'Expected automation update to replace ai_message content');
  });

  await runStep('automations.list.after-update', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    const automation = automations.find((entry) => entry.id === state.automationId);
    ensure(automations.filter((entry) => entry.id === state.automationId).length === 1, 'Expected automation update not to create a duplicate record');
    ensure(automation?.name === 'Smoke Automation Updated', 'Expected automation list to reflect updated automation');
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
    const taskAction = result.results.find((entry) => entry.sourceKind === 'internal' && entry.sourceId === 'subagent');
    state.automationSubagentSessionId = taskAction?.result?.conversationId ?? null;
    ensure(typeof state.automationSubagentSessionId === 'string', 'Expected automation run to create subagent conversation');
    ensure(result.status === 'success', 'Expected automation run to succeed');
  });

  await runStep('automations.list.after-run', async () => {
    const automations = await getJson(apiBase, '/automations', { headers: userHeaders() });
    const automation = automations.find((entry) => entry.id === state.automationId);
    ensure(typeof automation?.lastRunAt === 'string', 'Expected automation list to reflect last run timestamp');
  });

  await runStep('plugins.subagent-overview.with-subagent', async () => {
    const overview = await getJson(apiBase, '/subagents/overview');
    const subagent = overview.subagents.find((entry) => entry.conversationId === state.automationSubagentSessionId);
    ensure(subagent, 'Expected subagent overview to include automation-created conversation projection');
    ensure(subagent.description === '自动化烟测任务（已更新）', 'Expected subagent overview to expose persisted subagent description');
    ensure(subagent.requestPreview === '请输出 smoke automation task after update', 'Expected subagent overview to keep prompt preview separate from description');
    ensure(typeof subagent.conversationId === 'string' && subagent.conversationId.length > 0, 'Expected subagent overview to expose conversation id');
    ensure(typeof subagent.messageCount === 'number' && subagent.messageCount >= 1, 'Expected subagent overview to expose message count');
  });

  await runStep('plugins.subagent-detail.success', async () => {
    const subagent = await waitForSubagentTaskCompletion(apiBase, state.automationSubagentSessionId);
    ensure(subagent.conversationId === state.automationSubagentSessionId, 'Expected subagent conversation detail to load');
    ensure(subagent.description === '自动化烟测任务（已更新）', 'Expected subagent detail to expose persisted description');
    ensure(subagent.pluginId === 'subagent', 'Expected subagent detail source id');
    ensure(subagent.requestPreview === '请输出 smoke automation task after update', 'Expected subagent detail to keep prompt preview separate from description');
    ensure(typeof subagent.conversationId === 'string' && subagent.conversationId.length > 0, 'Expected subagent detail to expose conversation id');
    ensure(typeof subagent.messageCount === 'number' && subagent.messageCount >= 2, 'Expected subagent detail to expose updated message count');
    ensure(subagent.status === 'completed', 'Expected subagent detail status to be completed');
    ensure(typeof subagent.result?.text === 'string' && subagent.result.text.length > 0, 'Expected subagent detail result text');
  });

  await runStep('plugins.subagent-delete.success', async () => {
    const closed = await postJson(apiBase, `/subagents/${state.automationSubagentSessionId}/close`);
    ensure(closed.conversationId === state.automationSubagentSessionId, 'Expected close_subagent route to return the same conversation id');
    ensure(closed.status === 'closed', 'Expected close_subagent route to mark the subagent closed');
    ensure(typeof closed.closedAt === 'string' && closed.closedAt.length > 0, 'Expected close_subagent route to expose closedAt');
  });

  await runStep('plugins.subagent-detail.after-delete', async () => {
    const subagent = await getJson(apiBase, `/subagents/${state.automationSubagentSessionId}`);
    ensure(subagent.status === 'closed', 'Expected closed subagent detail to remain queryable');
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

  await runStep('ai.model.list.after-delete', async () => {
    const models = await getJson(apiBase, `/ai/providers/${state.providerId}/models`);
    ensure(!models.some((entry) => entry.id === 'smoke-extra'), 'Expected model list to exclude deleted model');
  });

  await runSmokeConversationDelete(apiBase, state, {
    headers: userHeaders,
    stepName: 'chat.conversation.delete',
  });

  await runSmokeConversationDeleteVerification(apiBase, state, {
    detailStepName: 'chat.conversation.get.after-delete',
    headers: userHeaders,
    listStepName: 'chat.conversation.list.after-delete',
  });

  await runStep('chat.conversation.delete.workspace', async () => {
    ensure(fs.existsSync(readSessionWorkspaceRoot()) === false, 'Expected conversation deletion to remove runtime workspace');
  });

  await runSmokeProviderDelete(apiBase, state, {
    stepName: 'ai.provider.delete',
  });

  await runSmokeProviderDeleteVerification(apiBase, state, {
    detailStepName: 'ai.provider.get.after-delete',
    listStepName: 'ai.providers.list.after-delete',
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

async function prepareCustomSubagentType(subagentTypesRoot) {
  await fsPromises.mkdir(subagentTypesRoot, { recursive: true });
  const reviewRoot = path.join(subagentTypesRoot, 'review');
  await fsPromises.mkdir(reviewRoot, { recursive: true });
  await fsPromises.writeFile(path.join(reviewRoot, 'subagent.json'), JSON.stringify({
    id: 'review',
    name: '审阅',
    description: '聚焦审阅与风险检查的烟测子代理类型。',
    providerId: null,
    modelId: null,
    toolNames: ['webfetch'],
  }, null, 2), 'utf8');
  await fsPromises.writeFile(path.join(reviewRoot, 'prompt.md'), '你是一个审阅子代理。\n优先指出风险、缺口与可疑点。', 'utf8');
}

async function prepareProjectLocalPlugin(pluginRootPath) {
  await fsPromises.rm(pluginRootPath, { recursive: true, force: true });
  await fsPromises.mkdir(pluginRootPath, { recursive: true });
  await fsPromises.writeFile(path.join(pluginRootPath, 'package.json'), JSON.stringify({
    name: '@garlic-claw/smoke-local-echo',
    version: '1.0.0',
    private: true,
    main: 'index.js',
    garlicClaw: {
      runtime: 'local',
    },
  }, null, 2), 'utf8');
  await fsPromises.writeFile(path.join(pluginRootPath, 'index.js'), [
    'module.exports.definition = {',
    "  manifest: {",
    "    id: 'project.smoke-local-echo',",
    "    name: 'Project Smoke Local Echo',",
    "    version: '1.0.0',",
    "    runtime: 'local',",
    '    permissions: [],',
    '    tools: [{ name: "echo", description: "echo", parameters: {} }],',
    '  },',
    '  tools: {',
    '    echo: async (params) => ({ echoed: params?.text ?? null }),',
    '  },',
    '};',
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
    "const remoteConnection = JSON.parse(process.env.SMOKE_REMOTE_CONNECTION || '{}');",
    "const remoteVariant = process.env.SMOKE_REMOTE_VARIANT || 'base';",
    "const manifestVersion = remoteVariant === 'refresh-v2' ? '1.0.1' : '1.0.0';",
    "const manifestDescription = remoteVariant === 'refresh-v2'",
    "  ? 'Temporary remote IoT light plugin for HTTP smoke verification (refreshed manifest).'",
    "  : 'Temporary remote IoT light plugin for HTTP smoke verification.';",
    'const lightState = { isOn: false };',
    '',
    'const client = PluginClient.fromRemoteAccess(remoteConnection, {',
    '  autoReconnect: false,',
    '  manifest: {',
    "    name: 'Smoke IoT Light Plugin',",
    '    version: manifestVersion,',
    '    description: manifestDescription,',
    "    permissions: ['memory:write', 'cron:write', 'conversation:write', 'llm:generate'],",
    '    tools: [',
    '      {',
    "        name: 'light.getState',",
    "        description: 'Read the current IoT light state.',",
    '        parameters: {},',
    '      },',
    '      {',
    "        name: 'light.turnOn',",
    "        description: 'Turn on the IoT light.',",
    '        parameters: {},',
    '      },',
    '      {',
    "        name: 'light.turnOff',",
    "        description: 'Turn off the IoT light.',",
    '        parameters: {},',
    '      },',
    '    ],',
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
    "client.onCommand('light.getState', async () => ({ isOn: lightState.isOn }));",
    "client.onCommand('light.turnOn', async () => { lightState.isOn = true; return { isOn: true }; });",
    "client.onCommand('light.turnOff', async () => { lightState.isOn = false; return { isOn: false }; });",
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
    "  if (action === 'generate-text') {",
    '    const result = await context.host.generateText({',
    "      prompt: typeof request.body.prompt === 'string' ? request.body.prompt : '请说明 smoke host llm.generate-text 已执行。',",
    "      ...(typeof request.body.providerId === 'string' ? { providerId: request.body.providerId } : {}),",
    "      ...(typeof request.body.modelId === 'string' ? { modelId: request.body.modelId } : {}),",
    "      ...(typeof request.body.transportMode === 'string' ? { transportMode: request.body.transportMode } : {}),",
    '    });',
    '    return { status: 200, body: { result } };',
    '  }',
    "  if (action === 'generate-message') {",
    '    const result = await context.host.generate({',
    '      messages: [',
    '        {',
    "          role: 'user',",
    '          content: [',
    '            {',
    "              type: 'text',",
    "              text: typeof request.body.prompt === 'string' ? request.body.prompt : '请说明 smoke host llm.generate 已执行。',",
    '            },',
    '          ],',
    '        },',
    '      ],',
    "      ...(typeof request.body.providerId === 'string' ? { providerId: request.body.providerId } : {}),",
    "      ...(typeof request.body.modelId === 'string' ? { modelId: request.body.modelId } : {}),",
    "      ...(typeof request.body.transportMode === 'string' ? { transportMode: request.body.transportMode } : {}),",
    '    });',
    '    return { status: 200, body: { result } };',
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

async function prepareRealProviderSmokeSettings(aiSettingsPath, providerId) {
  const normalizedProviderId = normalizeOptionalText(providerId);
  ensure(normalizedProviderId, 'Expected real provider id');
  const sourceProviderPath = path.join(PROJECT_ROOT, 'config', 'ai', 'providers', `${encodeURIComponent(normalizedProviderId)}.json`);
  ensure(fs.existsSync(sourceProviderPath), `Real smoke provider config not found: ${sourceProviderPath}`);
  const targetProviderDirectory = path.join(aiSettingsPath, 'providers');
  await fsPromises.mkdir(targetProviderDirectory, { recursive: true });
  await fsPromises.copyFile(sourceProviderPath, path.join(targetProviderDirectory, `${encodeURIComponent(normalizedProviderId)}.json`));
  await writeRealSmokeJsonDefaults(aiSettingsPath);
}

async function writeRealSmokeJsonDefaults(aiSettingsPath) {
  await fsPromises.mkdir(aiSettingsPath, { recursive: true });
  await fsPromises.writeFile(
    path.join(aiSettingsPath, 'settings.json'),
    JSON.stringify({
      hostModelRouting: { fallbackChatModels: [], utilityModelRoles: {} },
      visionFallback: { enabled: false },
    }, null, 2),
    'utf8',
  );
}

async function runTypescriptBuild() {
  await runCommand(process.execPath, [
    resolveTscCliEntry(),
    '-p', 'tsconfig.build.json',
    '--incremental',
    '--tsBuildInfoFile', path.join(SERVER_DIR, 'dist', 'tsconfig.build.tsbuildinfo-smoke'),
  ], {
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

async function startBackend(port, wsPort, files, options = {}) {
  const logs = [];
  const child = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      GARLIC_CLAW_AI_SETTINGS_PATH: files.aiSettingsPath,
      GARLIC_CLAW_SETTINGS_CONFIG_PATH: files.settingsConfigPath,
      GARLIC_CLAW_LOGIN_SECRET: LOGIN_SECRET,
      GARLIC_CLAW_AUTOMATIONS_PATH: files.automationsPath,
      GARLIC_CLAW_CONVERSATIONS_PATH: files.conversationsPath,
      GARLIC_CLAW_MCP_CONFIG_PATH: files.mcpConfigPath,
      GARLIC_CLAW_PERSONAS_PATH: files.personasPath,
      GARLIC_CLAW_PLUGIN_STATE_PATH: files.pluginStatePath,
      GARLIC_CLAW_RUNTIME_APPROVAL_MODE: options.runtimeApprovalMode ?? 'review',
      GARLIC_CLAW_RUNTIME_WORKSPACES_PATH: files.runtimeWorkspacesPath,
      GARLIC_CLAW_SKILL_GOVERNANCE_PATH: files.skillGovernancePath,
      GARLIC_CLAW_SUBAGENT_PATH: files.subagentPath,
      GARLIC_CLAW_SUBAGENTS_PATH: files.subagentsPath,
      HOME: files.userHomePath,
      USERPROFILE: files.userHomePath,
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

    await delay(100);
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
    artifactMode: normalizeSmokeArtifactMode(process.env.GARLIC_CLAW_SMOKE_ARTIFACT_MODE),
    profile: normalizeSmokeProfile(process.env.GARLIC_CLAW_SMOKE_PROFILE),
    proxyOrigin: null,
    realModelId: normalizeOptionalText(process.env.GARLIC_CLAW_SMOKE_REAL_MODEL_ID),
    realProviderId: normalizeOptionalText(process.env.GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID),
    runtimeApprovalMode: normalizeRuntimeApprovalMode(process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--proxy-origin') {
      config.proxyOrigin = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--profile') {
      config.profile = normalizeSmokeProfile(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--artifact-mode') {
      config.artifactMode = normalizeSmokeArtifactMode(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--runtime-approval-mode') {
      config.runtimeApprovalMode = normalizeRuntimeApprovalMode(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--real-provider-id') {
      config.realProviderId = normalizeOptionalText(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--real-model-id') {
      config.realModelId = normalizeOptionalText(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--real-provider-env') {
      config.realProviderId = normalizeOptionalText(process.env.GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID);
      config.realModelId = normalizeOptionalText(process.env.GARLIC_CLAW_SMOKE_REAL_MODEL_ID);
    }
  }

  if (args.includes('--real-provider-env')) {
    ensure(config.realProviderId, 'GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID is required for real provider smoke');
  }

  return config;
}

function normalizeSmokeProfile(value) {
  const normalizedValue = (value ?? 'full').trim().toLowerCase();
  if (normalizedValue === 'core' || normalizedValue === 'full') {
    return normalizedValue;
  }
  throw new Error('smoke profile must be core or full');
}

function normalizeSmokeArtifactMode(value) {
  const normalizedValue = (value ?? 'on-failure').trim().toLowerCase();
  if (normalizedValue === 'always' || normalizedValue === 'on-failure' || normalizedValue === 'never') {
    return normalizedValue;
  }
  throw new Error('smoke artifact mode must be always, on-failure, or never');
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

function normalizeRuntimeApprovalMode(value) {
  const normalizedValue = (value ?? 'review').trim().toLowerCase();
  if (normalizedValue === 'review' || normalizedValue === 'yolo') {
    return normalizedValue;
  }
  throw new Error('runtime approval mode must be review or yolo');
}

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, '');
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

    await delay(100);
  }

  throw new Error('Timed out waiting for bootstrap admin login');
}

async function waitForPluginHealth(apiBase, pluginId, expectedOk) {
  try {
    const health = await getJson(apiBase, `/plugins/${pluginId}/health`);
    if (readPluginHealthOk(health) === expectedOk) {
      return health;
    }
  } catch {
    // fall through to polling loop
  }

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

    await delay(100);
  }

  throw new Error(`Timed out waiting for plugin ${pluginId} health=${expectedOk}`);
}

function readPluginHealthOk(health) {
  return health?.status === 'healthy';
}

async function waitForSubagentTaskCompletion(apiBase, conversationId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DEFAULT_TIMEOUT_MS) {
    const subagent = await getJson(apiBase, `/subagents/${conversationId}`);
    if (subagent?.status === 'completed') {
      return subagent;
    }
    if (subagent?.status === 'error') {
      throw new Error(`Subagent conversation ${conversationId} failed: ${subagent.error ?? 'unknown error'}`);
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for subagent conversation ${conversationId} to complete`);
}

async function startRemoteRoutePlugin(scriptPath, remoteConnection, variant = 'base') {
  const logs = [];
  const child = spawn(process.execPath, [scriptPath], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      SMOKE_REMOTE_CONNECTION: JSON.stringify(remoteConnection),
      SMOKE_REMOTE_VARIANT: variant,
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

  if (typeof options.onEvent === 'function' && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const parsedEvents = parseSseChunk(chunk);
        for (const event of parsedEvents) {
          if (event.type === 'error') {
            throw new Error(`SSE error from ${routePath}: ${formatPayload(event)}`);
          }
          events.push(event);
          await options.onEvent(event);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsedEvents = parseSseChunk(buffer);
      for (const event of parsedEvents) {
        if (event.type === 'error') {
          throw new Error(`SSE error from ${routePath}: ${formatPayload(event)}`);
        }
        events.push(event);
        await options.onEvent(event);
      }
    }

    return events;
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
    .flatMap((chunk) => parseSseChunk(chunk));
}

function parseSseChunk(chunk) {
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
}

function parseSerializedJsonValue(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findContextCompactionSummaryMessage(messages) {
  return Array.isArray(messages) ? messages.find((message) => {
    const metadata = parseSerializedJsonValue(message?.metadataJson);
    return Array.isArray(metadata?.annotations) && metadata.annotations.some((annotation) =>
      annotation?.owner === 'conversation.context-governance'
      && annotation?.type === 'context-compaction'
      && annotation?.data?.role === 'summary');
  }) : null;
}

let completedStepCount = 0;

async function runStep(name, task) {
  currentStepName = name;
  console.log(`-> ${name}`);
  const result = await task();
  completedStepCount += 1;
  return result;
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
  const serializedEvents = JSON.stringify(events);
  ensure(startIndex >= 0, 'Expected SSE message-start event');
  ensure(finishIndex > startIndex, 'Expected SSE finish after message-start');
  ensure(doneIndex > finishIndex, 'Expected SSE [DONE] after finish');
  ensure(deltas.length > 0, `Expected SSE text-delta content, events=${serializedEvents}`);
  if (typeof expectedText === 'string') {
    ensure(deltas === expectedText, `Expected SSE text to equal "${expectedText}", events=${serializedEvents}`);
  }
  return deltas;
}

function assertAutoCompactionSse(events) {
  const serializedEvents = JSON.stringify(events);
  const messageStartCount = events.filter((entry) => entry.type === 'message-start').length;
  const finishCount = events.filter((entry) => entry.type === 'finish').length;
  const doneIndex = events.findIndex((entry) => entry.type === 'done');
  const turns = readCompletedSseAssistantTurns(events);
  ensure(messageStartCount === 2, `Expected auto compaction SSE to include exactly two assistant starts, events=${serializedEvents}`);
  ensure(finishCount === 2, `Expected auto compaction SSE to include exactly two assistant finishes, events=${serializedEvents}`);
  ensure(turns.length === 2, `Expected auto compaction SSE to include exactly two completed assistant turns, events=${serializedEvents}`);
  ensure(doneIndex > turns[1].finishIndex, `Expected SSE [DONE] after continuation finish, events=${serializedEvents}`);
  ensure(turns[0].text === AUTO_COMPACTION_MAIN_TEXT, `Expected first auto compaction assistant text to equal main summary, events=${serializedEvents}`);
  ensure(turns[1].text === AUTO_COMPACTION_CONTINUATION_TEXT, `Expected continuation assistant text to equal auto-continue reply, events=${serializedEvents}`);
  ensure(
    typeof turns[1].userText === 'string' && turns[1].userText.includes('Continue if you have next steps'),
    `Expected continuation turn to be triggered by synthetic continue user message, events=${serializedEvents}`,
  );
}

function readCompletedSseAssistantTurns(events) {
  const turns = [];
  const turnByMessageId = new Map();
  for (const [index, entry] of events.entries()) {
    if (entry.type === 'message-start' && typeof entry?.assistantMessage?.id === 'string') {
      const turn = {
        finishIndex: -1,
        messageId: entry.assistantMessage.id,
        startIndex: index,
        text: '',
        userText: typeof entry?.userMessage?.content === 'string' ? entry.userMessage.content : '',
      };
      turns.push(turn);
      turnByMessageId.set(turn.messageId, turn);
      continue;
    }
    if (entry.type === 'text-delta' && typeof entry?.messageId === 'string') {
      const turn = turnByMessageId.get(entry.messageId);
      if (turn) {
        turn.text += entry.text ?? '';
      }
      continue;
    }
    if (entry.type === 'finish' && typeof entry?.messageId === 'string') {
      const turn = turnByMessageId.get(entry.messageId);
      if (turn) {
        turn.finishIndex = index;
      }
    }
  }
  return turns.filter((turn) => turn.finishIndex > turn.startIndex);
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

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack ?? null,
    };
  }
  return {
    message: String(error),
    name: 'NonError',
    stack: null,
  };
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function startFakeOpenAiServer() {
  const chatCompletions = [];
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

      if (request.method === 'GET' && requestUrl.pathname === '/mock-webfetch/article') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<html><head><title>Smoke Article</title></head><body><h1>Smoke Article</h1><p>webfetch smoke body</p></body></html>');
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/mock-bash-timeout') {
        await delay(1_000);
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('slow-bash-ok');
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/v1/chat/completions') {
        const body = await readJsonBody(request);
        chatCompletions.push({
          body: structuredClone(body),
          receivedAt: new Date().toISOString(),
        });
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
    readChatCompletions() {
      return chatCompletions.map((entry) => structuredClone(entry));
    },
    resetChatCompletions() {
      chatCompletions.length = 0;
    },
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
  const plannedResponse = planSmokeChatResponse(body);
  const model = body.model ?? 'smoke-model';
  if (plannedResponse.kind === 'tool-call') {
    const usage = plannedResponse.usage ?? {
      completion_tokens: 8,
      prompt_tokens: 12,
      total_tokens: 20,
    };
    return {
      choices: [
        {
          finish_reason: 'tool_calls',
          index: 0,
          message: {
            content: '',
            role: 'assistant',
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify(plannedResponse.arguments),
                  name: plannedResponse.toolName,
                },
                id: plannedResponse.toolCallId,
                type: 'function',
              },
            ],
          },
        },
      ],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-smoke',
      model,
      object: 'chat.completion',
      usage,
    };
  }
  const text = plannedResponse.text;
  const usage = plannedResponse.usage ?? {
    completion_tokens: Math.max(1, text.length),
    prompt_tokens: 12,
    total_tokens: 12 + Math.max(1, text.length),
  };
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
    usage,
  };
}

async function writeStreamResponse(request, response, body) {
  response.writeHead(200, {
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'content-type': 'text/event-stream',
  });

  const model = body.model ?? 'smoke-model';
  const plannedResponse = planSmokeChatResponse(body);
  if (plannedResponse.kind === 'tool-call') {
    const usage = plannedResponse.usage ?? {
      completion_tokens: 8,
      prompt_tokens: 12,
      total_tokens: 20,
    };
    writeSse(response, {
      choices: [
        {
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify(plannedResponse.arguments),
                  name: plannedResponse.toolName,
                },
                id: plannedResponse.toolCallId,
                index: 0,
                type: 'function',
              },
            ],
          },
          finish_reason: null,
          index: 0,
        },
      ],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-smoke',
      model,
    });
    await delay(0);
    if (request.aborted || response.destroyed || response.writableEnded) {
      return;
    }
    writeSse(response, {
      choices: [
        {
          delta: {},
          finish_reason: 'tool_calls',
          index: 0,
        },
      ],
      created: Math.floor(Date.now() / 1000),
      id: 'chatcmpl-smoke',
      model,
      usage,
    });
    response.write('data: [DONE]\n\n');
    response.end();
    return;
  }
  const text = plannedResponse.text;
  const usage = plannedResponse.usage ?? {
    completion_tokens: Math.max(1, text.length),
    prompt_tokens: 12,
    total_tokens: 12 + Math.max(1, text.length),
  };
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
    await delay(0);
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
    usage,
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
  if (containsText(messages, '历史对话：')) {
    return 'Smoke 压缩摘要。';
  }
  if (latestUserMessageContainsImage(messages)) {
    return '这是一张用于后端烟测的图片。';
  }

  const latestUserText = findLatestUserText(messages);
  if (latestUserText.includes('请围绕“子代理长程压缩 smoke”写一段较长总结')) {
    return AUTO_COMPACTION_SUBAGENT_TEXT;
  }
  if (latestUserText.includes('请总结 smoke-http-flow 技能的用途')) {
    return 'Smoke HTTP Flow 用于后端烟测。';
  }
  if (latestUserText.includes('更新后')) {
    return '这是重试后的烟测回复。';
  }
  return latestUserText ? `本地 smoke 回复: ${latestUserText}` : '本地 smoke 回复。';
}

function planSmokeChatResponse(body) {
  if (shouldTriggerSkillTool(body)) {
    return {
      arguments: {
        name: 'smoke-http-flow',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_skill_0',
      toolName: 'skill',
    };
  }
  if (shouldTriggerSpawnSubagentTool(body)) {
    return {
      arguments: {
        description: isAutoCompactionSubagentPrompt(body) ? '子代理长程压缩 smoke' : '探索 smoke 技能',
        ...(isAutoCompactionSubagentPrompt(body)
          ? {
              modelId: 'smoke-auto-compaction',
              prompt: '请围绕“子代理长程压缩 smoke”写一段较长总结，方便随后验证自动压缩是否会立刻发生。',
              providerId: 'smoke-openai',
              subagentType: 'general',
            }
          : {
              prompt: '请总结 smoke-http-flow 技能的用途',
              subagentType: 'review',
            }),
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_subagent_0',
      toolName: 'spawn_subagent',
    };
  }
  if (shouldTriggerWaitSubagentTool(body)) {
    return {
      arguments: {
        conversationId: readLatestSubagentConversationId(body),
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_subagent_wait_0',
      toolName: 'wait_subagent',
    };
  }
  if (shouldTriggerTodoTool(body)) {
    return {
      arguments: {
        todos: [
          {
            content: '复核 todo 工具描述',
            priority: 'high',
            status: 'completed',
          },
          {
            content: '继续补 todo smoke',
            priority: 'high',
            status: 'in_progress',
          },
          {
            content: '整理 subagent 与 opencode 对齐点',
            priority: 'medium',
            status: 'pending',
          },
        ],
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_todo_0',
      toolName: 'todowrite',
    };
  }
  if (shouldTriggerWebFetchTool(body)) {
    return {
      arguments: {
        format: 'markdown',
        url: smokeWebFetchUrl,
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_webfetch_0',
      toolName: 'webfetch',
    };
  }
  if (shouldTriggerBashWriteTool(body)) {
    return {
      arguments: {
        command: buildSmokeBashWriteCommand(),
        description: '写入 smoke workspace 文件',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_bash_write_0',
      toolName: readSmokeShellToolName(),
    };
  }
  if (shouldTriggerBashConfigTool(body)) {
    return {
      arguments: {
        command: buildSmokeBashConfigCommand(),
        description: '生成多行输出',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_bash_config_0',
      toolName: readSmokeShellToolName(),
    };
  }
  if (shouldTriggerBashReadTool(body)) {
    return {
      arguments: {
        command: buildSmokeBashReadCommand(),
        description: '读取 smoke workspace 文件',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_bash_read_0',
      toolName: readSmokeShellToolName(),
    };
  }
  if (shouldTriggerBashWorkdirTool(body)) {
    return {
      arguments: {
        command: buildSmokeBashWorkdirCommand(),
        description: '在指定工作目录执行命令',
        workdir: 'nested',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_bash_workdir_0',
      toolName: readSmokeShellToolName(),
    };
  }
  if (shouldTriggerBashTimeoutTool(body)) {
    return {
      arguments: {
        command: `curl -s ${smokeBashTimeoutUrl}`,
        description: `触发 ${readSmokeShellToolName()} 超时`,
        timeout: 50,
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_bash_timeout_0',
      toolName: readSmokeShellToolName(),
    };
  }
  if (shouldTriggerBashTarTool(body)) {
    return {
      arguments: {
        command: buildSmokeBashTarCommand(),
        description: '打包并还原目录树',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_bash_tar_0',
      toolName: readSmokeShellToolName(),
    };
  }
  if (shouldTriggerReadTool(body)) {
    return {
      arguments: {
        filePath: 'notes/runtime.txt',
        limit: 5,
        offset: 1,
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_read_0',
      toolName: 'read',
    };
  }
  if (shouldTriggerGlobTool(body)) {
    return {
      arguments: {
        path: '/',
        pattern: '**/*.txt',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_glob_0',
      toolName: 'glob',
    };
  }
  if (shouldTriggerGrepTool(body)) {
    return {
      arguments: {
        include: '*.txt',
        path: '/',
        pattern: 'smoke-workspace',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_grep_0',
      toolName: 'grep',
    };
  }
  if (shouldTriggerWriteTool(body)) {
    return {
      arguments: {
        content: 'generated file\n',
        filePath: 'generated/output.txt',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_write_0',
      toolName: 'write',
    };
  }
  if (shouldTriggerWriteOverwriteTool(body)) {
    return {
      arguments: {
        content: 'overwritten workspace\n',
        filePath: 'notes/runtime.txt',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_write_overwrite_0',
      toolName: 'write',
    };
  }
  if (shouldTriggerEditTool(body)) {
    return {
      arguments: {
        filePath: 'generated/output.txt',
        newString: 'updated file',
        oldString: 'generated file',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_edit_0',
      toolName: 'edit',
    };
  }
  if (shouldTriggerCreateStyleEditTool(body)) {
    return {
      arguments: {
        filePath: 'generated/create-via-edit.txt',
        newString: 'created via edit\n',
        oldString: '',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_edit_create_0',
      toolName: 'edit',
    };
  }
  if (shouldTriggerStaleEditTool(body)) {
    return {
      arguments: {
        filePath: 'generated/output.txt',
        newString: 'stale file',
        oldString: 'updated file',
      },
      kind: 'tool-call',
      toolCallId: 'call_smoke_edit_stale_0',
      toolName: 'edit',
    };
  }
  if (requestContainsToolResult(body, 'skill')) {
    return {
      kind: 'text',
      text: '已加载技能 smoke-http-flow，可继续执行 Smoke HTTP Flow。',
    };
  }
  if (requestContainsToolResult(body, 'wait_subagent')) {
    if (isAutoCompactionSubagentPrompt(body)) {
      return {
        kind: 'text',
        text: AUTO_COMPACTION_MAIN_TEXT,
        usage: {
          completion_tokens: 28,
          prompt_tokens: 392,
          total_tokens: 420,
        },
      };
    }
    return {
      kind: 'text',
      text: '子代理已完成：Smoke HTTP Flow 用于后端烟测。',
    };
  }
  if (requestContainsToolResult(body, 'todowrite')) {
    return {
      kind: 'text',
      text: '已更新当前待办，当前剩余 2 项。',
    };
  }
  if (requestContainsToolResult(body, 'webfetch')) {
    return {
      kind: 'text',
      text: '已抓取 smoke 页面，并整理成 markdown。',
    };
  }
  if (requestContainsShellToolResult(body)) {
    return {
      kind: 'text',
      text: readLatestUserText(body?.messages).includes('读取刚才写入的 smoke workspace 文件')
        ? '已读取 smoke workspace 文件。'
        : readLatestUserText(body?.messages).includes('生成多行输出')
          ? '已读取 smoke workspace 文件。'
        : readLatestUserText(body?.messages).includes('nested 子目录中执行命令')
          ? `已在指定 ${readSmokeShellToolName()} 工作目录中完成执行。`
          : readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('很短超时触发 {shellToolName} 超时'))
            ? `已收到 ${readSmokeShellToolName()} 超时错误。`
          : readLatestUserText(body?.messages).includes('打包并还原一个 nested 目录树')
            ? `已完成 ${readSmokeShellToolName()} 打包与还原验证。`
            : '已写入 smoke workspace 文件。',
    };
  }
  if (requestContainsToolResult(body, 'read')) {
    return {
      kind: 'text',
      text: '已通过 read 工具读取 smoke workspace 文件。',
    };
  }
  if (requestContainsToolResult(body, 'glob')) {
    return {
      kind: 'text',
      text: '已通过 glob 工具列出 smoke workspace 文件。',
    };
  }
  if (requestContainsToolResult(body, 'grep')) {
    return {
      kind: 'text',
      text: '已通过 grep 工具找到 smoke workspace 文本。',
    };
  }
  if (requestContainsToolResult(body, 'write')) {
    return {
      kind: 'text',
      text: readLatestUserText(body?.messages).includes('覆盖刚才读取的 smoke workspace 文件')
        ? '已通过 write 工具覆盖 smoke workspace 已有文件。'
        : '已通过 write 工具写入 smoke workspace 文件。',
    };
  }
  if (requestContainsToolResult(body, 'edit')) {
    return {
      kind: 'text',
      text: readLatestUserText(body?.messages).includes('请使用 edit 工具在 smoke workspace 中直接创建一个 generated/create-via-edit.txt 文件')
        ? '已通过 edit 工具创建 smoke workspace 文件。'
        : '已通过 edit 工具修改 smoke workspace 文件。',
    };
  }
  if (requestContainsInvalidToolResult(body, 'edit', '文件在上次读取后已被修改')) {
    return {
      kind: 'text',
      text: '已确认文件在读取后发生变化，需要重新读取。',
    };
  }
  return {
    kind: 'text',
    text: resolveAssistantText(body),
    ...(readPlannedUsage(body) ? { usage: readPlannedUsage(body) } : {}),
  };
}

function shouldTriggerSkillTool(body) {
  return requestIncludesToolName(body, 'skill')
    && !requestContainsToolResult(body, 'skill')
    && readLatestUserText(body?.messages).includes('请加载 smoke-http-flow 技能');
}

function shouldTriggerSpawnSubagentTool(body) {
  return requestIncludesToolName(body, 'spawn_subagent')
    && !requestContainsToolResult(body, 'spawn_subagent')
    && readLatestUserText(body?.messages).includes('请使用 subagent 工具委派一个探索任务');
}

function shouldTriggerWaitSubagentTool(body) {
  return requestIncludesToolName(body, 'wait_subagent')
    && requestContainsToolResult(body, 'spawn_subagent')
    && !requestContainsToolResult(body, 'wait_subagent')
    && readLatestUserText(body?.messages).includes('请使用 subagent 工具委派一个探索任务');
}

function isAutoCompactionSubagentPrompt(body) {
  const latestUserText = readLatestUserText(body?.messages);
  return latestUserText.includes('请使用 subagent 工具委派一个探索任务')
    && latestUserText.includes('子代理长程压缩 smoke')
    && latestUserText.includes('主代理长程压缩 smoke');
}

function readPlannedUsage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (containsText(messages, '历史对话：')) {
    return null;
  }
  const latestUserText = readLatestUserText(messages);
  if (latestUserText.includes('子代理长程压缩 smoke')) {
    return {
      completion_tokens: 28,
      prompt_tokens: 392,
      total_tokens: 420,
    };
  }
  if (latestUserText.includes('主代理长程压缩 smoke')) {
    return {
      completion_tokens: 28,
      prompt_tokens: 392,
      total_tokens: 420,
    };
  }
  return null;
}

function shouldTriggerTodoTool(body) {
  return requestIncludesToolName(body, 'todowrite')
    && !requestContainsToolResult(body, 'todowrite')
    && readLatestUserText(body?.messages).includes('请更新当前待办列表');
}

function shouldTriggerWebFetchTool(body) {
  return requestIncludesToolName(body, 'webfetch')
    && !requestContainsToolResult(body, 'webfetch')
    && readLatestUserText(body?.messages).includes('请抓取 smoke web 页面');
}

function shouldTriggerBashWriteTool(body) {
  return requestIncludesToolName(body, readSmokeShellToolName())
    && !requestContainsShellToolResult(body)
    && readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具在 smoke workspace 中写入文件'));
}

function shouldTriggerBashConfigTool(body) {
  return requestIncludesToolName(body, readSmokeShellToolName())
    && !requestContainsShellToolResult(body)
    && readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具生成多行输出'));
}

function shouldTriggerBashReadTool(body) {
  return requestIncludesToolName(body, readSmokeShellToolName())
    && !requestContainsShellToolResult(body)
    && readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具读取刚才写入的 smoke workspace 文件'));
}

function shouldTriggerBashWorkdirTool(body) {
  return requestIncludesToolName(body, readSmokeShellToolName())
    && !requestContainsShellToolResult(body)
    && readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具在 nested 子目录中执行命令'));
}

function shouldTriggerBashTimeoutTool(body) {
  return requestIncludesToolName(body, readSmokeShellToolName())
    && !requestContainsShellToolResult(body)
    && readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('请使用很短超时触发 {shellToolName} 超时'));
}

function shouldTriggerBashTarTool(body) {
  return requestIncludesToolName(body, readSmokeShellToolName())
    && !requestContainsShellToolResult(body)
    && readLatestUserText(body?.messages).includes(buildSmokeShellInstruction('请使用 {shellToolName} 工具打包并还原一个 nested 目录树'));
}

function shouldTriggerReadTool(body) {
  return requestIncludesToolName(body, 'read')
    && !requestContainsToolResult(body, 'read')
    && readLatestUserText(body?.messages).includes('请使用 read 工具读取刚才写入的 smoke workspace 文件');
}

function shouldTriggerGlobTool(body) {
  return requestIncludesToolName(body, 'glob')
    && !requestContainsToolResult(body, 'glob')
    && readLatestUserText(body?.messages).includes('请使用 glob 工具列出 smoke workspace 中的 txt 文件');
}

function shouldTriggerGrepTool(body) {
  return requestIncludesToolName(body, 'grep')
    && !requestContainsToolResult(body, 'grep')
    && readLatestUserText(body?.messages).includes('请使用 grep 工具搜索 smoke workspace 中的 smoke-workspace 文本');
}

function shouldTriggerWriteTool(body) {
  return requestIncludesToolName(body, 'write')
    && !requestContainsToolResult(body, 'write')
    && readLatestUserText(body?.messages).includes('请使用 write 工具在 smoke workspace 中创建一个 generated 文件');
}

function shouldTriggerWriteOverwriteTool(body) {
  return requestIncludesToolName(body, 'write')
    && !requestContainsToolResult(body, 'write')
    && readLatestUserText(body?.messages).includes('请使用 write 工具覆盖刚才读取的 smoke workspace 文件');
}

function shouldTriggerEditTool(body) {
  return requestIncludesToolName(body, 'edit')
    && !requestContainsToolResult(body, 'edit')
    && readLatestUserText(body?.messages).includes('请使用 edit 工具修改刚才生成的 generated 文件');
}

function shouldTriggerCreateStyleEditTool(body) {
  return requestIncludesToolName(body, 'edit')
    && !requestContainsToolResult(body, 'edit')
    && readLatestUserText(body?.messages).includes('请使用 edit 工具在 smoke workspace 中直接创建一个 generated/create-via-edit.txt 文件');
}

function shouldTriggerStaleEditTool(body) {
  return requestIncludesToolName(body, 'edit')
    && !requestContainsToolResult(body, 'edit')
    && !requestContainsInvalidToolResult(body, 'edit', '文件在上次读取后已被修改')
    && readLatestUserText(body?.messages).includes('请使用 edit 工具再次修改刚才生成的 generated 文件');
}

function requestHasToolList(body) {
  return Array.isArray(body?.tools);
}

function requestIncludesToolName(body, toolName) {
  if (!Array.isArray(body?.tools)) {
    return false;
  }
  return body.tools.some((entry) => entry?.function?.name === toolName);
}

function requestContainsShellToolResult(body) {
  return requestContainsToolResult(body, readSmokeShellToolName());
}

function requestContainsToolResult(body, toolName) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) => {
    if (message?.role !== 'tool') {
      return false;
    }
    if (!toolName) {
      return true;
    }
    const toolCallId = typeof message?.tool_call_id === 'string'
      ? message.tool_call_id
      : typeof message?.toolCallId === 'string'
        ? message.toolCallId
        : '';
    const content = readTextContent(message);
    return (toolName === 'skill' && (toolCallId === 'call_smoke_skill_0' || content.includes('<skill_content name="smoke-http-flow">')))
      || (toolName === 'spawn_subagent' && toolCallId === 'call_smoke_subagent_0')
      || (toolName === 'wait_subagent' && toolCallId === 'call_smoke_subagent_wait_0')
      || (toolName === 'todowrite' && (toolCallId === 'call_smoke_todo_0' || content.includes('<todo_result>')))
      || (toolName === 'webfetch' && (toolCallId === 'call_smoke_webfetch_0' || content.includes('<webfetch_result>')))
      || ((toolName === 'bash' || toolName === 'powershell') && (
        toolCallId === 'call_smoke_bash_write_0'
        || toolCallId === 'call_smoke_bash_config_0'
        || toolCallId === 'call_smoke_bash_read_0'
        || toolCallId === 'call_smoke_bash_workdir_0'
        || toolCallId === 'call_smoke_bash_timeout_0'
        || toolCallId === 'call_smoke_bash_tar_0'
        || content.includes(`<${readSmokeShellResultTagName()}>`)
        || (content.includes('<invalid_tool_result>') && content.includes(`<tool>${readSmokeShellToolName()}</tool>`))
      ))
      || (toolName === 'read' && (toolCallId === 'call_smoke_read_0' || content.includes('<read_result>')))
      || (toolName === 'glob' && (toolCallId === 'call_smoke_glob_0' || content.includes('<glob_result>')))
      || (toolName === 'grep' && (toolCallId === 'call_smoke_grep_0' || content.includes('<grep_result>')))
      || (toolName === 'write' && (toolCallId === 'call_smoke_write_0' || content.includes('<write_result>')))
      || (toolName === 'edit' && (
        toolCallId === 'call_smoke_edit_0'
        || toolCallId === 'call_smoke_edit_create_0'
        || content.includes('<edit_result>')
      ));
  });
}

function requestContainsSkillContent(body, skillName) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes(`<skill_content name="${skillName}">`));
}

function requestContainsSubagentResult(body, expectedText) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes(expectedText)
    && isRenderedSubagentToolContent(readTextContent(message)));
}

function requestContainsSubagentSessionId(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && (readTextContent(message).includes('conversation_id: ') || readTextContent(message).includes('"conversationId"'))
    && isRenderedSubagentToolContent(readTextContent(message)));
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
    const textMatch = content.match(/conversation_id:\s*([0-9a-f-]+)/i);
    if (textMatch?.[1]) {
      return textMatch[1];
    }
  }
  throw new Error('Expected spawn_subagent result to expose conversation id');
}

function requestContainsTodoResult(body, todoContent) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<todo_result>')
    && readTextContent(message).includes(todoContent));
}

function requestContainsWebFetchResult(body, title) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<webfetch_result>')
    && readTextContent(message).includes(`Title: ${title}`));
}

function requestContainsReadResult(body, filePath, expectedText) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<read_result>')
    && readTextContent(message).includes(`Path: ${filePath}`)
    && readTextContent(message).includes(expectedText));
}

function requestContainsGlobResult(body, filePath) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<glob_result>')
    && readTextContent(message).includes(filePath));
}

function requestContainsGrepResult(body, filePath, expectedText) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<grep_result>')
    && readTextContent(message).includes(filePath)
    && readTextContent(message).includes(expectedText));
}

function requestContainsWriteResult(body, filePath) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<write_result>')
    && readTextContent(message).includes(`Path: ${filePath}`));
}

function requestContainsEditResult(body, filePath) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<edit_result>')
    && readTextContent(message).includes(`Path: ${filePath}`));
}

function readToolMessages(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages
    .filter((message) => message?.role === 'tool')
    .map((message) => readTextContent(message));
}

function requestContainsShellResult(body, contentFragment) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes(`<${readSmokeShellResultTagName()}>`)
    && readTextContent(message).includes(contentFragment));
}

function readLatestShellToolContent(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const bashToolMessage = [...messages].reverse().find((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes(`<${readSmokeShellResultTagName()}>`));
  return bashToolMessage ? readTextContent(bashToolMessage) : null;
}

function readBashStreamSection(content, sectionName) {
  const match = content.match(new RegExp(`<${sectionName}>\\n([\\s\\S]*?)\\n<\\/${sectionName}>`));
  return match ? match[1] : null;
}

function readNormalizedFileContent(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function isRenderedSubagentToolContent(content) {
  return content.includes('"conversationId"') || content.includes('"result"') || content.includes('"error"');
}

function requestContainsInvalidToolResult(body, toolName, errorFragment) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some((message) =>
    message?.role === 'tool'
    && readTextContent(message).includes('<invalid_tool_result>')
    && readTextContent(message).includes(`<tool>${toolName}</tool>`)
    && readTextContent(message).includes(errorFragment));
}

function readLatestUserText(messages) {
  return findLatestUserText(Array.isArray(messages) ? messages : []);
}

function containsText(messages, needle) {
  return messages.some((message) => readTextContent(message).includes(needle));
}

function containsImage(messages) {
  return messages.some((message) =>
    Array.isArray(message?.content)
    && message.content.some((part) => part?.type === 'image_url' || part?.type === 'input_image'));
}

function latestUserMessageContainsImage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }
    return Array.isArray(message?.content)
      && message.content.some((part) => part?.type === 'image_url' || part?.type === 'input_image');
  }
  return false;
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
