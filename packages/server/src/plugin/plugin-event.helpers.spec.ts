import {
  buildPluginEventFindManyInput,
  buildPluginEventListResult,
} from './plugin-event.helpers';

describe('plugin-event.helpers', () => {
  it('builds event query input with filters, cursor, ordering, and take size', () => {
    expect(
      buildPluginEventFindManyInput({
        pluginId: 'plugin-1',
        options: {
          limit: 2,
          level: 'error',
          type: 'tool:error',
          keyword: 'memory.search',
        },
        cursorEvent: null,
      }),
    ).toEqual({
      where: {
        pluginId: 'plugin-1',
        level: 'error',
        type: 'tool:error',
        OR: [
          {
            type: {
              contains: 'memory.search',
            },
          },
          {
            message: {
              contains: 'memory.search',
            },
          },
          {
            metadataJson: {
              contains: 'memory.search',
            },
          },
        ],
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: 3,
    });
  });

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

  it('builds cursor-aware findMany input for event pagination', () => {
    expect(
      buildPluginEventFindManyInput({
        pluginId: 'plugin-1',
        options: {
          limit: 20,
          cursor: 'event-4',
        },
        cursorEvent: {
          id: 'event-4',
          createdAt: new Date('2026-04-02T12:04:00.000Z'),
        },
      }),
    ).toEqual({
      where: {
        pluginId: 'plugin-1',
        AND: [
          {
            OR: [
              {
                createdAt: {
                  lt: new Date('2026-04-02T12:04:00.000Z'),
                },
              },
              {
                createdAt: new Date('2026-04-02T12:04:00.000Z'),
                id: {
                  lt: 'event-4',
                },
              },
            ],
          },
        ],
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: 21,
    });
  });
});
