const test = require('node:test');
const assert = require('node:assert/strict');

test('client subpath exposes PluginClient', async () => {
  const clientModule = require('../dist/client/index.js');

  assert.equal(typeof clientModule.PluginClient, 'function');
  assert.equal(typeof clientModule.PluginClient.fromBootstrap, 'function');
});
