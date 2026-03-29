import { KbService } from './kb.service';

describe('KbService', () => {
  const prisma = {
    knowledgeBaseEntry: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  let service: KbService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.knowledgeBaseEntry.upsert.mockResolvedValue(null);
    service = new KbService(prisma as never);
  });

  it('lists enabled knowledge base entries as safe summaries', async () => {
    prisma.knowledgeBaseEntry.findMany.mockResolvedValue([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        content:
          'Garlic Claw 使用 builtin 与 remote 统一插件运行时，统一 manifest、permissions、hooks 与 host api。',
        tags: 'plugin,runtime',
        enabled: true,
        createdAt: new Date('2026-03-28T02:00:00.000Z'),
        updatedAt: new Date('2026-03-28T02:00:00.000Z'),
      },
    ]);

    await expect(service.listEntries(5)).resolves.toEqual([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        excerpt:
          'Garlic Claw 使用 builtin 与 remote 统一插件运行时，统一 manifest、permissions、hooks 与 host api。',
        tags: ['plugin', 'runtime'],
        createdAt: '2026-03-28T02:00:00.000Z',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);

    expect(prisma.knowledgeBaseEntry.upsert).toHaveBeenCalled();
    expect(prisma.knowledgeBaseEntry.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
      },
      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          createdAt: 'asc',
        },
      ],
      take: 5,
    });
  });

  it('searches and reads knowledge base entries as plugin-safe detail objects', async () => {
    prisma.knowledgeBaseEntry.findMany.mockResolvedValue([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        tags: 'plugin,runtime',
        enabled: true,
        createdAt: new Date('2026-03-28T02:00:00.000Z'),
        updatedAt: new Date('2026-03-28T02:00:00.000Z'),
      },
    ]);
    prisma.knowledgeBaseEntry.findUnique.mockResolvedValue({
      id: 'kb-plugin-runtime',
      title: '统一插件运行时',
      content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      tags: 'plugin,runtime',
      enabled: true,
      createdAt: new Date('2026-03-28T02:00:00.000Z'),
      updatedAt: new Date('2026-03-28T02:00:00.000Z'),
    });

    await expect(service.searchEntries('插件 运行时', 3)).resolves.toEqual([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        tags: ['plugin', 'runtime'],
        createdAt: '2026-03-28T02:00:00.000Z',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    await expect(service.getEntry('kb-plugin-runtime')).resolves.toEqual({
      id: 'kb-plugin-runtime',
      title: '统一插件运行时',
      excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      tags: ['plugin', 'runtime'],
      createdAt: '2026-03-28T02:00:00.000Z',
      updatedAt: '2026-03-28T02:00:00.000Z',
    });

    expect(prisma.knowledgeBaseEntry.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        OR: [
          {
            title: {
              contains: '插件',
            },
          },
          {
            content: {
              contains: '插件',
            },
          },
          {
            tags: {
              contains: '插件',
            },
          },
          {
            title: {
              contains: '运行时',
            },
          },
          {
            content: {
              contains: '运行时',
            },
          },
          {
            tags: {
              contains: '运行时',
            },
          },
        ],
      },
      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          createdAt: 'asc',
        },
      ],
      take: 3,
    });
  });
});
