import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SkillsView from './SkillsView.vue'

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    currentConversationId: 'conversation-1',
  }),
}))

vi.mock('@/features/skills/composables/use-skill-management', () => ({
  useSkillManagement: () => ({
    loading: ref(false),
    error: ref(null),
    refreshing: ref(false),
    searchKeyword: ref(''),
    skills: shallowRef([
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
          trustLevel: 'local-script',
        },
        assets: [
          {
            path: 'scripts/plan.js',
            kind: 'script',
            textReadable: true,
            executable: true,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ]),
    filteredSkills: computed(() => [
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
          trustLevel: 'local-script',
        },
        assets: [
          {
            path: 'scripts/plan.js',
            kind: 'script',
            textReadable: true,
            executable: true,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ]),
    selectedSkillId: ref('project/planner'),
    selectedSkill: computed(() => ({
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
        trustLevel: 'local-script',
      },
      assets: [
        {
          path: 'scripts/plan.js',
          kind: 'script',
          textReadable: true,
          executable: true,
        },
      ],
      content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
    })),
    conversationSkillState: ref({
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
            trustLevel: 'local-script',
          },
        },
      ],
    }),
    totalCount: computed(() => 1),
    activeCount: computed(() => 1),
    restrictedCount: computed(() => 1),
    packageCount: computed(() => 1),
    scriptCapableCount: computed(() => 1),
    mutatingSkillId: ref(null),
    selectSkill: vi.fn(),
    toggleSkill: vi.fn(),
    clearConversationSkills: vi.fn(),
    updateSkillGovernance: vi.fn(),
    refreshAll: vi.fn(),
  }),
}))

describe('SkillsView', () => {
  it('renders the skill workspace, active state, and markdown preview', () => {
    const wrapper = mount(SkillsView)

    expect(wrapper.text()).toContain('技能工作台')
    expect(wrapper.text()).toContain('规划执行')
    expect(wrapper.text()).toContain('当前会话已激活')
    expect(wrapper.text()).toContain('kb.search')
    expect(wrapper.text()).toContain('可执行脚本')
    expect(wrapper.text()).toContain('scripts/plan.js')
    expect(wrapper.text()).toContain('把复杂请求拆成 3-5 步')
  })
})
