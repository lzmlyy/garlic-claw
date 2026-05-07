import { BadRequestException } from '@nestjs/common';
import {
  joinRuntimeVisiblePath,
  normalizeRuntimeVisiblePath,
  resolveRuntimeVisiblePath,
} from '../../../src/modules/execution/runtime/runtime-visible-path';

describe('runtime-visible-path', () => {
  it('normalizes visible paths', () => {
    expect(normalizeRuntimeVisiblePath('/docs/./nested/../file.txt')).toBe('/docs/file.txt');
  });

  it('resolves relative and absolute paths inside the visible root', () => {
    expect(resolveRuntimeVisiblePath('/workspace', 'docs/readme.md')).toBe('/workspace/docs/readme.md');
    expect(resolveRuntimeVisiblePath('/workspace', '/workspace/docs/readme.md')).toBe('/workspace/docs/readme.md');
    expect(resolveRuntimeVisiblePath('/', 'docs/readme.md')).toBe('/docs/readme.md');
  });

  it('rejects escaping the visible root', () => {
    expect(() => resolveRuntimeVisiblePath('/workspace', '../../outside')).toThrow(BadRequestException);
    expect(() => resolveRuntimeVisiblePath('/workspace', '/outside')).toThrow('路径必须位于 /workspace 内');
  });

  it('joins nested visible paths with the same normalization rules', () => {
    expect(joinRuntimeVisiblePath('/workspace/docs', '../logs/run.txt')).toBe('/workspace/logs/run.txt');
  });
});
