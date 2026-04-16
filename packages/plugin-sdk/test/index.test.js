const test = require('node:test');
const assert = require('node:assert/strict');

const DEVICE_TYPE = {
  API: 'api',
  BUILTIN: 'builtin',
  IOT: 'iot',
  MOBILE: 'mobile',
  PC: 'pc',
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
  CONVERSATION_TITLE_CONFIG_FIELDS,
  CONVERSATION_TITLE_DEFAULT_TITLE,
  CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
  KB_CONTEXT_CONFIG_FIELDS,
  KB_CONTEXT_DEFAULT_LIMIT,
  KB_CONTEXT_DEFAULT_PROMPT_PREFIX,
  MEMORY_CONTEXT_CONFIG_FIELDS,
  MEMORY_CONTEXT_DEFAULT_LIMIT,
  MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
  buildMessageLifecycleSummary,
  buildMessageReceivedSummary,
  buildResponseSendSummary,
  buildToolAuditSummary,
  buildWaitingModelSummary,
  clipContextText,
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
  parseCommaSeparatedNames,
  persistPluginObservation,
  readCurrentPersonaInfo,
  readCurrentProviderInfo,
  readPluginCreateAutomationParams,
  readBooleanFlag,
  readConversationMessages,
  readPersonaRouterConfig,
  readPersonaSummaryInfo,
  PERSONA_ROUTER_CONFIG_FIELDS,
  PROVIDER_ROUTER_CONFIG_FIELDS,
  PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY,
  readConversationSummary,
  readConversationTitleConfig,
  readMemorySearchResults,
  readMemorySaveResultId,
  readOptionalObjectParam,
  readPromptBlockConfig,
  readProviderRouterConfig,
  resolveConversationTitleRuntimeConfig,
  readOptionalStringParam,
  readPluginHookPayload,
  readJsonObjectValue,
  readLatestUserTextFromMessages,
  readRequiredStringParam,
  readRequiredTextValue,
  resolvePromptBlockConfig,
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
    serverUrl: 'ws://localhost:23331',
    token: 'test-token',
    pluginName: 'plugin.sdk.test',
    deviceType: DEVICE_TYPE.API,
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

test('PluginClient.fromBootstrap creates a client directly from bootstrap connection info', () => {
  const client = PluginClient.fromBootstrap({
    pluginName: 'remote.pc-host',
    deviceType: DEVICE_TYPE.API,
    serverUrl: 'ws://127.0.0.1:23331',
    token: 'remote-bootstrap-token',
    tokenExpiresIn: '30d',
  }, {
    manifest: {
      name: 'Remote PC Host',
      version: '1.0.0',
      permissions: [],
      tools: [],
    },
  });

  assert.equal(client.options.serverUrl, 'ws://127.0.0.1:23331');
  assert.equal(client.options.token, 'remote-bootstrap-token');
  assert.equal(client.options.pluginName, 'remote.pc-host');
  assert.equal(client.options.deviceType, DEVICE_TYPE.API);
  assert.deepEqual(client.resolveManifest(), {
    id: 'remote.pc-host',
    name: 'Remote PC Host',
    version: '1.0.0',
    runtime: 'remote',
    description: undefined,
    permissions: [],
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
      kind: 'call',
      method: 'llm.generate-text',
      params: {
        prompt: 'ping',
        maxOutputTokens: 64,
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

test('createPluginAuthorTransportExecutor runs author definitions with shared route normalization and governance actions', async () => {
  const seen = [];
  const executor = createPluginAuthorTransportExecutor({
    definition: {
      manifest: {
        id: 'plugin.sdk.author-transport',
        name: 'Author Transport',
        version: '1.0.0',
        runtime: 'builtin',
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

test('plugin-sdk exposes shared author-side text helpers for builtin plugins', () => {
  assert.equal(
    readLatestUserTextFromMessages([
      {
        role: 'system',
        content: 'system',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '第一句',
          },
          {
            type: 'image',
            imageUrl: 'https://example.com/a.png',
          },
          {
            type: 'text',
            text: '第二句',
          },
        ],
      },
    ]),
    '第一句\n第二句',
  );
  assert.equal(
    readLatestUserTextFromMessages([
      {
        role: 'assistant',
        content: 'assistant',
      },
    ]),
    '',
  );
  assert.equal(sanitizeOptionalText('  hello  '), 'hello');
  assert.equal(sanitizeOptionalText(undefined), '');
  assert.deepEqual(
    readPromptBlockConfig({
      limit: 4,
      promptPrefix: '相关知识',
    }),
    {
      limit: 4,
      promptPrefix: '相关知识',
    },
  );
  assert.deepEqual(parseCommaSeparatedNames(' alpha, beta ,, gamma '), [
    'alpha',
    'beta',
    'gamma',
  ]);
  assert.equal(parseCommaSeparatedNames('   '), undefined);
  assert.deepEqual(
    filterAllowedToolNames(['beta', 'gamma'], ['alpha', 'beta', 'gamma']),
    ['beta', 'gamma'],
  );
  assert.equal(filterAllowedToolNames(undefined, ['alpha']), null);
  assert.equal(sameToolNames(['alpha', 'beta'], ['alpha', 'beta']), true);
  assert.equal(sameToolNames(['alpha'], ['beta']), false);
  assert.equal(clipContextText('  short text  '), 'short text');
  assert.equal(clipContextText('a'.repeat(250)).length, 240);
  assert.equal(textIncludesKeyword('请直接回复 #fast', '#fast'), true);
  assert.equal(textIncludesKeyword('普通消息', ' #fast '), false);
  assert.deepEqual(
    resolvePromptBlockConfig({}, {
      limit: MEMORY_CONTEXT_DEFAULT_LIMIT,
      promptPrefix: MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
    }),
    {
      limit: MEMORY_CONTEXT_DEFAULT_LIMIT,
      promptPrefix: MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
    },
  );
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
      defaultTitle: 'New Chat',
      maxMessages: 6,
    }),
    {
      defaultTitle: 'New Chat',
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
      targetProviderId: 'anthropic',
      targetModelId: 'claude-3-7-sonnet',
      allowedToolNames: 'recall_memory',
      shortCircuitKeyword: '#fast',
      shortCircuitReply: '直接回复',
    }),
    {
      targetProviderId: 'anthropic',
      targetModelId: 'claude-3-7-sonnet',
      allowedToolNames: 'recall_memory',
      shortCircuitKeyword: '#fast',
      shortCircuitReply: '直接回复',
    },
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
  assert.equal(shouldGenerateConversationTitle(' New Chat ', 'New Chat'), true);
  assert.equal(shouldGenerateConversationTitle('已生成标题', 'New Chat'), false);
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

test('execution context exposes background subagent task host APIs', async () => {
  const client = createClient();
  const sent = installHostCallMock(client, {
    'subagent.task.start': () => ({
      id: 'subagent-task-1',
      pluginId: 'plugin.sdk.test',
      pluginDisplayName: 'plugin.sdk.test',
      runtimeKind: 'remote',
      status: 'queued',
      requestPreview: '请帮我总结当前对话',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackStatus: 'pending',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    }),
    'subagent.task.list': () => ([
      {
        id: 'subagent-task-1',
        pluginId: 'plugin.sdk.test',
        pluginDisplayName: 'plugin.sdk.test',
        runtimeKind: 'remote',
        status: 'queued',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: null,
        finishedAt: null,
      },
    ]),
    'subagent.task.get': () => ({
      id: 'subagent-task-1',
      pluginId: 'plugin.sdk.test',
      pluginDisplayName: 'plugin.sdk.test',
      runtimeKind: 'remote',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台任务总结',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackStatus: 'sent',
      writeBackMessageId: 'assistant-message-1',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: '2026-03-30T12:00:05.000Z',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
      context: {
        source: 'plugin',
        conversationId: 'conv-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台任务总结',
        message: {
          role: 'assistant',
          content: '这是后台任务总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    }),
  });

  const executionContext = client.createExecutionContext({
    source: 'plugin',
    conversationId: 'conv-1',
  });

  const startedTask = await executionContext.host.startSubagentTask({
    providerId: 'openai',
    modelId: 'gpt-5.2',
    messages: [
      {
        role: 'user',
        content: '请帮我总结当前对话',
      },
    ],
    maxSteps: 4,
    writeBack: {
      target: {
        type: 'conversation',
        id: 'conv-1',
      },
    },
  });
  const listedTasks = await executionContext.host.listSubagentTasks();
  const loadedTask = await executionContext.host.getSubagentTask('subagent-task-1');

  assert.equal(startedTask.status, 'queued');
  assert.equal(listedTasks.length, 1);
  assert.equal(loadedTask.status, 'completed');
  assert.equal(loadedTask.result.text, '这是后台任务总结');
  assert.deepEqual(
    sent.map((entry) => entry.payload.method),
    [
      'subagent.task.start',
      'subagent.task.list',
      'subagent.task.get',
    ],
  );
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
