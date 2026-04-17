import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillManagement } from '@/features/skills/composables/use-skill-management'
import * as skillData from '@/features/skills/composables/skill-management.data'

vi.mock('@/features/skills/composables/skill-management.data', () => ({
  loadSkillCatalog: vi.fn(),
  refreshSkillCatalog: vi.fn(),
  saveSkillGovernance: vi.fn(),
  loadConversationSkillState: vi.fn(),
  saveConversationSkills: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

function createChatStub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    currentConversationId: 'conversation-1' as string | null,
    ...overrides,
  }
}

describe('useSkillManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(skillData.loadSkillCatalog).mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        toolPolicy: {
          allow: ['kb.search'],
          deny: [],
        },
        governance: {
          trustLevel: 'asset-read',
        },
        assets: [
          {
            path: 'templates/task.md',
            kind: 'template',
            textReadable: true,
            executable: false,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ])
    vi.mocked(skillData.refreshSkillCatalog).mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        toolPolicy: {
          allow: ['kb.search'],
          deny: [],
        },
        governance: {
          trustLevel: 'asset-read',
        },
        assets: [
          {
            path: 'templates/task.md',
            kind: 'template',
            textReadable: true,
            executable: false,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ])
    vi.mocked(skillData.saveSkillGovernance).mockImplementation(async (skillId, payload) => ({
      id: skillId,
      name: '规划执行',
      description: '先拆任务，再逐步执行。',
      tags: ['planning'],
      sourceKind: 'project',
      entryPath: 'planner/SKILL.md',
      promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
      toolPolicy: {
        allow: ['kb.search'],
        deny: [],
      },
      governance: {
        trustLevel: payload.trustLevel ?? 'asset-read',
      },
      assets: [
        {
          path: 'templates/task.md',
          kind: 'template',
          textReadable: true,
          executable: false,
        },
      ],
      content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
    }))
    vi.mocked(skillData.loadConversationSkillState).mockResolvedValue({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
          toolPolicy: {
            allow: ['kb.search'],
            deny: [],
          },
          governance: {
            trustLevel: 'asset-read',
          },
        },
      ],
    })
    vi.mocked(skillData.saveConversationSkills).mockResolvedValue({
      activeSkillIds: [],
      activeSkills: [],
    })
  })

  it('loads the skill catalog and current conversation skill state', async () => {
    const chat = createChatStub()
    let state!: ReturnType<typeof useSkillManagement>
    const Harness = defineComponent({
      setup() {
        state = useSkillManagement(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.skills.value).toHaveLength(1)
    expect(state.conversationSkillState.value?.activeSkillIds).toEqual(['project/planner'])
    expect(state.packageCount.value).toBe(1)
    expect(state.scriptCapableCount.value).toBe(0)
  })

  it('toggles a skill for the current conversation', async () => {
    const chat = createChatStub()
    let state!: ReturnType<typeof useSkillManagement>
    const Harness = defineComponent({
      setup() {
        state = useSkillManagement(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()
    await state.toggleSkill('project/planner')

    expect(skillData.saveConversationSkills).toHaveBeenCalledWith(
      'conversation-1',
      [],
    )
  })

  it('updates skill governance in the local catalog and refreshes conversation state', async () => {
    const chat = createChatStub()
    let state!: ReturnType<typeof useSkillManagement>
    const Harness = defineComponent({
      setup() {
        state = useSkillManagement(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()
    vi.mocked(skillData.loadConversationSkillState).mockResolvedValueOnce({
      activeSkillIds: [],
      activeSkills: [],
    })

    await state.updateSkillGovernance('project/planner', {
      trustLevel: 'local-script',
    })
    await flushPromises()

    expect(skillData.saveSkillGovernance).toHaveBeenCalledWith('project/planner', {
      trustLevel: 'local-script',
    })
    expect(state.skills.value[0]?.governance).toEqual({
      trustLevel: 'local-script',
    })
    expect(state.conversationSkillState.value?.activeSkillIds).toEqual([])
    expect(state.scriptCapableCount.value).toBe(1)
  })
})
