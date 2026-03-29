import { computed, onMounted, ref } from 'vue'
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  listConversations,
  runAutomation,
  toggleAutomation,
} from '../api'
import type {
  ActionConfig,
  AutomationInfo,
  Conversation,
  TriggerConfig,
} from '@garlic-claw/shared'

type AutomationTriggerType = 'cron' | 'manual' | 'event'
type AutomationActionType = ActionConfig['type']

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
  const conversations = ref<Conversation[]>([])
  const loading = ref(true)
  const showCreate = ref(false)
  const form = ref(createAutomationFormState())
  const canCreate = computed(
    () => Boolean(form.value.name && hasValidTrigger(form.value) && hasValidAction(form.value)),
  )

  onMounted(() => {
    void Promise.all([loadAutomations(), loadConversations()])
  })

  async function loadAutomations() {
    loading.value = true
    try {
      automations.value = await listAutomations()
    } catch (error) {
      console.error('无法加载自动化程序:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadConversations() {
    try {
      conversations.value = await listConversations()
      if (!form.value.targetConversationId && conversations.value[0]) {
        form.value.targetConversationId = conversations.value[0].id
      }
    } catch (error) {
      console.error('无法加载会话列表:', error)
    }
  }

  async function handleCreate() {
    const trigger: TriggerConfig = {
      type: form.value.triggerType,
      cron:
        form.value.triggerType === 'cron'
          ? form.value.cronInterval
          : undefined,
      event:
        form.value.triggerType === 'event'
          ? form.value.eventName
          : undefined,
    }

    await createAutomation({
      name: form.value.name,
      trigger,
      actions: [buildAction(form.value)],
    })
    showCreate.value = false
    form.value = createAutomationFormState()
    if (conversations.value[0]) {
      form.value.targetConversationId = conversations.value[0].id
    }
    await loadAutomations()
  }

  async function handleToggle(id: string) {
    await toggleAutomation(id)
    await loadAutomations()
  }

  async function handleRun(id: string) {
    await runAutomation(id)
    await loadAutomations()
  }

  async function handleDelete(id: string) {
    await deleteAutomation(id)
    await loadAutomations()
  }

  return {
    automations,
    conversations,
    loading,
    showCreate,
    form,
    canCreate,
    handleCreate,
    handleToggle,
    handleRun,
    handleDelete,
    describeAction,
    formatTime,
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

  return Boolean(form.message && form.targetConversationId)
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
    },
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
 * 生成人类可读的自动化动作摘要。
 * @param action 自动化动作
 * @param conversations 当前可见会话列表
 * @returns 列表标签文案
 */
function describeAction(action: ActionConfig, conversations: Conversation[]): string {
  if (action.type === 'device_command') {
    return `${action.plugin ?? 'unknown'}→${action.capability ?? 'unknown'}`
  }

  const targetId = action.target?.id
  const conversation = conversations.find((item) => item.id === targetId)
  const targetLabel = conversation?.title ?? targetId ?? '未指定会话'
  const preview = truncate(action.message ?? '空消息', 20)

  return `消息→${targetLabel} · ${preview}`
}
