import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ProjectWorktreeFileService } from '../../../src/modules/execution/project/project-worktree-file.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';

describe('ProjectWorktreeFileService', () => {
  let originalCwd: string;
  let tempRoot: string;
  let projectRoot: string;
  let service: ProjectWorktreeFileService;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'garlic-claw-project-worktree-'));
    projectRoot = path.join(tempRoot, 'repo');
    fs.mkdirSync(path.join(projectRoot, 'packages', 'server'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'packages', 'server', 'package.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    process.chdir(projectRoot);
    service = new ProjectWorktreeFileService(new ProjectWorktreeRootService());
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempRoot, { force: true, recursive: true });
  });

  it('resolves relative paths inside project root', async () => {
    fs.writeFileSync(path.join(projectRoot, 'src', 'demo.ts'), 'export const demo = 1;\n', 'utf8');

    const result = await service.resolvePath('src/demo.ts');

    expect(result.exists).toBe(true);
    expect(result.type).toBe('file');
    expect(result.relativePath).toBe('src/demo.ts');
    expect(result.absolutePath).toBe(path.join(projectRoot, 'src', 'demo.ts'));
  });

  it('rejects paths outside project root', async () => {
    await expect(service.resolvePath('../outside.txt')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads and writes project files', async () => {
    const writeResult = await service.writeTextFile('src/new-file.ts', 'export const value = 1;\n');
    const readResult = await service.readTextFile('src/new-file.ts');

    expect(writeResult.created).toBe(true);
    expect(writeResult.path).toBe('src/new-file.ts');
    expect(readResult.path).toBe('src/new-file.ts');
    expect(readResult.content).toBe('export const value = 1;\n');
  });

  it('edits project files with replaceAll support', async () => {
    fs.writeFileSync(path.join(projectRoot, 'src', 'edit.txt'), 'alpha\nalpha\n', 'utf8');

    const editResult = await service.editTextFile({
      filePath: 'src/edit.txt',
      newString: 'beta',
      oldString: 'alpha',
      replaceAll: true,
    });

    expect(editResult.occurrences).toBe(2);
    expect(fs.readFileSync(path.join(projectRoot, 'src', 'edit.txt'), 'utf8')).toBe('beta\nbeta\n');
  });

  it('lists files under nested directories', async () => {
    fs.mkdirSync(path.join(projectRoot, 'src', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'nested', 'a.ts'), 'a\n', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'src', 'nested', 'b.ts'), 'b\n', 'utf8');

    const result = await service.listFiles('src');

    expect(result.basePath).toBe('src');
    expect(result.files.map((entry) => entry.relativePath)).toEqual([
      'src/nested/a.ts',
      'src/nested/b.ts',
    ]);
  });
});
