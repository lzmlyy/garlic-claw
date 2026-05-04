import { computed, onMounted, shallowRef, ref } from 'vue'
import type {
  ActionConfig,
  AutomationLogInfo,
  AutomationInfo,
  Conversation,
  TriggerConfig,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/shared/composables/use-async-state'
import {
  loadAutomationLogs as loadAutomationLogsById,
  createAutomationRecord,
  deleteAutomationRecord,
  loadAutomationConversations as loadAutomationConversationOptions,
  loadAutomations as loadAutomationList,
  runAutomationRequest,
  toggleAutomationEnabled,
  updateAutomationRecord,
} from './automations.data'

type AutomationTriggerType = 'cron' | 'manual' | 'event'
type AutomationActionType = ActionConfig['type']
type AutomationPageView = 'automations' | 'logs'

interface AutomationFormState {
  name: string
  triggerType: AutomationTriggerType
  cronInterval: string
  eventName: string
  actionType: AutomationActionType
  plugin: string
  capability: string
  message: string
  targetConversationId: string
  targetConversationMode: 'cron_child' | 'existing'
  maxHistoryConversations: number
}

interface AutomationLogEntryViewModel {
  automationId: string
  automationName: string
  createdAt: string
  enabled: boolean
  id: string
  result: string | null
  status: string
  trigger: TriggerConfig
}

interface ConversationOptionViewModel {
  id: string
  label: string
}

/**
 * 自动化页面的状态与交互逻辑。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - 自动化列表、会话列表、创建表单与操作函数
 * 预期行为:
 * - 页面只负责渲染
 * - 列表加载、创建、切换和删除逻辑统一收口
 */
export function useAutomations() {
  const automations = ref<AutomationInfo[]>([])
  const conversations = shallowRef<Conversation[]>([])
  const conversationOptions = computed<ConversationOptionViewModel[]>(
    () => buildConversationOptions(conversations.value),
  )
  const requestState = useAsyncState(true)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const showCreate = ref(false)
  const form = ref(createAutomationFormState())
  const currentView = ref<AutomationPageView>('automations')
  const logsLoading = ref(false)
  const logsLoaded = ref(false)
  const automationLogs = shallowRef<Record<string, AutomationLogInfo[]>>({})
  const canCreate = computed(
    () => Boolean(form.value.name && hasValidTrigger(form.value) && hasValidAction(form.value)),
  )
  const logEntries = computed<AutomationLogEntryViewModel[]>(() => {
    return automations.value
      .flatMap((automation) => (automationLogs.value[automation.id] ?? []).map((log) => ({
        automationId: automation.id,
        automationName: automation.name,
        createdAt: log.createdAt,
        enabled: automation.enabled,
        id: log.id,
        result: log.result,
        status: log.status,
        trigger: automation.trigger,
      })))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  })

  onMounted(() => {
    void Promise.all([loadAutomations(), loadConversations()])
  })

  async function loadAutomations() {
    loading.value = true
    requestState.clearError()
    try {
      automations.value = await loadAutomationList()
      if (currentView.value === 'logs' && !logsLoading.value) {
        void loadAutomationLogs()
      }
    } catch (caughtError) {
      requestState.setError(caughtError, '无法加载自动化程序')
    } finally {
      loading.value = false
    }
  }

  async function loadConversations() {
    requestState.clearError()
    try {
      conversations.value = await loadAutomationConversationOptions()
      if (!form.value.targetConversationId && conversations.value[0]) {
        form.value.targetConversationId = conversations.value[0].id
      }
    } catch (caughtError) {
      requestState.setError(caughtError, '无法加载会话列表')
    }
  }

  async function handleCreate() {
    requestState.clearError()
    try {
      await createAutomationRecord(buildAutomationPayload(form.value))
      showCreate.value = false
      form.value = createAutomationFormState()
      if (conversations.value[0]) {
        form.value.targetConversationId = conversations.value[0].id
      }
      await loadAutomations()
    } catch (caughtError) {
      requestState.setError(caughtError, '创建自动化失败')
    }
  }

  async function handleUpdate(id: string) {
    requestState.clearError()
    try {
      await updateAutomationRecord(id, buildAutomationPayload(form.value))
      showCreate.value = false
      await loadAutomations()
    } catch (caughtError) {
      requestState.setError(caughtError, '更新自动化失败')
    }
  }

  async function handleToggle(id: string) {
    requestState.clearError()
    try {
      await toggleAutomationEnabled(id)
      await loadAutomations()
    } catch (caughtError) {
      requestState.setError(caughtError, '切换自动化状态失败')
    }
  }

  async function handleRun(id: string) {
    requestState.clearError()
    try {
      await runAutomationRequest(id)
      await loadAutomations()
      if (currentView.value === 'logs') {
        await loadAutomationLogs()
      }
    } catch (caughtError) {
      requestState.setError(caughtError, '执行自动化失败')
    }
  }

  async function handleDelete(id: string) {
    requestState.clearError()
    try {
      await deleteAutomationRecord(id)
      const { [id]: _deletedLog, ...restLogs } = automationLogs.value
      automationLogs.value = restLogs
      await loadAutomations()
    } catch (caughtError) {
      requestState.setError(caughtError, '删除自动化失败')
    }
  }

  async function loadAutomationLogs() {
    logsLoading.value = true
    requestState.clearError()
    try {
      const entries = await Promise.all(
        automations.value.map(async (automation) => [
          automation.id,
          await loadAutomationLogsById(automation.id),
        ] as const),
      )
      automationLogs.value = Object.fromEntries(entries)
      logsLoaded.value = true
    } catch (caughtError) {
      requestState.setError(caughtError, '无法加载自动化日志')
    } finally {
      logsLoading.value = false
    }
  }

  function handleViewChange(view: AutomationPageView) {
    currentView.value = view
    if (view === 'logs' && !logsLoading.value) {
      void loadAutomationLogs()
    }
  }

  return {
    automations,
    conversationOptions,
    currentView,
    conversations,
    loading,
    logsLoading,
    logEntries,
    error,
    appError,
    showCreate,
    form,
    canCreate,
    handleCreate,
    handleUpdate,
    handleToggle,
    handleRun,
    handleDelete,
    handleViewChange,
    loadAutomationLogs,
    describeAction: (action: ActionConfig) => describeAction(action, conversationOptions.value),
    formatTime,
    formatTriggerLabel,
    truncate,
  }
}

/**
 * 生成一份干净的自动化创建表单默认值。
 * @returns 默认表单状态
 */
function createAutomationFormState(): AutomationFormState {
  return {
    name: '',
    triggerType: 'cron',
    cronInterval: '5m',
    eventName: '',
    actionType: 'device_command',
    plugin: '',
    capability: '',
    message: '',
    targetConversationId: '',
    targetConversationMode: 'cron_child',
    maxHistoryConversations: 10,
  }
}

/**
 * 判断当前表单的触发器配置是否合法。
 * @param form 当前表单
 * @returns 是否具备合法触发配置
 */
function hasValidTrigger(form: AutomationFormState): boolean {
  return (
    form.triggerType === 'manual'
    || (form.triggerType === 'cron' && Boolean(form.cronInterval))
    || (form.triggerType === 'event' && Boolean(form.eventName))
  )
}

/**
 * 判断当前表单的动作配置是否合法。
 * @param form 当前表单
 * @returns 是否具备合法动作配置
 */
function hasValidAction(form: AutomationFormState): boolean {
  if (form.actionType === 'device_command') {
    return Boolean(form.plugin && form.capability)
  }

  return Boolean(
    form.message
    && form.targetConversationId
    && (form.targetConversationMode !== 'cron_child' || Number.isInteger(form.maxHistoryConversations) && form.maxHistoryConversations > 0),
  )
}

/**
 * 从当前表单构建自动化动作。
 * @param form 当前表单
 * @returns 统一动作配置
 */
function buildAction(form: AutomationFormState): ActionConfig {
  if (form.actionType === 'device_command') {
    return {
      type: 'device_command',
      plugin: form.plugin,
      capability: form.capability,
    }
  }

  return {
    type: 'ai_message',
    message: form.message,
    target: {
      type: 'conversation',
      id: form.targetConversationId,
      ...(form.triggerType === 'cron' && form.targetConversationMode === 'cron_child'
        ? {
            conversationMode: 'cron_child' as const,
            maxHistoryConversations: form.maxHistoryConversations,
          }
        : {}),
    },
  }
}

function buildAutomationPayload(form: AutomationFormState): {
  name: string
  trigger: TriggerConfig
  actions: ActionConfig[]
} {
  return {
    name: form.name,
    trigger: {
      type: form.triggerType,
      cron:
        form.triggerType === 'cron'
          ? form.cronInterval
          : undefined,
      event:
        form.triggerType === 'event'
          ? form.eventName
          : undefined,
    },
    actions: [buildAction(form)],
  }
}

/**
 * 将 ISO 时间格式化为适合列表阅读的相对时间。
 * @param iso ISO 时间字符串
 * @returns 面向界面的时间文案
 */
function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60000) {
    return '刚刚'
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`
}

/**
 * 将过长文本裁剪到指定长度。
 * @param value 原始文本
 * @param max 最大长度
 * @returns 适合列表显示的文本
 */
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

/**
 * 生成统一的触发器展示文案。
 * @param trigger 触发配置
 * @returns 可读标签
 */
function formatTriggerLabel(trigger: TriggerConfig): string {
  if (trigger.type === 'cron') {
    return `每 ${trigger.cron ?? '未配置'}`
  }
  if (trigger.type === 'event') {
    return `事件 ${trigger.event ?? '未配置'}`
  }
  return '手动触发'
}

/**
 * 生成人类可读的自动化动作摘要。
 * @param action 自动化动作
 * @param conversations 当前可见会话列表
 * @returns 列表标签文案
 */
function buildConversationOptions(conversations: Conversation[]): ConversationOptionViewModel[] {
  const titleCounts = new Map<string, number>()
  for (const conversation of conversations) {
    const title = readConversationDisplayTitle(conversation)
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1)
  }
  return conversations.map((conversation) => {
    const title = readConversationDisplayTitle(conversation)
    return {
      id: conversation.id,
      label: titleCounts.get(title) === 1
        ? title
        : `${title} · ${readConversationShortId(conversation.id)}`,
    }
  })
}

function describeAction(action: ActionConfig, conversationOptions: ConversationOptionViewModel[]): string {
  if (action.type === 'device_command') {
    return `${action.plugin ?? 'unknown'}→${action.capability ?? 'unknown'}`
  }

  const targetId = action.target?.id
  const conversation = conversationOptions.find((item) => item.id === targetId)
  const targetLabel = conversation?.label ?? targetId ?? '未指定会话'
  const preview = truncate(action.message ?? '空消息', 20)
  if (action.target?.conversationMode === 'cron_child') {
    return `cron会话→${targetLabel} · 保留最近${action.target.maxHistoryConversations ?? 10}个 · ${preview}`
  }

  return `消息→${targetLabel} · ${preview}`
}

function readConversationDisplayTitle(conversation: Conversation): string {
  const title = conversation.title?.trim()
  return title || '未命名会话'
}

function readConversationShortId(id: string): string {
  return id.length <= 8 ? id : id.slice(-8)
}
