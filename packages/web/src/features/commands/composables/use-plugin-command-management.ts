import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { PluginCommandConflict, PluginCommandInfo } from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { usePagination } from '@/composables/use-pagination'
import {
  loadPluginCommandOverview,
} from './plugin-command-management.data'

type CommandFilter = 'all' | 'conflict' | 'protected' | 'offline'

export function usePluginCommandManagement() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const commands = shallowRef<PluginCommandInfo[]>([])
  const conflicts = shallowRef<PluginCommandConflict[]>([])
  const searchKeyword = ref('')
  const filter = ref<CommandFilter>('all')

  const normalizedKeyword = computed(() =>
    searchKeyword.value.trim().toLocaleLowerCase(),
  )
  const filteredCommands = computed(() =>
    commands.value.filter((command) =>
      matchesCommand(command, normalizedKeyword.value)
      && matchesFilter(command, filter.value)),
  )
  const orderedCommands = computed(() =>
    [...filteredCommands.value].sort((left, right) => {
      const attentionDiff = commandAttentionWeight(left) - commandAttentionWeight(right)
      if (attentionDiff !== 0) {
        return attentionDiff
      }

      const priorityDiff = normalizePriority(left.priority) - normalizePriority(right.priority)
      if (priorityDiff !== 0) {
        return priorityDiff
      }

      const pluginDiff = (left.pluginDisplayName ?? left.pluginId).localeCompare(
        right.pluginDisplayName ?? right.pluginId,
        'zh-CN',
      )
      if (pluginDiff !== 0) {
        return pluginDiff
      }

      return left.canonicalCommand.localeCompare(right.canonicalCommand, 'zh-CN')
    }),
  )
  const {
    currentPage: page,
    pageCount,
    pagedItems: pagedCommands,
    rangeStart,
    rangeEnd,
    canGoPrev: canGoPrevPage,
    canGoNext: canGoNextPage,
    resetPage,
    goPrevPage,
    goNextPage,
  } = usePagination(orderedCommands, 8)
  const commandCount = computed(() => commands.value.length)
  const filteredCommandCount = computed(() => filteredCommands.value.length)
  const conflictCount = computed(() => conflicts.value.length)
  const attentionCommandCount = computed(() =>
    commands.value.filter((command) => commandAttentionWeight(command) < 3).length,
  )

  watch([searchKeyword, filter], () => {
    resetPage()
  })

  onMounted(() => {
    void refreshAll()
  })

  async function refreshAll() {
    loading.value = true
    requestState.clearError()
    try {
      const overview = await loadPluginCommandOverview()
      commands.value = overview.commands
      conflicts.value = overview.conflicts
    } catch (caughtError) {
      requestState.setError(caughtError, '加载命令治理数据失败')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    appError,
    commands,
    conflicts,
    searchKeyword,
    filter,
    pagedCommands,
    page,
    pageCount,
    rangeStart,
    rangeEnd,
    canGoPrevPage,
    canGoNextPage,
    goPrevPage,
    goNextPage,
    commandCount,
    filteredCommandCount,
    conflictCount,
    attentionCommandCount,
    refreshAll,
  }
}

function matchesCommand(command: PluginCommandInfo, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  return [
    command.pluginDisplayName ?? '',
    command.pluginId,
    command.canonicalCommand,
    ...command.aliases,
    ...command.variants,
    command.description ?? '',
    command.governance?.disableReason ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(keyword)
}

function matchesFilter(command: PluginCommandInfo, filter: CommandFilter): boolean {
  switch (filter) {
    case 'conflict':
      return command.conflictTriggers.length > 0
    case 'protected':
      return command.governance?.canDisable === false
    case 'offline':
      return !command.connected
    default:
      return true
  }
}

function commandAttentionWeight(command: PluginCommandInfo): number {
  if (command.conflictTriggers.length > 0) {
    return 0
  }
  if (command.governance?.canDisable === false) {
    return 1
  }
  if (!command.connected) {
    return 2
  }

  return 3
}

function normalizePriority(priority?: number): number {
  if (typeof priority !== 'number' || !Number.isFinite(priority)) {
    return 0
  }

  return Math.trunc(priority)
}
