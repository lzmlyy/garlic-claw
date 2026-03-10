import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private prisma: PrismaService) {}

  async saveMemory(
    userId: string,
    content: string,
    category = 'general',
    keywords?: string,
  ) {
    const memory = await this.prisma.memory.create({
      data: { userId, content, category, keywords },
    });
    this.logger.log(`已为用户 ${userId} 保存记忆："${content.slice(0, 50)}..."`);
    return memory;
  }

  async searchMemories(userId: string, query: string, limit = 10) {
    // SQLite 兼容的关键词搜索，使用 LIKE
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);

    if (words.length === 0) {
      return this.prisma.memory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    // 在 content 和 keywords 字段中搜索
    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        OR: words.flatMap((word) => [
          { content: { contains: word } },
          { keywords: { contains: word } },
        ]),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return memories;
  }

  async getRecentMemories(userId: string, limit = 20) {
    return this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getMemoriesByCategory(userId: string, category: string, limit = 20) {
    return this.prisma.memory.findMany({
      where: { userId, category },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async deleteMemory(id: string, userId: string) {
    return this.prisma.memory.deleteMany({
      where: { id, userId },
    });
  }

  async getMemoryCount(userId: string) {
    return this.prisma.memory.count({ where: { userId } });
  }
}
