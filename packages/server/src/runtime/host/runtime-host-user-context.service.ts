import type { JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PERSONA_ID,
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

interface RuntimePersonaRecord {
  createdAt: string;
  description?: string;
  id: string;
  isDefault: boolean;
  name: string;
  prompt: string;
  updatedAt: string;
}

export interface RuntimeHostPersonaConversationState {
  activePersonaId?: string;
  updatedAt: string;
}

@Injectable()
export class RuntimeHostUserContextService {
  private readonly memories: RuntimeMemoryRecord[] = [];
  private memorySequence = 0;
  private readonly personas = new Map<string, RuntimePersonaRecord>([[
    DEFAULT_PERSONA_ID,
    {
      createdAt: '2026-04-10T00:00:00.000Z',
      description: 'server 默认人格',
      id: DEFAULT_PERSONA_ID,
      isDefault: true,
      name: 'Default Assistant',
      prompt: 'You are Garlic Claw.',
      updatedAt: '2026-04-10T00:00:00.000Z',
    },
  ]]);

  activatePersona(input: { conversation: RuntimeHostPersonaConversationState; personaId: string }): JsonValue {
    const persona = this.requirePersona(input.personaId);
    input.conversation.activePersonaId = persona.id;
    input.conversation.updatedAt = new Date().toISOString();
    return this.serializeActivePersona(persona, 'conversation');
  }

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

  listPersonas(): JsonValue {
    return [...this.personas.values()].sort((left, right) => left.id.localeCompare(right.id)).map((persona) => asJsonValue(persona));
  }

  readCurrentPersona(input: { context: PluginCallContext; conversationActivePersonaId?: string }): JsonValue {
    const activePersonaId = input.context.activePersonaId ?? input.conversationActivePersonaId ?? DEFAULT_PERSONA_ID;
    return this.serializeActivePersona(this.requirePersona(activePersonaId), activePersonaId === DEFAULT_PERSONA_ID ? 'default' : 'conversation');
  }

  readPersona(personaId: string): JsonValue {
    return asJsonValue(this.requirePersona(personaId));
  }

  rememberPersonaContext(context: PluginCallContext): void {
    if (!context.activePersonaId || this.personas.has(context.activePersonaId)) {return;}
    const timestamp = new Date().toISOString();
    this.personas.set(context.activePersonaId, {
      createdAt: timestamp,
      id: context.activePersonaId,
      isDefault: false,
      name: context.activePersonaId,
      prompt: '',
      updatedAt: timestamp,
    });
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

  private requirePersona(personaId: string): RuntimePersonaRecord {
    const persona = this.personas.get(personaId);
    if (persona) {return persona;}
    throw new NotFoundException(`Persona not found: ${personaId}`);
  }

  private serializeActivePersona(persona: RuntimePersonaRecord, source: 'conversation' | 'default') {
    return {
      description: persona.description ?? null,
      isDefault: persona.isDefault,
      name: persona.name,
      personaId: persona.id,
      prompt: persona.prompt,
      source,
    };
  }
}
