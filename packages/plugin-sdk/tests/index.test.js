const test = require('node:test');
const assert = require('node:assert/strict');

const REMOTE_ENVIRONMENT = {
  API: 'api',
  IOT: 'iot',
};
const { PluginClient } = require('../dist/client/index.js');
const { createPluginHostFacade } = require('../dist/host/index.js');
const {
  createAutomationCreatedResult,
  createAutomationEventDispatchResult,
  createAutomationListResult,
  createCalculateErrorResult,
  createCalculateSuccessResult,
  createCurrentTimeToolResult,
  createMemoryRecallToolResult,
  createMemorySaveToolResult,
  createRouteInspectorContextResponse,
  createAutomationRunResult,
  createSystemInfoToolResult,
  createAutomationToggleResult,
  buildAutomationRunSummary,
  buildConversationCreatedSummary,
  buildPluginGovernanceMessage,
  buildPluginGovernanceSummary,
  buildConversationTitlePrompt,
  buildToolAuditStorageKey,
  CONVERSATION_TITLE_CONFIG_SCHEMA,
  CONVERSATION_TITLE_DEFAULT_TITLE,
  CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
  KB_CONTEXT_CONFIG_SCHEMA,
  KB_CONTEXT_DEFAULT_LIMIT,
  KB_CONTEXT_DEFAULT_PROMPT_PREFIX,
  buildMessageLifecycleSummary,
  buildMessageReceivedSummary,
  buildResponseSendSummary,
  buildToolAuditSummary,
  buildWaitingModelSummary,
  createChatBeforeModelLineBlockResult,
  asChatBeforeModelPayload,
  createSubagentRunSummary,
  createPluginAuthorTransportExecutor,
  createChatBeforeModelHookResult,
  createPassHookResult,
  createProviderRouterMutateResult,
  createProviderRouterShortCircuitResult,
  createSystemPromptMutateResult,
  describeJsonValueKind,
  filterAllowedToolNames,
  normalizePositiveInteger,
  persistPluginObservation,
  readCurrentPersonaInfo,
  readCurrentProviderInfo,
  readPluginCreateAutomationParams,
  readBooleanFlag,
  readConversationMessages,
  readPersonaRouterConfig,
  readPersonaSummaryInfo,
  PERSONA_ROUTER_CONFIG_SCHEMA,
  PROVIDER_ROUTER_CONFIG_SCHEMA,
  PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY,
  readConversationSummary,
  readConversationTitleConfig,
  readMemorySearchResults,
  readMemorySaveResultId,
  readOptionalObjectParam,
  readProviderRouterConfig,
  readContextCompactionConfig,
  resolveContextCompactionRuntimeConfig,
  resolveConversationTitleRuntimeConfig,
  CONTEXT_COMPACTION_CONFIG_SCHEMA,
  CONTEXT_COMPACTION_DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE,
  CONTEXT_COMPACTION_DEFAULT_KEEP_RECENT,
  CONTEXT_COMPACTION_DEFAULT_RESERVED_TOKENS,
  CONTEXT_COMPACTION_DEFAULT_SLIDING_WINDOW_USAGE_PERCENT,
  CONTEXT_COMPACTION_DEFAULT_STRATEGY,
  CONTEXT_COMPACTION_DEFAULT_THRESHOLD,
  readOptionalStringParam,
  readPluginHookPayload,
  readJsonObjectValue,
  readRequiredStringParam,
  readRequiredTextValue,
  resolveProviderRouterShortCircuitReply,
  sameToolNames,
  readTextGenerationResult,
  sanitizeConversationTitle,
  sanitizeOptionalText,
  shouldGenerateConversationTitle,
  textIncludesKeyword,
} = require('../dist/authoring/index.js');

const WS_TYPE = {
  COMMAND: 'command',
  PLUGIN: 'plugin',
};

const WS_ACTION = {
  EXECUTE: 'execute',
  EXECUTE_ERROR: 'execute_error',
  HOST_CALL: 'host_call',
  HOST_RESULT: 'host_result',
  HOOK_INVOKE: 'hook_invoke',
  HOOK_RESULT: 'hook_result',
  HOOK_ERROR: 'hook_error',
  ROUTE_INVOKE: 'route_invoke',
  ROUTE_ERROR: 'route_error',
};

function createClient(manifest = {}) {
  return new PluginClient({
    accessKey: 'test-access-key',
    remoteEnvironment: REMOTE_ENVIRONMENT.API,
    serverUrl: 'ws://localhost:23331',
    pluginName: 'plugin.sdk.test',
    manifest,
  });
}

function createMessagePayload(content) {
  return {
    context: {
      source: 'chat-hook',
      conversationId: 'conv-1',
    },
    conversationId: 'conv-1',
    providerId: 'openai',
    modelId: 'gpt-5.2',
    message: {
      role: 'user',
      content,
      parts: [
        {
          type: 'text',
          text: content,
        },
      ],
    },
    modelMessages: [
      {
        role: 'user',
        content,
      },
    ],
  };
}

function createConversationSessionInfo(overrides = {}) {
  return {
    pluginId: 'plugin.sdk.test',
    conversationId: 'conv-1',
    timeoutMs: 60000,
    startedAt: '2026-03-30T10:00:00.000Z',
    expiresAt: '2026-03-30T10:01:00.000Z',
    lastMatchedAt: null,
    captureHistory: false,
    historyMessages: [],
    ...overrides,
  };
}

function installHostCallMock(client, handlers) {
  const sent = [];
  client.ws = {
    readyState: 1,
  };
  client.send = (type, action, payload, requestId) => {
    sent.push({
      type,
      action,
      payload,
      requestId,
    });

    if (action !== WS_ACTION.HOST_CALL) {
      return;
    }

    const handler = handlers[payload.method];
    if (!handler) {
      throw new Error(`Unexpected host method: ${payload.method}`);
    }

    queueMicrotask(() => {
      const data = typeof handler === 'function'
        ? handler(payload.params, payload.context, requestId)
        : handler;

      void client.handleMessage({
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_RESULT,
        requestId,
        payload: {
          data,
        },
      });
    });
  };

  return sent;
}

async function invokeMessageHook(client, payload) {
  const responses = [];
  const previousSend = client.send;
  client.send = (type, action, responsePayload, requestId) => {
    if (action === WS_ACTION.HOOK_RESULT) {
      responses.push({
        type,
        action,
        payload: responsePayload,
        requestId,
      });
      return;
    }

    if (typeof previousSend === 'function') {
      previousSend(type, action, responsePayload, requestId);
    }
  };

  try {
    await client.handleHookInvoke({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_INVOKE,
      requestId: 'req-1',
      payload: {
        hookName: 'message:received',
        context: payload.context,
        payload,
      },
    });
  } finally {
    client.send = previousSend;
  }

  assert.equal(responses.length, 1);
  return responses[0];
}

test('resolveManifest synthesizes message hook descriptors for commands and groups', () => {
  const client = createClient();
  client.command('help', () => 'help', {
    alias: ['帮助'],
    priority: -2,
  });

  const math = client.commandGroup('math', {
    alias: ['m'],
    description: '数学命令',
  });
  math.command('add', () => 'sum', {
    alias: ['sum'],
    description: '加法',
  });
  const calc = math.group('calc', {
    alias: ['c'],
    description: '高级计算',
  });
  calc.command('help', () => 'calc help');

  const manifest = client.resolveManifest();
  const messageHook = manifest.hooks.find((hook) => hook.name === 'message:received');

  assert.ok(messageHook);
  assert.equal(messageHook.priority, -2);
  assert.deepEqual(
    [...messageHook.filter.message.commands].sort(),
    [
      '/help',
      '/帮助',
      '/math',
      '/m',
      '/math add',
      '/math sum',
      '/m add',
      '/m sum',
      '/math calc',
      '/math c',
      '/m calc',
      '/m c',
      '/math calc help',
      '/math c help',
      '/m calc help',
      '/m c help',
    ].sort(),
  );
  assert.ok(Array.isArray(manifest.commands));
  assert.deepEqual(
    manifest.commands.map((command) => ({
      kind: command.kind,
      canonicalCommand: command.canonicalCommand,
      aliases: [...command.aliases].sort(),
      variants: [...command.variants].sort(),
      priority: command.priority,
      description: command.description,
    })),
    [
      {
        kind: 'command',
        canonicalCommand: '/help',
        aliases: ['/帮助'].sort(),
        variants: ['/help', '/帮助'].sort(),
        priority: -2,
        description: undefined,
      },
      {
        kind: 'group-help',
        canonicalCommand: '/math',
        aliases: ['/m'].sort(),
        variants: ['/math', '/m'].sort(),
        priority: 0,
        description: '数学命令',
      },
      {
        kind: 'command',
        canonicalCommand: '/math add',
        aliases: ['/math sum', '/m add', '/m sum'].sort(),
        variants: ['/math add', '/math sum', '/m add', '/m sum'].sort(),
        priority: 0,
        description: '加法',
      },
      {
        kind: 'group-help',
        canonicalCommand: '/math calc',
        aliases: ['/math c', '/m calc', '/m c'].sort(),
        variants: ['/math calc', '/math c', '/m calc', '/m c'].sort(),
        priority: 0,
        description: '高级计算',
      },
      {
        kind: 'command',
        canonicalCommand: '/math calc help',
        aliases: ['/math c help', '/m calc help', '/m c help'].sort(),
        variants: ['/math calc help', '/math c help', '/m calc help', '/m c help'].sort(),
        priority: 0,
        description: undefined,
      },
    ],
  );
});

test('PluginClient.fromRemoteAccess creates a client directly from remote connection info', () => {
  const client = PluginClient.fromRemoteAccess({
    accessKey: 'remote-access-key',
    pluginName: 'remote.pc-host',
    remote: {
      auth: {
        mode: 'required',
      },
      capabilityProfile: 'query',
      remoteEnvironment: REMOTE_ENVIRONMENT.API,
    },
    serverUrl: 'ws://127.0.0.1:23331',
  }, {
    manifest: {
      name: 'Remote PC Host',
      version: '1.0.0',
      permissions: [],
      tools: [],
    },
  });

  assert.equal(client.options.serverUrl, 'ws://127.0.0.1:23331');
  assert.equal(client.options.accessKey, 'remote-access-key');
  assert.equal(client.options.pluginName, 'remote.pc-host');
  assert.equal(client.options.remoteEnvironment, REMOTE_ENVIRONMENT.API);
  assert.deepEqual(client.resolveManifest(), {
    id: 'remote.pc-host',
    name: 'Remote PC Host',
    version: '1.0.0',
    runtime: 'remote',
    description: undefined,
    permissions: [],
    remote: {
      auth: {
        mode: 'required',
      },
      capabilityProfile: 'query',
      remoteEnvironment: REMOTE_ENVIRONMENT.API,
    },
    tools: [],
    hooks: [],
    config: undefined,
    routes: [],
  });
});

test('createPluginHostFacade normalizes host params for author-side host helpers', async () => {
  const calls = [];
  const host = createPluginHostFacade({
    call(method, params) {
      calls.push({
        kind: 'call',
        method,
        params,
      });
      return Promise.resolve({
        ok: true,
      });
    },
    callHost(method, params = {}) {
      calls.push({
        kind: 'callHost',
        method,
        params,
      });
      return Promise.resolve({
        ok: true,
      });
    },
  });

  await host.sendMessage({
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conversation-1',
    },
  });
  await host.startConversationSession({
    timeoutMs: 30000,
    captureHistory: true,
  });
  await host.getStorage('draft', {
    scope: 'conversation',
  });
  await host.generate({
    providerId: 'openai',
    transportMode: 'stream-collect',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
      },
    ],
  });
  await host.generateText({
    prompt: 'ping',
    maxOutputTokens: 64,
    transportMode: 'stream-collect',
  });

  assert.deepEqual(calls, [
    {
      kind: 'callHost',
      method: 'message.send',
      params: {
        content: 'hello',
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
      },
    },
    {
      kind: 'callHost',
      method: 'conversation.session.start',
      params: {
        timeoutMs: 30000,
        captureHistory: true,
      },
    },
    {
      kind: 'call',
      method: 'storage.get',
      params: {
        key: 'draft',
        scope: 'conversation',
      },
    },
    {
      kind: 'callHost',
      method: 'llm.generate',
      params: {
        providerId: 'openai',
        transportMode: 'stream-collect',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'hello',
              },
            ],
          },
        ],
      },
    },
    {
      kind: 'callHost',
      method: 'llm.generate-text',
      params: {
        prompt: 'ping',
        maxOutputTokens: 64,
        transportMode: 'stream-collect',
      },
    },
  ]);
});

test('plugin-sdk exposes generic hook payload readers and chat:before-model result helpers', () => {
  const payload = {
    context: {
      source: 'chat-hook',
      conversationId: 'conv-1',
    },
    request: {
      providerId: 'openai',
      modelId: 'gpt-5.2',
      systemPrompt: '你是 Garlic Claw',
      messages: [
        {
          role: 'user',
          content: '今天我想喝咖啡',
        },
      ],
      availableTools: [],
    },
  };

  assert.equal(readPluginHookPayload(payload), payload);
  assert.equal(asChatBeforeModelPayload(payload), payload);
  assert.deepEqual(
    createChatBeforeModelHookResult(
      payload.request.systemPrompt,
      '已知用户记忆：\n- [preference] 用户喜欢咖啡',
    ),
    {
      action: 'mutate',
      systemPrompt: '你是 Garlic Claw\n\n已知用户记忆：\n- [preference] 用户喜欢咖啡',
    },
  );
  assert.deepEqual(
    createChatBeforeModelHookResult('', '补充系统提示词'),
    {
      action: 'mutate',
      systemPrompt: '补充系统提示词',
    },
  );
  assert.deepEqual(
    createChatBeforeModelLineBlockResult(
      payload.request.systemPrompt,
      '与此用户相关的记忆',
      ['- [preference] 用户喜欢咖啡'],
    ),
    {
      action: 'mutate',
      systemPrompt: '你是 Garlic Claw\n\n与此用户相关的记忆：\n- [preference] 用户喜欢咖啡',
    },
  );
  assert.equal(
    createChatBeforeModelLineBlockResult(payload.request.systemPrompt, '前缀', []),
    null,
  );
});

test('plugin-sdk no longer exposes legacy memory auto-injection prompt config or helper exports', () => {
  const sdk = require('../dist/authoring/index.js');

  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'MEMORY_CONTEXT_CONFIG_SCHEMA'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'MEMORY_CONTEXT_DEFAULT_LIMIT'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'clipContextText'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'readLatestUserTextFromMessages'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'readPromptBlockConfig'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sdk, 'resolvePromptBlockConfig'), false);
});

test('createPluginAuthorTransportExecutor runs author definitions with shared route normalization and governance actions', async () => {
  const seen = [];
  const executor = createPluginAuthorTransportExecutor({
    definition: {
      manifest: {
        id: 'plugin.sdk.author-transport',
        name: 'Author Transport',
        version: '1.0.0',
        runtime: 'local',
        permissions: [],
        tools: [],
      },
      tools: {
        echo(params, context) {
          seen.push({
            kind: 'tool',
            params,
            callContext: context.callContext,
          });
          return {
            echoed: params.message,
          };
        },
      },
      hooks: {
        'chat:before-model'(payload, context) {
          seen.push({
            kind: 'hook',
            payload,
            callContext: context.callContext,
          });
          return {
            action: 'pass',
          };
        },
      },
      routes: {
        'inspect/context': (request, context) => {
          seen.push({
            kind: 'route',
            request,
            callContext: context.callContext,
          });
          return {
            status: 200,
            body: {
              ok: true,
            },
          };
        },
      },
    },
    governance: {
      reload() {
        seen.push({
          kind: 'reload',
        });
      },
    },
    createExecutionContext(callContext) {
      return {
        callContext,
        host: {
          tag: 'host',
        },
      };
    },
  });

  const callContext = {
    source: 'plugin',
    conversationId: 'conv-1',
  };
  const toolResult = await executor.executeTool({
    toolName: 'echo',
    params: {
      message: 'hello',
    },
    context: callContext,
  });
  const hookResult = await executor.invokeHook({
    hookName: 'chat:before-model',
    payload: {
      value: 1,
    },
    context: callContext,
  });
  const routeResult = await executor.invokeRoute({
    request: {
      path: '/inspect/context/',
      method: 'GET',
      headers: {},
      query: {},
      body: null,
    },
    context: callContext,
  });

  await executor.reload();

  assert.deepEqual(toolResult, {
    echoed: 'hello',
  });
  assert.deepEqual(hookResult, {
    action: 'pass',
  });
  assert.deepEqual(routeResult, {
    status: 200,
    body: {
      ok: true,
    },
  });
  assert.deepEqual(executor.listSupportedActions(), [
    'health-check',
    'reload',
  ]);
  assert.equal((await executor.checkHealth()).ok, true);
  assert.deepEqual(seen, [
    {
      kind: 'tool',
      params: {
        message: 'hello',
      },
      callContext,
    },
    {
      kind: 'hook',
      payload: {
        value: 1,
      },
      callContext,
    },
    {
      kind: 'route',
      request: {
        path: '/inspect/context/',
        method: 'GET',
        headers: {},
        query: {},
        body: null,
      },
      callContext,
    },
    {
      kind: 'reload',
    },
  ]);
});

test('plugin-sdk exposes shared author-side text helpers for authoring flows', () => {
  assert.equal(sanitizeOptionalText('  hello  '), 'hello');
  assert.equal(sanitizeOptionalText(undefined), '');
  assert.deepEqual(
    filterAllowedToolNames(['beta', 'gamma'], ['alpha', 'beta', 'gamma']),
    ['beta', 'gamma'],
  );
  assert.equal(filterAllowedToolNames(undefined, ['alpha']), null);
  assert.equal(sameToolNames(['alpha', 'beta'], ['alpha', 'beta']), true);
  assert.equal(sameToolNames(['alpha'], ['beta']), false);
  assert.equal(KB_CONTEXT_DEFAULT_LIMIT, 3);
  assert.equal(KB_CONTEXT_DEFAULT_PROMPT_PREFIX, '与当前问题相关的系统知识');
  assert.equal(KB_CONTEXT_CONFIG_SCHEMA.type, 'object');
  assert.equal(textIncludesKeyword('请直接回复 #fast', '#fast'), true);
  assert.equal(textIncludesKeyword('普通消息', ' #fast '), false);
  assert.equal(
    resolveProviderRouterShortCircuitReply('   '),
    PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY,
  );
  assert.deepEqual(createPassHookResult(), {
    action: 'pass',
  });
  assert.deepEqual(createSystemPromptMutateResult('你是写作助手'), {
    action: 'mutate',
    systemPrompt: '你是写作助手',
  });
});

test('plugin-sdk exposes shared json object readers for author-side plugins', () => {
  assert.deepEqual(
    readJsonObjectValue({
      ok: true,
      nested: {
        value: 1,
      },
    }),
    {
      ok: true,
      nested: {
        value: 1,
      },
    },
  );
  assert.equal(readJsonObjectValue(['not', 'object']), null);
  assert.equal(readJsonObjectValue(null), null);
});

test('plugin-sdk exposes shared host result readers for conversation, memory and text generation', () => {
  assert.deepEqual(
    readConversationSummary({
      id: 'conversation-1',
      title: '标题',
    }),
    {
      id: 'conversation-1',
      title: '标题',
    },
  );
  assert.deepEqual(
    readConversationMessages([
      {
        role: 'user',
        content: '你好',
      },
      {
        role: 'assistant',
        content: '世界',
      },
      {
        ignored: true,
      },
    ]),
    [
      {
        role: 'user',
        content: '你好',
      },
      {
        role: 'assistant',
        content: '世界',
      },
    ],
  );
  assert.deepEqual(
    readTextGenerationResult({
      text: '生成标题',
    }),
    {
      text: '生成标题',
    },
  );
  assert.deepEqual(
    readConversationTitleConfig({
      defaultTitle: '新的对话',
      maxMessages: 6,
    }),
    {
      defaultTitle: '新的对话',
      maxMessages: 6,
    },
  );
  assert.deepEqual(
    resolveConversationTitleRuntimeConfig({}),
    {
      defaultTitle: CONVERSATION_TITLE_DEFAULT_TITLE,
      maxMessages: CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
    },
  );
  assert.deepEqual(
    readProviderRouterConfig({
      routing: {
        targetProviderId: 'anthropic',
        targetModelId: 'claude-3-7-sonnet',
      },
      tools: {
        allowedToolNames: ['recall_memory'],
      },
      shortCircuit: {
        shortCircuitKeyword: '#fast',
        shortCircuitReply: '直接回复',
      },
    }),
    {
      targetProviderId: 'anthropic',
      targetModelId: 'claude-3-7-sonnet',
      allowedToolNames: ['recall_memory'],
      shortCircuitKeyword: '#fast',
      shortCircuitReply: '直接回复',
    },
  );
  assert.equal(PROVIDER_ROUTER_CONFIG_SCHEMA.items.routing.type, 'object');
  assert.equal(PROVIDER_ROUTER_CONFIG_SCHEMA.items.tools.items.allowedToolNames.type, 'list');
  assert.equal(PROVIDER_ROUTER_CONFIG_SCHEMA.items.shortCircuit.collapsed, true);
  assert.deepEqual(
    readContextCompactionConfig({
      strategy: 'sliding',
      keepRecentMessages: 0,
      frontendMessageWindowSize: 160,
      reservedTokens: 4096,
      slidingWindowUsagePercent: 45,
    }),
    {
      strategy: 'sliding',
      keepRecentMessages: 0,
      frontendMessageWindowSize: 160,
      reservedTokens: 4096,
      slidingWindowUsagePercent: 45,
    },
  );
  assert.deepEqual(
    readContextCompactionConfig({
      strategy: 'sliding',
      keepRecentMessages: 3,
      frontendMessageWindowSize: 160,
      reservedTokens: 4096,
      slidingWindowUsagePercent: 45,
    }),
    {
      strategy: 'sliding',
      keepRecentMessages: 3,
      frontendMessageWindowSize: 160,
      reservedTokens: 4096,
      slidingWindowUsagePercent: 45,
    },
  );
  const contextCompactionRuntimeConfig = resolveContextCompactionRuntimeConfig({});
  assert.equal(contextCompactionRuntimeConfig.compressionThreshold, CONTEXT_COMPACTION_DEFAULT_THRESHOLD);
  assert.equal(contextCompactionRuntimeConfig.enabled, true);
  assert.equal(contextCompactionRuntimeConfig.keepRecentMessages, CONTEXT_COMPACTION_DEFAULT_KEEP_RECENT);
  assert.equal(contextCompactionRuntimeConfig.frontendMessageWindowSize, CONTEXT_COMPACTION_DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE);
  assert.equal(contextCompactionRuntimeConfig.reservedTokens, CONTEXT_COMPACTION_DEFAULT_RESERVED_TOKENS);
  assert.equal(contextCompactionRuntimeConfig.slidingWindowUsagePercent, CONTEXT_COMPACTION_DEFAULT_SLIDING_WINDOW_USAGE_PERCENT);
  assert.equal(contextCompactionRuntimeConfig.showCoveredMarker, true);
  assert.equal(contextCompactionRuntimeConfig.strategy, CONTEXT_COMPACTION_DEFAULT_STRATEGY);
  assert.equal(typeof contextCompactionRuntimeConfig.summaryPrompt, 'string');
  assert.ok(contextCompactionRuntimeConfig.summaryPrompt.length > 0);
  assert.equal(resolveContextCompactionRuntimeConfig({ keepRecentMessages: 0 }).keepRecentMessages, 0);
  assert.ok(contextCompactionRuntimeConfig.summaryPrompt.includes('最近用户目标 / 限制 / 待办 / 下一步事项'));
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.keepRecentMessages.type, 'int');
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.keepRecentMessages.defaultValue, 0);
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.compressionThreshold.defaultValue, 80);
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.frontendMessageWindowSize.type, 'int');
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.strategy.type, 'string');
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.slidingWindowUsagePercent.type, 'int');
  assert.equal(CONTEXT_COMPACTION_CONFIG_SCHEMA.items.strategy.type, 'string');
  assert.equal(
    CONTEXT_COMPACTION_CONFIG_SCHEMA.items.strategy.options[1].value,
    'sliding',
  );
  assert.equal(
    CONTEXT_COMPACTION_CONFIG_SCHEMA.items.slidingWindowUsagePercent.type,
    'int',
  );
  assert.deepEqual(
    CONTEXT_COMPACTION_CONFIG_SCHEMA.items.slidingWindowUsagePercent.condition,
    { strategy: 'sliding' },
  );
  assert.deepEqual(
    readCurrentProviderInfo({
      providerId: 'openai',
      modelId: 'gpt-5.2',
    }),
    {
      providerId: 'openai',
      modelId: 'gpt-5.2',
    },
  );
  assert.deepEqual(
    readPersonaRouterConfig({
      targetPersonaId: 'persona-writer',
      switchKeyword: '#writer',
    }),
    {
      targetPersonaId: 'persona-writer',
      switchKeyword: '#writer',
    },
  );
  assert.deepEqual(
    readCurrentPersonaInfo({
      personaId: 'persona-writer',
    }),
    {
      personaId: 'persona-writer',
    },
  );
  assert.deepEqual(
    readPersonaSummaryInfo({
      id: 'persona-writer',
      prompt: '你是一个偏文学表达的写作助手。',
    }),
    {
      id: 'persona-writer',
      prompt: '你是一个偏文学表达的写作助手。',
    },
  );
  assert.deepEqual(
    createProviderRouterShortCircuitResult({
      reply: '直接回复',
      currentProviderId: 'anthropic',
      currentModelId: 'claude-3-7-sonnet',
      requestProviderId: 'openai',
      requestModelId: 'gpt-5.2',
    }),
    {
      action: 'short-circuit',
      assistantContent: '直接回复',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      reason: 'matched-short-circuit-keyword',
    },
  );
  assert.deepEqual(
    createProviderRouterMutateResult({
      shouldRoute: true,
      targetProviderId: 'anthropic',
      targetModelId: 'claude-3-7-sonnet',
      toolNames: ['recall_memory'],
    }),
    {
      action: 'mutate',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      toolNames: ['recall_memory'],
    },
  );
  assert.equal(shouldGenerateConversationTitle(' 新的对话 ', '新的对话'), true);
  assert.equal(shouldGenerateConversationTitle('已生成标题', '新的对话'), false);
  assert.match(
    buildConversationTitlePrompt([
      {
        role: 'user',
        content: '我想做一个咖啡店会员系统',
      },
      {
        role: 'assistant',
        content: '可以先设计会员等级和积分规则',
      },
    ], 4),
    /用户: 我想做一个咖啡店会员系统/,
  );
  assert.equal(
    sanitizeConversationTitle('「咖啡店会员系统设计」\n补充解释'),
    '咖啡店会员系统设计',
  );
  assert.equal(
    sanitizeConversationTitle('本地 smoke 回复: 请为下面这段对话生成一个简洁中文标题。'),
    '',
  );
});


test('plugin-sdk exposes shared json param readers for author-side tool handlers', () => {
  assert.equal(readRequiredStringParam({
    name: 'alpha',
  }, 'name'), 'alpha');
  assert.equal(readOptionalStringParam({
    name: 'alpha',
  }, 'name'), 'alpha');
  assert.equal(readOptionalStringParam({}, 'name'), null);
  assert.deepEqual(readOptionalObjectParam({
    nested: {
      ok: true,
    },
  }, 'nested'), {
    ok: true,
  });
  assert.equal(readOptionalObjectParam({}, 'nested'), undefined);

  assert.throws(() => readRequiredStringParam({}, 'name'), /name 必填/);
  assert.throws(() => readOptionalStringParam({
    name: 1,
  }, 'name'), /name 必须是字符串/);
  assert.throws(() => readOptionalObjectParam({
    nested: [],
  }, 'nested'), /nested 必须是对象/);
});

test('plugin-sdk exposes shared author-side value readers for remote plugins', () => {
  assert.equal(readRequiredTextValue('  hello  ', 'prompt'), 'hello');
  assert.equal(normalizePositiveInteger(4.8, 2), 4);
  assert.equal(normalizePositiveInteger(undefined, 2), 2);
  assert.equal(readBooleanFlag(true, false), true);
  assert.equal(readBooleanFlag('invalid', true), true);

  assert.throws(() => readRequiredTextValue('', 'prompt'), /prompt 必须是非空字符串/);
});

test('host facade exposes plugin log listing', async () => {
  const client = createClient();
  const sent = installHostCallMock(client, {
    'log.list': {
      items: [
        {
          id: 'event-1',
          type: 'plugin:test',
          level: 'info',
          message: 'plugin sdk listed logs',
          metadata: null,
          createdAt: '2026-04-01T08:15:00.000Z',
        },
      ],
      nextCursor: null,
    },
  });

  const executionContext = client.createExecutionContext({
    source: 'plugin',
  });
  const result = await executionContext.host.listLogs({
    limit: 5,
    level: 'info',
  });

  assert.deepEqual(result, {
    items: [
      {
        id: 'event-1',
        type: 'plugin:test',
        level: 'info',
        message: 'plugin sdk listed logs',
        metadata: null,
        createdAt: '2026-04-01T08:15:00.000Z',
      },
    ],
    nextCursor: null,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, WS_ACTION.HOST_CALL);
  assert.equal(sent[0].payload.method, 'log.list');
  assert.deepEqual(sent[0].payload.params, {
    limit: 5,
    level: 'info',
  });
});

test('routes nested command aliases through the longest matching command path', async () => {
  const client = createClient();
  const math = client.commandGroup('math', {
    alias: ['m'],
  });
  const calc = math.group('calc', {
    alias: ['c'],
  });

  calc.command('help', ({ matchedCommand, canonicalCommand, path, args }) =>
    `${matchedCommand}|${canonicalCommand}|${path.join('.')}|${args.join(',')}`);

  const response = await invokeMessageHook(
    client,
    createMessagePayload('/m c help foo bar'),
  );

  assert.equal(response.type, WS_TYPE.PLUGIN);
  assert.equal(response.action, WS_ACTION.HOOK_RESULT);
  assert.deepEqual(response.payload.data, {
    action: 'short-circuit',
    assistantContent: '/m c help|/math calc help|math.calc.help|foo,bar',
  });
});

test('returns generated group help when a command group is matched exactly', async () => {
  const client = createClient();
  const math = client.commandGroup('math', {
    description: '数学命令',
  });
  math.command('add', () => 'sum', {
    alias: ['sum'],
    description: '加法',
  });
  math.group('calc', {
    description: '高级计算',
  });

  const response = await invokeMessageHook(
    client,
    createMessagePayload('/math'),
  );

  assert.equal(response.payload.data.action, 'short-circuit');
  assert.match(response.payload.data.assistantContent, /^\/math$/m);
  assert.match(response.payload.data.assistantContent, /add \[sum\]: 加法/);
  assert.match(response.payload.data.assistantContent, /calc: 高级计算/);
});

test('aggregates onMessage mutations into a single mutate result', async () => {
  const client = createClient();
  client.onMessage(() => ({
    action: 'mutate',
    content: 'rewritten by sdk',
  }), {
    filter: {
      regex: '^hello$',
    },
  });

  const response = await invokeMessageHook(
    client,
    createMessagePayload('hello'),
  );

  assert.deepEqual(response.payload.data, {
    action: 'mutate',
    content: 'rewritten by sdk',
  });
});

test('returns hook_error for malformed message hook payloads', async () => {
  const client = createClient();
  client.onMessage(() => ({
    action: 'pass',
  }));
  const responses = [];
  const previousSend = client.send;
  client.send = (type, action, responsePayload, requestId) => {
    if (action === WS_ACTION.HOOK_ERROR) {
      responses.push({
        type,
        action,
        payload: responsePayload,
        requestId,
      });
      return;
    }

    if (typeof previousSend === 'function') {
      previousSend(type, action, responsePayload, requestId);
    }
  };

  try {
    await client.handleHookInvoke({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_INVOKE,
      requestId: 'req-invalid-hook',
      payload: {
        hookName: 'message:received',
        context: {
          source: 'chat-hook',
          conversationId: 'conv-1',
        },
        payload: {
          context: {
            source: 'chat-hook',
            conversationId: 'conv-1',
          },
          conversationId: 'conv-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          message: {
            role: 'user',
            content: 'hello',
            parts: [
              {
                type: 'text',
                text: 'hello',
              },
            ],
          },
          modelMessages: 'not-an-array',
        },
      },
    });
  } finally {
    client.send = previousSend;
  }

  assert.equal(responses.length, 1);
  assert.match(responses[0].payload.error, /Invalid message:received payload: modelMessages/);
});

test('returns route_error for malformed route invoke payloads', async () => {
  const client = createClient();
  const responses = [];
  const previousSend = client.send;
  client.send = (type, action, responsePayload, requestId) => {
    if (action === WS_ACTION.ROUTE_ERROR) {
      responses.push({
        type,
        action,
        payload: responsePayload,
        requestId,
      });
      return;
    }

    if (typeof previousSend === 'function') {
      previousSend(type, action, responsePayload, requestId);
    }
  };

  try {
    await client.handleRouteInvoke({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.ROUTE_INVOKE,
      requestId: 'req-invalid-route',
      payload: {
        request: {
          path: '/echo',
          method: 'TRACE',
          headers: {},
          query: {},
          body: null,
        },
        context: {
          source: 'http-route',
        },
      },
    });
  } finally {
    client.send = previousSend;
  }

  assert.equal(responses.length, 1);
  assert.match(responses[0].payload.error, /Invalid route invoke payload: request/);
});

test('returns execute_error for malformed execute payloads', async () => {
  const client = createClient();
  const responses = [];
  client.onCommand('echo', async () => 'ok');
  client.send = (type, action, responsePayload, requestId) => {
    if (action === WS_ACTION.EXECUTE_ERROR) {
      responses.push({
        type,
        action,
        payload: responsePayload,
        requestId,
      });
    }
  };

  await client.handleExecute({
    type: WS_TYPE.COMMAND,
    action: WS_ACTION.EXECUTE,
    requestId: 'req-invalid-execute',
    payload: {
      toolName: 'echo',
      params: 'not-an-object',
    },
  });

  assert.equal(responses.length, 1);
  assert.match(responses[0].payload.error, /Invalid execute payload: params/);
});

test('rejects host calls when host_result payload is malformed', async () => {
  const client = createClient();
  client.ws = {
    readyState: 1,
  };
  client.send = (type, action, payload, requestId) => {
    if (action !== WS_ACTION.HOST_CALL) {
      return;
    }

    queueMicrotask(() => {
      void client.handleMessage({
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_RESULT,
        requestId,
        payload: {
          invalid: true,
        },
      });
    });
  };

  const executionContext = client.createExecutionContext({
    source: 'plugin',
    conversationId: 'conv-1',
  });

  await assert.rejects(
    executionContext.host.getCurrentMessageTarget(),
    /Invalid host result payload/,
  );
});

test('returns hook_error when a message handler returns an invalid hook action', async () => {
  const client = createClient();
  client.onMessage(() => ({
    action: 'bogus',
  }));
  const responses = [];
  const previousSend = client.send;
  client.send = (type, action, responsePayload, requestId) => {
    if (action === WS_ACTION.HOOK_ERROR) {
      responses.push({
        type,
        action,
        payload: responsePayload,
        requestId,
      });
      return;
    }

    if (typeof previousSend === 'function') {
      previousSend(type, action, responsePayload, requestId);
    }
  };

  try {
    await client.handleHookInvoke({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_INVOKE,
      requestId: 'req-invalid-handler-result',
      payload: {
        hookName: 'message:received',
        context: {
          source: 'chat-hook',
          conversationId: 'conv-1',
        },
        payload: createMessagePayload('hello'),
      },
    });
  } finally {
    client.send = previousSend;
  }

  assert.equal(responses.length, 1);
  assert.match(responses[0].payload.error, /invalid hook action/i);
});

test('falls back to a broad hook descriptor when filters cannot be merged safely', () => {
  const client = createClient();
  client.command('ping', () => 'pong');
  client.onMessage(() => ({
    action: 'pass',
  }), {
    filter: {
      regex: '^hello$',
    },
  });

  const manifest = client.resolveManifest();
  const messageHook = manifest.hooks.find((hook) => hook.name === 'message:received');

  assert.ok(messageHook);
  assert.equal(messageHook.filter, undefined);
});

test('execution context exposes message target lookup and generic send host APIs', async () => {
  const client = createClient();
  const sent = [];

  client.ws = {
    readyState: 1,
  };
  client.send = (type, action, payload, requestId) => {
    sent.push({
      type,
      action,
      payload,
      requestId,
    });

    if (payload.method === 'message.target.current.get') {
      queueMicrotask(() => {
        void client.handleMessage({
          type: WS_TYPE.PLUGIN,
          action: WS_ACTION.HOST_RESULT,
          requestId,
          payload: {
            data: {
              type: 'conversation',
              id: 'conv-1',
              label: '当前会话',
            },
          },
        });
      });
      return;
    }

    if (payload.method === 'automation.event.emit') {
      queueMicrotask(() => {
        void client.handleMessage({
          type: WS_TYPE.PLUGIN,
          action: WS_ACTION.HOST_RESULT,
          requestId,
          payload: {
            data: {
              event: 'coffee.ready',
              matchedAutomationIds: ['automation-1'],
            },
          },
        });
      });
      return;
    }

    queueMicrotask(() => {
      void client.handleMessage({
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_RESULT,
        requestId,
        payload: {
          data: {
            id: 'assistant-message-plugin-1',
            target: {
              type: 'conversation',
              id: 'conv-2',
              label: '目标会话',
            },
            role: 'assistant',
            content: '插件补充回复',
            parts: [
              {
                type: 'text',
                text: '插件补充回复',
              },
            ],
            status: 'completed',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
        },
      });
    });
  };

  const executionContext = client.createExecutionContext({
    source: 'cron',
    conversationId: 'conv-1',
  });
  const currentTarget = await executionContext.host.getCurrentMessageTarget();
  const sentMessage = await executionContext.host.sendMessage({
    target: {
      type: 'conversation',
      id: 'conv-2',
    },
    content: '插件补充回复',
  });
  const emitted = await executionContext.host.emitAutomationEvent('coffee.ready');

  assert.deepEqual(currentTarget, {
    type: 'conversation',
    id: 'conv-1',
    label: '当前会话',
  });
  assert.deepEqual(sentMessage, {
    id: 'assistant-message-plugin-1',
    target: {
      type: 'conversation',
      id: 'conv-2',
      label: '目标会话',
    },
    role: 'assistant',
    content: '插件补充回复',
    parts: [
      {
        type: 'text',
        text: '插件补充回复',
      },
    ],
    status: 'completed',
    createdAt: '2026-03-28T10:00:00.000Z',
    updatedAt: '2026-03-28T10:00:00.000Z',
  });
  assert.deepEqual(emitted, {
    event: 'coffee.ready',
    matchedAutomationIds: ['automation-1'],
  });
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[0], {
    type: WS_TYPE.PLUGIN,
    action: WS_ACTION.HOST_CALL,
    payload: {
      method: 'message.target.current.get',
      params: {},
      context: {
        source: 'cron',
        conversationId: 'conv-1',
      },
    },
    requestId: sent[0].requestId,
  });
  assert.deepEqual(sent[1], {
    type: WS_TYPE.PLUGIN,
    action: WS_ACTION.HOST_CALL,
    payload: {
      method: 'message.send',
      params: {
        target: {
          type: 'conversation',
          id: 'conv-2',
        },
        content: '插件补充回复',
      },
      context: {
        source: 'cron',
        conversationId: 'conv-1',
      },
    },
    requestId: sent[1].requestId,
  });
  assert.deepEqual(sent[2], {
    type: WS_TYPE.PLUGIN,
    action: WS_ACTION.HOST_CALL,
    payload: {
      method: 'automation.event.emit',
      params: {
        event: 'coffee.ready',
      },
      context: {
        source: 'cron',
        conversationId: 'conv-1',
      },
    },
    requestId: sent[2].requestId,
  });
});

test('execution context exposes agent runtime style subagent host APIs', async () => {
  const client = createClient();
  const sent = installHostCallMock(client, {
    'subagent.spawn': () => ({
      conversationId: 'subagent-conversation-1',
      title: '总结当前对话',
      name: '总结分身',
      status: 'queued',
    }),
    'subagent.list': () => ([
      {
        description: '总结当前对话',
        conversationId: 'subagent-conversation-1',
        parentConversationId: 'conv-1',
        title: '总结当前对话',
        messageCount: 2,
        updatedAt: '2026-03-30T12:00:00.000Z',
        pluginId: 'plugin.sdk.test',
        pluginDisplayName: 'plugin.sdk.test',
        runtimeKind: 'remote',
        status: 'queued',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: null,
        finishedAt: null,
        closedAt: null,
      },
    ]),
    'subagent.get': () => ({
      description: '总结当前对话',
      conversationId: 'subagent-conversation-1',
      parentConversationId: 'conv-1',
      title: '总结当前对话',
      messageCount: 3,
      updatedAt: '2026-03-30T12:00:05.000Z',
      pluginId: 'plugin.sdk.test',
      pluginDisplayName: 'plugin.sdk.test',
      runtimeKind: 'remote',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台子代理总结',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: '2026-03-30T12:00:05.000Z',
      closedAt: null,
      request: {
        description: '总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
      },
      context: {
        source: 'plugin',
        conversationId: 'conv-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台子代理总结',
        message: {
          role: 'assistant',
          content: '这是后台子代理总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    }),
    'subagent.wait': () => ({
      conversationId: 'subagent-conversation-1',
      title: '总结当前对话',
      name: '总结分身',
      result: '这是后台子代理总结',
      status: 'completed',
    }),
    'subagent.send-input': () => ({
      conversationId: 'subagent-conversation-1',
      title: '继续总结',
      name: '继续总结分身',
      status: 'queued',
    }),
    'subagent.interrupt': () => ({
      conversationId: 'subagent-conversation-1',
      title: '继续总结',
      name: '继续总结分身',
      status: 'interrupted',
    }),
    'subagent.close': () => ({
      conversationId: 'subagent-conversation-1',
      title: '继续总结',
      name: '继续总结分身',
      status: 'closed',
    }),
  });

  const executionContext = client.createExecutionContext({
    source: 'plugin',
    conversationId: 'conv-1',
  });

  const startedSubagent = await executionContext.host.spawnSubagent({
    name: '总结分身',
    description: '总结当前对话',
    providerId: 'openai',
    modelId: 'gpt-5.2',
    messages: [
      {
        role: 'user',
        content: '请帮我总结当前对话',
      },
    ],
  });
  const listedSubagents = await executionContext.host.listSubagents();
  const loadedSubagent = await executionContext.host.getSubagent('subagent-conversation-1');
  const waitedSubagent = await executionContext.host.waitSubagent({
    conversationId: 'subagent-conversation-1',
    timeoutMs: 1000,
  });
  const continuedSubagent = await executionContext.host.sendInputSubagent({
    conversationId: 'subagent-conversation-1',
    name: '继续总结分身',
    description: '继续总结',
    messages: [
      {
        role: 'user',
        content: '再补充一句',
      },
    ],
  });
  const interruptedSubagent = await executionContext.host.interruptSubagent({
    conversationId: 'subagent-conversation-1',
  });
  const closedSubagent = await executionContext.host.closeSubagent({
    conversationId: 'subagent-conversation-1',
  });

  assert.equal(startedSubagent.conversationId, 'subagent-conversation-1');
  assert.equal(startedSubagent.status, 'queued');
  assert.equal(startedSubagent.name, '总结分身');
  assert.equal(listedSubagents.length, 1);
  assert.equal(loadedSubagent.status, 'completed');
  assert.equal(loadedSubagent.result.text, '这是后台子代理总结');
  assert.equal(waitedSubagent.status, 'completed');
  assert.equal(waitedSubagent.result, '这是后台子代理总结');
  assert.equal(continuedSubagent.status, 'queued');
  assert.equal(interruptedSubagent.status, 'interrupted');
  assert.equal(closedSubagent.status, 'closed');
  assert.equal(sent[0].payload.params.name, '总结分身');
  assert.equal(sent[0].payload.params.description, '总结当前对话');
  assert.equal(sent[4].payload.params.name, '继续总结分身');
  assert.equal(sent[4].payload.params.description, '继续总结');
  assert.deepEqual(
    sent.map((entry) => entry.payload.method),
    [
      'subagent.spawn',
      'subagent.list',
      'subagent.get',
      'subagent.wait',
      'subagent.send-input',
      'subagent.interrupt',
      'subagent.close',
    ],
  );
  assert.deepEqual(sent[2].payload.params, {
    conversationId: 'subagent-conversation-1',
  });
});

test('execution context exposes a conversation session controller helper', async () => {
  const client = createClient();
  let activeSession = createConversationSessionInfo();
  const sent = installHostCallMock(client, {
    'conversation.session.start': (params) => {
      activeSession = createConversationSessionInfo({
        timeoutMs: params.timeoutMs,
        captureHistory: Boolean(params.captureHistory),
        metadata: params.metadata,
      });
      return activeSession;
    },
    'conversation.session.get': () => activeSession,
    'conversation.session.keep': (params) => {
      activeSession = {
        ...activeSession,
        timeoutMs: params.timeoutMs,
        expiresAt: '2026-03-30T10:02:00.000Z',
      };
      return activeSession;
    },
    'conversation.session.finish': () => {
      activeSession = null;
      return true;
    },
  });

  const executionContext = client.createExecutionContext({
    source: 'chat-hook',
    conversationId: 'conv-1',
  });

  assert.ok(executionContext.host.conversationSession);

  const controller = executionContext.host.conversationSession;
  const started = await controller.start({
    timeoutMs: 60000,
    captureHistory: true,
    metadata: {
      step: 'profile-name',
    },
  });

  assert.equal(controller.conversationId, 'conv-1');
  assert.equal(controller.timeoutMs, 60000);
  assert.equal(controller.captureHistory, true);
  assert.deepEqual(controller.metadata, {
    step: 'profile-name',
  });
  assert.deepEqual(started, createConversationSessionInfo({
    captureHistory: true,
    metadata: {
      step: 'profile-name',
    },
  }));

  const kept = await controller.keep({
    timeoutMs: 90000,
    resetTimeout: true,
  });
  assert.equal(kept.timeoutMs, 90000);
  assert.equal(controller.expiresAt, '2026-03-30T10:02:00.000Z');

  const synced = await controller.sync();
  assert.equal(synced.timeoutMs, 90000);
  assert.equal(controller.session.timeoutMs, 90000);

  const finished = await controller.finish();
  assert.equal(finished, true);
  assert.equal(controller.session, null);
  assert.equal(controller.expiresAt, null);

  assert.deepEqual(
    sent.map((entry) => entry.payload.method),
    [
      'conversation.session.start',
      'conversation.session.keep',
      'conversation.session.get',
      'conversation.session.finish',
    ],
  );
});

test('sessionWaiter routes active session messages before the regular message pipeline', async () => {
  const client = createClient();
  const seen = [];
  let activeSession = createConversationSessionInfo({
    captureHistory: true,
    metadata: {
      step: 1,
    },
  });
  const sent = installHostCallMock(client, {
    'conversation.session.start': (params) => {
      activeSession = createConversationSessionInfo({
        timeoutMs: params.timeoutMs,
        captureHistory: Boolean(params.captureHistory),
        metadata: params.metadata,
      });
      return activeSession;
    },
    'conversation.session.keep': (params) => {
      activeSession = createConversationSessionInfo({
        timeoutMs: params.timeoutMs,
        captureHistory: true,
        metadata: {
          step: 2,
        },
        lastMatchedAt: '2026-03-30T10:00:30.000Z',
        historyMessages: [
          {
            role: 'user',
            content: '第二步',
            parts: [
              {
                type: 'text',
                text: '第二步',
              },
            ],
          },
        ],
      });
      return activeSession;
    },
  });

  client.onMessage((payload) => {
    seen.push(`fallback:${payload.message.content}`);
    return {
      action: 'short-circuit',
      assistantContent: `fallback:${payload.message.content}`,
    };
  });

  assert.equal(typeof client.sessionWaiter, 'function');
  const waiter = client.sessionWaiter(async (controller, payload) => {
    seen.push(`waiter:${payload.message.content}`);
    assert.equal(controller.conversationId, 'conv-1');
    assert.equal(controller.timeoutMs, 60000);
    assert.deepEqual(controller.metadata, {
      step: 1,
    });

    await controller.keep({
      timeoutMs: 45000,
      resetTimeout: true,
    });

    return {
      action: 'short-circuit',
      assistantContent: `waiter:${payload.message.content}`,
    };
  });

  const executionContext = client.createExecutionContext({
    source: 'chat-hook',
    conversationId: 'conv-1',
  });
  await waiter.start(executionContext, {
    timeoutMs: 60000,
    captureHistory: true,
    metadata: {
      step: 1,
    },
  });

  const response = await invokeMessageHook(client, {
    ...createMessagePayload('第二步'),
    session: createConversationSessionInfo({
      captureHistory: true,
      metadata: {
        step: 1,
      },
    }),
  });

  assert.equal(response.payload.data.assistantContent, 'waiter:第二步');
  assert.deepEqual(seen, ['waiter:第二步']);
  assert.deepEqual(
    sent.map((entry) => entry.payload.method),
    [
      'conversation.session.start',
      'conversation.session.keep',
    ],
  );
});

test('sessionWaiter unregisters after finish and later messages fall back to regular handlers', async () => {
  const client = createClient();
  let activeSession = createConversationSessionInfo();
  const sent = installHostCallMock(client, {
    'conversation.session.start': () => activeSession,
    'conversation.session.finish': () => {
      activeSession = null;
      return true;
    },
  });

  client.onMessage((payload) => ({
    action: 'short-circuit',
    assistantContent: `fallback:${payload.message.content}`,
  }));

  assert.equal(typeof client.sessionWaiter, 'function');
  const waiter = client.sessionWaiter(async (controller, payload) => {
    await controller.finish();
    return {
      action: 'short-circuit',
      assistantContent: `waiter:${payload.message.content}`,
    };
  });

  const executionContext = client.createExecutionContext({
    source: 'chat-hook',
    conversationId: 'conv-1',
  });
  await waiter.start(executionContext, {
    timeoutMs: 60000,
  });

  const first = await invokeMessageHook(client, {
    ...createMessagePayload('退出'),
    session: createConversationSessionInfo(),
  });
  assert.equal(first.payload.data.assistantContent, 'waiter:退出');

  const second = await invokeMessageHook(
    client,
    createMessagePayload('普通消息'),
  );
  assert.equal(second.payload.data.assistantContent, 'fallback:普通消息');
  assert.deepEqual(
    sent.map((entry) => entry.payload.method),
    [
      'conversation.session.start',
      'conversation.session.finish',
    ],
  );
});
