import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HostFilesystemBackendService } from '../../../src/modules/execution/file/host-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

describe('HostFilesystemBackendService', () => {
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
      if (!nextRoot) {
        continue;
      }
      fs.rmSync(nextRoot, { force: true, recursive: true });
    }
  });

  it('supports resolve, stat, directory, copy, move, delete and symlink operations', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-workspace-file-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-1');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'source.txt'),
      'source\n',
      'utf8',
    );

    await expect(service.resolvePath('session-1', 'docs/source.txt')).resolves.toEqual(
      expect.objectContaining({
        exists: true,
        type: 'file',
        virtualPath: '/docs/source.txt',
      }),
    );
    await expect(service.statPath('session-1', 'docs/source.txt')).resolves.toEqual(
      expect.objectContaining({
        exists: true,
        size: 7,
        type: 'file',
        virtualPath: '/docs/source.txt',
      }),
    );
    await expect(service.ensureDirectory('session-1', 'logs/archive')).resolves.toEqual({
      created: true,
      path: '/logs/archive',
    });
    await expect(service.ensureDirectory('session-1', 'logs/archive')).resolves.toEqual({
      created: false,
      path: '/logs/archive',
    });
    await expect(
      service.copyPath('session-1', 'docs/source.txt', 'logs/archive/copied.txt'),
    ).resolves.toEqual({
      fromPath: '/docs/source.txt',
      path: '/logs/archive/copied.txt',
    });
    await expect(
      service.movePath('session-1', 'logs/archive/copied.txt', 'logs/archive/moved.txt'),
    ).resolves.toEqual({
      fromPath: '/logs/archive/copied.txt',
      path: '/logs/archive/moved.txt',
    });
    await expect(
      service.createSymlink('session-1', {
        linkPath: 'logs/archive/link.txt',
        targetPath: '/docs/source.txt',
      }),
    ).resolves.toEqual({
      path: '/logs/archive/link.txt',
      target: '/docs/source.txt',
    });
    await expect(service.readSymlink('session-1', 'logs/archive/link.txt')).resolves.toEqual({
      path: '/logs/archive/link.txt',
      target: '/docs/source.txt',
    });
    await expect(service.deletePath('session-1', 'logs/archive/moved.txt')).resolves.toEqual({
      deleted: true,
      path: '/logs/archive/moved.txt',
    });
    await expect(service.deletePath('session-1', 'logs/archive/moved.txt')).resolves.toEqual({
      deleted: false,
      path: '/logs/archive/moved.txt',
    });

    expect(
      fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'logs', 'archive', 'link.txt'), 'utf8'),
    ).toBe('source\n');
  });

  it('supports backend-owned glob and grep operations', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-filesystem-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-2');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), '# title\nneedle here\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'notes.txt'), 'alpha\nneedle again\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'binary.bin'), Buffer.from([0, 159, 146, 150]));
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'chart.png'), Buffer.from([137, 80, 78, 71]));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), new Date('2026-04-20T00:00:00.000Z'), new Date('2026-04-20T00:00:00.000Z'));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'notes.txt'), new Date('2026-04-21T00:00:00.000Z'), new Date('2026-04-21T00:00:00.000Z'));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'binary.bin'), new Date('2026-04-22T00:00:00.000Z'), new Date('2026-04-22T00:00:00.000Z'));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'chart.png'), new Date('2026-04-23T00:00:00.000Z'), new Date('2026-04-23T00:00:00.000Z'));

    await expect(service.globPaths('session-2', {
      maxResults: 10,
      path: 'docs',
      pattern: '**/*.*',
    })).resolves.toEqual({
      basePath: '/docs',
      matches: ['/docs/nested/chart.png', '/docs/nested/binary.bin', '/docs/nested/notes.txt', '/docs/readme.md'],
      partial: false,
      skippedEntries: [],
      skippedPaths: [],
      totalMatches: 4,
      truncated: false,
    });

    await expect(service.grepText('session-2', {
      include: '**/*.*',
      maxLineLength: 2000,
      maxMatches: 10,
      path: 'docs',
      pattern: 'needle',
    })).resolves.toEqual({
      basePath: '/docs',
      matches: [
        {
          line: 2,
          text: 'needle again',
          virtualPath: '/docs/nested/notes.txt',
        },
        {
          line: 2,
          text: 'needle here',
          virtualPath: '/docs/readme.md',
        },
      ],
      partial: false,
      skippedEntries: [
        {
          path: '/docs/nested/binary.bin',
          reason: 'binary',
        },
        {
          path: '/docs/nested/chart.png',
          reason: 'binary',
        },
      ],
      skippedPaths: [],
      totalMatches: 2,
      truncated: false,
    });
  });

  it('reports skipped paths for partial glob and grep traversal', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-partial-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-partial');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'private'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'public.txt'), 'needle public\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'private', 'secret.txt'), 'needle secret\n', 'utf8');

    const originalReaddir = fs.promises.readdir;
    jest.spyOn(fs.promises, 'readdir').mockImplementation(async (targetPath, options) => {
      if (String(targetPath) === path.join(sessionEnvironment.sessionRoot, 'docs', 'private')) {
        const error = new Error('EACCES') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }
      return originalReaddir.call(fs.promises, targetPath as Parameters<typeof fs.promises.readdir>[0], options as Parameters<typeof fs.promises.readdir>[1]);
    });

    await expect(service.globPaths('session-partial', {
      maxResults: 10,
      path: 'docs',
      pattern: '**/*.txt',
    })).resolves.toEqual({
      basePath: '/docs',
      matches: ['/docs/public.txt'],
      partial: true,
      skippedEntries: [
        {
          path: '/docs/private',
          reason: 'inaccessible',
        },
      ],
      skippedPaths: ['/docs/private'],
      totalMatches: 1,
      truncated: false,
    });

    await expect(service.grepText('session-partial', {
      include: '**/*.txt',
      maxLineLength: 2000,
      maxMatches: 10,
      path: 'docs',
      pattern: 'needle',
    })).resolves.toEqual({
      basePath: '/docs',
      matches: [
        {
          line: 1,
          text: 'needle public',
          virtualPath: '/docs/public.txt',
        },
      ],
      partial: true,
      skippedEntries: [
        {
          path: '/docs/private',
          reason: 'inaccessible',
        },
      ],
      skippedPaths: ['/docs/private'],
      totalMatches: 1,
      truncated: false,
    });
  });

  it('reuses nearby path suggestions when glob base path is missing', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-glob-suggest-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-glob-suggest');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), '# title\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'reader-notes.md'), '# notes\n', 'utf8');

    await expect(service.globPaths('session-glob-suggest', {
      maxResults: 10,
      path: 'docs/read',
      pattern: '**/*.md',
    })).rejects.toThrow(
      [
        '路径不存在: /docs/read',
        '可选路径：',
        '/docs/readme.md',
        '/docs/reader-notes.md',
        '可继续操作：请改用上述路径之一重新 glob，或先 glob 上级目录缩小范围。',
      ].join('\n'),
    );
  });

  it('reuses nearby path suggestions when grep base path is missing', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-grep-suggest-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-grep-suggest');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), '# title\nneedle\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'reader-notes.md'), '# notes\nneedle\n', 'utf8');

    await expect(service.grepText('session-grep-suggest', {
      include: '**/*.md',
      maxLineLength: 2000,
      maxMatches: 10,
      path: 'docs/read',
      pattern: 'needle',
    })).rejects.toThrow(
      [
        '路径不存在: /docs/read',
        '可选路径：',
        '/docs/readme.md',
        '/docs/reader-notes.md',
        '可继续操作：请改用上述路径之一重新 grep，或先 glob 上级目录确认搜索范围。',
      ].join('\n'),
    );
  });

  it('preserves CRLF line endings when edit rewrites a text file', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-crlf-edit-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-crlf');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'windows.txt'),
      'alpha\r\nbeta\r\n',
      'utf8',
    );

    await expect(service.editTextFile('session-crlf', {
      filePath: 'docs/windows.txt',
      newString: 'beta updated',
      oldString: 'beta',
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 2,
        beforeLineCount: 2,
        deletions: 1,
        patch: expect.stringContaining('@@'),
      },
      occurrences: 1,
      path: '/docs/windows.txt',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      strategy: 'exact',
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'windows.txt'), 'utf8')).toBe(
      'alpha\r\nbeta updated\r\n',
    );
  });

  it('reports full grep totals even when visible matches are truncated', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-grep-total-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-grep-total');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'many.txt'),
      Array.from({ length: 5 }, (_, index) => `needle-${index}`).join('\n'),
      'utf8',
    );

    await expect(service.grepText('session-grep-total', {
      include: '**/*.txt',
      maxLineLength: 2000,
      maxMatches: 2,
      path: 'docs',
      pattern: 'needle',
    })).resolves.toEqual({
      basePath: '/docs',
      matches: [
        {
          line: 1,
          text: 'needle-0',
          virtualPath: '/docs/many.txt',
        },
        {
          line: 2,
          text: 'needle-1',
          virtualPath: '/docs/many.txt',
        },
      ],
      partial: false,
      skippedEntries: [],
      skippedPaths: [],
      totalMatches: 5,
      truncated: true,
    });
  });

  it('supports backend-owned read range for file and directory targets', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-read-range-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-3');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.txt'),
      `first line\n${'x'.repeat(2010)}\nthird line\n`,
      'utf8',
    );
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'second.txt'), 'next\n', 'utf8');

    await expect(service.readPathRange('session-3', {
      limit: 1,
      maxLineLength: 2000,
      offset: 2,
      path: 'docs/readme.txt',
    })).resolves.toEqual({
      byteLimited: false,
      limit: 1,
      lines: [`${'x'.repeat(2000)}... (line truncated)`],
      mimeType: 'text/plain',
      offset: 2,
      path: '/docs/readme.txt',
      totalBytes: 2033,
      totalLines: 3,
      truncated: true,
      type: 'file',
    });

    await expect(service.readPathRange('session-3', {
      limit: 5,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs',
    })).resolves.toEqual({
      entries: ['readme.txt', 'second.txt'],
      limit: 5,
      offset: 1,
      path: '/docs',
      totalEntries: 2,
      truncated: false,
      type: 'directory',
    });
  });

  it('rejects read offsets that exceed file lines or directory entries', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-read-offset-range-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-3b');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.txt'),
      'first line\nsecond line\nthird line\n',
      'utf8',
    );
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'second.txt'), 'next\n', 'utf8');

    await expect(service.readPathRange('session-3b', {
      limit: 1,
      maxLineLength: 2000,
      offset: 5,
      path: 'docs/readme.txt',
    })).rejects.toThrow('read.offset 超出范围: 5，文件总行数为 3');

    await expect(service.readPathRange('session-3b', {
      limit: 5,
      maxLineLength: 2000,
      offset: 4,
      path: 'docs',
    })).rejects.toThrow('read.offset 超出范围: 4，目录总条目数为 2');
  });

  it('reports read asset kinds and byte-limited text windows', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-read-assets-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-4');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'chart.png'), Buffer.from([137, 80, 78, 71]));
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'guide.pdf'), Buffer.from('%PDF-1.7'));
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'archive.bin'), Buffer.from([0, 159, 146, 150]));
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'large.txt'),
      Array.from({ length: 400 }, (_, index) => `line-${index}-${'x'.repeat(180)}`).join('\n'),
      'utf8',
    );

    await expect(service.readPathRange('session-4', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/chart.png',
    })).resolves.toEqual({
      mimeType: 'image/png',
      path: '/docs/chart.png',
      size: 4,
      type: 'image',
    });
    await expect(service.readPathRange('session-4', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/guide.pdf',
    })).resolves.toEqual({
      mimeType: 'application/pdf',
      path: '/docs/guide.pdf',
      size: 8,
      type: 'pdf',
    });
    await expect(service.readPathRange('session-4', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/archive.bin',
    })).resolves.toEqual({
      mimeType: 'application/octet-stream',
      path: '/docs/archive.bin',
      size: 4,
      type: 'binary',
    });
    await expect(service.readPathRange('session-4', {
      limit: 400,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/large.txt',
    })).resolves.toEqual(expect.objectContaining({
      byteLimited: true,
      mimeType: 'text/plain',
      path: '/docs/large.txt',
      truncated: true,
      type: 'file',
    }));
  });

  it('returns nearby path suggestions when the target path is missing', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-read-suggest-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-5');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), '# title\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'reader-notes.md'), '# notes\n', 'utf8');

    await expect(service.readPathRange('session-5', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/read',
    })).rejects.toThrow(
      [
        '路径不存在: /docs/read',
        '可选路径：',
        '/docs/readme.md',
        '/docs/reader-notes.md',
        '可继续操作：请改用上述路径之一重新 read，或先 read 上级目录确认路径。',
      ].join('\n'),
    );
  });

  it('returns write metadata and keeps the most specific edit strategy visible', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-write-edit-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-6');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });

    await expect(service.writeTextFile('session-6', 'docs/output.txt', 'first line\nsecond line\n')).resolves.toEqual({
      created: true,
      diff: {
        additions: 2,
        afterLineCount: 2,
        beforeLineCount: 0,
        deletions: 0,
        patch: expect.stringContaining('@@'),
      },
      lineCount: 2,
      path: '/docs/output.txt',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      status: 'created',
      size: 23,
    });

    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'block.ts'),
      'if (true) {\n  console.log("alpha");\n}\n',
      'utf8',
    );

    await expect(service.editTextFile('session-6', {
      filePath: 'docs/block.ts',
      newString: 'if (true) {\n    console.log("beta");\n}\n',
      oldString: 'if (true) {\nconsole.log("alpha");\n}\n',
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 3,
        beforeLineCount: 3,
        deletions: 1,
        patch: expect.stringContaining('@@'),
      },
      occurrences: 1,
      path: '/docs/block.ts',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      strategy: 'line-trimmed',
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'block.ts'), 'utf8')).toBe(
      'if (true) {\n    console.log("beta");\n}\n',
    );
  });

  it('supports create-style edit when oldString is empty', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-empty-edit-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-empty-edit');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });

    await expect(service.editTextFile('session-empty-edit', {
      filePath: 'docs/created.txt',
      newString: 'created by edit\n',
      oldString: '',
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 1,
        beforeLineCount: 0,
        deletions: 0,
        patch: expect.stringContaining('@@'),
      },
      occurrences: 1,
      path: '/docs/created.txt',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      strategy: 'empty-old-string',
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'created.txt'), 'utf8')).toBe(
      'created by edit\n',
    );
  });

  it('keeps line-trimmed strategy visible in native edit results for outer-whitespace-only blocks', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-line-trimmed-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-line-trimmed');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'block.ts'),
      [
        'alpha(',
        '  beta,',
        '  gamma,',
        ')',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(service.editTextFile('session-line-trimmed', {
      filePath: 'docs/block.ts',
      newString: [
        'alpha(',
        '  betaUpdated,',
        '  gamma,',
        ')',
        '',
      ].join('\n'),
      oldString: [
        ' alpha( ',
        ' beta,  ',
        ' gamma, ',
        ' ) ',
        '',
      ].join('\n'),
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 4,
        beforeLineCount: 4,
        deletions: 1,
        patch: expect.stringContaining('@@'),
      },
      occurrences: 1,
      path: '/docs/block.ts',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      strategy: 'line-trimmed',
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'block.ts'), 'utf8')).toBe(
      [
        'alpha(',
        '  betaUpdated,',
        '  gamma,',
        ')',
        '',
      ].join('\n'),
    );
  });

  it('preserves existing CRLF line endings for create-style overwrite edit', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-empty-edit-crlf-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-empty-edit-crlf');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'created.txt'),
      'alpha\r\nbeta\r\n',
      'utf8',
    );

    await expect(service.editTextFile('session-empty-edit-crlf', {
      filePath: 'docs/created.txt',
      newString: 'gamma\nomega\n',
      oldString: '',
    })).resolves.toEqual({
      diff: {
        additions: 2,
        afterLineCount: 2,
        beforeLineCount: 2,
        deletions: 2,
        patch: expect.stringContaining('@@'),
      },
      occurrences: 1,
      path: '/docs/created.txt',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      strategy: 'empty-old-string',
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'created.txt'), 'utf8')).toBe(
      'gamma\r\nomega\r\n',
    );
  });

  it('applies post-write formatting and diagnostics through the overlay owner', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-post-write-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(
      runtimeSessionEnvironmentService,
      {
        processTextFile: jest.fn(({
          content,
          path: nextPath,
        }: {
          content: string;
          hostPath: string;
          path: string;
          sessionRoot: string;
          visibleRoot: string;
        }) => ({
          content: nextPath.endsWith('.json') ? '{\n  "value": 1\n}\n' : content,
          postWrite: {
            diagnostics: nextPath.endsWith('.ts')
              ? [
                {
                  column: 17,
                  line: 1,
                  message: 'Expression expected.',
                  path: nextPath,
                  severity: 'error',
                  source: 'typescript',
                },
              ]
              : [],
            formatting: nextPath.endsWith('.json')
              ? {
                kind: 'json-pretty',
                label: 'json-pretty',
              }
              : null,
          },
        })),
      } as never,
    );
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-post-write');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });

    await expect(service.writeTextFile('session-post-write', 'docs/config.json', '{"value":1}\n')).resolves.toEqual({
      created: true,
      diff: {
        additions: 3,
        afterLineCount: 3,
        beforeLineCount: 0,
        deletions: 0,
        patch: expect.stringContaining('@@'),
      },
      lineCount: 3,
      path: '/docs/config.json',
      postWrite: {
        diagnostics: [],
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
      },
      status: 'created',
      size: Buffer.byteLength('{\n  "value": 1\n}\n', 'utf8'),
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'config.json'), 'utf8')).toBe(
      '{\n  "value": 1\n}\n',
    );

    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'broken.ts'), 'const answer = 1;\n', 'utf8');
    await expect(service.editTextFile('session-post-write', {
      filePath: 'docs/broken.ts',
      newString: '{',
      oldString: '1',
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 1,
        beforeLineCount: 1,
        deletions: 1,
        patch: expect.stringContaining('@@'),
      },
      occurrences: 1,
      path: '/docs/broken.ts',
      postWrite: {
        diagnostics: [
          {
            column: 17,
            line: 1,
            message: 'Expression expected.',
            path: '/docs/broken.ts',
            severity: 'error',
            source: 'typescript',
          },
        ],
        formatting: null,
      },
      strategy: 'exact',
    });
  });

  it('appends to an existing file without overwriting prior content', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-write-append-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-append');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'append.txt'),
      'alpha\nbeta\n',
      'utf8',
    );

    await expect(service.writeTextFile('session-append', 'docs/append.txt', 'gamma\n', {
      mode: 'append',
    })).resolves.toEqual({
      created: false,
      diff: {
        additions: 1,
        afterLineCount: 3,
        beforeLineCount: 2,
        deletions: 0,
        patch: expect.stringContaining('@@'),
      },
      lineCount: 3,
      path: '/docs/append.txt',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      status: 'appended',
      size: Buffer.byteLength('alpha\nbeta\ngamma\n', 'utf8'),
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'append.txt'), 'utf8')).toBe(
      'alpha\nbeta\ngamma\n',
    );
  });

  it('surfaces ambiguous trimmed-boundary matches instead of editing the first inline hit', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-host-edit-ambiguous-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-edit-ambiguous');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'ambiguous.txt'),
      'alpha middle alpha\n',
      'utf8',
    );

    await expect(service.editTextFile('session-edit-ambiguous', {
      filePath: 'docs/ambiguous.txt',
      newString: 'beta',
      oldString: '  alpha  ',
    })).rejects.toThrow('trimmed-boundary');
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'ambiguous.txt'), 'utf8')).toBe(
      'alpha middle alpha\n',
    );
  });
});
