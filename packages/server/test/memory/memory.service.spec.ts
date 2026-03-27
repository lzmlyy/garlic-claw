import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { MemoryService } from '@/memory/memory.service';

describe('MemoryService', () => {
  let service: MemoryService;
  let prisma: {
    memory: {
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      memory: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  describe('saveMemory', () => {
    it('should create a memory record', async () => {
      const mockMemory = {
        id: 'm1',
        userId: 'u1',
        content: 'I like coffee',
        category: 'preference',
        keywords: 'coffee,drink',
      };
      prisma.memory.create.mockResolvedValue(mockMemory);

      const result = await service.saveMemory(
        'u1',
        'I like coffee',
        'preference',
        'coffee,drink',
      );

      expect(prisma.memory.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          content: 'I like coffee',
          category: 'preference',
          keywords: 'coffee,drink',
        },
      });
      expect(result).toEqual(mockMemory);
    });

    it('should default category to general', async () => {
      prisma.memory.create.mockResolvedValue({});

      await service.saveMemory('u1', 'some fact');

      expect(prisma.memory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ category: 'general' }),
      });
    });
  });

  describe('searchMemories', () => {
    it('should search by keywords', async () => {
      prisma.memory.findMany.mockResolvedValue([
        { id: 'm1', content: 'I like coffee' },
      ]);

      const result = await service.searchMemories('u1', 'coffee');

      expect(prisma.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            OR: expect.any(Array),
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should return recent if query has no valid words', async () => {
      prisma.memory.findMany.mockResolvedValue([]);

      await service.searchMemories('u1', 'a');

      expect(prisma.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('getRecentMemories', () => {
    it('should return latest memories', async () => {
      prisma.memory.findMany.mockResolvedValue([]);

      await service.getRecentMemories('u1', 5);

      expect(prisma.memory.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    });
  });

  describe('deleteMemory', () => {
    it('should delete user-owned memory', async () => {
      prisma.memory.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteMemory('m1', 'u1');

      expect(prisma.memory.deleteMany).toHaveBeenCalledWith({
        where: { id: 'm1', userId: 'u1' },
      });
    });
  });

  describe('getMemoryCount', () => {
    it('should count memories for user', async () => {
      prisma.memory.count.mockResolvedValue(42);

      const count = await service.getMemoryCount('u1');

      expect(count).toBe(42);
    });
  });
});
