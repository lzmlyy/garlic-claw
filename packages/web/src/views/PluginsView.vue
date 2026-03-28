<template>
  <div class="plugins-page">
    <header class="page-header">
      <div>
        <h1>插件管理</h1>
        <p>统一管理内建插件与远程插件的配置、作用域、健康和治理动作。</p>
      </div>
      <button type="button" @click="refreshAll">刷新全部</button>
    </header>

    <p v-if="error" class="page-banner error">{{ error }}</p>
    <p v-else-if="notice" class="page-banner success">{{ notice }}</p>

    <div class="plugins-layout">
      <PluginSidebar
        :plugins="plugins"
        :loading="loading"
        :selected-plugin-name="selectedPluginName"
        :error="null"
        @refresh="refreshAll"
        @select="selectPlugin"
      />

      <section v-if="selectedPlugin" class="plugin-detail">
        <div class="detail-header">
          <div>
            <div class="eyebrow">{{ selectedPlugin.runtimeKind ?? 'remote' }}</div>
            <h2>{{ selectedPlugin.displayName ?? selectedPlugin.name }}</h2>
            <p>{{ selectedPlugin.description ?? '当前插件没有额外描述。' }}</p>
          </div>
          <div class="detail-actions">
            <button
              type="button"
              class="ghost-button"
              :disabled="detailLoading"
              @click="refreshSelectedDetails()"
            >
              {{ detailLoading ? '同步中...' : '刷新详情' }}
            </button>
            <button
              v-for="action in selectedPluginActions"
              :key="action.name"
              type="button"
              class="ghost-button"
              :disabled="runningAction !== null"
              @click="runAction(action.name)"
            >
              {{ runningAction === action.name ? action.pendingLabel : action.label }}
            </button>
            <button
              type="button"
              class="ghost-button danger-button"
              :disabled="deleting || !canDeleteSelected"
              @click="deleteSelectedPlugin"
            >
              {{ deleting ? '删除中...' : '删除记录' }}
            </button>
          </div>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-label">连接状态</span>
            <strong>{{ selectedPlugin.connected ? '在线' : '离线' }}</strong>
            <p>最后活跃：{{ formatTime(selectedPlugin.lastSeenAt) }}</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">健康状态</span>
            <strong>{{ healthText(healthSnapshot ?? selectedPlugin.health) }}</strong>
            <p>最后成功：{{ formatTime((healthSnapshot ?? selectedPlugin.health)?.lastSuccessAt ?? null) }}</p>
            <p>最后检查：{{ formatTime((healthSnapshot ?? selectedPlugin.health)?.lastCheckedAt ?? null) }}</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">失败统计</span>
            <strong>{{ (healthSnapshot ?? selectedPlugin.health)?.failureCount ?? 0 }}</strong>
            <p>连续失败：{{ (healthSnapshot ?? selectedPlugin.health)?.consecutiveFailures ?? 0 }}</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">能力概览</span>
            <strong>{{ selectedPlugin.capabilities.length }} 个能力</strong>
            <p>
              {{ selectedPlugin.hooks?.length ?? 0 }} 个 Hook，
              {{ selectedCronJobs.length }} 个 Cron，
              {{ selectedPlugin.routes?.length ?? 0 }} 个 Route，
              {{ selectedPlugin.permissions?.length ?? 0 }} 个权限
            </p>
          </article>
        </div>

        <div class="tag-panel">
          <div class="tag-group">
            <span class="tag-label">权限</span>
            <span v-for="permission in selectedPlugin.permissions ?? []" :key="permission" class="token">
              {{ permission }}
            </span>
            <span v-if="!(selectedPlugin.permissions?.length)" class="token muted-token">无</span>
          </div>
          <div class="tag-group">
            <span class="tag-label">Hook</span>
            <span v-for="hook in selectedPlugin.hooks ?? []" :key="hook.name" class="token">
              {{ hook.name }}
            </span>
            <span v-if="!(selectedPlugin.hooks?.length)" class="token muted-token">无</span>
          </div>
          <div class="tag-group">
            <span class="tag-label">扩展面</span>
            <span v-for="highlight in selectedPluginHighlights" :key="highlight" class="token accent-token">
              {{ highlight }}
            </span>
            <span v-if="selectedPluginHighlights.length === 0" class="token muted-token">基础工具插件</span>
          </div>
          <div class="tag-group">
            <span class="tag-label">工具</span>
            <span v-for="tool in selectedPlugin.capabilities" :key="tool.name" class="token">
              {{ tool.name }}
            </span>
            <span v-if="selectedPlugin.capabilities.length === 0" class="token muted-token">无</span>
          </div>
        </div>

        <div v-if="(healthSnapshot ?? selectedPlugin.health)?.lastError" class="error-card">
          <strong>最近错误</strong>
          <p>{{ (healthSnapshot ?? selectedPlugin.health)?.lastError }}</p>
          <p>最后错误时间：{{ formatTime((healthSnapshot ?? selectedPlugin.health)?.lastErrorAt ?? null) }}</p>
        </div>

        <div class="detail-grid">
          <PluginConfigForm
            :snapshot="configSnapshot"
            :saving="savingConfig"
            @save="saveConfig"
          />
          <PluginScopeEditor
            :scope="scopeSettings"
            :saving="savingScope"
            @save="saveScope"
          />
          <PluginEventLog
            class="detail-span"
            :events="eventLogs"
            :loading="detailLoading || eventLoading"
            :limit="eventLimit"
            @refresh="refreshPluginEvents"
          />
          <PluginStoragePanel
            class="detail-span"
            :entries="storageEntries"
            :loading="detailLoading"
            :saving="savingStorage"
            :deleting-key="deletingStorageKey"
            @refresh="refreshPluginStorage"
            @save="saveStorageEntry"
            @delete="deleteStorageEntry"
          />
          <PluginCronList
            class="detail-span"
            :jobs="selectedCronJobs"
            :deleting-job-id="deletingCronJobId"
            @delete="deleteCronJob"
          />
          <PluginRouteList
            class="detail-span"
            :plugin-name="selectedPlugin.name"
            :routes="selectedPlugin.routes ?? selectedPlugin.manifest?.routes ?? []"
          />
        </div>
      </section>

      <section v-else class="plugin-empty">
        <h2>暂无插件</h2>
        <p>启动内建插件或远程插件后，就可以在这里统一管理它们。</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PluginActionName, PluginHealthSnapshot, PluginInfo } from '@garlic-claw/shared'
import { computed } from 'vue'
import PluginConfigForm from '../components/plugin-management/PluginConfigForm.vue'
import PluginCronList from '../components/plugin-management/PluginCronList.vue'
import PluginEventLog from '../components/plugin-management/PluginEventLog.vue'
import PluginRouteList from '../components/plugin-management/PluginRouteList.vue'
import PluginScopeEditor from '../components/plugin-management/PluginScopeEditor.vue'
import PluginSidebar from '../components/plugin-management/PluginSidebar.vue'
import PluginStoragePanel from '../components/plugin-management/PluginStoragePanel.vue'
import { usePluginManagement } from '../composables/use-plugin-management'

const {
  loading,
  detailLoading,
  savingConfig,
  savingStorage,
  savingScope,
  eventLoading,
  runningAction,
  deletingCronJobId,
  deletingStorageKey,
  deleting,
  error,
  notice,
  plugins,
  selectedPluginName,
  selectedPlugin,
  configSnapshot,
  cronJobs,
  scopeSettings,
  healthSnapshot,
  eventLogs,
  eventLimit,
  storageEntries,
  canDeleteSelected,
  refreshAll,
  selectPlugin,
  refreshSelectedDetails,
  refreshPluginEvents,
  refreshPluginStorage,
  deleteCronJob,
  saveConfig,
  saveStorageEntry,
  saveScope,
  runAction,
  deleteStorageEntry,
  deleteSelectedPlugin,
} = usePluginManagement()

const selectedPluginHighlights = computed(() =>
  selectedPlugin.value ? pluginHighlights(selectedPlugin.value) : [],
)
const selectedPluginActions = computed(() =>
  selectedPlugin.value ? pluginActions(selectedPlugin.value) : [],
)
const selectedCronJobs = computed(() =>
  cronJobs.value.length > 0 ? cronJobs.value : selectedPlugin.value?.crons ?? [],
)

const ACTION_LABELS: Record<PluginActionName, {
  label: string
  pendingLabel: string
}> = {
  'health-check': {
    label: '健康检查',
    pendingLabel: '检查中...',
  },
  reload: {
    label: '重载插件',
    pendingLabel: '重载中...',
  },
  reconnect: {
    label: '请求重连',
    pendingLabel: '重连中...',
  },
}

/**
 * 把 ISO 时间转成人类可读文案。
 * @param value 时间字符串
 * @returns 展示文案
 */
function formatTime(value: string | null): string {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString()
}

/**
 * 把健康快照转成展示文案。
 * @param health 健康快照
 * @returns 展示文本
 */
function healthText(health: PluginHealthSnapshot | null | undefined): string {
  switch (health?.status) {
    case 'healthy':
      return '健康'
    case 'degraded':
      return '降级'
    case 'error':
      return '异常'
    case 'offline':
      return '离线'
    default:
      return '未知'
  }
}

/**
 * 根据插件权限与 Hook 推导它具备的高阶扩展面。
 * @param plugin 当前插件
 * @returns 可展示的能力标签
 */
function pluginHighlights(plugin: PluginInfo): string[] {
  const permissions = new Set(plugin.permissions ?? [])
  const hooks = new Set((plugin.hooks ?? []).map((hook) => hook.name))
  const highlights: string[] = []

  if (permissions.has('conversation:read')) {
    highlights.push('可读取会话上下文')
  }
  if (permissions.has('conversation:write')) {
    highlights.push('可修改会话标题')
  }
  if (permissions.has('provider:read')) {
    highlights.push('可读取 Provider 上下文')
  }
  if (permissions.has('memory:read')) {
    highlights.push('可读取用户记忆')
  }
  if (permissions.has('memory:write')) {
    highlights.push('可写入用户记忆')
  }
  if (permissions.has('automation:read')) {
    highlights.push('可读取自动化规则')
  }
  if (permissions.has('automation:write')) {
    highlights.push('可管理和触发自动化')
  }
  if (permissions.has('kb:read')) {
    highlights.push('可读取系统知识库')
  }
  if (permissions.has('persona:read')) {
    highlights.push('可读取 Persona 上下文')
  }
  if (permissions.has('persona:write')) {
    highlights.push('可切换当前 Persona')
  }
  if (permissions.has('llm:generate')) {
    highlights.push('可二次调用模型')
  }
  if (permissions.has('storage:read') || permissions.has('storage:write')) {
    highlights.push('可读写持久化插件 KV')
  }
  if (permissions.has('state:read') || permissions.has('state:write')) {
    highlights.push('可读写进程内状态')
  }
  if (permissions.has('log:write')) {
    highlights.push('可写入宿主事件日志')
  }
  if (permissions.has('cron:read') || permissions.has('cron:write')) {
    highlights.push('可管理宿主 Cron')
  }
  if (permissions.has('subagent:run')) {
    highlights.push('可调用宿主子代理')
  }
  if (hooks.has('chat:before-model')) {
    highlights.push('可改写模型上下文')
    highlights.push('可短路模型调用')
  }
  if (hooks.has('chat:after-model')) {
    highlights.push('可消费并改写模型结果')
  }
  if ((plugin.crons?.length ?? 0) > 0) {
    highlights.push('可定时执行任务')
  }
  if ((plugin.routes?.length ?? 0) > 0) {
    highlights.push('可暴露宿主内 JSON Route')
  }

  return highlights
}

/**
 * 把插件声明的治理动作映射成页面按钮配置。
 * @param plugin 当前插件
 * @returns 动作按钮列表
 */
function pluginActions(plugin: PluginInfo): Array<{
  name: PluginActionName
  label: string
  pendingLabel: string
}> {
  const supportedActions = plugin.supportedActions ?? ['health-check']

  return supportedActions.map((action) => ({
    name: action,
    label: ACTION_LABELS[action].label,
    pendingLabel: ACTION_LABELS[action].pendingLabel,
  }))
}
</script>

<style scoped>
.plugins-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.page-header h1 {
  font-size: 1.45rem;
}

.page-header p {
  color: var(--text-muted);
  max-width: 720px;
}

.page-banner {
  padding: 0.8rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
}

.page-banner.error {
  color: #ffb4b4;
  background: rgba(224, 85, 85, 0.15);
}

.page-banner.success {
  color: #b6ffd3;
  background: rgba(68, 204, 136, 0.15);
}

.plugins-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
}

.plugin-detail,
.plugin-empty {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.plugin-empty {
  align-content: start;
  padding: 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.plugin-empty p {
  color: var(--text-muted);
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 1rem 1.1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.eyebrow {
  display: inline-flex;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(124, 106, 246, 0.16);
  color: var(--accent-hover);
  text-transform: uppercase;
  font-size: 0.75rem;
  margin-bottom: 0.45rem;
}

.detail-header h2 {
  font-size: 1.35rem;
}

.detail-header p {
  color: var(--text-muted);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.danger-button {
  color: var(--danger);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.summary-card {
  display: grid;
  gap: 8px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.summary-card strong {
  font-size: 1.2rem;
}

.summary-card p,
.summary-label {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.tag-panel {
  display: grid;
  gap: 12px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-label {
  width: 52px;
  color: var(--text-muted);
  font-size: 0.82rem;
  padding-top: 0.2rem;
}

.token {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: var(--bg-input);
  font-size: 0.82rem;
}

.muted-token {
  color: var(--text-muted);
}

.accent-token {
  background: rgba(102, 197, 138, 0.18);
  color: #cbffd7;
  border: 1px solid rgba(102, 197, 138, 0.24);
}

.error-card {
  display: grid;
  gap: 8px;
  padding: 1rem;
  background: rgba(224, 85, 85, 0.12);
  border: 1px solid rgba(224, 85, 85, 0.24);
  border-radius: 12px;
  color: #ffd5d5;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail-span {
  grid-column: 1 / -1;
}

@media (max-width: 1200px) {
  .summary-grid,
  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .plugins-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .plugins-page {
    padding: 1rem;
  }

  .page-header,
  .detail-header {
    display: grid;
    grid-template-columns: 1fr;
  }

  .summary-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-actions {
    justify-content: flex-start;
  }
}
</style>
