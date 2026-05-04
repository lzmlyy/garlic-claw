<template>
  <ConsolePage class="automations-view" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="自动化"
        :icon="cpuBoltBold"
      >
        <template #actions>
          <ElButton
            v-if="currentView === 'logs'"
            class="view-header-action"
            title="刷新日志"
            aria-label="刷新日志"
            @click="loadAutomationLogs"
          >
            <Icon :icon="refreshBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            v-if="currentView === 'automations'"
            class="view-header-action"
            title="新建自动化"
            aria-label="新建自动化"
            @click="openCreateDialog"
          >
            <Icon :icon="addCircleBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <!-- 创建/编辑弹窗 -->
    <ElDialog
      :model-value="dialogVisible"
      :title="editingAutomation ? '编辑自动化' : '新建自动化'"
      width="560px"
      top="8vh"
      :close-on-click-modal="false"
      destroy-on-close
      @close="closeDialog"
    >
      <div class="dialog-body">
        <div class="field">
          <label>名称</label>
          <ElInput v-model="form.name" placeholder="例如：每5分钟检查系统信息" />
        </div>
        <div class="field">
          <label>触发方式</label>
          <ElSelect v-model="form.triggerType">
            <ElOption label="定时执行" value="cron" />
            <ElOption label="手动触发" value="manual" />
            <ElOption label="事件触发" value="event" />
          </ElSelect>
        </div>
        <div v-if="form.triggerType === 'cron'" class="field">
          <label>执行间隔</label>
          <ElInput v-model="form.cronInterval" placeholder="例如: 5m, 1h, 30s" />
          <span class="hint">支持标准 cron 表达式，也兼容 30s / 5m / 1h</span>
        </div>
        <div v-if="form.triggerType === 'event'" class="field">
          <label>事件名称</label>
          <ElInput v-model="form.eventName" placeholder="例如: coffee.ready" />
          <span class="hint">当插件或宿主发出同名自动化事件时执行</span>
        </div>
        <div class="field">
          <label>动作类型</label>
          <ElSelect v-model="form.actionType">
            <ElOption label="设备命令" value="device_command" />
            <ElOption label="发送消息" value="ai_message" />
          </ElSelect>
        </div>
        <div v-if="form.actionType === 'device_command'" class="field">
          <label>动作：设备命令</label>
          <ElInput v-model="form.plugin" placeholder="插件名称 (如 pc-NOTEBOOK)" />
          <ElInput
            v-model="form.capability"
            placeholder="能力名称 (如 get_pc_info)"
            class="field-gap-top"
          />
        </div>
        <div v-else class="field">
          <label>动作：发送消息</label>
          <ElInput
            v-model="form.message"
            type="textarea"
            :rows="3"
            placeholder="例如：咖啡已经煮好了，记得趁热喝。"
          />
          <template v-if="form.triggerType === 'cron'">
            <ElSelect v-model="form.targetConversationMode" class="field-gap-top">
              <ElOption label="自动创建 cron 会话" value="cron_child" />
              <ElOption label="写入已有会话" value="existing" />
            </ElSelect>
          </template>
          <ElSelect v-model="form.targetConversationId" class="field-gap-top">
            <ElOption
              disabled
              value=""
              :label="form.triggerType === 'cron' && form.targetConversationMode === 'cron_child' ? '请选择父会话' : '请选择目标会话'"
            />
            <ElOption
              v-for="conversation in conversationOptions"
              :key="conversation.id"
              :label="conversation.label"
              :value="conversation.id"
            />
          </ElSelect>
          <div v-if="form.triggerType === 'cron' && form.targetConversationMode === 'cron_child'" class="field nested-field">
            <label>历史会话保留数量</label>
            <ElInputNumber
              v-model.number="form.maxHistoryConversations"
              :min="1"
              :step="1"
              controls-position="right"
            />
          </div>
          <span class="hint">
            <template v-if="form.triggerType === 'cron' && form.targetConversationMode === 'cron_child'">
              每次 cron 触发都会在选中的父会话下新建一个子会话，并只保留最近设定数量的历史。
            </template>
            <template v-else>
              自动化会把消息写回选中的会话。
            </template>
            <template v-if="conversations.length === 0">没有可用会话，请先创建对话</template>
          </span>
        </div>
      </div>
      <template #footer>
        <ElButton @click="closeDialog">取消</ElButton>
        <ElButton type="primary" :disabled="!canCreate" @click="handleSave">
          {{ editingAutomation ? '保存' : '创建' }}
        </ElButton>
      </template>
    </ElDialog>

    <div class="automations-inner">
      <aside class="automations-sidebar">
        <nav class="detail-nav" aria-label="自动化面板切换">
          <div class="detail-nav-group">
            <ElButton
              v-for="panel in viewOptions"
              :key="panel.value"
              class="detail-nav-button"
              native-type="button"
              :title="panel.label"
              :class="{ active: currentView === panel.value }"
              @click="handleViewSwitch(panel.value)"
            >
              <Icon class="nav-icon" :icon="panel.icon" aria-hidden="true" />
              <span class="nav-label">{{ panel.label }}</span>
            </ElButton>
          </div>
        </nav>
      </aside>

      <main class="automations-content">
        <p v-if="error" class="page-banner error">{{ error }}</p>

        <div v-if="currentView === 'automations' && loading" class="loading">加载中...</div>

        <div v-else-if="currentView === 'automations' && automations.length === 0" class="empty">
          <p>暂无自动化规则</p>
          <p class="hint">可以通过上方按钮创建，或在对话中让 AI 帮你创建</p>
        </div>

        <div v-else-if="currentView === 'automations'" class="automation-list">
          <div
            v-for="auto in automations"
            :key="auto.id"
            class="automation-swipe-item"
            @touchstart.passive="(e) => onTouchStart(e, auto.id)"
            @touchmove="(e) => onTouchMove(e, auto.id)"
            @touchend="() => onTouchEnd(auto.id)"
            @touchcancel="() => onTouchEnd(auto.id)"
            @mousedown="(e) => onTouchStart(e, auto.id)"
            @mousemove="(e) => onTouchMove(e, auto.id)"
            @mouseup="() => onTouchEnd(auto.id)"
            @mouseleave="() => onTouchEnd(auto.id)"
          >
            <div class="swipe-action left-action" :style="getLeftActionStyle(auto.id)">
              <Icon :icon="auto.enabled ? closeCircleBold : checkCircleBold" :width="24" />
              <span class="action-text">{{ auto.enabled ? '停用' : '启用' }}</span>
            </div>

            <div class="swipe-action right-action" :style="getRightActionStyle(auto.id)">
              <Icon :icon="trashBold" :width="24" />
              <span class="action-text">删除</span>
            </div>

            <div
              class="automation-card"
              :class="{ disabled: !auto.enabled }"
              :style="getCardStyle(auto.id)"
              @click="handleCardClick(auto)"
            >
              <div class="card-header">
                <h3 class="card-title">{{ auto.name }}</h3>
                <div class="card-actions">
                  <ElButton
                    size="small"
                    plain
                    @click.stop="handleRun(auto.id)"
                    :disabled="!auto.enabled"
                  >
                    手动运行
                  </ElButton>
                  <ElButton
                    size="small"
                    plain
                    type="danger"
                    data-test="automation-delete-button"
                    @click.stop="confirmDeleteAutomation(auto.id, auto.name)"
                  >
                    删除
                  </ElButton>
                </div>
              </div>

              <div v-if="auto.actions.length > 0" class="card-detail">
                <span class="actions-list">
                  <span v-for="(action, i) in auto.actions" :key="i" class="action-tag">
                    {{ describeAction(action) }}
                  </span>
                </span>
              </div>

              <div class="card-footer">
                <span class="trigger-interval">
                  <Icon :icon="clockCircleBold" class="interval-icon" />
                  {{ formatTriggerLabel(auto.trigger) }}
                </span>
                <span v-if="auto.lastRunAt" class="last-run">
                  上次运行: {{ formatTime(auto.lastRunAt) }}
                </span>
                <span v-else class="last-run never">尚未运行</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="logsLoading" class="loading">日志加载中...</div>

        <div v-else-if="logEntries.length === 0" class="empty">
          <p>暂无执行日志</p>
          <p class="hint">先手动运行一次自动化，或等待定时 / 事件触发。</p>
        </div>

        <div v-else class="log-list">
          <article
            v-for="log in logEntries"
            :key="log.id"
            class="log-card"
            :class="log.status"
          >
            <div class="log-card-header">
              <div class="log-card-title-row">
                <span class="log-badge">{{ log.status === 'success' ? '成功' : log.status }}</span>
                <h3 class="log-card-title">{{ log.automationName }}</h3>
                <span v-if="!log.enabled" class="log-disabled-tag">已停用</span>
              </div>
              <span class="log-card-time">{{ formatTime(log.createdAt) }}</span>
            </div>
            <div class="log-card-meta">
              <span>{{ formatTriggerLabel(log.trigger) }}</span>
              <span>{{ log.automationId }}</span>
            </div>
            <pre class="log-card-result">{{ log.result || '无返回结果' }}</pre>
          </article>
        </div>
      </main>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import ConsolePage from '@/shared/components/ConsolePage.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import { useAutomations } from '@/modules/automations/composables/use-automations'
import type { AutomationInfo } from '@garlic-claw/shared'
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import checkCircleBold from '@iconify-icons/solar/check-circle-bold'
import clockCircleBold from '@iconify-icons/solar/clock-circle-bold'
import closeCircleBold from '@iconify-icons/solar/close-circle-bold'
import cpuBoltBold from '@iconify-icons/solar/cpu-bolt-bold'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import trashBold from '@iconify-icons/solar/trash-bin-trash-bold'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessageBox, ElOption, ElSelect } from 'element-plus'
import { reactive, ref } from 'vue'

type AutomationView = 'automations' | 'logs'

const {
  automations,
  conversationOptions,
  currentView,
  conversations,
  loading,
  error,
  form,
  canCreate,
  logsLoading,
  logEntries,
  handleCreate,
  handleUpdate,
  handleToggle,
  handleRun,
  handleDelete,
  handleViewChange,
  loadAutomationLogs,
  describeAction,
  formatTime,
  formatTriggerLabel,
} = useAutomations()

const viewOptions: ReadonlyArray<{ label: string; value: AutomationView; icon: IconifyIcon }> = [
  { label: '自动化规则', value: 'automations', icon: cpuBoltBold },
  { label: '执行日志', value: 'logs', icon: listCheckBold },
]

const dialogVisible = ref(false)
const editingAutomation = ref<AutomationInfo | null>(null)

function handleViewSwitch(value: AutomationView) {
  handleViewChange(value)
}

function openCreateDialog() {
  editingAutomation.value = null
  form.value.name = ''
  form.value.triggerType = 'cron'
  form.value.cronInterval = '5m'
  form.value.eventName = ''
  form.value.actionType = 'device_command'
  form.value.plugin = ''
  form.value.capability = ''
  form.value.message = ''
  form.value.targetConversationId = conversations.value[0]?.id ?? ''
  form.value.targetConversationMode = 'cron_child'
  form.value.maxHistoryConversations = 10
  dialogVisible.value = true
}

function openEditDialog(auto: AutomationInfo) {
  editingAutomation.value = auto
  form.value.name = auto.name
  form.value.triggerType = auto.trigger.type
  form.value.cronInterval = auto.trigger.cron ?? '5m'
  form.value.eventName = auto.trigger.event ?? ''
  form.value.actionType = auto.actions[0]?.type ?? 'device_command'
  form.value.plugin = auto.actions[0]?.plugin ?? ''
  form.value.capability = auto.actions[0]?.capability ?? ''
  form.value.message = auto.actions[0]?.message ?? ''
  form.value.targetConversationId = auto.actions[0]?.target?.id ?? ''
  form.value.targetConversationMode = auto.actions[0]?.target?.conversationMode ?? 'existing'
  form.value.maxHistoryConversations = auto.actions[0]?.target?.maxHistoryConversations ?? 10
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
  editingAutomation.value = null
}

async function handleSave() {
  if (editingAutomation.value) {
    await handleUpdate(editingAutomation.value.id)
  } else {
    await handleCreate()
  }
  dialogVisible.value = false
}

function confirmDeleteAutomation(id: string, name: string) {
  ElMessageBox.confirm(
    `确定要删除「${name || '未命名自动化'}」吗？删除后无法恢复。`,
    '删除确认',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(() => handleDelete(id))
    .catch(() => {})
}

const swipeState = reactive<Record<string, {
  offset: number
  startX: number
  startY: number
  isDragging: boolean
  hasMoved: boolean
}>>({})

const SWIPE_THRESHOLD = 80
const MAX_OFFSET = 120

function initSwipeState(id: string) {
  if (!swipeState[id]) {
    swipeState[id] = { offset: 0, startX: 0, startY: 0, isDragging: false, hasMoved: false }
  }
}

function onTouchStart(e: Event, id: string) {
  initSwipeState(id)
  const state = swipeState[id]
  state.isDragging = true

  if (e instanceof TouchEvent) {
    state.startX = e.touches[0].clientX
    state.startY = e.touches[0].clientY
  } else if (e instanceof MouseEvent) {
    state.startX = e.clientX
    state.startY = e.clientY
  }
}

function onTouchMove(e: Event, id: string) {
  const state = swipeState[id]
  if (!state?.isDragging) return

  let clientX = 0
  let clientY = 0
  if (e instanceof TouchEvent) {
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else if (e instanceof MouseEvent) {
    clientX = e.clientX
    clientY = e.clientY
  }

  const deltaX = clientX - state.startX
  const deltaY = clientY - state.startY

  if (Math.abs(deltaY) > Math.abs(deltaX)) return

  if (Math.abs(deltaX) > 5) {
    state.hasMoved = true
  }

  if (e instanceof TouchEvent && Math.abs(deltaX) > 10) {
    e.preventDefault()
  }

  state.offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, deltaX))
}

function onTouchEnd(id: string) {
  const state = swipeState[id]
  if (!state) return

  const hadMoved = state.hasMoved
  state.isDragging = false

  if (hadMoved) {
    setTimeout(() => {
      state.hasMoved = false
    }, 50)
  } else {
    state.hasMoved = false
  }

  const auto = automations.value.find(a => a.id === id)
  if (!auto) {
    state.offset = 0
    return
  }

  if (state.offset > SWIPE_THRESHOLD) {
    handleToggle(id)
    state.offset = 0
    return
  }

  if (state.offset < -SWIPE_THRESHOLD) {
    confirmDeleteAutomation(id, auto.name || '未命名自动化')
    state.offset = 0
    return
  }

  state.offset = 0
}

function handleCardClick(auto: AutomationInfo) {
  const state = swipeState[auto.id]
  if (state?.hasMoved) return
  openEditDialog(auto)
}

function getCardStyle(id: string) {
  const state = swipeState[id]
  if (!state) return {}
  return {
    transform: `translateX(${state.offset}px)`,
    transition: state.isDragging ? 'none' : 'transform 0.3s ease',
  }
}

function getLeftActionStyle(id: string) {
  const state = swipeState[id]
  if (!state) return { opacity: 0 }
  const opacity = Math.min(1, Math.max(0, state.offset / SWIPE_THRESHOLD))
  return {
    opacity,
    transform: `scale(${0.8 + opacity * 0.2})`,
  }
}

function getRightActionStyle(id: string) {
  const state = swipeState[id]
  if (!state) return { opacity: 0 }
  const opacity = Math.min(1, Math.max(0, -state.offset / SWIPE_THRESHOLD))
  return {
    opacity,
    transform: `scale(${0.8 + opacity * 0.2})`,
  }
}
</script>

<style scoped>
.automations-view {
  background: var(--shell-bg);
}

.automations-inner {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.automations-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.automations-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px 24px;
}

.detail-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
}

.detail-nav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-nav :deep(.detail-nav-button.el-button) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 20px;
  border-radius: 8px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  margin: 0;
  color: var(--shell-text-secondary, var(--text-muted));
  font-size: 14px;
  text-align: left;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.detail-nav :deep(.detail-nav-button.el-button:hover) {
  border-color: transparent;
  background: var(--shell-bg-hover, #334155);
  color: var(--shell-text, var(--text));
}

.detail-nav :deep(.detail-nav-button.el-button.active) {
  border-color: transparent;
  color: var(--shell-active, var(--accent));
  background: color-mix(in srgb, var(--shell-active, var(--accent)) 10%, transparent);
}

.nav-icon {
  width: 20px;
  min-width: 20px;
  font-size: 20px;
  flex-shrink: 0;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-banner {
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface-panel-soft);
  backdrop-filter: blur(12px);
}

.page-banner.error {
  color: #ffd1d1;
  background: rgba(224, 85, 85, 0.14);
}

.loading, .empty {
  text-align: center;
  padding: 3rem 0;
  color: var(--text-muted);
}

.empty .hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.dialog-body .field {
  margin-bottom: 0.8rem;
}

.dialog-body .nested-field {
  margin-top: 0.8rem;
  margin-bottom: 0;
}

.field-gap-top {
  margin-top: 0.4rem;
}

.dialog-body label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.3rem;
}

.dialog-body .hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
  display: block;
}

.automation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.automation-swipe-item {
  position: relative;
  touch-action: pan-y;
  user-select: none;
}

.swipe-action {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  border-radius: 12px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.left-action {
  left: 0;
  background: linear-gradient(90deg, var(--success) 0%, #74d8a8 100%);
}

.right-action {
  right: 0;
  background: linear-gradient(270deg, #f36c6c 0%, #f89898 100%);
}

.action-text {
  margin-top: 4px;
  font-size: 11px;
  white-space: nowrap;
}

.automation-card {
  position: relative;
  z-index: 1;
  background: var(--surface-panel);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-radius: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--success);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.automation-card:hover {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.automation-card:active {
  cursor: grabbing;
}

.automation-card.disabled {
  border-left-color: #909399;
  opacity: 0.65;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.card-detail {
  margin-top: 8px;
}

.actions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.action-tag {
  background: var(--bg-input);
  padding: 0.15em 0.5em;
  border-radius: 4px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.trigger-interval {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.interval-icon {
  flex-shrink: 0;
  color: var(--accent);
}

.last-run {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: auto;
}

.last-run.never {
  font-style: italic;
  opacity: 0.7;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-card {
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
}

.log-card.success {
  border-left: 3px solid var(--success);
}

.log-card.error {
  border-left: 3px solid var(--danger);
}

.log-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.log-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.log-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 12px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  flex-shrink: 0;
}

.log-card.success .log-badge {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
}

.log-card.error .log-badge {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}

.log-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-disabled-tag,
.log-card-time,
.log-card-meta {
  color: var(--text-muted);
  font-size: 12px;
}

.log-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
}

.log-card-result {
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-input);
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  color: var(--text-muted);
  font-family: 'Cascadia Code', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.automations-view :deep(.view-header-action.active) {
  border-color: rgba(103, 199, 207, 0.42);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.2);
}

@media (max-width: 800px) {
  .automations-sidebar {
    width: 180px;
  }

  .automations-content {
    padding: 16px;
  }
}

@media (max-width: 840px) {
  .card-header,
  .card-footer,
  .log-card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .last-run {
    margin-left: 0;
  }
}

@media (max-width: 720px) {
  .automations-inner {
    flex-direction: column;
  }

  .automations-sidebar {
    width: 100%;
    max-height: 110px;
    border-right: none;
    border-bottom: 1px solid var(--shell-border);
  }

  .detail-nav {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 12px 8px;
  }

  .detail-nav-group {
    flex-direction: row;
    gap: 4px;
  }

  .detail-nav :deep(.detail-nav-button.el-button) {
    min-height: 40px;
    padding: 0 14px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .automations-content {
    padding: 12px;
  }
}
</style>
