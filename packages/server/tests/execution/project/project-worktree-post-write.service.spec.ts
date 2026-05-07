import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorktreePostWriteService } from '../../../src/modules/execution/project/project-worktree-post-write.service';

describe('ProjectWorktreePostWriteService', () => {
  const tempRoots: string[] = [];
  const inlineRoot = path.join(os.tmpdir(), 'gc-post-write-inline');

  afterEach(() => {
    while (tempRoots.length > 0) {
      const nextRoot = tempRoots.pop();
      if (nextRoot && fs.existsSync(nextRoot)) {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      }
    }
  });

  it('formats json and reports no diagnostics for valid content', () => {
    const service = new ProjectWorktreePostWriteService();

    const result = service.processTextFile({
      content: '{"value":1}\n',
      hostPath: path.join(inlineRoot, 'docs', 'config.json'),
      path: '/docs/config.json',
      sessionRoot: inlineRoot,
      visibleRoot: '/',
    });

    expect(result).toEqual({
      content: '{\n  "value": 1\n}\n',
      postWrite: {
        diagnostics: [],
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
      },
    });
  });

  it('returns syntax diagnostics for invalid typescript content', () => {
    const service = new ProjectWorktreePostWriteService();

    const result = service.processTextFile({
      content: 'const answer = ;\n',
      hostPath: path.join(inlineRoot, 'docs', 'broken.ts'),
      path: '/docs/broken.ts',
      sessionRoot: inlineRoot,
      visibleRoot: '/',
    });

    expect(result.content).toBe('const answer = ;\n');
    expect(result.postWrite.formatting).toBeNull();
    expect(result.postWrite.diagnostics).toEqual([
      expect.objectContaining({
        line: 1,
        path: '/docs/broken.ts',
        severity: 'error',
        source: 'typescript',
      }),
    ]);
    expect(result.postWrite.diagnostics[0]?.message).toContain('Expression expected');
  });

  it('returns syntax diagnostics for invalid json content', () => {
    const service = new ProjectWorktreePostWriteService();

    const result = service.processTextFile({
      content: '{"value": }',
      hostPath: path.join(inlineRoot, 'docs', 'invalid.json'),
      path: '/docs/invalid.json',
      sessionRoot: inlineRoot,
      visibleRoot: '/',
    });

    expect(result.content).toBe('{"value": }');
    expect(result.postWrite.formatting).toBeNull();
    expect(result.postWrite.diagnostics).toEqual([
      expect.objectContaining({
        line: 1,
        path: '/docs/invalid.json',
        severity: 'error',
        source: 'typescript',
      }),
    ]);
  });

  it('returns project diagnostics from related files when tsconfig is present', () => {
    const service = new ProjectWorktreePostWriteService();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-post-write-project-'));
    tempRoots.push(tempRoot);

    fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        noEmit: true,
        strict: true,
        target: 'esnext',
      },
      include: ['src/**/*.ts'],
    }, null, 2));
    fs.writeFileSync(path.join(tempRoot, 'src', 'b.ts'), 'export const value: string = 1;\n', 'utf8');

    const result = service.processTextFile({
      content: 'import { value } from "./b";\nconsole.log(value);\n',
      hostPath: path.join(tempRoot, 'src', 'a.ts'),
      path: '/src/a.ts',
      sessionRoot: tempRoot,
      visibleRoot: '/',
    });

    expect(result.content).toBe('import { value } from "./b";\nconsole.log(value);\n');
    expect(result.postWrite.formatting).toBeNull();
    expect(result.postWrite.diagnostics).toEqual([
      expect.objectContaining({
        path: '/src/b.ts',
        severity: 'error',
        source: 'typescript',
      }),
    ]);
    expect(result.postWrite.diagnostics[0]?.message).toContain("Type 'number' is not assignable to type 'string'");
  });
});
