const test = require('node:test');
const assert = require('node:assert/strict');

test('root entry stays empty and forces curated subpaths', () => {
  const rootModule = require('../dist/index.js');

  assert.deepEqual(Object.keys(rootModule), []);
});
