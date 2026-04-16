import type { JsonObject, JsonValue } from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { asJsonValue, readPositiveInteger, readRequiredString } from './runtime-host-values';

interface RuntimeKbEntry {
  content: string;
  createdAt: string;
  excerpt: string;
  id: string;
  tags: string[];
  title: string;
  updatedAt: string;
}

@Injectable()
export class RuntimeHostKnowledgeService {
  private readonly kbEntries: RuntimeKbEntry[] = [{
    content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
    createdAt: '2026-03-28T02:00:00.000Z',
    excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
    id: 'kb-plugin-runtime',
    tags: ['plugin', 'runtime'],
    title: '统一插件运行时',
    updatedAt: '2026-03-28T02:00:00.000Z',
  }];

  getKbEntry(params: JsonObject): JsonValue {
    const entryId = readRequiredString(params, 'entryId');
    const entry = this.kbEntries.find((item) => item.id === entryId);
    if (entry) {return asJsonValue(entry);}
    throw new NotFoundException(`KB entry not found: ${entryId}`);
  }

  listKbEntries(params: JsonObject): JsonValue {
    const limit = readPositiveInteger(params, 'limit') ?? 20;
    return this.kbEntries.slice(0, limit).map((entry) => asJsonValue({
      createdAt: entry.createdAt,
      excerpt: entry.excerpt,
      id: entry.id,
      tags: [...entry.tags],
      title: entry.title,
      updatedAt: entry.updatedAt,
    }));
  }

  searchKbEntries(params: JsonObject): JsonValue {
    const limit = readPositiveInteger(params, 'limit') ?? 5;
    const query = readRequiredString(params, 'query').toLowerCase();
    return this.kbEntries
      .filter((entry) => entry.title.toLowerCase().includes(query) || entry.excerpt.toLowerCase().includes(query) || entry.content.toLowerCase().includes(query) || entry.tags.some((tag) => tag.toLowerCase().includes(query)))
      .slice(0, limit)
      .map((entry) => asJsonValue(entry));
  }
}
