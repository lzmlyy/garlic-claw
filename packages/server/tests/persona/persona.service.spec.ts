import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import YAML from 'yaml'
import { DEFAULT_PERSONA_PROMPT } from '../../src/persona/default-persona'
import { PersonaService } from '../../src/persona/persona.service'
import { PersonaStoreService, resolvePersonaStorageRoot } from '../../src/persona/persona-store.service'
import { RuntimeHostConversationRecordService } from '../../src/runtime/host/runtime-host-conversation-record.service'

describe('PersonaService', () => {
  const originalPersonaPath = process.env.GARLIC_CLAW_PERSONAS_PATH
  let conversationRecordService: RuntimeHostConversationRecordService
  let service: PersonaService
  let storageRoot: string

  beforeEach(() => {
    storageRoot = path.join(
      os.tmpdir(),
      `gc-personas-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    process.env.GARLIC_CLAW_PERSONAS_PATH = storageRoot
    conversationRecordService = new RuntimeHostConversationRecordService()
    service = new PersonaService(
      new PersonaStoreService(),
      conversationRecordService,
    )
  })

  afterEach(() => {
    if (fs.existsSync(storageRoot)) {
      fs.rmSync(storageRoot, { force: true, recursive: true })
    }
  })

  afterAll(() => {
    if (originalPersonaPath) {
      process.env.GARLIC_CLAW_PERSONAS_PATH = originalPersonaPath
      return
    }
    delete process.env.GARLIC_CLAW_PERSONAS_PATH
  })

  it('loads the default persona from persistent storage and exposes detail fields', () => {
    const personas = service.listPersonas()
    const current = service.readCurrentPersona({
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
    })

    expect(personas).toEqual([
      expect.objectContaining({
        id: 'builtin.default-assistant',
        isDefault: true,
        name: 'Default Assistant',
      }),
    ])
    expect(service.readPersona('builtin.default-assistant')).toEqual(
      expect.objectContaining({
        avatar: null,
        beginDialogs: [],
        customErrorMessage: null,
        id: 'builtin.default-assistant',
        prompt: DEFAULT_PERSONA_PROMPT,
        skillIds: null,
        toolNames: null,
      }),
    )
    expect(current).toEqual(
      expect.objectContaining({
        personaId: 'builtin.default-assistant',
        source: 'default',
      }),
    )
    expect(
      fs.readFileSync(
        path.join(storageRoot, 'builtin.default-assistant', 'SYSTEM.md'),
        'utf-8',
      ).trim(),
    ).toBe(DEFAULT_PERSONA_PROMPT)
    expect(
      YAML.parse(
        fs.readFileSync(
          path.join(storageRoot, 'builtin.default-assistant', 'meta.yaml'),
          'utf-8',
        ),
      ),
    ).toEqual(expect.objectContaining({
      id: 'builtin.default-assistant',
      isDefault: true,
      name: 'Default Assistant',
    }))
    expect(
      YAML.parse(
        fs.readFileSync(
          path.join(storageRoot, 'builtin.default-assistant', 'meta.yaml'),
          'utf-8',
        ),
      ),
    ).not.toHaveProperty('avatar')
  })

  it('creates, updates and deletes personas while falling active conversations back to default', () => {
    const conversationId = (
      conversationRecordService.createConversation({
        title: 'Persona Test',
        userId: 'user-1',
      }) as { id: string }
    ).id

    const created = service.createPersona({
      beginDialogs: [
        { content: '我们先做事实校准。', role: 'assistant' },
        { content: '好的，继续。', role: 'user' },
      ],
      customErrorMessage: '当前人格暂时无法完成请求。',
      description: '偏向结构化分析',
      id: 'persona.analyst',
      isDefault: false,
      name: 'Analyst',
      prompt: '你是一个结构化分析助手。',
      skillIds: ['project/planner'],
      toolNames: ['memory.search'],
    })
    const activated = service.activatePersona({
      conversationId,
      personaId: 'persona.analyst',
    })
    const updated = service.updatePersona('persona.analyst', {
      beginDialogs: [
        { content: '先列假设，再给结论。', role: 'assistant' },
      ],
      customErrorMessage: '当前人格不可用，请稍后再试。',
      description: '偏向审稿式分析',
      isDefault: true,
      name: 'Reviewer',
      prompt: '你是一个审稿式分析助手。',
      skillIds: [],
      toolNames: [],
    })
    expect(
      fs.readFileSync(
        path.join(storageRoot, 'persona.analyst', 'SYSTEM.md'),
        'utf-8',
      ).trim(),
    ).toBe('你是一个审稿式分析助手。')
    expect(
      YAML.parse(
        fs.readFileSync(
          path.join(storageRoot, 'persona.analyst', 'meta.yaml'),
          'utf-8',
        ),
      ),
    ).toEqual(expect.objectContaining({
      customErrorMessage: '当前人格不可用，请稍后再试。',
      id: 'persona.analyst',
      isDefault: true,
      name: 'Reviewer',
    }))
    expect(
      YAML.parse(
        fs.readFileSync(
          path.join(storageRoot, 'persona.analyst', 'meta.yaml'),
          'utf-8',
        ),
      ),
    ).not.toHaveProperty('avatar')
    const deleted = service.deletePersona('persona.analyst')

    expect(created).toEqual(
      expect.objectContaining({
        beginDialogs: [
          { content: '我们先做事实校准。', role: 'assistant' },
          { content: '好的，继续。', role: 'user' },
        ],
        avatar: null,
        customErrorMessage: '当前人格暂时无法完成请求。',
        id: 'persona.analyst',
        skillIds: ['project/planner'],
        toolNames: ['memory.search'],
      }),
    )
    expect(activated).toEqual(
      expect.objectContaining({
        personaId: 'persona.analyst',
        source: 'conversation',
      }),
    )
    expect(updated).toEqual(
      expect.objectContaining({
        beginDialogs: [
          { content: '先列假设，再给结论。', role: 'assistant' },
        ],
        avatar: null,
        customErrorMessage: '当前人格不可用，请稍后再试。',
        id: 'persona.analyst',
        isDefault: true,
        name: 'Reviewer',
        skillIds: [],
        toolNames: [],
      }),
    )
    expect(deleted).toEqual({
      deletedPersonaId: 'persona.analyst',
      fallbackPersonaId: 'builtin.default-assistant',
      reassignedConversationCount: 1,
    })
    expect(conversationRecordService.requireConversation(conversationId).activePersonaId).toBe('builtin.default-assistant')
    expect(service.readCurrentPersona({
      context: {
        activePersonaId: 'persona.analyst',
        source: 'plugin',
        userId: 'user-1',
      },
    })).toEqual(
      expect.objectContaining({
        personaId: 'builtin.default-assistant',
        source: 'default',
      }),
    )
    expect(fs.existsSync(path.join(storageRoot, 'persona.analyst'))).toBe(false)
  })

  it('reads avatar from avatar image files in the persona directory', () => {
    service.createPersona({
      beginDialogs: [],
      customErrorMessage: null,
      description: '偏向结构化分析',
      id: 'persona.analyst',
      isDefault: false,
      name: 'Analyst',
      prompt: '你是一个结构化分析助手。',
      skillIds: null,
      toolNames: null,
    })
    const avatarPath = path.join(storageRoot, 'persona.analyst', 'avatar.webp')
    fs.writeFileSync(avatarPath, 'fake-avatar', 'utf-8')

    const reloadedService = new PersonaService(
      new PersonaStoreService(),
      conversationRecordService,
    )

    expect(reloadedService.readPersona('persona.analyst')).toEqual(
      expect.objectContaining({
        avatar: '/api/personas/persona.analyst/avatar',
        id: 'persona.analyst',
      }),
    )
  })

  it('resolves the default persona directory to the repository root persona folder', () => {
    const originalPersonaPath = process.env.GARLIC_CLAW_PERSONAS_PATH
    const originalJestWorkerId = process.env.JEST_WORKER_ID

    delete process.env.GARLIC_CLAW_PERSONAS_PATH
    delete process.env.JEST_WORKER_ID

    try {
      expect(resolvePersonaStorageRoot()).toBe(
        path.resolve(__dirname, '..', '..', '..', '..', 'persona'),
      )
    } finally {
      if (originalPersonaPath) {
        process.env.GARLIC_CLAW_PERSONAS_PATH = originalPersonaPath
      } else {
        delete process.env.GARLIC_CLAW_PERSONAS_PATH
      }
      if (originalJestWorkerId) {
        process.env.JEST_WORKER_ID = originalJestWorkerId
      } else {
        delete process.env.JEST_WORKER_ID
      }
    }
  })
})
