import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { PluginActionName, ToolInfo, ToolSourceInfo } from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { usePagination } from '@/composables/use-pagination'
import {
  loadToolOverview,
  runToolSourceActionRequest,
  saveToolEnabled,
  saveToolSourceEnabled,
} from '@/features/tools/composables/tool-management.data'

type ToolFilter = 'all' | 'enabled' | 'disabled' | 'attention'

/**
 * 工具治理页的状态与行为收口。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - 工具源、工具列表、筛选状态和治理动作函数
 * 预期行为:
 * - 页面只负责渲染
 * - 所有统一工具治理请求集中到此 composable
 */
export function createToolManagementModule() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const mutatingSourceKey = ref<string | null>(null)
  const mutatingToolId = ref<string | null>(null)
  const runningActionKey = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const sources = shallowRef<ToolSourceInfo[]>([])
  const tools = shallowRef<ToolInfo[]>([])
  const selectedSourceKey = ref<string | null>(null)
  const sourceSearchKeyword = ref('')
  const toolSearchKeyword = ref('')
  const toolFilter = ref<ToolFilter>('all')

  const normalizedSourceKeyword = computed(() =>
    sourceSearchKeyword.value.trim().toLocaleLowerCase(),
  )
  const normalizedToolKeyword = computed(() =>
    toolSearchKeyword.value.trim().toLocaleLowerCase(),
  )
  const filteredSources = computed(() =>
    sources.value.filter((source) => matchesSource(source, normalizedSourceKeyword.value)),
  )
  const orderedSources = computed(() =>
    [...filteredSources.value].sort((left, right) => {
      const attentionDiff = sourceSortWeight(left) - sourceSortWeight(right)
      if (attentionDiff !== 0) {
        return attentionDiff
      }

      return sourceLabel(left).localeCompare(sourceLabel(right), 'zh-CN')
    }),
  )
  const {
    currentPage: sourcePage,
    pageCount: sourcePageCount,
    pagedItems: pagedSources,
    rangeStart: sourceRangeStart,
    rangeEnd: sourceRangeEnd,
    canGoPrev: canGoPrevSourcePage,
    canGoNext: canGoNextSourcePage,
    resetPage: resetSourcePage,
    goPrevPage: goPrevSourcePage,
    goNextPage: goNextSourcePage,
  } = usePagination(orderedSources, 6)
  const selectedSource = computed<ToolSourceInfo | null>(() => {
    const selected = sources.value.find((source) =>
      buildSourceKey(source) === selectedSourceKey.value)
    return selected ?? null
  })
  const toolsBySourceKey = computed(() => {
    const grouped = new Map<string, ToolInfo[]>()
    for (const item of tools.value) {
      const key = `${item.sourceKind}:${item.sourceId}`
      const bucket = grouped.get(key)
      if (bucket) {
        bucket.push(item)
      } else {
        grouped.set(key, [item])
      }
    }

    return grouped
  })
  const visibleTools = computed(() => {
    if (!selectedSourceKey.value) {
      return []
    }

    return toolsBySourceKey.value.get(selectedSourceKey.value) ?? []
  })
  const filteredTools = computed(() =>
    visibleTools.value.filter((tool) =>
      matchesTool(tool, normalizedToolKeyword.value)
      && matchesToolFilter(tool, toolFilter.value)),
  )
  const orderedTools = computed(() =>
    [...filteredTools.value].sort((left, right) => {
      const enabledDiff = Number(right.enabled) - Number(left.enabled)
      if (enabledDiff !== 0) {
        return enabledDiff
      }

      return left.callName.localeCompare(right.callName, 'zh-CN')
    }),
  )
  const {
    currentPage: toolPage,
    pageCount: toolPageCount,
    pagedItems: pagedTools,
    rangeStart: toolRangeStart,
    rangeEnd: toolRangeEnd,
    canGoPrev: canGoPrevToolPage,
    canGoNext: canGoNextToolPage,
    resetPage: resetToolPage,
    goPrevPage: goPrevToolPage,
    goNextPage: goNextToolPage,
  } = usePagination(orderedTools, 8)
  const sourceCount = computed(() => sources.value.length)
  const filteredSourceCount = computed(() => filteredSources.value.length)
  const enabledSourceCount = computed(() =>
    sources.value.filter((source) => source.enabled).length,
  )
  const toolCount = computed(() => tools.value.length)
  const filteredToolCount = computed(() => filteredTools.value.length)
  const enabledToolCount = computed(() =>
    tools.value.filter((tool) => tool.enabled).length,
  )
  const attentionSourceCount = computed(() =>
    sources.value.filter((source) => source.health === 'error').length,
  )

  watch([sourceSearchKeyword], () => {
    resetSourcePage()
  })

  watch([toolSearchKeyword, toolFilter], () => {
    resetToolPage()
  })

  onMounted(() => {
    void refreshAll()
  })

  async function refreshAll(preferredSourceKey = selectedSourceKey.value) {
    loading.value = true
    requestState.clearError()
    try {
      const overview = await loadToolOverview()
      const nextSources = overview.sources
      const nextTools = overview.tools
      sources.value = nextSources
      tools.value = nextTools
      const fallback = nextSources.find((source) =>
        buildSourceKey(source) === preferredSourceKey) ?? nextSources[0] ?? null
      selectedSourceKey.value = fallback ? buildSourceKey(fallback) : null
    } catch (caughtError) {
      requestState.setError(caughtError, '加载工具治理数据失败')
    } finally {
      loading.value = false
    }
  }

  function selectSource(kind: ToolSourceInfo['kind'], sourceId: string) {
    selectedSourceKey.value = `${kind}:${sourceId}`
    resetToolPage()
  }

  async function setSourceEnabled(source: ToolSourceInfo, enabled: boolean) {
    const sourceKey = buildSourceKey(source)
    mutatingSourceKey.value = sourceKey
    requestState.clearError()
    notice.value = null
    try {
      await saveToolSourceEnabled(source.kind, source.id, enabled)
      notice.value = enabled ? '工具源已启用' : '工具源已禁用'
      await refreshAll(sourceKey)
    } catch (caughtError) {
      requestState.setError(caughtError, '更新工具源状态失败')
    } finally {
      mutatingSourceKey.value = null
    }
  }

  async function setToolEnabled(tool: ToolInfo, enabled: boolean) {
    mutatingToolId.value = tool.toolId
    requestState.clearError()
    notice.value = null
    try {
      await saveToolEnabled(tool.toolId, enabled)
      notice.value = enabled ? '工具已启用' : '工具已禁用'
      await refreshAll(selectedSourceKey.value)
    } catch (caughtError) {
      requestState.setError(caughtError, '更新工具状态失败')
    } finally {
      mutatingToolId.value = null
    }
  }

  async function runSourceAction(source: ToolSourceInfo, action: PluginActionName) {
    const actionKey = `${buildSourceKey(source)}:${action}`
    runningActionKey.value = actionKey
    requestState.clearError()
    notice.value = null
    try {
      const result = await runToolSourceActionRequest(source.kind, source.id, action)
      notice.value = result.message
      await refreshAll(buildSourceKey(source))
    } catch (caughtError) {
      requestState.setError(caughtError, '执行工具源治理动作失败')
    } finally {
      runningActionKey.value = null
    }
  }

  return {
    loading,
    mutatingSourceKey,
    mutatingToolId,
    runningActionKey,
    error,
    appError,
    notice,
    sources,
    tools,
    selectedSourceKey,
    selectedSource,
    sourceSearchKeyword,
    toolSearchKeyword,
    toolFilter,
    pagedSources,
    sourcePage,
    sourcePageCount,
    sourceRangeStart,
    sourceRangeEnd,
    canGoPrevSourcePage,
    canGoNextSourcePage,
    goPrevSourcePage,
    goNextSourcePage,
    pagedTools,
    toolPage,
    toolPageCount,
    toolRangeStart,
    toolRangeEnd,
    canGoPrevToolPage,
    canGoNextToolPage,
    goPrevToolPage,
    goNextToolPage,
    sourceCount,
    filteredSourceCount,
    enabledSourceCount,
    toolCount,
    filteredToolCount,
    enabledToolCount,
    attentionSourceCount,
    refreshAll,
    selectSource,
    setSourceEnabled,
    setToolEnabled,
    runSourceAction,
  }
}

function buildSourceKey(source: Pick<ToolSourceInfo, 'kind' | 'id'>): string {
  return `${source.kind}:${source.id}`
}

function sourceLabel(source: ToolSourceInfo): string {
  return source.label || source.id
}

function sourceSortWeight(source: ToolSourceInfo): number {
  if (source.health === 'error') {
    return 0
  }
  if (!source.enabled) {
    return 1
  }

  return 2
}

function matchesSource(source: ToolSourceInfo, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  return [
    source.label,
    source.id,
    source.kind,
    source.lastError ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(keyword)
}

function matchesTool(tool: ToolInfo, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  return [
    tool.name,
    tool.callName,
    tool.toolId,
    tool.description,
    tool.lastError ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(keyword)
}

function matchesToolFilter(tool: ToolInfo, filter: ToolFilter): boolean {
  switch (filter) {
    case 'enabled':
      return tool.enabled
    case 'disabled':
      return !tool.enabled
    case 'attention':
      return tool.health === 'error'
    default:
      return true
  }
}
