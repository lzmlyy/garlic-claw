import type {
  PluginPersonaCurrentInfo,
  PluginPersonaDeleteResult,
  PluginPersonaDetail,
  PluginPersonaDialogEntry,
  PluginPersonaSummary,
  PluginPersonaUpdateInput,
  PluginPersonaUpsertInput,
} from '@garlic-claw/shared'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { RuntimeHostConversationRecordService } from '../runtime/host/runtime-host-conversation-record.service'
import { DEFAULT_PERSONA_ID } from '../runtime/host/runtime-host-values'
import type { StoredPersonaRecord } from './persona-store.service'
import { PersonaStoreService } from './persona-store.service'

@Injectable()
export class PersonaService {
  constructor(
    private readonly personaStoreService: PersonaStoreService,
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
  ) {}

  listPersonas(): PluginPersonaSummary[] {
    return this.listStoredPersonas().map(toPersonaSummary)
  }

  readPersona(personaId: string): PluginPersonaDetail {
    return toPersonaDetail(this.requirePersona(personaId))
  }

  readCurrentPersona(input: {
    context: {
      activePersonaId?: string
      conversationId?: string
      source: string
      userId?: string
    }
    conversationActivePersonaId?: string
    conversationId?: string
  }): PluginPersonaCurrentInfo {
    const conversationActivePersonaId = input.conversationActivePersonaId
      ?? this.readConversationActivePersonaId(input.conversationId ?? input.context.conversationId)
    const resolved = this.resolvePersonaForContext(
      input.context.activePersonaId,
      conversationActivePersonaId,
    )
    return {
      ...toPersonaDetail(resolved.persona),
      personaId: resolved.persona.id,
      source: resolved.source,
    }
  }

  activatePersona(input: {
    conversationId: string
    personaId: string
    userId?: string
  }): PluginPersonaCurrentInfo {
    const persona = this.requirePersona(input.personaId)
    this.runtimeHostConversationRecordService.rememberConversationActivePersona(
      input.conversationId,
      persona.id,
      input.userId,
    )
    return {
      ...toPersonaDetail(persona),
      personaId: persona.id,
      source: 'conversation',
    }
  }

  createPersona(input: PluginPersonaUpsertInput): PluginPersonaDetail {
    const personas = this.listStoredPersonas()
    const personaId = normalizeRequiredId(input.id, 'id is required')
    if (personas.some((persona) => persona.id === personaId)) {
      throw new BadRequestException(`Persona already exists: ${personaId}`)
    }
    const timestamp = new Date().toISOString()
    const created: StoredPersonaRecord = {
      avatar: null,
      beginDialogs: normalizeDialogEntries(input.beginDialogs),
      createdAt: timestamp,
      customErrorMessage: normalizeNullableText(input.customErrorMessage),
      description: normalizeOptionalText(input.description),
      id: personaId,
      isDefault: input.isDefault === true,
      name: normalizeRequiredText(input.name, 'name is required'),
      prompt: normalizeRequiredText(input.prompt, 'prompt is required'),
      skillIds: normalizeNullableIdList(input.skillIds),
      toolNames: normalizeNullableIdList(input.toolNames),
      updatedAt: timestamp,
    }
    const savedPersona = this.persistPersonas([...personas, created], created.id).find((persona) => persona.id === created.id)
    if (!savedPersona) {
      throw new NotFoundException(`Persona not found after create: ${created.id}`)
    }
    return toPersonaDetail(savedPersona)
  }

  updatePersona(personaId: string, patch: PluginPersonaUpdateInput): PluginPersonaDetail {
    const current = this.requirePersona(personaId)
    const next: StoredPersonaRecord = {
      ...current,
      ...(patch.beginDialogs !== undefined ? { beginDialogs: normalizeDialogEntries(patch.beginDialogs) } : {}),
      ...(patch.customErrorMessage !== undefined ? { customErrorMessage: normalizeNullableText(patch.customErrorMessage) } : {}),
      ...(patch.description !== undefined ? { description: normalizeOptionalText(patch.description) } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      ...(patch.name !== undefined ? { name: normalizeRequiredText(patch.name, 'name is required') } : {}),
      ...(patch.prompt !== undefined ? { prompt: normalizeRequiredText(patch.prompt, 'prompt is required') } : {}),
      ...(patch.skillIds !== undefined ? { skillIds: normalizeNullableIdList(patch.skillIds) } : {}),
      ...(patch.toolNames !== undefined ? { toolNames: normalizeNullableIdList(patch.toolNames) } : {}),
      updatedAt: new Date().toISOString(),
    }
    const savedPersona = this.persistPersonas(
      this.listStoredPersonas().map((persona) => persona.id === personaId ? next : persona),
      next.isDefault ? next.id : undefined,
    ).find((persona) => persona.id === personaId)
    if (!savedPersona) {
      throw new NotFoundException(`Persona not found after update: ${personaId}`)
    }
    return toPersonaDetail(savedPersona)
  }

  deletePersona(personaId: string): PluginPersonaDeleteResult {
    if (personaId === DEFAULT_PERSONA_ID) {
      throw new BadRequestException('Default persona cannot be deleted')
    }
    this.requirePersona(personaId)
    const remaining = this.listStoredPersonas().filter((persona) => persona.id !== personaId)
    this.persistPersonas(remaining, undefined)
    const fallbackPersonaId = this.requireDefaultPersona(this.listStoredPersonas()).id
    const conversations = this.runtimeHostConversationRecordService.listConversations() as Array<{
      id: string
    }>
    let reassignedConversationCount = 0
    for (const conversation of conversations) {
      if (this.runtimeHostConversationRecordService.requireConversation(conversation.id).activePersonaId !== personaId) {
        continue
      }
      this.runtimeHostConversationRecordService.rememberConversationActivePersona(
        conversation.id,
        fallbackPersonaId,
      )
      reassignedConversationCount += 1
    }
    return {
      deletedPersonaId: personaId,
      fallbackPersonaId,
      reassignedConversationCount,
    }
  }

  readPersonaAvatarPath(personaId: string): string {
    this.requirePersona(personaId)
    const avatarPath = this.personaStoreService.readAvatarPath(personaId)
    if (avatarPath) {
      return avatarPath
    }
    throw new NotFoundException(`Persona avatar not found: ${personaId}`)
  }

  private listStoredPersonas(): StoredPersonaRecord[] {
    return this.personaStoreService.list()
  }

  private persistPersonas(
    personas: StoredPersonaRecord[],
    preferredDefaultPersonaId?: string,
  ): StoredPersonaRecord[] {
    const fallbackDefaultPersonaId = personas.some((persona) => persona.id === DEFAULT_PERSONA_ID)
      ? DEFAULT_PERSONA_ID
      : personas[0]?.id
    const resolvedDefaultPersonaId = preferredDefaultPersonaId
      ?? personas.find((persona) => persona.isDefault)?.id
      ?? fallbackDefaultPersonaId
    return this.personaStoreService.replaceAll(
      personas
        .map((persona) => ({
          ...persona,
          isDefault: persona.id === resolvedDefaultPersonaId,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    )
  }

  private requirePersona(personaId: string): StoredPersonaRecord {
    const persona = this.personaStoreService.read(personaId)
    if (persona) {
      return persona
    }
    throw new NotFoundException(`Persona not found: ${personaId}`)
  }

  private requireDefaultPersona(personas: StoredPersonaRecord[]): StoredPersonaRecord {
    const persona = personas.find((entry) => entry.isDefault) ?? personas.find((entry) => entry.id === DEFAULT_PERSONA_ID)
    if (persona) {
      return persona
    }
    throw new NotFoundException('Default persona not found')
  }

  private readConversationActivePersonaId(conversationId?: string): string | undefined {
    if (!conversationId) {
      return undefined
    }
    try {
      return this.runtimeHostConversationRecordService.requireConversation(conversationId).activePersonaId
    } catch {
      return undefined
    }
  }

  private resolvePersonaForContext(
    contextPersonaId?: string,
    conversationPersonaId?: string,
  ): { persona: StoredPersonaRecord; source: 'context' | 'conversation' | 'default' } {
    const contextPersona = contextPersonaId ? this.personaStoreService.read(contextPersonaId) : null
    if (contextPersona) {
      return { persona: contextPersona, source: contextPersona.id === DEFAULT_PERSONA_ID ? 'default' : 'context' }
    }
    const conversationPersona = conversationPersonaId ? this.personaStoreService.read(conversationPersonaId) : null
    if (conversationPersona) {
      return { persona: conversationPersona, source: conversationPersona.id === DEFAULT_PERSONA_ID ? 'default' : 'conversation' }
    }
    return { persona: this.requireDefaultPersona(this.listStoredPersonas()), source: 'default' }
  }
}

function toPersonaSummary(persona: StoredPersonaRecord): PluginPersonaSummary {
  return {
    avatar: readPersonaAvatarUrl(persona),
    createdAt: persona.createdAt,
    description: persona.description,
    id: persona.id,
    isDefault: persona.isDefault,
    name: persona.name,
    updatedAt: persona.updatedAt,
  }
}

function readPersonaAvatarUrl(persona: StoredPersonaRecord): string | null {
  return persona.avatar
    ? `/api/personas/${encodeURIComponent(persona.id)}/avatar`
    : null
}

function toPersonaDetail(persona: StoredPersonaRecord): PluginPersonaDetail {
  return {
    ...toPersonaSummary(persona),
    beginDialogs: persona.beginDialogs.map((entry) => ({ ...entry })),
    customErrorMessage: persona.customErrorMessage,
    prompt: persona.prompt,
    skillIds: persona.skillIds ? [...persona.skillIds] : null,
    toolNames: persona.toolNames ? [...persona.toolNames] : null,
  }
}

function normalizeDialogEntries(value: PluginPersonaDialogEntry[] | undefined): PluginPersonaDialogEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    const content = normalizeOptionalText(entry?.content)
    const role = entry?.role === 'assistant' || entry?.role === 'user' ? entry.role : null
    return content && role ? [{ content, role }] : []
  })
}

function normalizeNullableIdList(value: string[] | null | undefined): string[] | null {
  if (value === undefined || value === null) {
    return null
  }
  return [...new Set(value.flatMap((entry) => {
    const normalized = normalizeOptionalText(entry)
    return normalized ? [normalized] : []
  }))]
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value)
  return normalized ?? null
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeRequiredId(value: unknown, errorMessage: string): string {
  const normalized = normalizeOptionalText(value)
  if (normalized) {
    return normalized
  }
  throw new BadRequestException(errorMessage)
}

function normalizeRequiredText(value: unknown, errorMessage: string): string {
  const normalized = normalizeOptionalText(value)
  if (normalized) {
    return normalized
  }
  throw new BadRequestException(errorMessage)
}
