import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HostFilesystemBackendService } from '../../../src/modules/execution/file/host-filesystem-backend.service';
import { RuntimeFileFreshnessService } from '../../../src/modules/execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

const runtimeWorkspaceRoots: string[] = [];

describe('RuntimeFileFreshnessService', () => {
  afterEach(() => {
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (nextRoot && fs.existsSync(nextRoot)) {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      }
    }
  });

  it('allows creating a new file without a prior read', async () => {
    const { service } = await createFixture();

    await expect(service.assertCanWrite('session-1', 'docs/new-file.txt')).resolves.toBeUndefined();
  });

  it('rejects overwriting an existing file before it has been read', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).rejects.toThrow(
      '修改已有文件前必须先读取',
    );
  });

  it('surfaces other recently read files when overwrite is blocked before read', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
        'docs/notes.txt': 'beta\n',
        'docs/todo.md': 'gamma\n',
      },
    });

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-04-24T12:00:10.000Z'));
      await service.rememberRead('session-1', 'docs/notes.txt', undefined, {
        lineCount: 21,
        offset: 20,
        totalLines: 120,
        truncated: true,
      });
      jest.setSystemTime(new Date('2026-04-24T12:00:55.000Z'));
      await service.rememberRead('session-1', 'docs/todo.md', undefined, {
        lineCount: 10,
        offset: 1,
        totalLines: 10,
        truncated: false,
      });
      jest.setSystemTime(new Date('2026-04-24T12:01:00.000Z'));

      await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).rejects.toThrow(
        [
          '修改已有文件前必须先读取: /docs/existing.txt',
          '请先使用 read 工具读取该文件。',
          '本 session 已加载的其他文件上下文（按最近读取排序）：',
          '- [最近读取 #1 | 5 秒前] /docs/todo.md (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
          '- [最近读取 #2 | 50 秒前] /docs/notes.txt (已加载 lines 20-40 of 120，下一步可 read /docs/notes.txt offset=41)',
        ].join('\n'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts overwriting an existing file after a fresh read stamp is recorded', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await service.rememberRead('session-1', 'docs/existing.txt');

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).resolves.toBeUndefined();
  });

  it('rejects overwriting when the file changed after the last read', async () => {
    const { service, sessionRoot } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await service.rememberRead('session-1', 'docs/existing.txt', undefined, {
      lineCount: 1,
      offset: 1,
      totalLines: 1,
      truncated: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.writeFileSync(path.join(sessionRoot, 'docs', 'existing.txt'), 'beta\n', 'utf8');

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).rejects.toThrow(
      '文件在上次读取后已被修改: /docs/existing.txt',
    );
    await service.assertCanWrite('session-1', 'docs/existing.txt').catch((error: Error) => {
      expect(error.message).toContain('最近修改:');
      expect(error.message).toContain('上次读取:');
      expect(error.message).toContain('已过期上下文: 已加载 lines 1-1 of 1');
      expect(error.message).toContain('请先重新读取当前文件: read /docs/existing.txt');
    });
  });

  it('serializes writes on the same file path', async () => {
    const { service } = await createFixture();
    const steps: string[] = [];

    const first = service.withFileLock('session-1', '/docs/locked.txt', async () => {
      steps.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      steps.push('first:end');
      return 'first';
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = service.withFileLock('session-1', 'docs/locked.txt', async () => {
      steps.push('second:start');
      steps.push('second:end');
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(steps).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('does not serialize same virtual path across different sessions', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-file-freshness-sessions-'));
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const hostFilesystemBackend = new HostFilesystemBackendService(
      runtimeSessionEnvironmentService,
    );
    const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([
      hostFilesystemBackend,
    ]);
    const service = new RuntimeFileFreshnessService(runtimeFilesystemBackendService);
    const steps: string[] = [];

    const first = service.withFileLock('session-a', '/docs/locked.txt', async () => {
      steps.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      steps.push('first:end');
      return 'first';
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = service.withFileLock('session-b', '/docs/locked.txt', async () => {
      steps.push('second:start');
      steps.push('second:end');
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(steps).toEqual(['first:start', 'second:start', 'second:end', 'first:end']);
  });

  it('withWriteFreshnessGuard blocks unread overwrite before invoking writer', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });
    const writer = jest.fn().mockResolvedValue({ path: '/docs/existing.txt' });

    await expect(service.withWriteFreshnessGuard(
      'session-1',
      'docs/existing.txt',
      writer,
    )).rejects.toThrow('修改已有文件前必须先读取');
    expect(writer).not.toHaveBeenCalled();
  });

  it('withWriteFreshnessGuard records read stamp after successful write run', async () => {
    const { service, sessionRoot } = await createFixture();

    await expect(service.withWriteFreshnessGuard(
      'session-1',
      'docs/new.txt',
      async () => {
        const hostPath = path.join(sessionRoot, 'docs', 'new.txt');
        fs.mkdirSync(path.dirname(hostPath), { recursive: true });
        fs.writeFileSync(hostPath, 'alpha\n', 'utf8');
        return { path: '/docs/new.txt' };
      },
    )).resolves.toEqual({ path: '/docs/new.txt' });

    expect(service.listRecentReads('session-1')).toEqual(['/docs/new.txt']);
  });

  it('withWriteFreshnessGuard allows append mode on an unread existing file', async () => {
    const { service, sessionRoot } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await expect(service.withWriteFreshnessGuard(
      'session-1',
      'docs/existing.txt',
      async () => {
        fs.writeFileSync(path.join(sessionRoot, 'docs', 'existing.txt'), 'alpha\nbeta\n', 'utf8');
        return { path: '/docs/existing.txt' };
      },
      undefined,
      { requireReadBeforeWrite: false },
    )).resolves.toEqual({ path: '/docs/existing.txt' });

    expect(service.listRecentReads('session-1')).toEqual([]);
  });

  it('withWriteFreshnessGuard still requires a fresh read before overwrite after a blind append', async () => {
    const { service, sessionRoot } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await expect(service.withWriteFreshnessGuard(
      'session-1',
      'docs/existing.txt',
      async () => {
        fs.writeFileSync(path.join(sessionRoot, 'docs', 'existing.txt'), 'alpha\nbeta\n', 'utf8');
        return { path: '/docs/existing.txt' };
      },
      undefined,
      { requireReadBeforeWrite: false },
    )).resolves.toEqual({ path: '/docs/existing.txt' });

    await expect(service.withWriteFreshnessGuard(
      'session-1',
      'docs/existing.txt',
      async () => ({ path: '/docs/existing.txt' }),
    )).rejects.toThrow('修改已有文件前必须先读取');
  });

  it('lists recent reads in reverse chronological order and supports exclude/limit', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/a.txt': 'alpha\n',
        'docs/b.txt': 'beta\n',
        'docs/c.txt': 'gamma\n',
      },
    });

    await service.rememberRead('session-1', 'docs/a.txt');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.rememberRead('session-1', 'docs/b.txt');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.rememberRead('session-1', 'docs/c.txt');

    expect(service.listRecentReads('session-1')).toEqual([
      '/docs/c.txt',
      '/docs/b.txt',
      '/docs/a.txt',
    ]);
    expect(service.listRecentReads('session-1', {
      excludePath: '/docs/c.txt',
      limit: 1,
    })).toEqual(['/docs/b.txt']);
  });

  it('builds read system reminders from recent reads with stable wrapper text', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/readme.txt': 'alpha\n',
        'docs/notes.txt': 'beta\n',
        'docs/todo.md': 'gamma\n',
      },
    });

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-04-24T12:00:10.000Z'));
      await service.rememberRead('session-1', 'docs/notes.txt', undefined, {
        lineCount: 21,
        offset: 20,
        totalLines: 120,
        truncated: true,
      });
      jest.setSystemTime(new Date('2026-04-24T12:00:55.000Z'));
      await service.rememberRead('session-1', 'docs/todo.md', undefined, {
        lineCount: 10,
        offset: 1,
        totalLines: 10,
        truncated: false,
      });
      jest.setSystemTime(new Date('2026-04-24T12:01:00.000Z'));
      await service.rememberRead('session-1', 'docs/readme.txt');

      expect(service.buildReadSystemReminder('session-1', {
        excludePath: '/docs/readme.txt',
        limit: 5,
      })).toEqual([
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1 | 5 秒前] /docs/todo.md (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
        '- [最近读取 #2 | 50 秒前] /docs/notes.txt (已加载 lines 20-40 of 120，下一步可 read /docs/notes.txt offset=41)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not surface write-only freshness stamps as loaded file context reminders', async () => {
    const { service, sessionRoot } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
        'docs/notes.txt': 'beta\n',
      },
    });

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-04-24T12:00:50.000Z'));
      await service.rememberRead('session-1', 'docs/notes.txt', undefined, {
        lineCount: 10,
        offset: 1,
        totalLines: 10,
        truncated: false,
      });
      jest.setSystemTime(new Date('2026-04-24T12:00:55.000Z'));
      await service.rememberRead('session-1', 'docs/existing.txt', undefined, {
        lineCount: 1,
        offset: 1,
        totalLines: 1,
        truncated: false,
      });
      jest.setSystemTime(new Date('2026-04-24T12:01:00.000Z'));
      await service.withWriteFreshnessGuard(
        'session-1',
        'docs/existing.txt',
        async () => {
          fs.writeFileSync(path.join(sessionRoot, 'docs', 'existing.txt'), 'updated\n', 'utf8');
          return { path: '/docs/existing.txt' };
        },
      );

      expect(service.listRecentReads('session-1')).toEqual([
        '/docs/existing.txt',
        '/docs/notes.txt',
      ]);
      expect(service.buildReadSystemReminder('session-1', {
        limit: 5,
      })).toEqual([
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1 | 10 秒前] /docs/notes.txt (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps empty-file reads visible in loaded file context reminders', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/empty.txt': '',
      },
    });

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-04-24T12:01:00.000Z'));
      await service.rememberRead('session-1', 'docs/empty.txt', undefined, {
        lineCount: 0,
        offset: 1,
        totalLines: 0,
        truncated: false,
      });
      jest.setSystemTime(new Date('2026-04-24T12:01:02.000Z'));

      expect(service.buildReadSystemReminder('session-1')).toEqual([
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1 | 刚刚读取] /docs/empty.txt (已加载空文件（0 lines of 0），当前窗口已加载，可直接复用)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('claims read instruction paths only once per assistant message when message id is provided', async () => {
    const { service } = await createFixture();

    expect(service.claimReadInstructionPaths('session-1', [
      '/docs/AGENTS.md',
      '/docs/nested/AGENTS.md',
    ], 'assistant-1')).toEqual([
      '/docs/AGENTS.md',
      '/docs/nested/AGENTS.md',
    ]);
    expect(service.claimReadInstructionPaths('session-1', [
      '/docs/AGENTS.md',
      '/docs/other/AGENTS.md',
    ], 'assistant-1')).toEqual([
      '/docs/other/AGENTS.md',
    ]);
    expect(service.claimReadInstructionPaths('session-2', [
      '/docs/AGENTS.md',
    ], 'assistant-1')).toEqual([
      '/docs/AGENTS.md',
    ]);
    expect(service.claimReadInstructionPaths('session-1', [
      '/docs/AGENTS.md',
    ], 'assistant-2')).toEqual([
      '/docs/AGENTS.md',
    ]);
  });

  it('falls back to session-scoped instruction claims when assistant message id is unavailable', async () => {
    const { service } = await createFixture();

    expect(service.claimReadInstructionPaths('session-1', [
      '/docs/AGENTS.md',
    ])).toEqual([
      '/docs/AGENTS.md',
    ]);
    expect(service.claimReadInstructionPaths('session-1', [
      '/docs/AGENTS.md',
      '/docs/other/AGENTS.md',
    ])).toEqual([
      '/docs/other/AGENTS.md',
    ]);
  });
});

async function createFixture(input?: {
  initialFiles?: Record<string, string>;
}) {
  const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-file-freshness-'));
  runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
  process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

  const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
  const hostFilesystemBackend = new HostFilesystemBackendService(
    runtimeSessionEnvironmentService,
  );
  const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([
    hostFilesystemBackend,
  ]);
  const service = new RuntimeFileFreshnessService(runtimeFilesystemBackendService);
  const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-1');

  for (const [relativePath, content] of Object.entries(input?.initialFiles ?? {})) {
    const hostPath = path.join(sessionEnvironment.sessionRoot, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.writeFileSync(hostPath, content, 'utf8');
  }

  return {
    service,
    sessionRoot: sessionEnvironment.sessionRoot,
  };
}
