import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { ProjectWorktreeSearchOverlayService } from '../../../src/modules/execution/project/project-worktree-search-overlay.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

describe('ProjectWorktreeSearchOverlayService', () => {
  const originalWorkspaceRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
  const runtimeWorkspaceRoots: string[] = [];

  afterEach(() => {
    if (originalWorkspaceRoot === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = originalWorkspaceRoot;
    }
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (nextRoot && fs.existsSync(nextRoot)) {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      }
    }
  });

  it('renders project-relative base and next-read overlays when the runtime workspace looks like a project', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-project-overlay-'));
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new ProjectWorktreeSearchOverlayService(
      runtimeSessionEnvironmentService,
      new ProjectWorktreeRootService(),
    );
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-project-overlay');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'packages', 'server', 'src'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'packages', 'server', 'package.json'), '{}', 'utf8');
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'packages', 'server', 'src', 'demo.ts'),
      'export const demo = 1;\n',
      'utf8',
    );

    await expect(service.buildSearchOverlay({
      basePath: '/packages/server/src',
      matches: [
        '/packages/server/src/internal/deep-demo.ts',
        '/packages/server/src/demo.ts',
      ],
      sessionId: 'session-project-overlay',
    })).resolves.toEqual([
      'Project Base: packages/server/src',
      'Project Next Read: packages/server/src/demo.ts',
    ]);
  });

  it('returns no overlay when the runtime workspace is not a project worktree', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-no-project-overlay-'));
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new ProjectWorktreeSearchOverlayService(
      runtimeSessionEnvironmentService,
      new ProjectWorktreeRootService(),
    );
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-no-project-overlay');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'demo.ts'), 'export const demo = 1;\n', 'utf8');

    await expect(service.buildSearchOverlay({
      basePath: '/docs',
      matches: ['/docs/demo.ts'],
      sessionId: 'session-no-project-overlay',
    })).resolves.toEqual([]);
  });
});
