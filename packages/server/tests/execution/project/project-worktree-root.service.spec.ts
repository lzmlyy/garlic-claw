import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';

describe('ProjectWorktreeRootService', () => {
  let originalProjectWorktreePath: string | undefined;
  let service: ProjectWorktreeRootService;
  let tempRoot: string;

  beforeEach(() => {
    originalProjectWorktreePath = process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH;
    service = new ProjectWorktreeRootService();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'garlic-claw-project-root-'));
  });

  afterEach(() => {
    if (originalProjectWorktreePath === undefined) {
      delete process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH;
    } else {
      process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH = originalProjectWorktreePath;
    }
    fs.rmSync(tempRoot, { force: true, recursive: true });
  });

  it('findRoot returns nearest worktree root', () => {
    const projectRoot = path.join(tempRoot, 'repo');
    const nestedRoot = path.join(projectRoot, 'packages', 'server', 'src', 'nested');
    fs.mkdirSync(nestedRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'packages', 'server'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'packages', 'server', 'package.json'), '{}', 'utf8');

    expect(service.findRoot(nestedRoot)).toBe(projectRoot);
  });

  it('resolveRoot prefers the nearest project root from the provided path', () => {
    const projectRoot = path.join(tempRoot, 'repo');
    const nestedRoot = path.join(projectRoot, 'packages', 'server', 'src', 'nested');
    fs.mkdirSync(nestedRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'packages', 'server'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'packages', 'server', 'package.json'), '{}', 'utf8');

    expect(service.resolveRoot(nestedRoot)).toBe(projectRoot);
  });

  it('resolveRoot prefers explicit environment override', () => {
    const configuredRoot = path.join(tempRoot, 'configured-root');
    fs.mkdirSync(configuredRoot, { recursive: true });
    process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH = configuredRoot;

    expect(service.resolveRoot(path.join(tempRoot, 'other'))).toBe(path.resolve(configuredRoot));
  });
});
