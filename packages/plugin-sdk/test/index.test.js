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

async function invokeMessageHook(client, payload) {
  const responses = [];
  client.send = (type, action, responsePayload, requestId) => {
    responses.push({
      type,
      action,
      payload: responsePayload,
      requestId,
    });
  };

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
