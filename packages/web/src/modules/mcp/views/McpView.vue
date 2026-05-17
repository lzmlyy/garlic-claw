<template>
  <ConsolePage class="mcp-page" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="MCP 管理"
        :icon="widgetAddBold"
      >
        <template #actions>
          <ElButton
            v-if="currentView === 'logs' && panelRef?.selectedServer"
            class="view-header-action"
            :class="{ active: panelRef?.showLogSettings }"
            title="日志设置"
            @click="panelRef?.toggleLogSettings()"
          >
            <Icon :icon="settingsBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            class="view-header-action"
            :title="currentView === 'manage' ? '刷新配置' : '刷新日志'"
            :disabled="panelRef?.loading"
            @click="panelRef?.handleRefresh()"
          >
            <Icon :icon="refreshBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            v-if="currentView === 'manage'"
            class="view-header-action"
            title="新增 Server"
            data-test="mcp-new-button"
            @click="panelRef?.startCreate()"
          >
            <Icon :icon="addCircleBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <div class="mcp-inner">
      <aside class="mcp-sidebar">
        <nav class="detail-nav" aria-label="MCP 详情面板切换">
          <div class="detail-nav-group">
            <ElButton
              v-for="panel in viewOptions"
              :key="panel.value"
              class="detail-nav-button"
              native-type="button"
              :title="panel.label"
              :class="{ active: currentView === panel.value }"
              @click="currentView = panel.value"
            >
              <Icon class="nav-icon" :icon="panel.icon" aria-hidden="true" />
              <span class="nav-label">{{ panel.label }}</span>
            </ElButton>
          </div>
        </nav>
      </aside>

      <main class="mcp-content">
        <McpConfigPanel ref="panelRef" :view="currentView" />
      </main>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import { ElButton } from 'element-plus'
import type { McpServerConfig } from '@garlic-claw/shared'
import { ref } from 'vue'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import McpConfigPanel from '@/modules/tools/components/McpConfigPanel.vue'

type McpPageView = 'manage' | 'logs'
type McpConfigPanelExposed = {
  loading: boolean
  selectedServer: McpServerConfig | null
  showLogSettings: boolean
  startCreate: () => void
  handleRefresh: () => void
  toggleLogSettings: () => void
}

const currentView = ref<McpPageView>('manage')
const panelRef = ref<McpConfigPanelExposed | null>(null)
const viewOptions: ReadonlyArray<{ label: string; value: McpPageView; icon: IconifyIcon }> = [
  { label: 'MCP 配置', value: 'manage', icon: widgetAddBold },
  { label: '事件日志', value: 'logs', icon: listCheckBold },
]
</script>

<style scoped>
.mcp-page {
  background: transparent;
}

.mcp-inner {
  display: flex;
  height: 100%;
  overflow: visible;
}

.mcp-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.mcp-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
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

.mcp-page :deep(.view-header-action.active) {
  border-color: var(--gc-accent);
  box-shadow: var(--gc-focus-shadow);
}

@media (max-width: 800px) {
  .mcp-sidebar {
    width: 180px;
  }

  .mcp-content {
    padding: 16px;
  }
}

@media (max-width: 720px) {
  .mcp-inner {
    flex-direction: column;
  }

  .mcp-sidebar {
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

  .mcp-content {
    padding: 12px;
  }
}
</style>
