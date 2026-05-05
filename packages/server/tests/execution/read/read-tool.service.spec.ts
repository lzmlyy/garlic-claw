import { ReadToolService } from '../../../src/modules/execution/read/read-tool.service';

describe('ReadToolService', () => {
  it('formats directory windows with continuation hints', async () => {
    const freshness = {
      buildReadSystemReminder: jest.fn().mockReturnValue([]),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          entries: ['a.txt', 'b.txt'],
          limit: 2,
          offset: 3,
          path: '/docs',
          totalEntries: 6,
          truncated: true,
          type: 'directory',
        }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs',
      limit: 2,
      offset: 3,
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs',
        'Type: directory',
        '<entries>',
        'a.txt',
        'b.txt',
        '(showing entries 3-4 of 6. Use offset=5 to continue. Read a child path from this directory to inspect content.)',
        '</entries>',
        '</read_result>',
      ].join('\n'),
      path: '/docs',
      truncated: true,
      type: 'directory',
    });
    expect(freshness.rememberRead).not.toHaveBeenCalled();
  });

  it('formats byte-limited file reads with explicit continuation hints', async () => {
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          byteLimited: true,
          limit: 2,
          lines: ['alpha', 'beta'],
          mimeType: 'text/plain',
          offset: 4,
          path: '/docs/readme.txt',
          totalBytes: 80960,
          totalLines: 400,
          truncated: true,
          type: 'file',
        }),
      } as never,
      {
        buildReadSystemReminder: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/readme.txt',
      limit: 2,
      offset: 4,
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '4: alpha',
        '5: beta',
        '(output capped at 50 KB. Showing lines 4-5. Use offset=6 to continue reading this file. If this file is large or has long lines, use grep to find anchors before reading another window.)',
        '</content>',
        '</read_result>',
      ].join('\n'),
      path: '/docs/readme.txt',
      truncated: true,
      type: 'file',
    });
  });

  it('formats line-window truncation with grep guidance', async () => {
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          byteLimited: false,
          limit: 2,
          lines: ['alpha', 'beta'],
          mimeType: 'text/plain',
          offset: 4,
          path: '/docs/readme.txt',
          totalBytes: 160,
          totalLines: 9,
          truncated: true,
          type: 'file',
        }),
      } as never,
      {
        buildReadSystemReminder: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/readme.txt',
      limit: 2,
      offset: 4,
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '4: alpha',
        '5: beta',
        '(showing lines 4-5 of 9. Use offset=6 to continue reading this file. If this file is large or has long lines, use grep to find anchors before reading another window.)',
        '</content>',
        '</read_result>',
      ].join('\n'),
      path: '/docs/readme.txt',
      truncated: true,
      type: 'file',
    });
  });

  it('formats image reads as non-text assets', async () => {
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          mimeType: 'image/png',
          path: '/docs/chart.png',
          size: 4096,
          type: 'image',
        }),
      } as never,
      {
        buildReadSystemReminder: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/chart.png',
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs/chart.png',
        'Type: image',
        'Mime: image/png',
        'Size: 4.0 KB',
        'Image file detected. Text content was not expanded. Read a related text file or use an asset-aware tool to continue.',
        '</read_result>',
      ].join('\n'),
      path: '/docs/chart.png',
      truncated: false,
      type: 'image',
    });
  });

  it('formats binary reads as non-text assets with a next-step hint', async () => {
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          mimeType: 'application/octet-stream',
          path: '/docs/archive.bin',
          size: 512,
          type: 'binary',
        }),
      } as never,
      {
        buildReadSystemReminder: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/archive.bin',
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs/archive.bin',
        'Type: binary',
        'Mime: application/octet-stream',
        'Size: 512 B',
        'Binary file detected. Text content was not expanded. Read a related text file or use an asset-aware tool to continue.',
        '</read_result>',
      ].join('\n'),
      path: '/docs/archive.bin',
      truncated: false,
      type: 'binary',
    });
  });

  it('formats pdf reads as non-text assets', async () => {
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          mimeType: 'application/pdf',
          path: '/docs/guide.pdf',
          size: 6144,
          type: 'pdf',
        }),
      } as never,
      {
        buildReadSystemReminder: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/guide.pdf',
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs/guide.pdf',
        'Type: pdf',
        'Mime: application/pdf',
        'Size: 6.0 KB',
        'PDF file detected. Text content was not expanded. Read a related text file or use an asset-aware tool to continue.',
        '</read_result>',
      ].join('\n'),
      path: '/docs/guide.pdf',
      truncated: false,
      type: 'pdf',
    });
  });

  it('appends a session reminder with other recently read files', async () => {
    const freshness = {
      buildReadSystemReminder: jest.fn().mockReturnValue([
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1] /docs/notes.txt (已加载 lines 20-40 of 120，下一步可 read /docs/notes.txt offset=41)',
        '- [最近读取 #2] /docs/todo.md (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
      ]),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          byteLimited: false,
          limit: 2,
          lines: ['alpha', 'beta'],
          mimeType: 'text/plain',
          offset: 1,
          path: '/docs/readme.txt',
          totalBytes: 11,
          totalLines: 2,
          truncated: false,
          type: 'file',
        }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/readme.txt',
      limit: 2,
      offset: 1,
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /docs/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '1: alpha',
        '2: beta',
        '(end of file, total lines: 2, total bytes: 11 B. Re-run read with a different offset if you need another window.)',
        '</content>',
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1] /docs/notes.txt (已加载 lines 20-40 of 120，下一步可 read /docs/notes.txt offset=41)',
        '- [最近读取 #2] /docs/todo.md (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
        '</read_result>',
      ].join('\n'),
      path: '/docs/readme.txt',
      truncated: false,
      type: 'file',
    });
    expect(freshness.buildReadSystemReminder).toHaveBeenCalledWith('session-1', {
      excludePath: '/docs/readme.txt',
      limit: 5,
    });
  });

  it('appends path-specific AGENTS.md instructions before loaded file reminders', async () => {
    const freshness = {
      buildReadSystemReminder: jest.fn().mockReturnValue([
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1] /docs/notes.txt (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
      ]),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
    const readPathRange = jest.fn().mockResolvedValue({
      byteLimited: false,
      limit: 2,
      lines: ['alpha', 'beta'],
      mimeType: 'text/plain',
      offset: 1,
      path: '/workspace/subdir/nested/readme.txt',
      totalBytes: 11,
      totalLines: 2,
      truncated: false,
      type: 'file',
    });
    const statPath = jest.fn().mockImplementation(async (_sessionId: string, inputPath?: string) => {
      if (inputPath === '/workspace/subdir/AGENTS.md') {
        return {
          exists: true,
          mtime: null,
          size: 24,
          type: 'file',
          virtualPath: '/workspace/subdir/AGENTS.md',
        };
      }
      if (inputPath === '/workspace/AGENTS.md') {
        return {
          exists: true,
          mtime: null,
          size: 32,
          type: 'file',
          virtualPath: '/workspace/AGENTS.md',
        };
      }
      return {
        exists: false,
        mtime: null,
        size: null,
        type: 'missing',
        virtualPath: inputPath ?? '/workspace',
      };
    });
    const readTextFile = jest.fn().mockResolvedValue({
      content: '# Team Rules\nUse snake_case.',
      path: '/workspace/subdir/AGENTS.md',
    });
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        readPathRange,
        readTextFile,
        statPath,
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'subdir/nested/readme.txt',
      limit: 2,
      offset: 1,
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: ['/workspace/subdir/AGENTS.md'],
      output: [
        '<read_result>',
        'Path: /workspace/subdir/nested/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '1: alpha',
        '2: beta',
        '(end of file, total lines: 2, total bytes: 11 B. Re-run read with a different offset if you need another window.)',
        '</content>',
        '<system-reminder>',
        '该路径命中以下 AGENTS.md 指令，请一并遵守：',
        '<agents path="/workspace/subdir/AGENTS.md">',
        '# Team Rules',
        'Use snake_case.',
        '</agents>',
        '</system-reminder>',
        '<system-reminder>',
        '本 session 已加载这些文件上下文（按最近读取排序）：',
        '- [最近读取 #1] /docs/notes.txt (已加载 lines 1-10 of 10，当前窗口已加载，可直接复用)',
        '如需跨文件继续，优先复用这些已加载内容，避免重复 read。',
        '如果目标文件可能已变化，修改前先重新 read 该文件。',
        '</system-reminder>',
        '</read_result>',
      ].join('\n'),
      path: '/workspace/subdir/nested/readme.txt',
      truncated: false,
      type: 'file',
    });
    expect(statPath).toHaveBeenCalledWith('session-1', '/workspace/subdir/nested/AGENTS.md', 'host-filesystem');
    expect(statPath).toHaveBeenCalledWith('session-1', '/workspace/subdir/AGENTS.md', 'host-filesystem');
    expect(statPath).not.toHaveBeenCalledWith('session-1', '/workspace/AGENTS.md', 'host-filesystem');
    expect(readTextFile).toHaveBeenCalledWith('session-1', '/workspace/subdir/AGENTS.md', 'host-filesystem');
    expect(readTextFile).not.toHaveBeenCalledWith('session-1', '/workspace/AGENTS.md', 'host-filesystem');
  });

  it('does not repeat already-claimed AGENTS.md instructions in the same assistant message', async () => {
    const freshness = {
      buildReadSystemReminder: jest.fn().mockReturnValue([]),
      claimReadInstructionPaths: jest.fn().mockReturnValue([]),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReadToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          byteLimited: false,
          limit: 2,
          lines: ['alpha', 'beta'],
          mimeType: 'text/plain',
          offset: 1,
          path: '/workspace/subdir/nested/readme.txt',
          totalBytes: 11,
          totalLines: 2,
          truncated: false,
          type: 'file',
        }),
        readTextFile: jest.fn().mockResolvedValue({
          content: '# Team Rules\nUse snake_case.',
          path: '/workspace/subdir/AGENTS.md',
        }),
        statPath: jest.fn().mockImplementation(async (_sessionId: string, inputPath?: string) => ({
          exists: inputPath === '/workspace/subdir/AGENTS.md',
          mtime: null,
          size: inputPath === '/workspace/subdir/AGENTS.md' ? 24 : null,
          type: inputPath === '/workspace/subdir/AGENTS.md' ? 'file' : 'missing',
          virtualPath: inputPath ?? '/workspace',
        })),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      assistantMessageId: 'assistant-message-1',
      backendKind: 'host-filesystem',
      filePath: 'subdir/nested/readme.txt',
      limit: 2,
      offset: 1,
      sessionId: 'session-1',
    })).resolves.toEqual({
      loaded: [],
      output: [
        '<read_result>',
        'Path: /workspace/subdir/nested/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '1: alpha',
        '2: beta',
        '(end of file, total lines: 2, total bytes: 11 B. Re-run read with a different offset if you need another window.)',
        '</content>',
        '</read_result>',
      ].join('\n'),
      path: '/workspace/subdir/nested/readme.txt',
      truncated: false,
      type: 'file',
    });
    expect(freshness.claimReadInstructionPaths).toHaveBeenCalledWith(
      'session-1',
      ['/workspace/subdir/AGENTS.md'],
      'assistant-message-1',
    );
  });
});
