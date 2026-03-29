import type {
  PluginKbEntryDetail,
  PluginKbEntrySummary,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_KB_ENTRIES } from './default-kb';

/**
 * KB 宿主服务。
 *
 * 输入:
 * - 搜索词
 * - 条目 ID
 * - 列表限制
 *
 * 输出:
 * - 插件可见的知识库摘要/详情
 *
 * 预期行为:
 * - 保障最小系统知识条目存在
 * - 向 builtin / remote 插件暴露统一只读 KB 面
 * - 不把 Prisma 细节泄漏给插件层
 */
@Injectable()
export class KbService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 列出当前启用的知识库条目摘要。
   * @param limit 返回数量上限
   * @returns 条目摘要列表
   */
  async listEntries(limit = 20): Promise<PluginKbEntrySummary[]> {
    await this.ensureDefaultEntries();
    const entries = await this.prisma.knowledgeBaseEntry.findMany({
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
      take: normalizeKbLimit(limit, 20),
    });

    return entries.map((entry) => this.toSummary(entry));
  }

  /**
   * 搜索启用中的知识库条目。
   * @param query 搜索词
   * @param limit 返回数量上限
   * @returns 条目详情列表
   */
  async searchEntries(query: string, limit = 5): Promise<PluginKbEntryDetail[]> {
    await this.ensureDefaultEntries();
    const words = query
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);
    const entries = await this.prisma.knowledgeBaseEntry.findMany({
      where: words.length > 0
        ? {
          enabled: true,
          OR: words.flatMap((word) => [
            {
              title: {
                contains: word,
              },
            },
            {
              content: {
                contains: word,
              },
            },
            {
              tags: {
                contains: word,
              },
            },
          ]),
        }
        : {
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
      take: normalizeKbLimit(limit, 5),
    });

    return entries.map((entry) => this.toDetail(entry));
  }

  /**
   * 读取一个启用中的知识库条目详情。
   * @param entryId 条目 ID
   * @returns 条目详情
   */
  async getEntry(entryId: string): Promise<PluginKbEntryDetail> {
    await this.ensureDefaultEntries();
    const entry = await this.prisma.knowledgeBaseEntry.findUnique({
      where: {
        id: entryId,
      },
    });
    if (!entry || !entry.enabled) {
      throw new NotFoundException(`KB entry not found: ${entryId}`);
    }

    return this.toDetail(entry);
  }

  /**
   * 保障默认系统知识条目存在。
   * @returns 无返回值
   */
  private async ensureDefaultEntries(): Promise<void> {
    await Promise.all(
      DEFAULT_KB_ENTRIES.map((entry) =>
        this.prisma.knowledgeBaseEntry.upsert({
          where: {
            id: entry.id,
          },
          update: {},
          create: {
            id: entry.id,
            title: entry.title,
            content: entry.content,
            tags: entry.tags,
            enabled: true,
          },
        })),
    );
  }

  /**
   * 将持久化条目裁剪成插件摘要。
   * @param entry 原始知识库记录
   * @returns 插件可见摘要
   */
  private toSummary(entry: {
    id: string;
    title: string;
    content: string;
    tags: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PluginKbEntrySummary {
    return {
      id: entry.id,
      title: entry.title,
      excerpt: createKbExcerpt(entry.content),
      tags: toKbTags(entry.tags),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  /**
   * 将持久化条目裁剪成插件详情。
   * @param entry 原始知识库记录
   * @returns 插件可见详情
   */
  private toDetail(entry: {
    id: string;
    title: string;
    content: string;
    tags: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PluginKbEntryDetail {
    return {
      ...this.toSummary(entry),
      content: entry.content,
    };
  }
}

/**
 * 把用户输入的 limit 收敛到合理范围。
 * @param limit 原始限制数量
 * @param fallback 默认值
 * @returns 安全的正整数限制
 */
function normalizeKbLimit(limit: number, fallback: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(limit));
}

/**
 * 生成条目的安全摘要文本。
 * @param content 原始正文
 * @returns 截断后的摘要
 */
function createKbExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
}

/**
 * 将逗号分隔标签转换为字符串数组。
 * @param rawTags 原始标签文本
 * @returns 去空白后的标签数组
 */
function toKbTags(rawTags: string | null): string[] {
  return (rawTags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
