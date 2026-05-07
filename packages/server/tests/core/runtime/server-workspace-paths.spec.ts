import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createServerTestArtifactPath,
  deleteServerLegacyPackageTmpRoot,
  deleteServerTestArtifactsRoot,
  resolveServerLegacyPackageTmpRoot,
  resolveServerRuntimeWorkspaceRoot,
  resolveServerStatePath,
  resolveServerTestArtifactsRoot,
  resolveServerWorkspaceRoot,
} from '../../../src/core/runtime/server-workspace-paths';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

describe('server-workspace-paths', () => {
  const originalCwd = process.cwd();
  const originalWorkspaceRoot = process.env.GARLIC_CLAW_WORKSPACE_ROOT;
  const originalRuntimeWorkspaceRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-server-workspace-paths-'));
    fs.mkdirSync(path.join(repoRoot, 'packages', 'server'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'packages', 'server', 'package.json'), JSON.stringify({ name: 'gc-test-server' }), 'utf-8');
    fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ name: 'gc-test-root' }), 'utf-8');
    process.chdir(path.join(repoRoot, 'packages', 'server'));
    delete process.env.GARLIC_CLAW_WORKSPACE_ROOT;
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalWorkspaceRoot === undefined) {
      delete process.env.GARLIC_CLAW_WORKSPACE_ROOT;
    } else {
      process.env.GARLIC_CLAW_WORKSPACE_ROOT = originalWorkspaceRoot;
    }
    if (originalRuntimeWorkspaceRoot === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = originalRuntimeWorkspaceRoot;
    }
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  it('resolves workspace-scoped default roots from the repository root', () => {
    expect(resolveServerWorkspaceRoot()).toBe(path.join(repoRoot, 'workspace'));
    expect(resolveServerRuntimeWorkspaceRoot()).toBe(path.join(repoRoot, 'workspace', 'runtime-workspaces'));
    expect(resolveServerStatePath('conversations.server.json')).toBe(path.join(repoRoot, 'workspace', 'server-state', 'conversations.server.json'));
    expect(resolveServerTestArtifactsRoot()).toBe(path.join(repoRoot, 'workspace', 'test-artifacts'));
    expect(resolveServerLegacyPackageTmpRoot()).toBe(path.join(repoRoot, 'packages', 'server', 'tmp'));
  });

  it('lets environment variables override workspace defaults', () => {
    process.env.GARLIC_CLAW_WORKSPACE_ROOT = path.join(repoRoot, '.workspace-override');
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = path.join(repoRoot, '.runtime-override');

    expect(resolveServerWorkspaceRoot()).toBe(path.join(repoRoot, '.workspace-override'));
    expect(resolveServerRuntimeWorkspaceRoot()).toBe(path.join(repoRoot, '.runtime-override'));
  });

  it('creates jest artifact paths under workspace/test-artifacts', () => {
    const filePath = createServerTestArtifactPath({
      extension: '.json',
      prefix: 'runtime-tools.test',
      subdirectory: 'server',
    });

    expect(filePath).toContain(path.join(repoRoot, 'workspace', 'test-artifacts', 'server'));
    expect(filePath).toContain(`process-${process.pid}`);
  });

  it('deletes the legacy tmp root and test artifact root', () => {
    const legacyFilePath = path.join(resolveServerLegacyPackageTmpRoot(), 'legacy.txt');
    const artifactFilePath = path.join(resolveServerTestArtifactsRoot(), 'artifact.txt');
    fs.mkdirSync(path.dirname(legacyFilePath), { recursive: true });
    fs.mkdirSync(path.dirname(artifactFilePath), { recursive: true });
    fs.writeFileSync(legacyFilePath, 'legacy', 'utf-8');
    fs.writeFileSync(artifactFilePath, 'artifact', 'utf-8');

    deleteServerLegacyPackageTmpRoot();
    deleteServerTestArtifactsRoot();

    expect(fs.existsSync(resolveServerLegacyPackageTmpRoot())).toBe(false);
    expect(fs.existsSync(resolveServerTestArtifactsRoot())).toBe(false);
  });

  it('reclaims empty runtime session directories after tool cleanup', async () => {
    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-empty');

    expect(fs.existsSync(sessionEnvironment.sessionRoot)).toBe(true);

    await runtimeSessionEnvironmentService.deleteSessionEnvironmentIfEmpty('session-empty');

    expect(fs.existsSync(sessionEnvironment.sessionRoot)).toBe(false);
  });
});
