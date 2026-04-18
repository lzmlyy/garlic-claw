<template>
  <div class="plugins-page commands-page">
    <section class="command-hero">
      <header class="command-hero-header">
        <div>
          <span class="hero-kicker">Plugin Command Governance</span>
          <h1>命令治理</h1>
          <p>统一查看插件消息命令、冲突触发词和对应插件治理入口。</p>
        </div>
        <div class="command-hero-side">
          <button
            type="button"
            class="hero-action icon-only"
            title="刷新全部"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-action-icon" aria-hidden="true" />
          </button>
          <div class="hero-note">
            <span class="hero-note-label">当前命令面</span>
            <strong>{{ heroHeadline }}</strong>
            <p>冲突先暴露，治理动作仍统一回到插件页，不再让命令问题散落在聊天主链里。</p>
          </div>
        </div>
      </header>

      <div class="overview-grid">
        <article
          v-for="card in overviewCards"
          :key="card.label"
          class="overview-card"
          :class="card.tone"
        >
          <span class="overview-label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.note }}</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <div class="commands-layout">
      <section class="command-list-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">Command Directory</span>
            <h2>命令目录</h2>
            <p>按插件查看 slash 命令、别名、保护状态和冲突提示。</p>
          </div>
          <button
            type="button"
            class="ghost-button icon-only"
            title="刷新"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="ghost-button-icon" aria-hidden="true" />
          </button>
        </div>

        <div class="panel-controls">
          <input
            v-model="searchKeyword"
            data-test="command-search"
            type="text"
            placeholder="搜索插件、命令、别名或说明"
          >
          <SegmentedSwitch v-model="filter" :options="filterOptions" />
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
          当前筛选下没有命令记录。
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
                <p>{{ command.description || '当前命令没有额外描述。' }}</p>
              </div>
              <RouterLink
                class="ghost-button link-button"
                :to="{ name: 'plugins', query: { plugin: command.pluginId } }"
              >
                打开插件治理
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
          <button
            type="button"
            class="ghost-button"
            :disabled="!canGoPrevPage"
            @click="goPrevPage"
          >
            上一页
          </button>
          <button
            type="button"
            class="ghost-button"
            :disabled="!canGoNextPage"
            @click="goNextPage"
          >
            下一页
          </button>
        </div>
      </section>

      <aside class="command-conflict-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">Conflict Radar</span>
            <h2>冲突触发词</h2>
            <p>同一触发词命中多个插件时，先在这里暴露，再回到对应插件治理页处理。</p>
          </div>
        </div>

        <div v-if="conflicts.length === 0" class="sidebar-state">
          当前没有发现命令冲突。
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import SegmentedSwitch from '@/components/SegmentedSwitch.vue'
import { usePluginCommandManagement } from '../composables/use-plugin-command-management'

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
  attentionCommandCount,
  refreshAll,
} = usePluginCommandManagement()

const heroHeadline = computed(() => {
  if (commandCount.value === 0) {
    return '等待首条命令接入'
  }
  if (conflictCount.value === 0) {
    return `${commandCount.value} 条命令，当前无冲突`
  }

  return `${commandCount.value} 条命令，${conflictCount.value} 个冲突触发词`
})
const overviewCards = computed(() => [
  {
    label: '命令总数',
    value: String(commandCount.value),
    note: '来自插件 runtime manifest 或 hook filter 的统一目录',
    tone: 'accent',
  },
  {
    label: '冲突触发词',
    value: String(conflictCount.value),
    note: conflictCount.value > 0 ? '同一 slash 触发词命中了多个插件' : '当前没有重叠触发词',
    tone: conflictCount.value > 0 ? 'warning' : 'neutral',
  },
  {
    label: '需关注命令',
    value: String(attentionCommandCount.value),
    note: '优先关注冲突、受保护或离线插件命令',
    tone: attentionCommandCount.value > 0 ? 'warning' : 'neutral',
  },
])

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
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 0;
}

.command-hero,
.command-list-panel,
.command-conflict-panel {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.2);
  background: var(--bg-card);
  padding: 1rem;
}

.command-hero-header,
.commands-layout,
.panel-header,
.command-card-top,
.panel-controls,
.meta-row,
.conflict-owners {
  display: flex;
  gap: 0.75rem;
}

.command-hero-header,
.panel-header,
.command-card-top {
  justify-content: space-between;
}

.commands-layout {
  align-items: flex-start;
}

.command-list-panel {
  flex: 1 1 0;
  min-width: 0;
}

.command-conflict-panel {
  width: 320px;
  flex-shrink: 0;
}

.command-hero-side,
.hero-note,
.command-list,
.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hero-kicker,
.panel-kicker,
.hero-note-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.overview-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.overview-card.warning {
  border-color: rgba(214, 162, 36, 0.4);
}

.panel-controls {
  flex-wrap: wrap;
  align-items: center;
  margin: 1rem 0 0.75rem;
}

.panel-controls input {
  flex: 1 1 240px;
}

.filter-chips,
.meta-row {
  flex-wrap: wrap;
}

.filter-chip,
.owner-chip,
.meta-chip {
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

.hero-action.icon-only,
.ghost-button.icon-only {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.hero-action-icon,
.ghost-button-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 1100px) {
  .commands-layout {
    flex-direction: column;
  }

  .command-conflict-panel {
    width: 100%;
  }
}
</style>
