import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillManagement } from './use-skill-management'
import * as api from '../api'

vi.mock('../api', () => ({
  listSkills: vi.fn(),
  refreshSkills: vi.fn(),
  updateSkillGovernance: vi.fn(),
  getConversationSkills: vi.fn(),
  updateConversationSkills: vi.fn(),
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
    vi.mocked(api.listSkills).mockResolvedValue([
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
          enabled: true,
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
    vi.mocked(api.refreshSkills).mockResolvedValue([
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
          enabled: true,
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
    vi.mocked(api.updateSkillGovernance).mockImplementation(async (skillId, payload) => ({
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
        enabled: payload.enabled ?? true,
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
    vi.mocked(api.getConversationSkills).mockResolvedValue({
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
            enabled: true,
            trustLevel: 'asset-read',
          },
        },
      ],
    })
    vi.mocked(api.updateConversationSkills).mockResolvedValue({
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
    expect(state.disabledCount.value).toBe(0)
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

    expect(api.updateConversationSkills).toHaveBeenCalledWith('conversation-1', {
      activeSkillIds: [],
    })
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
    vi.mocked(api.getConversationSkills).mockResolvedValueOnce({
      activeSkillIds: [],
      activeSkills: [],
    })

    await state.updateSkillGovernance('project/planner', {
      enabled: false,
      trustLevel: 'local-script',
    })
    await flushPromises()

    expect(api.updateSkillGovernance).toHaveBeenCalledWith('project/planner', {
      enabled: false,
      trustLevel: 'local-script',
    })
    expect(state.skills.value[0]?.governance).toEqual({
      enabled: false,
      trustLevel: 'local-script',
    })
    expect(state.conversationSkillState.value?.activeSkillIds).toEqual([])
    expect(state.disabledCount.value).toBe(1)
  })
})
