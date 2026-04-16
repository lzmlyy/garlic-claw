const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalCommandPath,
  buildCommandVariants,
  normalizeCommandAliases,
  normalizeCommandSegment,
  renderCommandGroupHelp,
} = require('../dist/utils/command-match.js');
const {
  matchesMessageFilter,
  normalizePriority,
} = require('../dist/utils/message-filter.js');
const {
  normalizeRoutePath,
  normalizeRouteResponse,
} = require('../dist/utils/route.js');

test('command utilities normalize aliases and render command group help', () => {
  assert.equal(normalizeCommandSegment('/hello'), 'hello');
  assert.deepEqual(normalizeCommandAliases(['foo', '/foo', 'bar']), ['foo', 'bar']);
  assert.equal(buildCanonicalCommandPath(['gc', 'ping']), '/gc ping');
  assert.deepEqual(buildCommandVariants([{ segment: 'gc', aliases: ['garlic'] }, { segment: 'ping', aliases: [] }]), ['/gc ping', '/garlic ping']);
  assert.equal(renderCommandGroupHelp({
    aliases: ['garlic'],
    canonicalCommand: '/gc',
    children: [],
    commands: [{ description: 'ping command', path: ['gc', 'ping'], variants: ['/gc ping', '/garlic ping'] }],
    segment: 'gc',
  }), '/gc\n├── ping: ping command');
});

test('message filter utilities match command, regex, and message kind', () => {
  const payload = {
    context: { source: 'plugin' },
    conversationId: 'conversation-1',
    message: {
      content: null,
      parts: [{ text: '/ping now', type: 'text' }],
      role: 'user',
    },
    modelId: 'gpt-5.4',
    modelMessages: [{ content: '/ping now', role: 'user' }],
    providerId: 'openai',
  };

  assert.equal(normalizePriority(1.8), 1);
  assert.equal(normalizePriority(NaN), 0);
  assert.equal(matchesMessageFilter(payload, { commands: ['/ping'] }), true);
  assert.equal(matchesMessageFilter(payload, { regex: { pattern: '^/ping', flags: '' } }), true);
  assert.equal(matchesMessageFilter(payload, { messageKinds: ['text'] }), true);
  assert.equal(matchesMessageFilter(payload, { commands: ['/pong'] }), false);
});

test('route utilities normalize paths and default response status', () => {
  assert.equal(normalizeRoutePath('/api/ping/'), 'api/ping');
  assert.deepEqual(normalizeRouteResponse({ body: { ok: true } }), { body: { ok: true }, headers: undefined, status: 200 });
});
