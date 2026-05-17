<template>
  <ConsolePage class="commands-page" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="命令管理"
        :icon="keyboardBold"
      >
        <template #actions>
          <ElButton
            class="hero-action icon-only view-header-action"
            title="刷新全部"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-action-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <div class="commands-inner">
      <aside class="commands-sidebar">
        <nav class="detail-nav" aria-label="命令管理面板切换">
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

      <main class="commands-main">
        <p v-if="error" class="page-banner error">{{ error }}</p>

        <div class="commands-content">
          <section v-if="currentView === 'directory'" class="command-list-panel">
            <div class="panel-header">
              <div>
                <h2>命令目录</h2>
                <p>按插件查看 slash 命令、别名、保护状态和冲突提示。</p>
                <div class="panel-summary" aria-label="命令目录统计">
                  <span class="summary-chip">命令总数 {{ commandCount }}</span>
                  <span class="summary-chip" :class="{ warning: conflictCount > 0 }">
                    冲突触发词 {{ conflictCount }}
                  </span>
                </div>
              </div>
            </div>

            <div class="panel-controls">
              <ElInput
                v-model="searchKeyword"
                data-test="command-search"
                placeholder="搜索插件、命令、别名或说明"
              />
              <HeaderViewSwitch
                v-model="filter"
                :options="filterOptions"
                aria-label="命令目录筛选"
                size="small"
              />
            </div>

            <div class="sidebar-results">
              <span class="sidebar-results-text">
                匹配 {{ filteredCommandCount }} / {{ commandCount }} 条命令
                <span v-if="commandCount > 0">
                  · 第 {{ page }} / {{ pageCount }} 页
                  · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
                </span>
              </span>
            </div>

            <div v-if="loading" class="sidebar-state">加载中...</div>
            <div v-else-if="pagedCommands.length === 0" class="sidebar-state">
              无匹配命令
            </div>
            <div v-else class="command-list">
              <article
                v-for="command in pagedCommands"
                :key="command.commandId"
                class="command-card"
              >
                <div class="command-card-top">
                  <div>
                    <strong>{{ command.canonicalCommand }}</strong>
                    <p>{{ command.description || '无描述' }}</p>
                  </div>
                  <RouterLink
                    class="ghost-button link-button"
                    :to="{ name: 'plugins', query: { plugin: command.pluginId } }"
                  >
                    管理插件
                  </RouterLink>
                </div>

                <div class="meta-row">
                  <span class="meta-chip">{{ command.pluginDisplayName || command.pluginId }}</span>
                  <span class="meta-chip">{{ command.runtimeKind === 'local' ? '本地' : '远程' }}</span>
                  <span class="meta-chip">{{ command.connected ? '在线' : '离线' }}</span>
                  <span class="meta-chip">{{ sourceLabel(command.source) }}</span>
                  <span class="meta-chip">优先级 {{ command.priority ?? 0 }}</span>
                </div>

                <p v-if="command.aliases.length > 0" class="detail-line">
                  别名: {{ command.aliases.join(' · ') }}
                </p>
                <p class="detail-line">
                  触发集合: {{ command.variants.join(' · ') }}
                </p>
                <p v-if="command.conflictTriggers.length > 0" class="detail-line warning-text">
                  冲突触发词: {{ command.conflictTriggers.join(' · ') }}
                </p>
                <p v-if="command.governance?.canDisable === false" class="detail-line muted-text">
                  {{ command.governance.disableReason }}
                </p>
              </article>
            </div>

            <div v-if="commandCount > 0" class="sidebar-pagination">
              <ElButton
                class="ghost-button"
                :disabled="!canGoPrevPage"
                @click="goPrevPage"
              >
                上一页
              </ElButton>
              <ElButton
                class="ghost-button"
                :disabled="!canGoNextPage"
                @click="goNextPage"
              >
                下一页
              </ElButton>
            </div>
          </section>

          <aside v-else class="command-conflict-panel is-full">
            <div class="panel-header">
              <div>
                <h2>冲突触发词</h2>
                <p>同一触发词命中多个插件时，在这里查看，到对应插件页处理。</p>
              </div>
            </div>

            <div v-if="conflicts.length === 0" class="sidebar-state">
              没有发现冲突
            </div>
            <div v-else class="conflict-list">
              <article
                v-for="conflict in conflicts"
                :key="conflict.trigger"
                class="conflict-card"
              >
                <strong>{{ conflict.trigger }}</strong>
                <p>{{ conflict.commands.length }} 个插件命中了同一触发词。</p>
                <div class="conflict-owners">
                  <RouterLink
                    v-for="owner in conflict.commands"
                    :key="owner.commandId"
                    class="owner-chip"
                    :to="{ name: 'plugins', query: { plugin: owner.pluginId } }"
                  >
                    {{ owner.pluginDisplayName || owner.pluginId }}
                    <span>· P{{ owner.priority ?? 0 }}</span>
                  </RouterLink>
                </div>
              </article>
            </div>
          </aside>
        </div>
      </main>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import keyboardBold from '@iconify-icons/solar/keyboard-bold'
import { ElButton, ElInput } from 'element-plus'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import HeaderViewSwitch from '@/shared/components/HeaderViewSwitch.vue'
import { usePluginCommandManagement } from '../composables/use-plugin-command-management'
import type { IconifyIcon } from '@iconify/types'

type CommandsPageView = 'directory' | 'conflicts'

const {
  loading,
  error,
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
  refreshAll,
} = usePluginCommandManagement()

const currentView = ref<CommandsPageView>('directory')
const viewOptions: ReadonlyArray<{ label: string; value: CommandsPageView; icon: IconifyIcon }> = [
  { label: '命令目录', value: 'directory', icon: keyboardBold },
  { label: '冲突触发词', value: 'conflicts', icon: listCheckBold },
]

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'conflict', label: '冲突' },
  { value: 'protected', label: '受保护' },
  { value: 'offline', label: '离线' },
]

function sourceLabel(source: 'manifest' | 'hook-filter'): string {
  return source === 'manifest' ? 'manifest' : 'hook filter'
}
</script>

<style scoped>
.commands-page {
  background: transparent;
}

.commands-inner {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.commands-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.commands-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
  display: grid;
  gap: 16px;
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

.command-list-panel,
.command-conflict-panel {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.2);
  background: var(--bg-card);
  padding: 1rem;
}

.panel-header,
.command-card-top,
.panel-controls,
.meta-row,
.conflict-owners {
  display: flex;
  gap: 0.75rem;
}

.panel-header,
.command-card-top {
  justify-content: space-between;
}

.command-list-panel {
  min-width: 0;
}

.command-conflict-panel {
  width: 320px;
  flex-shrink: 0;
}

.commands-content {
  min-height: 0;
}

.command-conflict-panel.is-full {
  width: 100%;
}

.command-list,
.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-controls {
  flex-wrap: wrap;
  align-items: center;
  margin: 1rem 0 0.75rem;
}

.panel-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.panel-controls :deep(.el-input),
.panel-controls :deep(.el-select) {
  flex: 1 1 240px;
}

.filter-chips,
.meta-row {
  flex-wrap: wrap;
}

.filter-chip,
.owner-chip,
.meta-chip,
.summary-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: transparent;
  text-decoration: none;
}

.filter-chip.active,
.owner-chip:hover,
.link-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.summary-chip.warning {
  border-color: rgba(214, 162, 36, 0.4);
  color: #b77c15;
}

.command-card,
.conflict-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.9rem;
}

.detail-line,
.sidebar-state {
  color: var(--text-muted);
}

.warning-text {
  color: #b77c15;
}

.muted-text {
  font-size: 0.85rem;
}

.link-button {
  align-self: flex-start;
}

.ghost-button-icon {
  width: 16px;
  height: 16px;
}

.commands-page :deep(.view-header-action.active) {
  border-color: var(--gc-accent);
  box-shadow: var(--gc-focus-shadow);
}

@media (max-width: 800px) {
  .commands-sidebar {
    width: 180px;
  }

  .commands-main {
    padding: 16px;
  }
}

@media (max-width: 1100px) {
  .command-conflict-panel {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .commands-inner {
    flex-direction: column;
  }

  .commands-sidebar {
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

  .commands-main {
    padding: 12px;
  }

  .panel-header,
  .command-card-top {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
