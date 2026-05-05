import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HostFilesystemBackendService } from '../../../src/modules/execution/file/host-filesystem-backend.service';
import { RuntimeFileFreshnessService } from '../../../src/modules/execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { WriteToolService } from '../../../src/modules/execution/write/write-tool.service';

const runtimeWorkspaceRoots: string[] = [];

describe('WriteToolService', () => {
  afterEach(() => {
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (nextRoot && fs.existsSync(nextRoot)) {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      }
    }
  });

  it('uses direct write guidance instead of speculative directory planning', () => {
    const service = new WriteToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {} as never,
      {} as never,
    );

    expect(service.buildToolDescription()).toBe([
      '直接把完整内容写入目标文件。',
      'filePath 可传相对路径或 backend 可见的绝对路径；相对路径按当前 backend 可见根解析。',
      '需要写新文件时直接调用 write；不需要先描述将要创建哪些文件，也不需要先创建目录。',
      '父目录不存在时工具会自动创建。',
      '如果文件已存在，写入前必须先拿到该文件的当前内容；可先用 read 工具读取，或沿用同一 session 中最新一次成功 write/edit 后记录的当前版本。',
      '如需在已有文件末尾直接追加文本，可传 mode=append；该模式会基于当前文件尾部追加，不会覆盖已有内容。',
      '如果文件自上次读取或修改后又发生变化，需要重新 read 再写入。',
      '该工具不执行命令，只负责文件系统写入。',
    ].join('\n'));
  });

  it('formats write metadata for the model', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new WriteToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        writeTextFile: jest.fn().mockResolvedValue({
          created: true,
        diff: {
          additions: 3,
          afterLineCount: 3,
          beforeLineCount: 0,
          deletions: 0,
          patch: 'mock patch',
        },
        lineCount: 3,
        path: '/docs/output.txt',
        postWrite: {
          diagnostics: [],
          formatting: {
            kind: 'json-pretty',
            label: 'json-pretty',
          },
        },
        status: 'created',
        size: 2048,
      }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      content: 'one\ntwo\nthree\n',
      filePath: 'docs/output.txt',
      sessionId: 'session-1',
    })).resolves.toEqual({
      created: true,
      diff: {
        additions: 3,
        afterLineCount: 3,
        beforeLineCount: 0,
        deletions: 0,
        patch: 'mock patch',
      },
      lineCount: 3,
      output: [
        '<write_result>',
        'Path: /docs/output.txt',
        'Status: created',
        'Lines: 3',
        'Size: 2.0 KB',
        'Diff: +3 / -0',
        'Line delta: 0 -> 3',
        '<patch>',
        'mock patch',
        '</patch>',
        'Formatting: json-pretty',
        'Diagnostics: none',
        'Next: read /docs/output.txt to confirm the formatted output before continuing edits or writes.',
        '</write_result>',
      ].join('\n'),
      path: '/docs/output.txt',
      postWrite: {
        diagnostics: [],
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
      },
      postWriteSummary: {
        currentFileDiagnostics: 0,
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
        nextHint: 'Next: read /docs/output.txt to confirm the formatted output before continuing edits or writes.',
        omittedRelatedFiles: 0,
        relatedFileDiagnostics: 0,
        relatedFiles: 0,
        relatedFocusPaths: [],
        severityCounts: {
          error: 0,
          hint: 0,
          info: 0,
          warning: 0,
        },
        totalDiagnostics: 0,
        visibleRelatedPaths: [],
        visibleRelatedFiles: 0,
      },
      status: 'created',
      size: 2048,
    });
    expect(freshness.withWriteFreshnessGuard).toHaveBeenCalledWith(
      'session-1',
      'docs/output.txt',
      expect.any(Function),
      'host-filesystem',
      undefined,
    );
  });

  it('formats append writes with appended status', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new WriteToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        writeTextFile: jest.fn().mockResolvedValue({
          created: false,
          diff: {
            additions: 1,
            afterLineCount: 3,
            beforeLineCount: 2,
            deletions: 0,
            patch: 'append patch',
          },
          lineCount: 3,
          path: '/docs/output.txt',
          postWrite: {
            diagnostics: [],
            formatting: null,
          },
          status: 'appended',
          size: 24,
        }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      content: 'three\n',
      filePath: 'docs/output.txt',
      mode: 'append',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      created: false,
      output: expect.stringContaining('Status: appended'),
      status: 'appended',
    }));
    expect(freshness.withWriteFreshnessGuard).toHaveBeenCalledWith(
      'session-1',
      'docs/output.txt',
      expect.any(Function),
      'host-filesystem',
      { requireReadBeforeWrite: false },
    );
  });

  it('keeps overwrite gated by fresh read after append mode writes to an existing file', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-write-tool-'));
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const hostFilesystemBackend = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([hostFilesystemBackend]);
    const runtimeFileFreshnessService = new RuntimeFileFreshnessService(runtimeFilesystemBackendService);
    const service = new WriteToolService(
      runtimeSessionEnvironmentService,
      runtimeFilesystemBackendService,
      runtimeFileFreshnessService,
    );

    const { sessionRoot } = await runtimeSessionEnvironmentService.getSessionEnvironment('session-1');
    fs.mkdirSync(path.join(sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, 'docs', 'output.txt'), 'one\n', 'utf8');

    await expect(service.execute({
      backendKind: 'host-filesystem',
      content: 'two\n',
      filePath: 'docs/output.txt',
      mode: 'append',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      output: expect.stringContaining('Status: appended'),
      status: 'appended',
    }));

    await expect(service.execute({
      backendKind: 'host-filesystem',
      content: 'replaced\n',
      filePath: 'docs/output.txt',
      mode: 'overwrite',
      sessionId: 'session-1',
    })).rejects.toThrow('修改已有文件前必须先读取');
  });
});
