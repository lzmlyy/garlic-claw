import { BadRequestException } from '@nestjs/common';
import { EditToolService } from '../../../src/modules/execution/edit/edit-tool.service';

describe('EditToolService', () => {
  it('allows empty oldString input for create-or-overwrite edit flows', () => {
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getDefaultBackendKind: () => 'host-filesystem',
      } as never,
      {} as never,
    );

    expect(service.readInput({
      filePath: 'docs/new.txt',
      newString: 'created content\n',
      oldString: '',
    }, 'session-create')).toEqual({
      backendKind: 'host-filesystem',
      filePath: 'docs/new.txt',
      newString: 'created content\n',
      oldString: '',
      sessionId: 'session-create',
    });
  });

  it('formats edit strategy details for the model', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockResolvedValue({
        diff: {
          additions: 1,
          afterLineCount: 1,
          beforeLineCount: 1,
          deletions: 1,
          patch: 'mock patch',
        },
        occurrences: 1,
        path: '/docs/output.txt',
        postWrite: {
          diagnostics: [
            {
              column: 15,
              line: 1,
              message: 'Expression expected.',
              path: '/docs/output.txt',
              severity: 'error',
              source: 'typescript',
            },
          ],
          formatting: null,
        },
        strategy: 'whitespace-normalized',
      }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/output.txt',
      newString: 'beta',
      oldString: 'alpha',
      sessionId: 'session-1',
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 1,
        beforeLineCount: 1,
        deletions: 1,
        patch: 'mock patch',
      },
      occurrences: 1,
      output: [
        '<edit_result>',
        'Path: /docs/output.txt',
        'Occurrences: 1',
        'Mode: replace-one',
        'Strategy: whitespace-normalized',
        'Diff: +1 / -1',
        'Line delta: 1 -> 1',
        '<patch>',
        'mock patch',
        '</patch>',
        'Diagnostics: 1 issue(s) in current file',
        '<diagnostics file="/docs/output.txt">',
        'ERROR [1:15] Expression expected.',
        '</diagnostics>',
        'Next: read /docs/output.txt and fix error diagnostics before continuing edits or writes.',
        '</edit_result>',
      ].join('\n'),
      path: '/docs/output.txt',
      postWrite: {
        diagnostics: [
          {
            column: 15,
            line: 1,
            message: 'Expression expected.',
            path: '/docs/output.txt',
            severity: 'error',
            source: 'typescript',
          },
        ],
        formatting: null,
      },
      postWriteSummary: {
        currentFileDiagnostics: 1,
        formatting: null,
        nextHint: 'Next: read /docs/output.txt and fix error diagnostics before continuing edits or writes.',
        omittedRelatedFiles: 0,
        relatedFileDiagnostics: 0,
        relatedFiles: 0,
        relatedFocusPaths: [],
        severityCounts: {
          error: 1,
          hint: 0,
          info: 0,
          warning: 0,
        },
        totalDiagnostics: 1,
        visibleRelatedPaths: [],
        visibleRelatedFiles: 0,
      },
      strategy: 'whitespace-normalized',
    });
    expect(freshness.withWriteFreshnessGuard).toHaveBeenCalledWith(
      'session-1',
      'docs/output.txt',
      expect.any(Function),
      'host-filesystem',
    );
  });

  it('keeps backend ambiguity errors visible to the caller', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockRejectedValue(
          new BadRequestException('edit.oldString 按 trimmed-boundary 策略匹配到多个位置。 当前命中 2 处：第 1 行。'),
        ),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/output.txt',
      newString: 'beta',
      oldString: '  alpha  ',
      sessionId: 'session-1',
    })).rejects.toThrow('trimmed-boundary');
  });

  it('formats escape-normalized strategy details for escaped oldString input', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockResolvedValue({
          diff: {
            additions: 1,
            afterLineCount: 1,
            beforeLineCount: 2,
            deletions: 2,
            patch: 'mock escape patch',
          },
          occurrences: 1,
          path: '/docs/output.txt',
          postWrite: {
            diagnostics: [],
            formatting: null,
          },
          strategy: 'escape-normalized',
        }),
      } as never,
      freshness as never,
    );

    const result = await service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/output.txt',
      newString: 'gamma\n',
      oldString: 'alpha\\nbeta\\n',
      sessionId: 'session-2',
    });

    expect(result.strategy).toBe('escape-normalized');
    expect(result.output).toContain('Strategy: escape-normalized');
    expect(result.output).toContain('Path: /docs/output.txt');
  });

  it('formats line-ending-normalized strategy details for CRLF replacement input', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockResolvedValue({
          diff: {
            additions: 2,
            afterLineCount: 2,
            beforeLineCount: 2,
            deletions: 2,
            patch: 'mock crlf patch',
          },
          occurrences: 1,
          path: '/docs/output.txt',
          postWrite: {
            diagnostics: [],
            formatting: null,
          },
          strategy: 'line-ending-normalized',
        }),
      } as never,
      freshness as never,
    );

    const result = await service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/output.txt',
      newString: 'gamma\nomega\n',
      oldString: 'alpha\nbeta\n',
      sessionId: 'session-3',
    });

    expect(result.strategy).toBe('line-ending-normalized');
    expect(result.output).toContain('Strategy: line-ending-normalized');
    expect(result.output).toContain('Path: /docs/output.txt');
  });

  it('keeps empty-old-string strategy visible for create-style edit output', async () => {
    const freshness = {
      withWriteFreshnessGuard: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockResolvedValue({
          diff: {
            additions: 2,
            afterLineCount: 2,
            beforeLineCount: 0,
            deletions: 0,
            patch: 'mock create patch',
          },
          occurrences: 1,
          path: '/docs/new.txt',
          postWrite: {
            diagnostics: [],
            formatting: null,
          },
          strategy: 'empty-old-string',
        }),
      } as never,
      freshness as never,
    );

    const result = await service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/new.txt',
      newString: 'created content\n',
      oldString: '',
      sessionId: 'session-create',
    });

    expect(result.strategy).toBe('empty-old-string');
    expect(result.output).toContain('Strategy: empty-old-string');
    expect(result.output).toContain('Path: /docs/new.txt');
  });
});
