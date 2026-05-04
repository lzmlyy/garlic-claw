import { WriteToolService } from '../../../src/modules/execution/write/write-tool.service';

describe('WriteToolService', () => {
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
      size: 2048,
    });
    expect(freshness.withWriteFreshnessGuard).toHaveBeenCalledWith(
      'session-1',
      'docs/output.txt',
      expect.any(Function),
      'host-filesystem',
    );
  });
});
