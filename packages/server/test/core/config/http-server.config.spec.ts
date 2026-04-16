import { readHttpServerConfig } from '../../../src/core/bootstrap/bootstrap-http-app';

describe('readHttpServerConfig', () => {
  it('returns defaults when env values are missing', () => {
    expect(readHttpServerConfig({})).toEqual({
      globalPrefix: 'api',
      port: 23331,
    });
  });

  it('uses explicit env values when provided', () => {
    expect(
      readHttpServerConfig({
        HTTP_GLOBAL_PREFIX: 'neo',
        PORT: '24444',
      }),
    ).toEqual({
      globalPrefix: 'neo',
      port: 24444,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => readHttpServerConfig({ PORT: '0' })).toThrow(
      'PORT must be a positive integer',
    );
  });
});
