import { GrepToolService } from '../../../src/modules/execution/grep/grep-tool.service';

describe('GrepToolService', () => {
  it('formats empty grep results with an explicit next step', async () => {
    const service = new GrepToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: [],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 0,
          truncated: false,
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      include: '**/*.md',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 0,
      output: [
        '<grep_result>',
        'Base: /docs',
        'Pattern: needle',
        'Include: **/*.md',
        '<matches>',
        '(no matches)',
        '(total matches: 0. Refine path, include or pattern and retry.)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('formats partial search output for the model', async () => {
    const service = new GrepToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: [
            {
              line: 7,
              text: 'needle here',
              virtualPath: '/docs/readme.md',
            },
          ],
          partial: true,
          skippedEntries: [
            {
              path: '/docs/private.md',
              reason: 'unreadable',
            },
            {
              path: '/docs/image.png',
              reason: 'binary',
            },
          ],
          skippedPaths: ['/docs/private.md'],
          totalMatches: 1,
          truncated: false,
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([
          'Project Base: docs',
          'Project Next Read: docs/readme.md',
        ]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      include: '**/*.md',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 1,
      output: [
        '<grep_result>',
        'Base: /docs',
        'Project Base: docs',
        'Project Next Read: docs/readme.md',
        'Pattern: needle',
        'Include: **/*.md',
        '<matches>',
        '/docs/readme.md:',
        '  7: needle here',
        '(total matches: 1. Use read on a matching file to inspect surrounding context, then edit or write if you need changes.)',
        '(suggested next read: /docs/readme.md)',
        '(non-text files were skipped during search: /docs/image.png)',
        '(search may be incomplete; some paths could not be searched: /docs/private.md)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('formats truncated grep results with visible totals', async () => {
    const service = new GrepToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: [
            {
              line: 3,
              text: 'needle one',
              virtualPath: '/docs/a.md',
            },
            {
              line: 8,
              text: 'needle two',
              virtualPath: '/docs/b.md',
            },
          ],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 140,
          truncated: true,
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      include: '**/*.md',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 140,
      output: [
        '<grep_result>',
        'Base: /docs',
        'Pattern: needle',
        'Include: **/*.md',
        '<matches>',
        '/docs/a.md:',
        '  3: needle one',
        '/docs/b.md:',
        '  8: needle two',
        '(showing first 2 of 140 matches, 138 hidden. Refine path, include or pattern to continue.)',
        '(suggested next read: /docs/a.md)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: true,
    });
  });

  it('chooses a better suggested read target than the first raw grep match', async () => {
    const service = new GrepToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: [
            {
              line: 3,
              text: 'needle one',
              virtualPath: '/docs/deep/topic.md',
            },
            {
              line: 5,
              text: 'needle two',
              virtualPath: '/docs/readme.md',
            },
            {
              line: 9,
              text: 'needle three',
              virtualPath: '/docs/readme.md',
            },
          ],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 3,
          truncated: false,
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([
          'Project Base: docs',
          'Project Next Read: docs/readme.md',
        ]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      include: '**/*.md',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 3,
      output: [
        '<grep_result>',
        'Base: /docs',
        'Project Base: docs',
        'Project Next Read: docs/readme.md',
        'Pattern: needle',
        'Include: **/*.md',
        '<matches>',
        '/docs/deep/topic.md:',
        '  3: needle one',
        '/docs/readme.md:',
        '  5: needle two',
        '  9: needle three',
        '(total matches: 3. Use read on a matching file to inspect surrounding context, then edit or write if you need changes.)',
        '(suggested next read: /docs/readme.md)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('omits include guidance from grep truncation summary when include is not provided', async () => {
    const service = new GrepToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: [
            {
              line: 3,
              text: 'needle one',
              virtualPath: '/docs/a.md',
            },
            {
              line: 8,
              text: 'needle two',
              virtualPath: '/docs/b.md',
            },
          ],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 140,
          truncated: true,
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 140,
      output: [
        '<grep_result>',
        'Base: /docs',
        'Pattern: needle',
        '<matches>',
        '/docs/a.md:',
        '  3: needle one',
        '/docs/b.md:',
        '  8: needle two',
        '(showing first 2 of 140 matches, 138 hidden. Refine path or pattern to continue.)',
        '(suggested next read: /docs/a.md)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: true,
    });
  });
});
