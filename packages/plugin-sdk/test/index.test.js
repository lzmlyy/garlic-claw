const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DeviceType,
  PluginClient,
} = require('../dist/index.js');

const WS_TYPE = {
  PLUGIN: 'plugin',
};

const WS_ACTION = {
  HOST_CALL: 'host_call',
  HOST_RESULT: 'host_result',
  HOOK_INVOKE: 'hook_invoke',
  HOOK_RESULT: 'hook_result',
};

function createClient(manifest = {}) {
  return new PluginClient({
    serverUrl: 'ws://localhost:23331',
    token: 'test-token',
    pluginName: 'plugin.sdk.test',
    deviceType: DeviceType.API,
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
