import { RuntimeFilesystemPostWriteService } from '../../../src/modules/execution/runtime/runtime-filesystem-post-write.service';

describe('RuntimeFilesystemPostWriteService', () => {
  it('keeps content unchanged when no provider is registered', () => {
    const service = new RuntimeFilesystemPostWriteService();

    expect(service.processTextFile({
      content: 'const value = 1;\n',
      hostPath: '/workspace/docs/value.ts',
      path: '/docs/value.ts',
      sessionRoot: '/workspace',
      visibleRoot: '/',
    })).toEqual({
      content: 'const value = 1;\n',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
    });
  });

  it('pipes content through providers and merges diagnostics', () => {
    const service = new RuntimeFilesystemPostWriteService([
      {
        processTextFile: jest.fn(({ content, path }) => ({
          content: path.endsWith('.json') ? '{\n  "value": 1\n}\n' : content,
          postWrite: {
            diagnostics: [],
            formatting: {
              kind: 'json-pretty',
              label: 'json-pretty',
            },
          },
        })),
      },
      {
        processTextFile: jest.fn(({ content, path }) => ({
          content,
          postWrite: {
            diagnostics: [
              {
                column: 1,
                line: 1,
                message: 'mock issue',
                path,
                severity: 'warning',
                source: 'mock',
              },
            ],
            formatting: null,
          },
        })),
      },
    ]);

    expect(service.processTextFile({
      content: '{"value":1}\n',
      hostPath: '/workspace/docs/config.json',
      path: '/docs/config.json',
      sessionRoot: '/workspace',
      visibleRoot: '/',
    })).toEqual({
      content: '{\n  "value": 1\n}\n',
      postWrite: {
        diagnostics: [
          {
            column: 1,
            line: 1,
            message: 'mock issue',
            path: '/docs/config.json',
            severity: 'warning',
            source: 'mock',
          },
        ],
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
      },
    });
  });
});
