import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PluginPersonaDetail, PluginPersonaDialogEntry } from '@garlic-claw/shared'
import { Injectable } from '@nestjs/common'
import YAML from 'yaml'
import { DEFAULT_PERSONA_PROMPT } from './default-persona'
import { DEFAULT_PERSONA_ID } from '../runtime/host/runtime-host-values'

export interface StoredPersonaRecord extends PluginPersonaDetail {}

interface StoredPersonaMeta extends Omit<StoredPersonaRecord, 'avatar' | 'prompt'> {}

const DEFAULT_PERSONA_TIMESTAMP = '2026-04-10T00:00:00.000Z'
const PERSONA_META_FILE_NAME = 'meta.yaml'
const PERSONA_PROMPT_FILE_NAME = 'SYSTEM.md'
const LEGACY_PERSONA_META_FILE_NAME = 'meta.json'
const AVATAR_BASENAME = 'avatar'
const AVATAR_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.avif',
  '.ico',
  '.tif',
  '.tiff',
])

@Injectable()
export class PersonaStoreService {
  private readonly storageRoot = resolvePersonaStorageRoot()
  private personas = loadPersonaStore(this.storageRoot)

  list(): StoredPersonaRecord[] {
    return this.personas.map((persona) => structuredClone(persona))
  }

  read(personaId: string): StoredPersonaRecord | null {
    const persona = this.personas.find((entry) => entry.id === personaId)
    return persona ? structuredClone(persona) : null
  }

  readAvatarPath(personaId: string): string | null {
    const personaRoot = path.join(this.storageRoot, readPersonaFolderName(personaId))
    return readPersonaAvatarFilePath(personaRoot)
  }

  replaceAll(personas: StoredPersonaRecord[]): StoredPersonaRecord[] {
    const nextPersonas = personas.map((persona) => structuredClone(persona))
    persistPersonaStore(this.storageRoot, this.personas, nextPersonas)
    this.personas = nextPersonas
    return this.list()
  }
}

export function resolvePersonaStorageRoot(): string {
  if (process.env.GARLIC_CLAW_PERSONAS_PATH) {
    return path.resolve(process.env.GARLIC_CLAW_PERSONAS_PATH)
  }
  if (process.env.JEST_WORKER_ID) {
    return path.join(
      process.cwd(),
      'tmp',
      `personas.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
  }
  return path.join(resolveProjectRoot(), 'persona')
}

function resolveProjectRoot(): string {
  return findProjectRoot(process.cwd())
    ?? findProjectRoot(__dirname)
    ?? process.cwd()
}

function findProjectRoot(startPath: string): string | null {
  let currentPath = path.resolve(startPath)

  while (true) {
    if (
      fs.existsSync(path.join(currentPath, 'package.json'))
      && fs.existsSync(path.join(currentPath, 'packages', 'server'))
    ) {
      return currentPath
    }

    const parentPath = path.dirname(currentPath)
    if (parentPath === currentPath) {
      return null
    }
    currentPath = parentPath
  }
}

function loadPersonaStore(storageRoot: string): StoredPersonaRecord[] {
  const seeded = [createDefaultPersona()]
  try {
    fs.mkdirSync(storageRoot, { recursive: true })
    const loaded = readStoredPersonas(storageRoot)
    const normalized = normalizeStoredPersonas(loaded.length > 0 ? loaded : seeded)
    persistPersonaStore(storageRoot, loaded, normalized)
    return normalized
  } catch {
    persistPersonaStore(storageRoot, [], seeded)
    return seeded
  }
}

function readStoredPersonas(storageRoot: string): StoredPersonaRecord[] {
  if (!fs.existsSync(storageRoot)) {
    return []
  }

  return fs.readdirSync(storageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const persona = readStoredPersona(path.join(storageRoot, entry.name))
      return persona ? [persona] : []
    })
}

function readStoredPersona(personaRoot: string): StoredPersonaRecord | null {
  const metaPath = resolvePersonaMetaPath(personaRoot)
  if (!fs.existsSync(metaPath)) {
    return null
  }

  try {
    const parsedMeta = readStoredPersonaMeta(metaPath)
    const promptPath = path.join(personaRoot, PERSONA_PROMPT_FILE_NAME)
    const prompt = fs.existsSync(promptPath)
      ? fs.readFileSync(promptPath, 'utf-8').replace(/\r\n/g, '\n')
      : undefined
    return {
      avatar: readPersonaAvatarFilePath(personaRoot),
      beginDialogs: parsedMeta.beginDialogs,
      createdAt: parsedMeta.createdAt,
      customErrorMessage: parsedMeta.customErrorMessage,
      description: parsedMeta.description,
      id: parsedMeta.id ?? path.basename(personaRoot),
      isDefault: parsedMeta.isDefault,
      name: parsedMeta.name,
      prompt,
      skillIds: parsedMeta.skillIds,
      toolNames: parsedMeta.toolNames,
      updatedAt: parsedMeta.updatedAt,
    } as StoredPersonaRecord
  } catch {
    return null
  }
}

function persistPersonaStore(
  storageRoot: string,
  previousPersonas: readonly StoredPersonaRecord[],
  nextPersonas: readonly StoredPersonaRecord[],
): void {
  fs.mkdirSync(storageRoot, { recursive: true })

  const previousFolderNames = new Set(previousPersonas.map((persona) => readPersonaFolderName(persona.id)))
  const nextFolderNames = new Set(nextPersonas.map((persona) => readPersonaFolderName(persona.id)))

  for (const folderName of previousFolderNames) {
    if (nextFolderNames.has(folderName)) {
      continue
    }
    fs.rmSync(path.join(storageRoot, folderName), { force: true, recursive: true })
  }

  for (const persona of nextPersonas) {
    writeStoredPersona(storageRoot, persona)
  }
}

function writeStoredPersona(storageRoot: string, persona: StoredPersonaRecord): void {
  const personaRoot = path.join(storageRoot, readPersonaFolderName(persona.id))
  fs.mkdirSync(personaRoot, { recursive: true })
  const meta: StoredPersonaMeta = {
    beginDialogs: persona.beginDialogs,
    createdAt: persona.createdAt,
    customErrorMessage: persona.customErrorMessage,
    description: persona.description,
    id: persona.id,
    isDefault: persona.isDefault,
    name: persona.name,
    skillIds: persona.skillIds,
    toolNames: persona.toolNames,
    updatedAt: persona.updatedAt,
  }
  fs.writeFileSync(
    path.join(personaRoot, PERSONA_META_FILE_NAME),
    readPersonaMetaYaml(meta),
    'utf-8',
  )
  const legacyMetaPath = path.join(personaRoot, LEGACY_PERSONA_META_FILE_NAME)
  if (fs.existsSync(legacyMetaPath)) {
    fs.rmSync(legacyMetaPath, { force: true })
  }
  fs.writeFileSync(
    path.join(personaRoot, PERSONA_PROMPT_FILE_NAME),
    `${persona.prompt.trimEnd()}\n`,
    'utf-8',
  )
}

function readPersonaFolderName(personaId: string): string {
  return encodeURIComponent(personaId.trim())
}

function resolvePersonaMetaPath(personaRoot: string): string {
  const yamlPath = path.join(personaRoot, PERSONA_META_FILE_NAME)
  if (fs.existsSync(yamlPath)) {
    return yamlPath
  }
  return path.join(personaRoot, LEGACY_PERSONA_META_FILE_NAME)
}

function readStoredPersonaMeta(metaPath: string): Partial<StoredPersonaMeta> {
  const raw = fs.readFileSync(metaPath, 'utf-8')
  if (path.basename(metaPath) === LEGACY_PERSONA_META_FILE_NAME) {
    return JSON.parse(raw) as Partial<StoredPersonaMeta>
  }
  const parsed = YAML.parse(raw)
  return typeof parsed === 'object' && parsed !== null
    ? parsed as Partial<StoredPersonaMeta>
    : {}
}

function readPersonaMetaYaml(meta: StoredPersonaMeta): string {
  return [
    '# Persona 元数据',
    '# 同目录的 SYSTEM.md 存放系统提示词正文。',
    '# avatar 不在这里手动配置；如果当前目录存在名为 avatar 的图片文件，例如 avatar.png / avatar.webp / avatar.jpg，服务端会自动识别。',
    '',
    '# 人设唯一 ID。建议与目录名保持一致，方便人工检查。',
    ...formatPersonaMetaField('id', meta.id),
    '',
    '# 人设显示名称。',
    ...formatPersonaMetaField('name', meta.name),
    '',
    '# 人设简介。没有可写 null。',
    ...formatPersonaMetaField('description', meta.description ?? null),
    '',
    '# 预置对话，按数组顺序注入到主对话模型上下文。',
    '# 每项格式：',
    '# - role: user | assistant',
    '#   content: 对话内容',
    '# 没有预置对话时写 []。',
    ...formatPersonaMetaField('beginDialogs', meta.beginDialogs),
    '',
    '# Persona 允许使用的 tools。',
    '# null 表示不限制；[] 表示全部禁用；非空数组表示只允许这些 tool 名称。',
    ...formatPersonaMetaField('toolNames', meta.toolNames),
    '',
    '# Persona 允许使用的 skills。',
    '# null 表示不限制；[] 表示全部禁用；非空数组表示只允许这些 skill ID。',
    ...formatPersonaMetaField('skillIds', meta.skillIds),
    '',
    '# 仅在“主对话主回复”失败时，直接回复给用户的固定错误文案。',
    '# subagent、标题生成、摘要总结等链路不会使用这个字段。',
    '# 留空或写 null 表示使用系统默认错误文案。',
    ...formatPersonaMetaField('customErrorMessage', meta.customErrorMessage),
    '',
    '# 是否为默认人设。同一时刻只会有一个默认人设生效。',
    ...formatPersonaMetaField('isDefault', meta.isDefault),
    '',
    '# 创建时间与更新时间通常由系统维护；手动编辑时建议保持 ISO 时间格式。',
    ...formatPersonaMetaField('createdAt', meta.createdAt),
    ...formatPersonaMetaField('updatedAt', meta.updatedAt),
    '',
  ].join('\n')
}

function formatPersonaMetaField(fieldName: string, value: unknown): string[] {
  const serialized = YAML.stringify(value).trimEnd()
  if (!serialized) {
    return [`${fieldName}: null`]
  }
  if (!serialized.includes('\n')) {
    return [`${fieldName}: ${serialized}`]
  }
  return [
    `${fieldName}:`,
    ...serialized.split('\n').map((line) => `  ${line}`),
  ]
}

function readPersonaAvatarFilePath(personaRoot: string): string | null {
  if (!fs.existsSync(personaRoot)) {
    return null
  }

  const match = fs.readdirSync(personaRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .find((entry) => {
      const extension = path.extname(entry.name).toLowerCase()
      const basename = path.basename(entry.name, extension).toLowerCase()
      return basename === AVATAR_BASENAME && AVATAR_IMAGE_EXTENSIONS.has(extension)
    })

  if (!match) {
    return null
  }

  return path.join(personaRoot, match.name)
}

function normalizeStoredPersonas(rawPersonas: StoredPersonaRecord[]): StoredPersonaRecord[] {
  const records = rawPersonas
    .filter((persona): persona is StoredPersonaRecord => Boolean(persona && typeof persona.id === 'string' && persona.id.trim()))
    .map((persona) => normalizeStoredPersona(persona))

  if (!records.some((persona) => persona.id === DEFAULT_PERSONA_ID)) {
    records.unshift(createDefaultPersona())
  }

  const preferredDefault = records.find((persona) => persona.isDefault)?.id ?? DEFAULT_PERSONA_ID
  return records
    .map((persona) => ({
      ...persona,
      isDefault: persona.id === preferredDefault,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeStoredPersona(persona: StoredPersonaRecord): StoredPersonaRecord {
  const fallback = createDefaultPersona()
  return {
    avatar: normalizeNullableText(persona.avatar),
    beginDialogs: normalizeDialogEntries(persona.beginDialogs),
    createdAt: typeof persona.createdAt === 'string' && persona.createdAt ? persona.createdAt : fallback.createdAt,
    customErrorMessage: normalizeNullableText(persona.customErrorMessage),
    description: normalizeOptionalText(persona.description),
    id: persona.id.trim(),
    isDefault: persona.isDefault === true,
    name: normalizeRequiredText(persona.name, persona.id),
    prompt: normalizeRequiredText(persona.prompt, fallback.prompt),
    skillIds: normalizeNullableIdList(persona.skillIds),
    toolNames: normalizeNullableIdList(persona.toolNames),
    updatedAt: typeof persona.updatedAt === 'string' && persona.updatedAt ? persona.updatedAt : fallback.updatedAt,
  }
}

function createDefaultPersona(): StoredPersonaRecord {
  return {
    avatar: null,
    beginDialogs: [],
    createdAt: DEFAULT_PERSONA_TIMESTAMP,
    customErrorMessage: null,
    description: 'server 默认人格',
    id: DEFAULT_PERSONA_ID,
    isDefault: true,
    name: 'Default Assistant',
    prompt: DEFAULT_PERSONA_PROMPT,
    skillIds: null,
    toolNames: null,
    updatedAt: DEFAULT_PERSONA_TIMESTAMP,
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

function normalizeRequiredText(value: unknown, fallback: string): string {
  return normalizeOptionalText(value) ?? fallback
}
