import { buildPluginEventListResult } from './plugin-event.helpers';

describe('plugin-event.helpers', () => {
  it('builds paginated event list results with parsed metadata and next cursor', () => {
    expect(
      buildPluginEventListResult({
        events: [
          {
            id: 'event-3',
            type: 'tool:error',
            level: 'error',
            message: 'timeout',
            metadataJson: JSON.stringify({
              toolName: 'memory.search',
            }),
            createdAt: new Date('2026-04-02T12:03:00.000Z'),
          },
          {
            id: 'event-2',
            type: 'tool:error',
            level: 'warn',
            message: 'slow',
            metadataJson: JSON.stringify({
              toolName: 'memory.search',
            }),
            createdAt: new Date('2026-04-02T12:02:00.000Z'),
          },
          {
            id: 'event-1',
            type: 'tool:error',
            level: 'info',
            message: 'older',
            metadataJson: JSON.stringify({
              toolName: 'memory.search',
            }),
            createdAt: new Date('2026-04-02T12:01:00.000Z'),
          },
        ],
        limit: 2,
      }),
    ).toEqual({
      items: [
        {
          id: 'event-3',
          type: 'tool:error',
          level: 'error',
          message: 'timeout',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-04-02T12:03:00.000Z',
        },
        {
          id: 'event-2',
          type: 'tool:error',
          level: 'warn',
          message: 'slow',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-04-02T12:02:00.000Z',
        },
      ],
      nextCursor: 'event-1',
    });
  });

  it('falls back to null metadata when persisted event json is malformed', () => {
    const warnings: string[] = [];

    expect(
      buildPluginEventListResult({
        events: [
          {
            id: 'event-1',
            type: 'tool:error',
            level: 'noop',
            message: 'timeout',
            metadataJson: '{bad-json',
            createdAt: new Date('2026-04-02T12:01:00.000Z'),
          },
        ],
        limit: 20,
        onWarn: (message) => warnings.push(message),
      }),
    ).toEqual({
      items: [
        {
          id: 'event-1',
          type: 'tool:error',
          level: 'info',
          message: 'timeout',
          metadata: null,
          createdAt: '2026-04-02T12:01:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(warnings).toEqual([
      expect.stringContaining('plugin.nullableJsonObject'),
    ]);
  });
});
