import { computed, onMounted, ref } from 'vue'
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  runAutomation,
  toggleAutomation,
} from '../api'
import type { AutomationInfo } from '@garlic-claw/shared'

type AutomationTriggerType = 'cron' | 'manual'

interface AutomationFormState {
  name: string
  triggerType: AutomationTriggerType
  cronInterval: string
  plugin: string
  capability: string
}

/**
 * 自动化页面的状态与交互逻辑。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - 自动化列表、创建表单与操作函数
 * 预期行为:
 * - 页面只负责渲染
 * - 列表加载、创建、切换和删除逻辑统一收口
 */
export function useAutomations() {
  const automations = ref<AutomationInfo[]>([])
  const loading = ref(true)
  const showCreate = ref(false)
  const form = ref(createAutomationFormState())
  const canCreate = computed(
    () => form.value.name && form.value.plugin && form.value.capability,
  )

  onMounted(() => {
    void loadAutomations()
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

  async function handleCreate() {
    await createAutomation({
      name: form.value.name,
      trigger: {
        type: form.value.triggerType,
        cron:
          form.value.triggerType === 'cron'
            ? form.value.cronInterval
            : undefined,
      },
      actions: [
        {
          type: 'device_command',
          plugin: form.value.plugin,
          capability: form.value.capability,
        },
      ],
    })
    showCreate.value = false
    form.value = createAutomationFormState()
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
    loading,
    showCreate,
    form,
    canCreate,
    handleCreate,
    handleToggle,
    handleRun,
    handleDelete,
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
    plugin: '',
    capability: '',
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
  return value.length > max ? `${value.slice(0, max)}…` : value
}
