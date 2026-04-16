const test = require('node:test');
const assert = require('node:assert/strict');

const hostModule = require('../dist/host/index.js');
const {
  buildPluginMessageSendParams,
  buildPluginRegisterCronParams,
  toScopedStateParams,
} = require('../dist/host/facade-payload.helpers.js');
const { createPluginHostFacade, toHostJsonValue } = hostModule;

test('host subpath only exposes stable facade surface', async () => {
  const calls = [];
  const host = createPluginHostFacade({
    call(method, params) {
      calls.push({ kind: 'call', method, params });
      return Promise.resolve({ ok: true });
    },
    callHost(method, params = {}) {
      calls.push({ kind: 'callHost', method, params });
      return Promise.resolve({ ok: true });
    },
  });

  assert.equal('buildPluginMessageSendParams' in hostModule, false);
  assert.equal('buildPluginRegisterCronParams' in hostModule, false);
  assert.equal('toScopedStateParams' in hostModule, false);

  await host.sendMessage({
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conv-1',
    },
  });

  assert.deepEqual(buildPluginMessageSendParams({
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conv-1',
    },
  }), {
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conv-1',
    },
  });
  assert.deepEqual(buildPluginRegisterCronParams({
    name: 'heartbeat',
    cron: '10s',
  }), {
    name: 'heartbeat',
    cron: '10s',
  });
  assert.deepEqual(toScopedStateParams({ scope: 'conversation' }), {
    scope: 'conversation',
  });
  assert.deepEqual(toHostJsonValue({
    foo: undefined,
    bar: ['x', undefined, 1],
  }), {
    bar: ['x', 1],
  });
  assert.deepEqual(calls[0], {
    kind: 'callHost',
    method: 'message.send',
    params: {
      content: 'hello',
      target: {
        type: 'conversation',
        id: 'conv-1',
      },
    },
  });
});
