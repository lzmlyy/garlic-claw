import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ProjectWorktreeRootService } from '../../src/modules/execution/project/project-worktree-root.service'
import { DEFAULT_PERSONA_PROMPT } from '../../src/modules/persona/default-persona'
import { PersonaService } from '../../src/modules/persona/persona.service'
import { PersonaStoreService } from '../../src/modules/persona/persona-store.service'
import { ConversationStoreService } from '../../src/modules/runtime/host/conversation-store.service'

describe('PersonaService', () => {
  const originalPersonaPath = process.env.GARLIC_CLAW_PERSONAS_PATH
  let conversationRecordService: ConversationStoreService
  let service: PersonaService
  let storageRoot: string

  beforeEach(() => {
    storageRoot = path.join(
      os.tmpdir(),
      `gc-personas-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    process.env.GARLIC_CLAW_PERSONAS_PATH = storageRoot
    conversationRecordService = new ConversationStoreService()
    service = new PersonaService(
      new PersonaStoreService(new ProjectWorktreeRootService()),
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
      JSON.parse(
        fs.readFileSync(
          path.join(storageRoot, 'builtin.default-assistant', 'persona.json'),
          'utf-8',
        ),
      ),
    ).toEqual(expect.objectContaining({
      id: 'builtin.default-assistant',
      name: 'Default Assistant',
    }))
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(storageRoot, 'settings.json'),
          'utf-8',
        ),
      ),
    ).toEqual({ defaultPersonaId: 'builtin.default-assistant' })
    expect(
      fs.readFileSync(
        path.join(storageRoot, 'builtin.default-assistant', 'prompt.md'),
        'utf-8',
      ),
    ).toBe(DEFAULT_PERSONA_PROMPT)
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(storageRoot, 'builtin.default-assistant', 'persona.json'),
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
      toolNames: [],
    })
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(storageRoot, 'persona.analyst', 'persona.json'),
          'utf-8',
        ),
      ),
    ).toEqual(expect.objectContaining({
      customErrorMessage: '当前人格不可用，请稍后再试。',
      id: 'persona.analyst',
      name: 'Reviewer',
    }))
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(storageRoot, 'settings.json'),
          'utf-8',
        ),
      ),
    ).toEqual({ defaultPersonaId: 'persona.analyst' })
    expect(
      fs.readFileSync(
        path.join(storageRoot, 'persona.analyst', 'prompt.md'),
        'utf-8',
      ),
    ).toBe('你是一个审稿式分析助手。')
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(storageRoot, 'persona.analyst', 'persona.json'),
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
      toolNames: null,
    })
    const avatarPath = path.join(storageRoot, 'persona.analyst', 'avatar.webp')
    fs.writeFileSync(avatarPath, 'fake-avatar', 'utf-8')

    const reloadedService = new PersonaService(
      new PersonaStoreService(new ProjectWorktreeRootService()),
      conversationRecordService,
    )

    expect(reloadedService.readPersona('persona.analyst')).toEqual(
      expect.objectContaining({
        avatar: '/api/personas/persona.analyst/avatar',
        id: 'persona.analyst',
      }),
    )
  })

  it('resolves the default persona directory to the repository root config/personas folder', () => {
    const originalPersonaPath = process.env.GARLIC_CLAW_PERSONAS_PATH
    const originalJestWorkerId = process.env.JEST_WORKER_ID

    delete process.env.GARLIC_CLAW_PERSONAS_PATH
    delete process.env.JEST_WORKER_ID

    try {
      const store = new PersonaStoreService(new ProjectWorktreeRootService())
      const expectedRoot = path.resolve(__dirname, '..', '..', '..', '..', 'config', 'personas')

      expect(store.read('builtin.default-assistant')).toEqual(
        expect.objectContaining({
          id: 'builtin.default-assistant',
        }),
      )
      expect(fs.existsSync(path.join(expectedRoot, 'builtin.default-assistant', 'persona.json'))).toBe(true)
      expect(fs.existsSync(path.join(expectedRoot, 'builtin.default-assistant', 'prompt.md'))).toBe(true)
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
