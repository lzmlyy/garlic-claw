import { BUILTIN_MEMORY_PLUGIN } from '../../../src/modules/plugin/builtin/builtin-memory.plugin';

describe('BUILTIN_MEMORY_PLUGIN', () => {
  it('keeps memory as explicit tools only without hidden before-model injection or plugin config', () => {
    expect(BUILTIN_MEMORY_PLUGIN.manifest.config).toBeUndefined();
    expect(BUILTIN_MEMORY_PLUGIN.manifest.hooks ?? []).toEqual([]);
    expect(BUILTIN_MEMORY_PLUGIN.hooks).toBeUndefined();
    expect(BUILTIN_MEMORY_PLUGIN.manifest.permissions).toEqual([
      'memory:read',
      'memory:write',
    ]);
    expect(BUILTIN_MEMORY_PLUGIN.manifest.tools.map((tool) => tool.name)).toEqual([
      'save_memory',
      'search_memory',
    ]);
  });

  it('keeps save_memory and search_memory as working explicit tools', async () => {
    const host = {
      saveMemory: jest.fn().mockResolvedValue({
        id: 'memory-1',
      }),
      searchMemories: jest.fn().mockResolvedValue([
        {
          category: 'preference',
          content: '用户喜欢咖啡',
          createdAt: '2026-05-04T00:00:00.000Z',
        },
      ]),
    };
    const context = {
      host,
    } as never;

    await expect(BUILTIN_MEMORY_PLUGIN.tools?.save_memory?.({
      category: 'preference',
      content: '用户喜欢咖啡',
      keywords: '咖啡,偏好',
    } as never, context)).resolves.toEqual({
      id: 'memory-1',
      saved: true,
    });
    await expect(BUILTIN_MEMORY_PLUGIN.tools?.search_memory?.({
      query: '咖啡',
    } as never, context)).resolves.toEqual({
      count: 1,
      memories: [
        {
          category: 'preference',
          content: '用户喜欢咖啡',
          date: '2026-05-04',
        },
      ],
    });
    expect(host.saveMemory).toHaveBeenCalledWith({
      category: 'preference',
      content: '用户喜欢咖啡',
      keywords: '咖啡,偏好',
    });
    expect(host.searchMemories).toHaveBeenCalledWith('咖啡');
  });
});
