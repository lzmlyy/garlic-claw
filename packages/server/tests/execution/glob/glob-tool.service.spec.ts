import { GlobToolService } from '../../../src/modules/execution/glob/glob-tool.service';

describe('GlobToolService', () => {
  it('formats empty glob results with explicit totals', async () => {
    const service = new GlobToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
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
      path: 'docs',
      pattern: '**/*.md',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 0,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Pattern: **/*.md',
        '<matches>',
        '(no matches)',
        '(total matches: 0. Refine path or pattern and retry.)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('formats truncated glob results with visible totals', async () => {
    const service = new GlobToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: ['/docs/a.ts', '/docs/b.ts'],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 120,
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
      pattern: '**/*.ts',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 120,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Pattern: **/*.ts',
        '<matches>',
        '/docs/a.ts',
        '/docs/b.ts',
        '(showing first 2 of 120 matches, 118 hidden. Refine path or pattern to continue.)',
        '(suggested next read: /docs/a.ts)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: true,
    });
  });

  it('formats partial glob output with skipped paths', async () => {
    const service = new GlobToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: ['/docs/a.ts'],
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
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([
          'Project Base: docs',
          'Project Next Read: docs/a.ts',
        ]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      path: 'docs',
      pattern: '**/*.ts',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 1,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Project Base: docs',
        'Project Next Read: docs/a.ts',
        'Pattern: **/*.ts',
        '<matches>',
        '/docs/a.ts',
        '(total matches: 1. Use read on a matching path to inspect content, then edit or write if you need changes.)',
        '(suggested next read: /docs/a.ts)',
        '(search may be incomplete; inaccessible paths were skipped: /docs/private)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('chooses a better suggested read target than the first raw glob match', async () => {
    const service = new GlobToolService(
      {
        deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: ['/docs/guides/setup/runtime.ts', '/docs/readme.ts'],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 2,
          truncated: false,
        }),
      } as never,
      {
        buildSearchOverlay: jest.fn().mockResolvedValue([
          'Project Base: docs',
          'Project Next Read: docs/readme.ts',
        ]),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      path: 'docs',
      pattern: '**/*.ts',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 2,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Project Base: docs',
        'Project Next Read: docs/readme.ts',
        'Pattern: **/*.ts',
        '<matches>',
        '/docs/guides/setup/runtime.ts',
        '/docs/readme.ts',
        '(total matches: 2. Use read on a matching path to inspect content, then edit or write if you need changes.)',
        '(suggested next read: /docs/readme.ts)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: false,
    });
  });
});
