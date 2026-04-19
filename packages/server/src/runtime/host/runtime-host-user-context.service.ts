import type { JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import {
  asJsonValue,
  readKeywords,
  readOptionalString,
  readPositiveInteger,
  readRequiredString,
  requireContextField,
} from './runtime-host-values';

interface RuntimeMemoryRecord {
  category: string;
  content: string;
  createdAt: string;
  id: string;
  keywords: string[];
  userId: string;
}

@Injectable()
export class RuntimeHostUserContextService {
  private readonly memories: RuntimeMemoryRecord[] = [];
  private memorySequence = 0;

  deleteMemory(memoryId: string, userId: string): { count: number } {
    const nextMemories = this.memories.filter((record) => !(record.id === memoryId && record.userId === userId));
    const deleted = this.memories.length - nextMemories.length;
    this.memories.length = 0;
    this.memories.push(...nextMemories);
    return { count: deleted };
  }

  getMemoriesByCategory(userId: string, category: string, limit = 20): JsonValue {
    return this.listMemories(userId, limit, (record) => record.category === category);
  }

  getRecentMemories(userId: string, limit = 20): JsonValue {
    return this.listMemories(userId, limit);
  }

  saveMemory(context: PluginCallContext, params: JsonObject): JsonValue {
    const record: RuntimeMemoryRecord = {
      category: readOptionalString(params, 'category') ?? 'general',
      content: readRequiredString(params, 'content'),
      createdAt: new Date().toISOString(),
      id: `memory-${++this.memorySequence}`,
      keywords: readKeywords(params.keywords),
      userId: requireContextField(context, 'userId'),
    };
    this.memories.push(record);
    return asJsonValue(record);
  }

  searchMemories(context: PluginCallContext, params: JsonObject): JsonValue {
    return this.searchMemoriesByUser(requireContextField(context, 'userId'), readRequiredString(params, 'query'), readPositiveInteger(params, 'limit') ?? 10);
  }

  searchMemoriesByUser(userId: string, query: string, limit = 10): JsonValue {
    const normalizedQuery = query.toLowerCase();
    return this.listMemories(userId, limit, (record) =>
      record.content.toLowerCase().includes(normalizedQuery)
        || record.category.toLowerCase().includes(normalizedQuery)
        || record.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery)));
  }

  private listMemories(userId: string, limit: number, predicate?: (record: RuntimeMemoryRecord) => boolean): JsonValue {
    return this.memories
      .filter((record) => record.userId === userId)
      .filter((record) => !predicate || predicate(record))
      .slice()
      .reverse()
      .slice(0, limit)
      .map((record) => asJsonValue(record));
  }
}
