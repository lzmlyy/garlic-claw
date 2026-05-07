import {
  readRuntimeFilesystemPostWriteSummary,
  renderRuntimeFilesystemPostWriteLines,
} from '../../../src/modules/execution/file/runtime-file-post-write-report';

describe('renderRuntimeFilesystemPostWriteLines', () => {
  it('groups diagnostics by file and keeps related file diagnostics visible', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 10,
          line: 1,
          message: 'Current file issue',
          path: '/src/a.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 3,
          line: 2,
          message: 'Related file issue',
          path: '/src/b.ts',
          severity: 'warning',
          source: 'typescript',
        },
      ],
      formatting: null,
    })).toEqual([
      'Diagnostics: 2 issue(s) across 2 file(s)',
      [
        '<diagnostics file="/src/a.ts">',
        'ERROR [1:10] Current file issue',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/b.ts">',
        'WARNING [2:3] Related file issue',
        '</diagnostics>',
      ].join('\n'),
      'Next: read the current file and fix error diagnostics before continuing edits or writes.',
    ]);
  });

  it('adds a formatting-specific next hint when formatting ran without diagnostics', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [],
      formatting: {
        kind: 'json-pretty',
        label: 'json-pretty',
      },
    }, {
      targetPath: '/src/a.json',
    })).toEqual([
      'Formatting: json-pretty',
      'Diagnostics: none',
      'Next: read /src/a.json to confirm the formatted output before continuing edits or writes.',
    ]);
  });

  it('highlights current vs related diagnostics when target path is provided', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 4,
          line: 8,
          message: 'Current file error',
          path: '/src/a.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 2,
          line: 3,
          message: 'Related warning',
          path: '/src/b.ts',
          severity: 'warning',
          source: 'typescript',
        },
      ],
      formatting: null,
    }, {
      targetPath: '/src/a.ts',
    })).toEqual([
      'Diagnostics: 2 issue(s). Current file: 1 Related files: 1 across 1 file(s)',
      [
        '<diagnostics file="/src/a.ts">',
        'ERROR [8:4] Current file error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/b.ts">',
        'WARNING [3:2] Related warning',
        '</diagnostics>',
      ].join('\n'),
      'Next: read /src/a.ts and fix error diagnostics before continuing edits or writes.',
    ]);
  });

  it('shows related-file next hint when errors only exist outside current file', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 2,
          line: 3,
          message: 'Related file error',
          path: '/src/b.ts',
          severity: 'error',
          source: 'typescript',
        },
      ],
      formatting: null,
    }, {
      targetPath: '/src/a.ts',
    })).toEqual([
      'Diagnostics: 1 issue(s) in related file',
      [
        '<diagnostics file="/src/b.ts">',
        'ERROR [3:2] Related file error',
        '</diagnostics>',
      ].join('\n'),
      'Next: read related files first: /src/b.ts. Fix error diagnostics before continuing edits or writes.',
    ]);
  });

  it('prioritizes related file paths in next hints by severity and issue count', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 2,
          line: 3,
          message: 'Related warning',
          path: '/src/b.ts',
          severity: 'warning',
          source: 'typescript',
        },
        {
          column: 8,
          line: 9,
          message: 'Related error',
          path: '/src/c.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 4,
          line: 2,
          message: 'Another related error',
          path: '/src/d.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 5,
          line: 5,
          message: 'Second related error',
          path: '/src/d.ts',
          severity: 'error',
          source: 'typescript',
        },
      ],
      formatting: null,
    }, {
      targetPath: '/src/a.ts',
    })).toEqual([
      'Diagnostics: 4 issue(s) in related files (3 file(s))',
      [
        '<diagnostics file="/src/d.ts">',
        'ERROR [2:4] Another related error',
        'ERROR [5:5] Second related error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/c.ts">',
        'ERROR [9:8] Related error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/b.ts">',
        'WARNING [3:2] Related warning',
        '</diagnostics>',
      ].join('\n'),
      'Next: read related files first: /src/d.ts, /src/c.ts, /src/b.ts. Fix error diagnostics before continuing edits or writes.',
    ]);
  });

  it('keeps next hints actionable when only info diagnostics exist', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 6,
          line: 4,
          message: 'Formatter adjusted import order',
          path: '/src/a.ts',
          severity: 'info',
          source: 'typescript',
        },
      ],
      formatting: null,
    }, {
      targetPath: '/src/a.ts',
    })).toEqual([
      'Diagnostics: 1 issue(s) in current file',
      [
        '<diagnostics file="/src/a.ts">',
        'INFO [4:6] Formatter adjusted import order',
        '</diagnostics>',
      ].join('\n'),
      'Next: read /src/a.ts and review diagnostics before finalizing changes.',
    ]);
  });

  it('caps related diagnostics blocks to the top 5 files while preserving full summary counts', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 1,
          line: 1,
          message: 'Current file error',
          path: '/src/a.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'b warning',
          path: '/src/b.ts',
          severity: 'warning',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'c error',
          path: '/src/c.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'd error',
          path: '/src/d.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'e error',
          path: '/src/e.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'f error',
          path: '/src/f.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'g info',
          path: '/src/g.ts',
          severity: 'info',
          source: 'typescript',
        },
      ],
      formatting: null,
    }, {
      targetPath: '/src/a.ts',
    })).toEqual([
      'Diagnostics: 7 issue(s). Current file: 1 Related files: 6 across 6 file(s)',
      [
        '<diagnostics file="/src/a.ts">',
        'ERROR [1:1] Current file error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/c.ts">',
        'ERROR [1:1] c error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/d.ts">',
        'ERROR [1:1] d error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/e.ts">',
        'ERROR [1:1] e error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/f.ts">',
        'ERROR [1:1] f error',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/b.ts">',
        'WARNING [1:1] b warning',
        '</diagnostics>',
      ].join('\n'),
      '... diagnostics from 1 more related file(s) omitted',
      'Next: read /src/a.ts and fix error diagnostics before continuing edits or writes.',
    ]);
  });

  it('reports visible and omitted related file counts in structured summary', () => {
    expect(readRuntimeFilesystemPostWriteSummary({
      diagnostics: [
        {
          column: 1,
          line: 1,
          message: 'Current file error',
          path: '/src/a.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'b warning',
          path: '/src/b.ts',
          severity: 'warning',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'c error',
          path: '/src/c.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'd error',
          path: '/src/d.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'e error',
          path: '/src/e.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'f error',
          path: '/src/f.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 1,
          line: 1,
          message: 'g info',
          path: '/src/g.ts',
          severity: 'info',
          source: 'typescript',
        },
      ],
      formatting: null,
    }, {
      targetPath: '/src/a.ts',
    })).toEqual({
      currentFileDiagnostics: 1,
      formatting: null,
      nextHint: 'Next: read /src/a.ts and fix error diagnostics before continuing edits or writes.',
      omittedRelatedFiles: 1,
      relatedFileDiagnostics: 6,
      relatedFiles: 6,
      relatedFocusPaths: ['/src/c.ts', '/src/d.ts', '/src/e.ts'],
      severityCounts: {
        error: 5,
        hint: 0,
        info: 1,
        warning: 1,
      },
      totalDiagnostics: 7,
      visibleRelatedPaths: ['/src/c.ts', '/src/d.ts', '/src/e.ts', '/src/f.ts', '/src/b.ts'],
      visibleRelatedFiles: 5,
    });
  });
});
