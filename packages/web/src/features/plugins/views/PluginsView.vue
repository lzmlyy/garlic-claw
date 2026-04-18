<template>
  <div class="plugins-page">
    <PluginPageHero
      :headline="heroHeadline"
      :cards="overviewCards"
      @refresh="refreshAll"
    />

    <p v-if="error" class="page-banner error">{{ error }}</p>
    <p v-else-if="notice" class="page-banner success">{{ notice }}</p>

    <PluginAttentionPanel
      :plugins="attentionPlugins"
      :running-action="runningAction"
      @select-plugin="selectPlugin"
      @run-action="runActionForPlugin"
    />

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
        <PluginDetailOverview
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

        <div class="detail-grid">
          <PluginConfigForm
            :snapshot="configSnapshot"
            :saving="savingConfig"
            @save="saveConfig"
          />
          <PluginLlmPreferencePanel
            v-if="selectedPluginUsesLlm"
            :preference="llmPreference"
            :providers="llmProviders"
            :options="llmOptions"
            :saving="savingLlmPreference"
            @save="saveLlmPreference"
          />
          <PluginScopeEditor
            :plugin="selectedPlugin"
            :scope="scopeSettings"
            :saving="savingScope"
            @save="saveScope"
          />
          <ToolGovernancePanel
            class="detail-span"
            :source-id="selectedPlugin.name"
            source-kind="plugin"
            title="插件工具治理"
            description="当前插件声明的宿主工具都在这里控制启用状态和治理动作。"
            :show-source-list="false"
            empty-title="当前插件没有工具源"
            empty-description="这个插件目前没有暴露宿主工具，或尚未连上运行时。"
          />
          <PluginEventLog
            class="detail-span"
            :events="eventLogs"
            :loading="detailLoading || eventLoading"
            :query="eventQuery"
            :next-cursor="eventNextCursor"
            @refresh="refreshPluginEvents"
            @load-more="loadMorePluginEvents"
          />
          <PluginStoragePanel
            class="detail-span"
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
            class="detail-span"
            :jobs="selectedCronJobs"
            :deleting-job-id="deletingCronJobId"
            @delete="deleteCronJob"
          />
          <PluginConversationSessionList
            class="detail-span"
            :sessions="selectedConversationSessions"
            :finishing-conversation-id="finishingConversationId"
            @finish="finishConversationSession"
          />
          <PluginRouteList
            class="detail-span"
            :plugin-name="selectedPlugin.name"
            :routes="selectedPlugin.manifest.routes ?? []"
          />
        </div>
      </section>

      <section v-else class="plugin-empty">
        <span class="empty-kicker">等待插件接入</span>
        <h2>暂无插件</h2>
        <p>启动本地插件或远程插件后，就可以在这里统一查看扩展面、健康快照和治理动作。</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PluginActionName, PluginHealthSnapshot, PluginInfo } from '@garlic-claw/shared'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PluginAttentionPanel from '@/features/plugins/components/PluginAttentionPanel.vue'
import PluginConfigForm from '@/features/plugins/components/PluginConfigForm.vue'
import PluginConversationSessionList from '@/features/plugins/components/PluginConversationSessionList.vue'
import PluginCronList from '@/features/plugins/components/PluginCronList.vue'
import PluginDetailOverview from '@/features/plugins/components/PluginDetailOverview.vue'
import PluginEventLog from '@/features/plugins/components/PluginEventLog.vue'
import PluginLlmPreferencePanel from '@/features/plugins/components/PluginLlmPreferencePanel.vue'
import PluginPageHero from '@/features/plugins/components/PluginPageHero.vue'
import PluginRouteList from '@/features/plugins/components/PluginRouteList.vue'
import PluginScopeEditor from '@/features/plugins/components/PluginScopeEditor.vue'
import PluginSidebar from '@/features/plugins/components/PluginSidebar.vue'
import PluginStoragePanel from '@/features/plugins/components/PluginStoragePanel.vue'
import {
  hasPluginIssue,
  pluginAttentionWeight,
  pluginUsesHostLlm,
} from '@/features/plugins/composables/plugin-management.helpers'
import { usePluginManagement } from '@/features/plugins/composables/use-plugin-management'
import ToolGovernancePanel from '@/features/tools/components/ToolGovernancePanel.vue'

const route = useRoute()
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
  savingLlmPreference,
  savingStorage,
  savingScope,
  eventLoading,
  runningAction,
  deletingCronJobId,
  finishingConversationId,
  deletingStorageKey,
  deleting,
  error,
  notice,
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
  saveLlmPreference,
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
const onlinePluginCount = computed(() =>
  plugins.value.filter((plugin) => plugin.connected).length,
)
const localPluginCount = computed(() =>
  plugins.value.filter((plugin) => (plugin.runtimeKind ?? 'remote') === 'local').length,
)
const remotePluginCount = computed(() =>
  Math.max(plugins.value.length - localPluginCount.value, 0),
)
const attentionPluginCount = computed(() =>
  plugins.value.filter((plugin) => needsAttention(plugin)).length,
)
const heroHeadline = computed(() => {
  const total = plugins.value.length
  const online = onlinePluginCount.value
  if (total === 0) {
    return '等待首个插件接入'
  }
  if (online === total) {
    return `${online} / ${total} 在线`
  }

  return `${online} / ${total} 在线，${total - online} 个离线`
})
const overviewCards = computed(() => {
  const total = plugins.value.length

  return [
    {
      label: '已接入插件',
      value: String(total),
      note: total > 0
        ? `本地 ${localPluginCount.value} · 远程 ${remotePluginCount.value}`
        : '本地与远程插件都会汇聚到这里',
      tone: 'accent',
    },
    {
      label: '在线插件',
      value: String(onlinePluginCount.value),
      note: total === 0
        ? '当前还没有建立运行中的插件连接'
        : onlinePluginCount.value === total
          ? '当前全部在线'
          : `${total - onlinePluginCount.value} 个离线`,
      tone: 'neutral',
    },
    {
      label: '需关注',
      value: String(attentionPluginCount.value),
      note: attentionPluginCount.value > 0
        ? '存在异常、降级或满并发插件'
        : '当前没有高优先级告警',
      tone: attentionPluginCount.value > 0 ? 'warning' : 'neutral',
    },
    {
      label: '当前焦点',
      value: selectedPlugin.value
        ? selectedPlugin.value.displayName ?? selectedPlugin.value.name
        : '未选择插件',
      note: selectedPlugin.value
        ? `${runtimeKindLabel(selectedPlugin.value)} · ${healthText(selectedPluginHealth.value)}`
        : '从左侧选择插件进入详情',
      tone: 'spotlight',
    },
  ]
})

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
 * 根据运行形态生成更适合页面展示的文案。
 * @param plugin 当前插件
 * @returns 运行形态标签
 */
function runtimeKindLabel(plugin: PluginInfo): string {
  return (plugin.runtimeKind ?? 'remote') === 'local' ? '本地插件' : '远程插件'
}

/**
 * 判断插件是否需要在总览里被视为“需关注”。
 * @param plugin 插件摘要
 * @returns 是否需要关注
 */
function needsAttention(plugin: PluginInfo): boolean {
  return hasPluginIssue(plugin)
}

/**
 * 根据插件权限与 Hook 推导它具备的高阶扩展面。
 * @param plugin 当前插件
 * @returns 可展示的能力标签
 */
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
    pushHighlight('可暴露宿主内 JSON Route')
  }

  return [...highlights]
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

async function runActionForPlugin(input: {
  pluginName: string
  action: PluginActionName
}) {
  if (selectedPluginName.value !== input.pluginName) {
    await selectPlugin(input.pluginName)
  }

  await runAction(input.action)
}
</script>

<style scoped src="./plugins-view.css"></style>
