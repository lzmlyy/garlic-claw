import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { resolveServerStatePath } from '../../../core/runtime/server-workspace-paths';
import {
  asJsonValue,
  readKeywords,
  readOptionalString,
  readPositiveInteger,
  readRequiredString,
  requireContextField,
} from './host-input.codec';

interface RuntimeMemoryRecord {
  category: string;
  content: string;
  createdAt: string;
  id: string;
  keywords: string[];
  userId: string;
}

interface HostMemoryStoreFile {
  memories?: RuntimeMemoryRecord[];
  memorySequence?: number;
}

@Injectable()
export class UserContextService {
  private readonly memories: RuntimeMemoryRecord[];
  private readonly storagePath: string | null;
  private memorySequence: number;

  constructor() {
    this.storagePath = resolveMemoryStoragePath();
    const loaded = this.loadMemories();
    this.memories = loaded.memories;
    this.memorySequence = loaded.memorySequence;
  }

  deleteMemory(memoryId: string, userId: string): { count: number } {
    const nextMemories = this.memories.filter((record) => !(record.id === memoryId && record.userId === userId));
    const deleted = this.memories.length - nextMemories.length;
    this.memories.length = 0;
    this.memories.push(...nextMemories);
    this.saveMemories();
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
    this.saveMemories();
    return asJsonValue(record);
  }

  searchMemories(context: PluginCallContext, params: JsonObject): JsonValue {
    return this.searchMemoriesByUser(requireContextField(context, 'userId'), readRequiredString(params, 'query'), readPositiveInteger(params, 'limit') ?? 10);
  }

  searchMemoriesByUser(userId: string, query: string, limit = 10): JsonValue {
    const normalizedTerms = normalizeMemorySearchTerms(query);
    return this.memories
      .filter((record) => record.userId === userId)
      .map((record) => ({ record, score: countMemorySearchMatches(record, normalizedTerms) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || Date.parse(right.record.createdAt) - Date.parse(left.record.createdAt))
      .slice(0, limit)
      .map((entry) => asJsonValue(entry.record));
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

  private loadMemories(): { memories: RuntimeMemoryRecord[]; memorySequence: number } {
    if (!this.storagePath) {
      return { memories: [], memorySequence: 0 };
    }
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {
        return { memories: [], memorySequence: 0 };
      }
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as HostMemoryStoreFile;
      return {
        memories: Array.isArray(parsed.memories) ? parsed.memories.filter(isRuntimeMemoryRecord) : [],
        memorySequence: typeof parsed.memorySequence === 'number' ? parsed.memorySequence : 0,
      };
    } catch {
      return { memories: [], memorySequence: 0 };
    }
  }

  private saveMemories(): void {
    if (!this.storagePath) {
      return;
    }
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({
      memories: this.memories,
      memorySequence: this.memorySequence,
    }, null, 2), 'utf-8');
  }
}

function resolveMemoryStoragePath(): string | null {
  if (process.env.GARLIC_CLAW_MEMORIES_PATH) {
    return path.resolve(process.env.GARLIC_CLAW_MEMORIES_PATH);
  }
  if (process.env.JEST_WORKER_ID) {
    return null;
  }
  return resolveServerStatePath('memories.server.json');
}

function isRuntimeMemoryRecord(value: unknown): value is RuntimeMemoryRecord {
  return typeof value === 'object'
    && value !== null
    && typeof (value as RuntimeMemoryRecord).category === 'string'
    && typeof (value as RuntimeMemoryRecord).content === 'string'
    && typeof (value as RuntimeMemoryRecord).createdAt === 'string'
    && typeof (value as RuntimeMemoryRecord).id === 'string'
    && Array.isArray((value as RuntimeMemoryRecord).keywords)
    && (value as RuntimeMemoryRecord).keywords.every((keyword) => typeof keyword === 'string')
    && typeof (value as RuntimeMemoryRecord).userId === 'string';
}

function normalizeMemorySearchTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[\s,，。；;、|/]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(terms.length > 0 ? terms : [query.toLowerCase().trim()].filter(Boolean))];
}

function countMemorySearchMatches(record: RuntimeMemoryRecord, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }
  const normalizedContent = record.content.toLowerCase();
  const normalizedCategory = record.category.toLowerCase();
  const normalizedKeywords = record.keywords.map((keyword) => keyword.toLowerCase());
  return terms.reduce((count, term) => (
    normalizedContent.includes(term)
      || normalizedCategory.includes(term)
      || normalizedKeywords.some((keyword) => keyword.includes(term))
      ? count + 1
      : count
  ), 0);
}
