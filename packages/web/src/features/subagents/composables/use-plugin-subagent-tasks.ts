import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { PluginSubagentTaskSummary } from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { usePagination } from '@/composables/use-pagination'
import {
  loadPluginSubagentTaskOverview,
} from './plugin-subagent-tasks.data'

type TaskFilter = 'all' | 'running' | 'completed' | 'error' | 'writeback-failed'

const POLL_INTERVAL_MS = 5000

export function usePluginSubagentTasks() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const tasks = shallowRef<PluginSubagentTaskSummary[]>([])
  const searchKeyword = ref('')
  const filter = ref<TaskFilter>('all')
  const normalizedKeyword = computed(() => searchKeyword.value.trim().toLocaleLowerCase())
  const filteredTasks = computed(() =>
    tasks.value.filter((task) =>
      matchesTask(task, normalizedKeyword.value)
      && matchesFilter(task, filter.value)),
  )
  const orderedTasks = computed(() =>
    [...filteredTasks.value].sort((left, right) => {
      const attentionDiff = taskAttentionWeight(left) - taskAttentionWeight(right)
      if (attentionDiff !== 0) {
        return attentionDiff
      }

      return new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime()
    }),
  )
  const {
    currentPage: page,
    pageCount,
    pagedItems: pagedTasks,
    rangeStart,
    rangeEnd,
    canGoPrev: canGoPrevPage,
    canGoNext: canGoNextPage,
    resetPage,
    goPrevPage,
    goNextPage,
  } = usePagination(orderedTasks, 8)
  const taskCount = computed(() => tasks.value.length)
  const filteredTaskCount = computed(() => filteredTasks.value.length)
  const runningTaskCount = computed(() =>
    tasks.value.filter((task) => task.status === 'queued' || task.status === 'running').length,
  )
  const errorTaskCount = computed(() =>
    tasks.value.filter((task) => task.status === 'error').length,
  )
  const writeBackAttentionCount = computed(() =>
    tasks.value.filter((task) => task.writeBackStatus === 'pending' || task.writeBackStatus === 'failed').length,
  )

  let pollTimer: ReturnType<typeof setInterval> | null = null

  watch([searchKeyword, filter], () => {
    resetPage()
  })

  onMounted(() => {
    void refreshAll()
    pollTimer = setInterval(() => {
      void refreshAll()
    }, POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  })

  async function refreshAll() {
    loading.value = true
    requestState.clearError()
    try {
      const overview = await loadPluginSubagentTaskOverview()
      tasks.value = overview.tasks
    } catch (caughtError) {
      requestState.setError(caughtError, '加载后台子代理任务失败')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    appError,
    tasks,
    searchKeyword,
    filter,
    pagedTasks,
    page,
    pageCount,
    rangeStart,
    rangeEnd,
    canGoPrevPage,
    canGoNextPage,
    goPrevPage,
    goNextPage,
    taskCount,
    filteredTaskCount,
    runningTaskCount,
    errorTaskCount,
    writeBackAttentionCount,
    refreshAll,
  }
}

function matchesTask(task: PluginSubagentTaskSummary, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  return [
    task.pluginDisplayName ?? '',
    task.pluginId,
    task.requestPreview,
    task.resultPreview ?? '',
    task.providerId ?? '',
    task.modelId ?? '',
    task.error ?? '',
    task.writeBackError ?? '',
    task.writeBackTarget?.id ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(keyword)
}

function matchesFilter(task: PluginSubagentTaskSummary, filter: TaskFilter): boolean {
  switch (filter) {
    case 'running':
      return task.status === 'queued' || task.status === 'running'
    case 'completed':
      return task.status === 'completed'
    case 'error':
      return task.status === 'error'
    case 'writeback-failed':
      return task.writeBackStatus === 'failed'
    default:
      return true
  }
}

function taskAttentionWeight(task: PluginSubagentTaskSummary): number {
  if (task.status === 'error') {
    return 0
  }
  if (task.writeBackStatus === 'failed') {
    return 1
  }
  if (task.status === 'queued' || task.status === 'running') {
    return 2
  }
  if (task.writeBackStatus === 'pending') {
    return 3
  }

  return 4
}
