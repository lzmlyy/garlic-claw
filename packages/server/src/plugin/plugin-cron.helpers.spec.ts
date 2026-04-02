import {
  normalizePluginCronJobRecord,
  parsePluginCronData,
  parsePluginCronInterval,
  parsePluginCronSource,
  serializePluginCronJob,
} from './plugin-cron.helpers';

describe('plugin-cron.helpers', () => {
  it('normalizes persisted cron records and serializes summaries safely', () => {
    const record = normalizePluginCronJobRecord({
      id: 'cron-job-1',
      pluginName: 'builtin.cron-heartbeat',
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳',
      source: 'host',
      enabled: true,
      dataJson: JSON.stringify({
        channel: 'default',
      }),
      lastRunAt: new Date('2026-03-27T13:00:10.000Z'),
      lastError: null,
      lastErrorAt: null,
      createdAt: new Date('2026-03-27T13:00:00.000Z'),
      updatedAt: new Date('2026-03-27T13:00:10.000Z'),
    });

    expect(serializePluginCronJob(record)).toEqual({
      id: 'cron-job-1',
      pluginId: 'builtin.cron-heartbeat',
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳',
      source: 'host',
      enabled: true,
      data: {
        channel: 'default',
      },
      lastRunAt: '2026-03-27T13:00:10.000Z',
      lastError: null,
      lastErrorAt: null,
      createdAt: '2026-03-27T13:00:00.000Z',
      updatedAt: '2026-03-27T13:00:10.000Z',
    });
  });

  it('parses cron data and interval with fallbacks', () => {
    const onWarn = jest.fn();

    expect(parsePluginCronData('{"ok":true}', onWarn)).toEqual({ ok: true });
    expect(parsePluginCronData('{not-json', onWarn)).toBeUndefined();
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining('插件 cron data JSON 无效，已回退为空值:'),
    );

    expect(parsePluginCronInterval('10s')).toBe(10_000);
    expect(parsePluginCronInterval('15m')).toBe(900_000);
    expect(parsePluginCronInterval('1h')).toBe(3_600_000);
    expect(parsePluginCronInterval('5s')).toBeNull();
    expect(parsePluginCronInterval('not-real')).toBeNull();

    expect(parsePluginCronSource('host')).toBe('host');
    expect(parsePluginCronSource('manifest')).toBe('manifest');
    expect(parsePluginCronSource('anything-else')).toBe('manifest');
  });
});
