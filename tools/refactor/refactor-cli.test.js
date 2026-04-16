const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI_PATH = path.join(REPO_ROOT, 'tools', 'refactor', 'cli.js');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'tools', 'refactor', 'fixtures');

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  return {
    ...result,
    report: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test('root package.json exposes all stage-0A repo scripts', () => {
  const packageJson = require(PACKAGE_JSON_PATH);
  const scriptNames = [
    'repo:refactor-metrics',
    'repo:exports-guard',
    'repo:forbidden-imports',
    'repo:consumer-check',
    'repo:module-allowlists',
    'repo:ws-contract',
    'repo:zero-legacy-refs',
  ];

  for (const scriptName of scriptNames) {
    assert.equal(typeof packageJson.scripts?.[scriptName], 'string');
  }
});

test('refactor-metrics summarizes configured package metrics', () => {
  const fixturePath = path.join(FIXTURE_ROOT, 'shared-compliant');
  const result = runCli(['refactor-metrics', '--workspace', fixturePath]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
  assert.equal(result.report.packages['packages/shared'].totalLines > 0, true);
  assert.equal(result.report.imports.shared.classCounts.root > 0, true);
});

test('exports-guard enforces shared exports allowlist', () => {
  const compliantFixturePath = path.join(FIXTURE_ROOT, 'shared-compliant');
  const passResult = runCli([
    'exports-guard',
    '--scope',
    'shared',
    '--workspace',
    compliantFixturePath,
  ]);

  assert.equal(passResult.status, 0);
  assert.equal(passResult.report.status, 'pass');

  const violatingFixturePath = path.join(FIXTURE_ROOT, 'shared-violations');
  const failResult = runCli([
    'exports-guard',
    '--scope',
    'shared',
    '--workspace',
    violatingFixturePath,
  ]);

  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.report.status, 'fail');
  assert.equal(failResult.report.violations.some((entry) => entry.kind === 'exports'), true);
});

test('forbidden-imports rejects shared source-path bypasses', () => {
  const compliantFixturePath = path.join(FIXTURE_ROOT, 'shared-compliant');
  const passResult = runCli([
    'forbidden-imports',
    '--scope',
    'shared-source-paths',
    '--workspace',
    compliantFixturePath,
  ]);

  assert.equal(passResult.status, 0);
  assert.equal(passResult.report.status, 'pass');

  const violatingFixturePath = path.join(FIXTURE_ROOT, 'shared-violations');
  const failResult = runCli([
    'forbidden-imports',
    '--scope',
    'shared-source-paths',
    '--workspace',
    violatingFixturePath,
  ]);

  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.report.status, 'fail');
  assert.equal(failResult.report.violations.some((entry) => entry.kind === 'tsconfig-path'), true);
  assert.equal(failResult.report.violations.some((entry) => entry.kind === 'import'), true);
});

test('consumer-check only allows the shared root public surface', () => {
  const compliantFixturePath = path.join(FIXTURE_ROOT, 'shared-compliant');
  const passResult = runCli([
    'consumer-check',
    '--scope',
    'shared-public-surface',
    '--workspace',
    compliantFixturePath,
  ]);

  assert.equal(passResult.status, 0);
  assert.equal(passResult.report.status, 'pass');
  assert.equal(passResult.report.consumers.length, 4);

  const violatingFixturePath = path.join(FIXTURE_ROOT, 'shared-violations');
  const failResult = runCli([
    'consumer-check',
    '--scope',
    'shared-public-surface',
    '--workspace',
    violatingFixturePath,
  ]);

  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.report.status, 'fail');
  assert.equal(
    failResult.report.violations.some(
      (entry) => entry.kind === 'consumer-import' && entry.specifier === '@garlic-claw/shared/private',
    ),
    true,
  );
});

test('zero-legacy-refs rejects shared runtime helpers and barrel leaks', () => {
  const compliantFixturePath = path.join(FIXTURE_ROOT, 'shared-compliant');
  const passResult = runCli([
    'zero-legacy-refs',
    '--scope',
    'shared-runtime-helpers',
    '--workspace',
    compliantFixturePath,
  ]);

  assert.equal(passResult.status, 0);
  assert.equal(passResult.report.status, 'pass');

  const violatingFixturePath = path.join(FIXTURE_ROOT, 'shared-violations');
  const failResult = runCli([
    'zero-legacy-refs',
    '--scope',
    'shared-runtime-helpers',
    '--workspace',
    violatingFixturePath,
  ]);

  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.report.status, 'fail');
  assert.equal(
    failResult.report.violations.some((entry) => entry.kind === 'path'),
    true,
  );
  assert.equal(
    failResult.report.violations.some((entry) => entry.kind === 'index-export'),
    true,
  );
});

test('zero-legacy-refs rejects stale path references inside tracked docs', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-zero-legacy-'));
  fs.mkdirSync(path.join(workspace, 'tools', 'refactor', 'config'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'tools', 'refactor', 'config', 'zero-legacy-refs.config.json'), JSON.stringify({
    scopes: {
      docs: {
        forbiddenTextMatches: [{
          file: 'docs/spec.md',
          needles: ['packages/server/src/legacy.ts'],
        }],
      },
    },
  }, null, 2));
  fs.writeFileSync(path.join(workspace, 'docs', 'spec.md'), 'still mentions packages/server/src/legacy.ts\n', 'utf8');

  const result = runCli(['zero-legacy-refs', '--scope', 'docs', '--workspace', workspace]);

  assert.notEqual(result.status, 0);
  assert.equal(result.report.status, 'fail');
  assert.equal(result.report.violations.some((entry) => entry.kind === 'text-match'), true);
  fs.rmSync(workspace, { force: true, recursive: true });
});

test('module-allowlists enforces plugin runtime imports, exports, and ModuleRef tokens', () => {
  const compliantFixturePath = path.join(FIXTURE_ROOT, 'plugin-runtime-compliant');
  const passResult = runCli([
    'module-allowlists',
    '--scope',
    'plugin-runtime',
    '--workspace',
    compliantFixturePath,
  ]);

  assert.equal(passResult.status, 0);
  assert.equal(passResult.report.status, 'pass');

  const violatingFixturePath = path.join(FIXTURE_ROOT, 'plugin-runtime-violations');
  const failResult = runCli([
    'module-allowlists',
    '--scope',
    'plugin-runtime',
    '--workspace',
    violatingFixturePath,
  ]);

  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.report.status, 'fail');
  assert.equal(
    failResult.report.violations.some((entry) => entry.kind === 'module-export'),
    true,
  );
  assert.equal(
    failResult.report.violations.some((entry) => entry.kind === 'module-ref-token' || entry.kind === 'module-ref-string-token'),
    true,
  );
});

test('ws-contract enforces websocket constants and contract fixture coverage', () => {
  const compliantFixturePath = path.join(FIXTURE_ROOT, 'plugin-runtime-compliant');
  const passResult = runCli([
    'ws-contract',
    '--scope',
    'plugin-runtime',
    '--workspace',
    compliantFixturePath,
  ]);

  assert.equal(passResult.status, 0);
  assert.equal(passResult.report.status, 'pass');

  const violatingFixturePath = path.join(FIXTURE_ROOT, 'plugin-runtime-violations');
  const failResult = runCli([
    'ws-contract',
    '--scope',
    'plugin-runtime',
    '--workspace',
    violatingFixturePath,
  ]);

  assert.notEqual(failResult.status, 0);
  assert.equal(failResult.report.status, 'fail');
  assert.equal(
    failResult.report.violations.some((entry) => entry.kind === 'contract-value' || entry.kind === 'required-substring'),
    true,
  );
});

test('current workspace passes shared exports guard', () => {
  const result = runCli([
    'exports-guard',
    '--scope',
    'shared',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace has no shared source-path bypasses', () => {
  const result = runCli([
    'forbidden-imports',
    '--scope',
    'shared-source-paths',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace passes server forbidden imports gate', () => {
  const result = runCli([
    'forbidden-imports',
    '--scope',
    'server',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace rejects plugin-sdk bare root imports', () => {
  const result = runCli([
    'forbidden-imports',
    '--scope',
    'plugin-sdk-root-bare-imports',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace passes chat-ai owner forbidden imports gate', () => {
  const result = runCli([
    'forbidden-imports',
    '--scope',
    'chat-ai-owner-freeze',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace passes chat-kernel forbidden imports gate', () => {
  const result = runCli([
    'forbidden-imports',
    '--scope',
    'chat-kernel',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace passes ai-kernel forbidden imports gate', () => {
  const result = runCli([
    'forbidden-imports',
    '--scope',
    'ai-kernel',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace has no shared runtime helper leftovers', () => {
  const result = runCli([
    'zero-legacy-refs',
    '--scope',
    'shared-runtime-helpers',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace passes server cutover zero-legacy gate', () => {
  const result = runCli([
    'zero-legacy-refs',
    '--scope',
    'server-cutover',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('current workspace passes plugin runtime module allowlists', () => {
  const scopes = ['server', 'server-plugin-runtime', 'server-execution-domains'];

  for (const scope of scopes) {
    const result = runCli([
      'module-allowlists',
      '--scope',
      scope,
      '--workspace',
      REPO_ROOT,
    ]);

    assert.equal(result.status, 0);
    assert.equal(result.report.status, 'pass');
  }
});

test('current workspace passes websocket contract gate', () => {
  const result = runCli([
    'ws-contract',
    '--scope',
    'server',
    '--workspace',
    REPO_ROOT,
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.report.status, 'pass');
});

test('ws-contract rejects commented and skipped pattern matches', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-ws-contract-'));
  fs.mkdirSync(path.join(workspace, 'tools', 'refactor', 'config'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'tools', 'refactor', 'config', 'ws-contract.config.json'), JSON.stringify({
    scopes: {
      test: {
        requiredSubstrings: [{
          file: 'src/sample.ts',
          patterns: ['important pattern'],
        }],
      },
    },
  }, null, 2));
  fs.writeFileSync(path.join(workspace, 'src', 'sample.ts'), [
    '// important pattern',
    "it.skip('important pattern', () => {});",
  ].join('\n'), 'utf8');

  const result = runCli(['ws-contract', '--scope', 'test', '--workspace', workspace]);

  assert.notEqual(result.status, 0);
  assert.equal(result.report.status, 'fail');
  assert.equal(result.report.violations.some((entry) => entry.kind === 'required-substring'), true);
  fs.rmSync(workspace, { force: true, recursive: true });
});
