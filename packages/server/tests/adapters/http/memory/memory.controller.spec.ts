import { MemoryController } from '../../../../src/adapters/http/memory/memory.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe('MemoryController', () => {
  const runtimeHostService = {
    deleteMemory: jest.fn(),
    getMemoriesByCategory: jest.fn(),
    getRecentMemories: jest.fn(),
    searchMemoriesByUser: jest.fn(),
  };

  let controller: MemoryController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MemoryController(runtimeHostService as never);
  });

  it('marks memory routes with jwt auth guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MemoryController) as Array<{ name?: string }> | undefined;
    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('lists recent, category and search memory views for the current user', async () => {
    runtimeHostService.getRecentMemories.mockReturnValue([{ id: 'memory-1' }]);
    runtimeHostService.getMemoriesByCategory.mockReturnValue([{ id: 'memory-2' }]);
    runtimeHostService.searchMemoriesByUser.mockReturnValue([{ id: 'memory-3' }]);

    await expect(controller.listMemories('user-1')).resolves.toEqual([{ id: 'memory-1' }]);
    await expect(controller.listMemories('user-1', 'preference')).resolves.toEqual([{ id: 'memory-2' }]);
    await expect(controller.listMemories('user-1', undefined, 'coffee', '5')).resolves.toEqual([{ id: 'memory-3' }]);
  });

  it('deletes a memory for the current user', async () => {
    runtimeHostService.deleteMemory.mockReturnValue({ count: 1 });

    await expect(controller.deleteMemory('memory-1', 'user-1')).resolves.toEqual({ count: 1 });
  });
});
