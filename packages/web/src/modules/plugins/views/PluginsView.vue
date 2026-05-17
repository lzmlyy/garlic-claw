<template>
  <ConsolePage class="plugins-page" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="插件管理"
        :icon="widgetBold"
      >
        <template #actions>
          <ElButton
            class="hero-action view-header-action"
            title="刷新全部"
            @click="refreshAll"
          >
            <Icon :icon="refreshBold" class="refresh-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <div class="plugins-inner">
      <aside class="plugins-sidebar">
        <nav class="detail-nav" aria-label="插件详情面板切换">
          <div class="detail-nav-group">
            <ElButton
              v-for="panel in availablePanels"
              :key="panel.value"
              class="detail-nav-button"
              native-type="button"
              :title="panel.label"
              :class="{ active: activePanel === panel.value }"
              @click="activePanel = panel.value"
            >
              <Icon class="nav-icon" :icon="panel.icon" aria-hidden="true" />
              <span class="nav-label">{{ panel.label }}</span>
            </ElButton>
          </div>
        </nav>
      </aside>

      <main class="plugins-content">
        <p v-if="error" class="page-banner error">{{ error }}</p>

        <PluginAttentionPanel
          :plugins="attentionPlugins"
          :running-action="runningAction"
          @select-plugin="selectPlugin"
          @run-action="runActionForPlugin"
        />

        <section class="plugin-detail">
          <PluginSidebar
            v-show="activePanel === 'plugins'"
            v-model:active-filter="activeFilter"
            :filter-options="filterOptions"
            :plugins="plugins"
            :loading="loading"
            :selected-plugin-name="selectedPluginName"
            :error="null"
            @select="handleSelectPlugin"
          />

          <template v-if="selectedPlugin">
            <PluginDetailOverview
              v-if="activePanel === 'overview'"
              :plugin="selectedPlugin"
              :health="selectedPluginHealth"
              :actions="selectedPluginActions"
              :running-action="runningAction"
              :detail-loading="detailLoading"
              :deleting="deleting"
              :can-delete="canDeleteSelected"
              :cron-count="selectedCronJobs.length"
              :highlights="selectedPluginHighlights"
              @refresh-details="refreshSelectedDetails()"
              @run-action="runAction"
              @delete-selected="deleteSelectedPlugin"
            />

            <div v-if="activePanel !== 'plugins'" class="detail-content">
              <div v-if="activePanel === 'logs'" class="plugin-log-stack">
                <PluginEventLog
                  :events="eventLogs"
                  :loading="detailLoading || eventLoading"
                  :query="eventQuery"
                  :next-cursor="eventNextCursor"
                  @refresh="refreshPluginEvents"
                  @load-more="loadMorePluginEvents"
                />
                <EventLogSettingsPanel
                  :settings="selectedPlugin.eventLog"
                  :saving="savingEventLog"
                  title="插件日志设置"
                  description="此插件的事件日志会写入 log/plugins/<pluginId>/ 目录。"
                  @save="saveEventLog"
                />
              </div>
              <PluginRemoteSummaryPanel
                v-if="activePanel === 'remote-summary'"
                :plugin="selectedPlugin"
              />
              <PluginRemoteAccessPanel
                v-if="activePanel === 'remote-access'"
                :plugin="selectedPlugin"
                :saving="savingRemoteAccess"
                @save="saveRemoteAccess"
              />
              <SchemaConfigForm
                v-if="activePanel === 'config'"
                :snapshot="configSnapshot"
                :saving="savingConfig"
                title="插件配置"
                description="宿主按插件声明的配置元数据统一渲染，不再依赖扁平字段表单。"
                empty-text="插件没有声明配置元数据。"
                @save="saveConfig"
              />
              <PluginLlmPreferencePanel
                v-if="selectedPluginUsesLlm && activePanel === 'llm-preference'"
                :preference="llmPreference"
                :providers="llmProviders"
                :options="llmOptions"
                :saving="savingLlmPreference"
                @save="saveLlmPreference"
              />
              <PluginScopeEditor
                v-if="activePanel === 'scope'"
                :plugin="selectedPlugin"
                :scope="scopeSettings"
                :saving="savingScope"
                @save="saveScope"
              />
              <PluginStoragePanel
                v-if="activePanel === 'storage'"
                :entries="storageEntries"
                :prefix="storagePrefix"
                :loading="detailLoading"
                :saving="savingStorage"
                :deleting-key="deletingStorageKey"
                @refresh="refreshPluginStorage"
                @save="saveStorageEntry"
                @delete="deleteStorageEntry"
              />
              <PluginCronList
                v-if="activePanel === 'cron'"
                :jobs="selectedCronJobs"
                :deleting-job-id="deletingCronJobId"
                @delete="deleteCronJob"
              />
              <PluginConversationSessionList
                v-if="activePanel === 'sessions'"
                :sessions="selectedConversationSessions"
                :finishing-conversation-id="finishingConversationId"
                @finish="finishConversationSession"
              />
              <PluginRouteList
                v-if="activePanel === 'routes'"
                :plugin-name="selectedPlugin.name"
                :routes="selectedPlugin.manifest.routes ?? []"
              />
            </div>
          </template>

          <section v-else-if="activePanel !== 'plugins'" class="plugin-empty">
            <h2>暂无插件</h2>
            <p>启动本地插件或远程插件后，就可以在这里统一查看扩展面和健康快照。</p>
          </section>
        </section>
      </main>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import SchemaConfigForm from '@/modules/config/components/SchemaConfigForm.vue'
import PluginAttentionPanel from '@/modules/plugins/components/PluginAttentionPanel.vue'
import PluginConversationSessionList from '@/modules/plugins/components/PluginConversationSessionList.vue'
import PluginCronList from '@/modules/plugins/components/PluginCronList.vue'
import PluginDetailOverview from '@/modules/plugins/components/PluginDetailOverview.vue'
import PluginEventLog from '@/modules/plugins/components/PluginEventLog.vue'
import PluginLlmPreferencePanel from '@/modules/plugins/components/PluginLlmPreferencePanel.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import documentTextBold from '@iconify-icons/solar/document-text-bold'
import serverBold from '@iconify-icons/solar/server-bold'
import codeBold from '@iconify-icons/solar/code-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import cpuBold from '@iconify-icons/solar/cpu-bold'
import cpuBoltBold from '@iconify-icons/solar/cpu-bolt-bold'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import clockCircleBold from '@iconify-icons/solar/clock-circle-bold'
import chatRoundLineBold from '@iconify-icons/solar/chat-round-line-bold'
import linkRoundBold from '@iconify-icons/solar/link-round-bold'
import { ElButton } from 'element-plus'
import PluginRemoteAccessPanel from '@/modules/plugins/components/PluginRemoteAccessPanel.vue'
import PluginRemoteSummaryPanel from '@/modules/plugins/components/PluginRemoteSummaryPanel.vue'
import PluginRouteList from '@/modules/plugins/components/PluginRouteList.vue'
import PluginScopeEditor from '@/modules/plugins/components/PluginScopeEditor.vue'
import PluginSidebar from '@/modules/plugins/components/PluginSidebar.vue'
import PluginStoragePanel from '@/modules/plugins/components/PluginStoragePanel.vue'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import {
  hasPluginIssue,
  pluginAttentionWeight,
  pluginUsesHostLlm,
} from '@/modules/plugins/composables/plugin-management.helpers'
import { usePluginManagement } from '@/modules/plugins/composables/use-plugin-management'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
import type { PluginActionName, PluginHealthSnapshot, PluginInfo } from '@garlic-claw/shared'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

type PluginFilterValue = 'all' | 'attention' | 'local' | 'remote'
type DetailPanelId =
  | 'plugins'
  | 'overview'
  | 'logs'
  | 'remote-summary'
  | 'remote-access'
  | 'config'
  | 'llm-preference'
  | 'scope'
  | 'storage'
  | 'cron'
  | 'sessions'
  | 'routes'

const route = useRoute()
const activeFilter = ref<PluginFilterValue>('all')
const filterOptions: ReadonlyArray<{ label: string; value: PluginFilterValue }> = [
  { label: '全部', value: 'all' },
  { label: '需关注', value: 'attention' },
  { label: '本地', value: 'local' },
  { label: '远程', value: 'remote' },
]
const preferredPluginName = computed(() => {
  const raw = route.query.plugin
  return typeof raw === 'string' && raw.trim()
    ? raw.trim()
    : null
})

const {
  loading,
  detailLoading,
  savingConfig,
  savingEventLog,
  savingLlmPreference,
  savingRemoteAccess,
  savingStorage,
  savingScope,
  eventLoading,
  runningAction,
  deletingCronJobId,
  finishingConversationId,
  deletingStorageKey,
  deleting,
  error,
  plugins,
  selectedPluginName,
  selectedPlugin,
  configSnapshot,
  llmPreference,
  llmProviders,
  llmOptions,
  conversationSessions,
  cronJobs,
  scopeSettings,
  healthSnapshot,
  eventLogs,
  eventQuery,
  eventNextCursor,
  storageEntries,
  storagePrefix,
  canDeleteSelected,
  refreshAll,
  selectPlugin,
  refreshSelectedDetails,
  refreshPluginEvents,
  loadMorePluginEvents,
  refreshPluginStorage,
  deleteCronJob,
  finishConversationSession,
  saveConfig,
  saveEventLog,
  saveLlmPreference,
  saveRemoteAccess,
  saveStorageEntry,
  saveScope,
  runAction,
  deleteStorageEntry,
  deleteSelectedPlugin,
} = usePluginManagement({
  preferredPluginName,
})

const selectedPluginHighlights = computed(() =>
  selectedPlugin.value ? pluginHighlights(selectedPlugin.value) : [],
)
const selectedPluginHealth = computed<PluginHealthSnapshot | null>(() =>
  healthSnapshot.value ?? selectedPlugin.value?.health ?? null,
)
const selectedPluginActions = computed(() =>
  selectedPlugin.value ? pluginActions(selectedPlugin.value) : [],
)
const selectedPluginUsesLlm = computed(() =>
  selectedPlugin.value ? pluginUsesHostLlm(selectedPlugin.value) : false,
)

const activePanel = ref<DetailPanelId>('plugins')

const PANEL_ICONS: Record<DetailPanelId, IconifyIcon> = {
  plugins: widgetBold,
  overview: listCheckBold,
  logs: documentTextBold,
  'remote-summary': serverBold,
  'remote-access': codeBold,
  config: settingsBold,
  'llm-preference': cpuBold,
  scope: cpuBoltBold,
  storage: disketteBold,
  cron: clockCircleBold,
  sessions: chatRoundLineBold,
  routes: linkRoundBold,
}

const availablePanels = computed(() => {
  const panels: Array<{ label: string; value: DetailPanelId; icon: IconifyIcon }> = []
  panels.push({ label: '插件列表', value: 'plugins', icon: PANEL_ICONS['plugins'] })
  if (selectedPlugin.value) {
    panels.push({ label: '插件概览', value: 'overview', icon: PANEL_ICONS['overview'] })
    panels.push({ label: '日志', value: 'logs', icon: PANEL_ICONS['logs'] })
    if (selectedPlugin.value.remote) {
      panels.push({ label: '远程摘要', value: 'remote-summary', icon: PANEL_ICONS['remote-summary'] })
      panels.push({ label: '远程接入', value: 'remote-access', icon: PANEL_ICONS['remote-access'] })
    }
    panels.push({ label: '插件配置', value: 'config', icon: PANEL_ICONS['config'] })
    if (selectedPluginUsesLlm.value) {
      panels.push({ label: '模型偏好', value: 'llm-preference', icon: PANEL_ICONS['llm-preference'] })
    }
    panels.push({ label: '作用域', value: 'scope', icon: PANEL_ICONS['scope'] })
    panels.push({ label: '持久化 KV', value: 'storage', icon: PANEL_ICONS['storage'] })
    panels.push({ label: '定时任务', value: 'cron', icon: PANEL_ICONS['cron'] })
    panels.push({ label: '会话等待态', value: 'sessions', icon: PANEL_ICONS['sessions'] })
    panels.push({ label: 'Web 路由', value: 'routes', icon: PANEL_ICONS['routes'] })
  }
  return panels
})

watch(availablePanels, (panels) => {
  if (!panels.some((p) => p.value === activePanel.value)) {
    activePanel.value = panels[0]?.value ?? 'plugins'
  }
}, { immediate: true })

const selectedCronJobs = computed(() =>
  cronJobs.value.length > 0 ? cronJobs.value : selectedPlugin.value?.crons ?? [],
)
const selectedConversationSessions = computed(() => conversationSessions.value)
const attentionPlugins = computed(() =>
  [...plugins.value]
    .filter((plugin) => hasPluginIssue(plugin))
    .sort((left, right) => {
      const weightDiff = pluginAttentionWeight(left) - pluginAttentionWeight(right)
      if (weightDiff !== 0) {
        return weightDiff
      }

      return (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name)
    }),
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
  'refresh-metadata': {
    label: '刷新元数据',
    pendingLabel: '刷新中...',
  },
}

/** 根据权限与 Hook 推导插件能力标签。 */
function pluginHighlights(plugin: PluginInfo): string[] {
  const permissions = new Set(plugin.manifest.permissions)
  const hooks = new Set((plugin.manifest.hooks ?? []).map((hook) => hook.name))
  const highlights = new Set<string>()
  const pushHighlight = (label: string) => {
    highlights.add(label)
  }

  if (permissions.has('conversation:read')) {
    pushHighlight('可读取会话上下文')
  }
  if (permissions.has('conversation:write')) {
    pushHighlight('可修改会话标题')
  }
  if (permissions.has('provider:read')) {
    pushHighlight('可读取 Provider 上下文')
  }
  if (permissions.has('memory:read')) {
    pushHighlight('可读取用户记忆')
  }
  if (permissions.has('memory:write')) {
    pushHighlight('可写入用户记忆')
  }
  if (permissions.has('automation:read')) {
    pushHighlight('可读取自动化规则')
  }
  if (permissions.has('automation:write')) {
    pushHighlight('可管理和触发自动化')
  }
  if (permissions.has('kb:read')) {
    pushHighlight('可读取系统知识库')
  }
  if (permissions.has('persona:read')) {
    pushHighlight('可读取人设上下文')
  }
  if (permissions.has('persona:write')) {
    pushHighlight('可切换当前人设')
  }
  if (permissions.has('llm:generate')) {
    pushHighlight('可二次调用模型')
  }
  if (permissions.has('storage:read') || permissions.has('storage:write')) {
    pushHighlight('可读写持久化插件 KV')
  }
  if (permissions.has('state:read') || permissions.has('state:write')) {
    pushHighlight('可读写进程内状态')
  }
  if (permissions.has('log:write')) {
    pushHighlight('可写入宿主事件日志')
  }
  if (permissions.has('cron:read') || permissions.has('cron:write')) {
    pushHighlight('可管理宿主 Cron')
  }
  if (permissions.has('subagent:run')) {
    pushHighlight('可调用宿主子代理')
  }
  if (hooks.has('conversation:created')) {
    pushHighlight('可监听会话创建')
  }
  if (hooks.has('message:received')) {
    pushHighlight('可前置监听和过滤消息')
  }
  if (hooks.has('message:created')) {
    pushHighlight('可改写消息草稿')
  }
  if (hooks.has('message:updated')) {
    pushHighlight('可改写消息编辑结果')
  }
  if (hooks.has('message:deleted')) {
    pushHighlight('可监听消息删除')
  }
  if (hooks.has('automation:before-run')) {
    pushHighlight('可拦截自动化执行')
  }
  if (hooks.has('automation:after-run')) {
    pushHighlight('可改写或记录自动化结果')
  }
  if (hooks.has('tool:before-call')) {
    pushHighlight('可拦截工具调用参数')
  }
  if (hooks.has('tool:after-call')) {
    pushHighlight('可观察或改写工具结果')
  }
  if (hooks.has('response:before-send')) {
    pushHighlight('可改写最终发送内容')
  }
  if (hooks.has('response:after-send')) {
    pushHighlight('可观察最终发送结果')
  }
  if (hooks.has('plugin:loaded')) {
    pushHighlight('可监听插件加载')
  }
  if (hooks.has('plugin:unloaded')) {
    pushHighlight('可监听插件卸载')
  }
  if (hooks.has('plugin:error')) {
    pushHighlight('可观察插件失败事件')
  }
  if (hooks.has('chat:before-model')) {
    pushHighlight('可改写模型上下文')
    pushHighlight('可短路模型调用')
  }
  if (hooks.has('chat:waiting-model')) {
    pushHighlight('可观察模型等待态')
  }
  if (hooks.has('chat:after-model')) {
    pushHighlight('可消费并改写模型结果')
  }
  if ((plugin.crons?.length ?? 0) > 0) {
    pushHighlight('可定时执行任务')
  }
  if ((plugin.manifest.routes?.length ?? 0) > 0) {
    pushHighlight('可暴露宿主内 JSON 路由')
  }

  return [...highlights]
}

/** 映射插件声明的动作到按钮。 */
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

async function handleSelectPlugin(pluginName: string) {
  await selectPlugin(pluginName)
  activePanel.value = 'overview'
}

async function runActionForPlugin(input: {
  pluginName: string
  action: PluginActionName
}) {
  if (selectedPluginName.value !== input.pluginName) {
    await handleSelectPlugin(input.pluginName)
  }

  await runAction(input.action)
}
</script>

<style scoped>
.plugins-page {
  background: transparent;
}

.hero-action {
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-panel-hover-soft);
  color: var(--text);
}

.hero-action:hover:not(:disabled) {
  background: var(--surface-panel-muted-strong);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.overview-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.overview-card {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 6px;
  min-width: 0;
  height: 72px;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-card-gradient);
  overflow: hidden;
}

.overview-card strong {
  font-size: clamp(1.15rem, 1.6vw, 1.55rem);
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.overview-label {
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-card p {
  color: var(--text-muted);
  font-size: 0.78rem;
  overflow: hidden;
}

.overview-card.warning {
  border-color: rgba(240, 198, 118, 0.28);
}

.overview-card.warning strong {
  color: #f5d38c;
}

.overview-card.spotlight strong {
  font-size: 1.25rem;
}

@media (max-width: 1280px) {
  .overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}

.page-banner {
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface-panel-soft);
  backdrop-filter: blur(var(--gc-blur-standard));
  -webkit-backdrop-filter: blur(var(--gc-blur-standard));
}

.page-banner.error {
  color: #ffd1d1;
  background: rgba(224, 85, 85, 0.14);
}

.page-banner.success {
  color: #c5ffe0;
  background: rgba(68, 204, 136, 0.14);
}

.plugins-inner {
  display: flex;
  height: 100%;
  overflow: visible;
}

.plugins-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.plugins-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
  display: grid;
  gap: 16px;
}

.plugin-detail {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.plugin-empty {
  display: grid;
  gap: 16px;
  min-width: 0;
  align-content: start;
  padding: 2rem;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--surface-card-gradient);
}

.plugin-empty p {
  color: var(--text-muted);
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

.detail-content {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.plugin-log-stack {
  display: grid;
  gap: 16px;
}

.plugins-page :deep(.panel-section),
.plugins-page :deep(.route-card),
.plugins-page :deep(.cron-card),
.plugins-page :deep(.plugin-sidebar) {
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--surface-card-gradient);
}

.plugins-page :deep(.tester-card),
.plugins-page :deep(.tester-response),
.plugins-page :deep(.tester-headers) {
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: var(--surface-panel-muted-strong);
}

@media (max-width: 800px) {
  .plugins-sidebar {
    width: 180px;
  }

  .plugins-content {
    padding: 16px;
  }
}

@media (max-width: 720px) {
  .plugins-inner {
    flex-direction: column;
  }

  .plugins-sidebar {
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

  .plugins-content {
    padding: 12px;
  }
}
</style>
