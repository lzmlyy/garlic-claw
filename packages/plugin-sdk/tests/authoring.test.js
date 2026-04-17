const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildConversationTitlePrompt,
  createPluginAuthorTransportExecutor,
  readConversationSummary,
} = require('../dist/authoring/index.js');

test('authoring subpath exposes supported helper exports', () => {
  assert.equal(typeof createPluginAuthorTransportExecutor, 'function');
  assert.equal(typeof buildConversationTitlePrompt, 'function');
  assert.deepEqual(readConversationSummary({
    id: 'conv-1',
    title: '标题',
  }), {
    id: 'conv-1',
    title: '标题',
  });
});
