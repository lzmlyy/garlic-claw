import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePluginSubagentTasks } from '@/features/subagents/composables/use-plugin-subagent-tasks'
import * as subagentTaskData from '@/features/subagents/composables/plugin-subagent-tasks.data'

vi.mock('@/features/subagents/composables/plugin-subagent-tasks.data', () => ({
  loadPluginSubagentTaskOverview: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

function createOverview() {
  return {
    tasks: [
      {
        id: 'subagent-task-1',
        pluginId: 'builtin.subagent-delegate',
        pluginDisplayName: '子代理委派',
        runtimeKind: 'builtin' as const,
        status: 'running' as const,
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending' as const,
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        conversationId: 'conversation-1',
      },
      {
        id: 'subagent-task-2',
        pluginId: 'remote.ops-helper',
        pluginDisplayName: '运维助手',
        runtimeKind: 'remote' as const,
        status: 'completed' as const,
        requestPreview: '请分析最近失败的插件',
        resultPreview: '这是后台任务总结',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        writeBackStatus: 'sent' as const,
        writeBackMessageId: 'assistant-message-2',
        requestedAt: '2026-03-30T11:50:00.000Z',
        startedAt: '2026-03-30T11:50:01.000Z',
        finishedAt: '2026-03-30T11:50:05.000Z',
      },
    ],
  }
}

describe('usePluginSubagentTasks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(subagentTaskData.loadPluginSubagentTaskOverview).mockResolvedValue(createOverview())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the overview, filters by keyword and task status, and keeps polling', async () => {
    let state!: ReturnType<typeof usePluginSubagentTasks>
    const Harness = defineComponent({
      setup() {
        state = usePluginSubagentTasks()
        return () => null
      },
    })

    const wrapper = mount(Harness)
    await flushPromises()

    expect(state.taskCount.value).toBe(2)
    expect(state.runningTaskCount.value).toBe(1)
    expect(state.pagedTasks.value.map((task) => task.id)).toEqual([
      'subagent-task-1',
      'subagent-task-2',
    ])

    state.filter.value = 'running'
    await flushPromises()

    expect(state.filteredTaskCount.value).toBe(1)
    expect(state.pagedTasks.value.map((task) => task.id)).toEqual([
      'subagent-task-1',
    ])

    state.filter.value = 'all'
    state.searchKeyword.value = '运维'
    await flushPromises()

    expect(state.filteredTaskCount.value).toBe(1)
    expect(state.pagedTasks.value.map((task) => task.id)).toEqual([
      'subagent-task-2',
    ])

    await vi.advanceTimersByTimeAsync(5000)
    expect(subagentTaskData.loadPluginSubagentTaskOverview).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
