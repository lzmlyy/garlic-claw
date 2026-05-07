import { replaceRuntimeText } from '../../../src/modules/execution/file/runtime-text-replace';

describe('replaceRuntimeText', () => {
  it('supports exact strategy', () => {
    expect(replaceRuntimeText('alpha beta', 'alpha', 'gamma')).toEqual({
      content: 'gamma beta',
      occurrences: 1,
      strategy: 'exact',
    });
  });

  it('supports block-anchor strategy on multi-line edits with stable anchors', () => {
    expect(replaceRuntimeText(
      'if (true) {\n  console.log("alpha");\n  console.log("tail");\n}\n',
      'if (true) {\nconsole.log("alpha");\n}\n',
      'if (true) {\n    console.log("beta");\n}\n',
    )).toEqual({
      content: 'if (true) {\n    console.log("beta");\n}\n',
      occurrences: 1,
      strategy: 'block-anchor',
    });
  });

  it('supports whitespace-normalized strategy', () => {
    expect(replaceRuntimeText(
      'const value = 1;\n',
      'const   value   =   1;',
      'const value = 2;',
    )).toEqual({
      content: 'const value = 2;\n',
      occurrences: 1,
      strategy: 'whitespace-normalized',
    });
  });

  it('supports indentation-flexible strategy', () => {
    expect(replaceRuntimeText(
      'function demo() {\n    if (true) {\n      return 1;\n    }\n}\n',
      'if (true) {\n  return 1;\n}\n',
      'if (true) {\n  return 2;\n}\n',
    )).toEqual({
      content: 'function demo() {\n    if (true) {\n      return 2;\n    }\n}\n',
      occurrences: 1,
      strategy: 'indentation-flexible',
    });
  });

  it('supports trimmed-boundary strategy', () => {
    expect(replaceRuntimeText(
      'const value = 1;\n',
      '  const value = 1;  ',
      'const value = 2;',
    )).toEqual({
      content: 'const value = 2;\n',
      occurrences: 1,
      strategy: 'trimmed-boundary',
    });
  });

  it('supports trailing-whitespace-trimmed strategy without ignoring leading indentation', () => {
    expect(replaceRuntimeText(
      '  const value = 1;\nconst value = 1;\n',
      'const value = 1;   ',
      'const value = 2;',
    )).toEqual({
      content: '  const value = 1;\nconst value = 2;\n',
      occurrences: 1,
      strategy: 'trailing-whitespace-trimmed',
    });
  });

  it('supports line-ending-normalized strategy and preserves CRLF in replacement output', () => {
    expect(replaceRuntimeText(
      'const first = 1;\r\nconst second = 2;\r\n',
      'const first = 1;\nconst second = 2;\n',
      'const first = 3;\nconst second = 4;\n',
    )).toEqual({
      content: 'const first = 3;\r\nconst second = 4;\r\n',
      occurrences: 1,
      strategy: 'line-ending-normalized',
    });
  });

  it('prefers line-trimmed over context-aware when each line only differs by outer whitespace', () => {
    expect(replaceRuntimeText(
      [
        'alpha(',
        '  beta,',
        '  gamma,',
        ')',
        '',
      ].join('\n'),
      [
        ' alpha( ',
        ' beta,  ',
        ' gamma, ',
        ' ) ',
        '',
      ].join('\n'),
      [
        'alpha(',
        '  betaUpdated,',
        '  gamma,',
        ')',
        '',
      ].join('\n'),
    )).toEqual({
      content: [
        'alpha(',
        '  betaUpdated,',
        '  gamma,',
        ')',
        '',
      ].join('\n'),
      occurrences: 1,
      strategy: 'line-trimmed',
    });
  });

  it('rejects ambiguous trimmed-boundary matches instead of silently editing the first one', () => {
    expect(() => replaceRuntimeText(
      'alpha middle alpha\n',
      '  alpha  ',
      'beta',
    )).toThrow('trimmed-boundary');
    expect(() => replaceRuntimeText(
      'alpha middle alpha\n',
      '  alpha  ',
      'beta',
    )).toThrow('第 1 行');
  });

  it('rejects ambiguous exact matches instead of falling through to looser strategies', () => {
    expect(() => replaceRuntimeText(
      'foo\n foo \n',
      'foo',
      'bar',
    )).toThrow('第 1 行');
    expect(() => replaceRuntimeText(
      'foo\n foo \n',
      'foo',
      'bar',
    )).toThrow('第 2 行');
  });

  it('supports replaceAll on a strict exact match set', () => {
    expect(replaceRuntimeText(
      'alpha\nalpha\n',
      'alpha',
      'beta',
      true,
    )).toEqual({
      content: 'beta\nbeta\n',
      occurrences: 2,
      strategy: 'exact',
    });
  });

  it('rejects replaceAll when a loose strategy points to different candidate texts', () => {
    expect(() => replaceRuntimeText(
      'value\n\tvalue\t\n',
      ' value ',
      'beta',
      true,
    )).toThrow('replaceAll 只允许同一段文本的全量替换');
  });

  it('prefers line-trimmed strategy when every line already matches after trim', () => {
    expect(replaceRuntimeText(
      [
        'function run() {',
        '  const value = computeOldValue();',
        '  return value;',
        '}',
        '',
      ].join('\n'),
      [
        'function run() {',
        'const value = computeOldValue();',
        'return value;',
        '}',
        '',
      ].join('\n'),
      [
        'function run() {',
        '  const value = computeNewValue();',
        '  return value;',
        '}',
        '',
      ].join('\n'),
    )).toEqual({
      content: [
        'function run() {',
        '  const value = computeNewValue();',
        '  return value;',
        '}',
        '',
      ].join('\n'),
      occurrences: 1,
      strategy: 'line-trimmed',
    });
  });

  it('prefers line-trimmed over context-aware when a looser anchor match is unnecessary', () => {
    expect(replaceRuntimeText(
      [
        'const start',
        'x = 1',
        'y = 2',
        'const end',
        '',
        'const start',
        'x = 1   ',
        'y=2   ',
        'const end',
        '',
      ].join('\n'),
      [
        'const start',
        'x = 1',
        'y=2',
        'const end',
        '',
      ].join('\n'),
      'done\n',
    )).toEqual({
      content: [
        'const start',
        'x = 1',
        'y = 2',
        'const end',
        '',
        'done',
        '',
      ].join('\n'),
      occurrences: 1,
      strategy: 'line-trimmed',
    });
  });

  it('keeps context-aware tie cases ambiguous instead of auto-picking one candidate', () => {
    expect(() => replaceRuntimeText(
      [
        'const start',
        'a',
        'x',
        'const end',
        '',
        'const start',
        'a',
        'y',
        'const end',
        '',
      ].join('\n'),
      [
        'const start',
        'a',
        'z',
        'const end',
        '',
      ].join('\n'),
      'done\n',
    )).toThrow('context-aware');
    expect(() => replaceRuntimeText(
      [
        'const start',
        'a',
        'x',
        'const end',
        '',
        'const start',
        'a',
        'y',
        'const end',
        '',
      ].join('\n'),
      [
        'const start',
        'a',
        'z',
        'const end',
        '',
      ].join('\n'),
      'done\n',
    )).toThrow('第 1 行');
    expect(() => replaceRuntimeText(
      [
        'const start',
        'a',
        'x',
        'const end',
        '',
        'const start',
        'a',
        'y',
        'const end',
        '',
      ].join('\n'),
      [
        'const start',
        'a',
        'z',
        'const end',
        '',
      ].join('\n'),
      'done\n',
    )).toThrow('第 6 行');
  });

  it('selects the best block-anchor candidate when multiple anchor blocks are available', () => {
    expect(replaceRuntimeText(
      [
        'BEGIN',
        'a',
        'x',
        'b',
        'END',
        '',
        'BEGIN',
        'a',
        'b',
        'c',
        'END',
        '',
      ].join('\n'),
      [
        'BEGIN',
        'a',
        'b',
        'END',
        '',
      ].join('\n'),
      'DONE\n',
    )).toEqual({
      content: [
        'BEGIN',
        'a',
        'x',
        'b',
        'END',
        '',
        'DONE',
        '',
      ].join('\n'),
      occurrences: 1,
      strategy: 'block-anchor',
    });
  });

  it('supports escape-normalized strategy for escaped newline patterns', () => {
    expect(replaceRuntimeText(
      'alpha\nbeta\n',
      'alpha\\nbeta\\n',
      'gamma\n',
    )).toEqual({
      content: 'gamma\n',
      occurrences: 1,
      strategy: 'escape-normalized',
    });
  });

  it('supports escape-normalized strategy for unicode escape patterns', () => {
    expect(replaceRuntimeText(
      'const text = "A";\n',
      'const text = "\\u0041";\n',
      'const text = "B";\n',
    )).toEqual({
      content: 'const text = "B";\n',
      occurrences: 1,
      strategy: 'escape-normalized',
    });
  });

  it('returns a more actionable not-found error', () => {
    expect(() => replaceRuntimeText(
      'const answer = 42;\n',
      'const answer = 7;\n',
      'const answer = 8;\n',
    )).toThrow('请重新读取当前文件');
  });
});
