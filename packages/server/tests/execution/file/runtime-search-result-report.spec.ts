import {
  readRuntimeSearchSuggestedReadPath,
  renderRuntimeSearchSuggestedReadHint,
} from '../../../src/modules/execution/file/runtime-search-result-report';

describe('runtime-search-result-report', () => {
  it('prefers shallower and shorter glob matches over the first raw result', () => {
    expect(readRuntimeSearchSuggestedReadPath([
      '/docs/guides/setup/runtime.md',
      '/docs/readme.md',
      '/docs/guides/intro.md',
    ])).toBe('/docs/readme.md');
  });

  it('prefers grep paths with more hits before fallback path heuristics', () => {
    expect(readRuntimeSearchSuggestedReadPath([
      { virtualPath: '/docs/deep/topic.md' },
      { virtualPath: '/docs/readme.md' },
      { virtualPath: '/docs/readme.md' },
    ])).toBe('/docs/readme.md');
  });

  it('renders the shared suggested-read hint from the ranked candidate', () => {
    expect(renderRuntimeSearchSuggestedReadHint([
      '/docs/deep/topic.md',
      '/docs/readme.md',
    ])).toBe('(suggested next read: /docs/readme.md)');
  });
});
