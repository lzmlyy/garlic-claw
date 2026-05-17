<template>
  <ConsolePage class="skills-page" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="技能目录"
        :icon="magicStick3Bold"
      >
        <template #actions>
          <ElButton
            v-if="currentView === 'logs' && selectedSkill"
            class="hero-button icon-only view-header-action"
            :class="{ active: showLogSettings }"
            title="日志设置"
            @click="showLogSettings = !showLogSettings"
          >
            <Icon :icon="settingsBold" class="hero-button-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            class="hero-button icon-only view-header-action"
            title="刷新目录"
            :disabled="refreshing"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-button-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>

      </ConsoleViewHeader>
    </template>

    <div class="skills-inner">
      <aside class="skills-sidebar">
        <nav class="detail-nav" aria-label="技能详情面板切换">
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

      <main class="skills-main">
        <p v-if="error" class="page-banner error">{{ error }}</p>

        <div class="skills-layout">
          <SkillsList
            v-model="selectedSkillIdModel"
            v-model:search-keyword="searchKeyword"
            :enabled-count="enabledCount"
            :total-count="totalCount"
            :skills="filteredSkills"
            :loading="loading"
          />

          <div v-if="currentView === 'details'" class="skill-detail-column">
            <SkillDetailPanel
              :skill="selectedSkill"
              :mutating-skill-id="mutatingSkillId"
              @update-load-policy="handleSkillLoadPolicyUpdate"
            />
          </div>

          <div v-else-if="selectedSkill" class="skill-log-column">
            <EventLogSettingsPanel
              v-if="showLogSettings"
              :settings="selectedSkill.governance.eventLog"
              :saving="mutatingSkillId === selectedSkill.id"
              title="技能日志设置"
              description="此技能的事件日志会写入 log/skills/<skillId>/ 目录。"
              @save="handleSkillEventLogUpdate"
            />
            <EventLogPanel
              title="技能事件日志"
              description="查看技能最近的加载和拒绝记录。"
              :events="eventLogs"
              :loading="eventLoading"
              :query="eventQuery"
              :next-cursor="eventNextCursor"
              @refresh="refreshSkillEvents"
              @load-more="loadMoreSkillEvents"
            />
          </div>

          <div v-else class="skill-log-column">
            <section class="skill-log-empty">
              请先从左侧选择一个技能，再查看事件日志。
            </section>
          </div>
        </div>
      </main>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import { ElButton } from 'element-plus'
import type { SkillLoadPolicy } from '@garlic-claw/shared'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import SkillDetailPanel from '@/modules/skills/components/SkillDetailPanel.vue'
import SkillsList from '@/modules/skills/components/SkillsList.vue'
import EventLogPanel from '@/modules/tools/components/EventLogPanel.vue'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import { useSkillManagement } from '@/modules/skills/composables/use-skill-management'
import type { IconifyIcon } from '@iconify/types'

type SkillsPageView = 'details' | 'logs'
const {
  loading,
  refreshing,
  error,
  mutatingSkillId,
  eventLoading,
  eventLogs,
  eventQuery,
  eventNextCursor,
  searchKeyword,
  filteredSkills,
  selectedSkillId,
  selectedSkill,
  enabledCount,
  totalCount,
  selectSkill,
  updateSkillGovernance,
  refreshSkillEvents,
  loadMoreSkillEvents,
  refreshAll,
} = useSkillManagement()

const currentView = ref<SkillsPageView>('details')
const showLogSettings = ref(false)
const viewOptions: ReadonlyArray<{ label: string; value: SkillsPageView; icon: IconifyIcon }> = [
  { label: '技能详情', value: 'details', icon: magicStick3Bold },
  { label: '事件日志', value: 'logs', icon: listCheckBold },
]

const selectedSkillIdModel = computed({
  get: () => selectedSkillId.value,
  set: (nextSkillId: string | null) => {
    if (!nextSkillId) {
      selectedSkillId.value = null
      return
    }

    selectSkill(nextSkillId)
  },
})

function handleSkillLoadPolicyUpdate(payload: {
  skillId: string
  loadPolicy: SkillLoadPolicy
}) {
  void updateSkillGovernance(payload.skillId, {
    loadPolicy: payload.loadPolicy,
  })
}

function handleSkillEventLogUpdate(payload: { maxFileSizeMb: number }) {
  if (!selectedSkill.value) {
    return
  }

  void updateSkillGovernance(selectedSkill.value.id, {
    eventLog: payload,
  })
}
</script>

<style scoped>
.skills-page {
  background: transparent;
}

.skills-inner {
  display: flex;
  height: 100%;
  overflow: visible;
}

.skills-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.skills-main {
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

.skills-page .skills-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0;
  align-items: start;
  min-height: 0;
}

.skills-page .skill-list-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 10px;
  padding-right: 16px;
  border-right: 1px solid var(--shell-border, #334155);
  overflow: hidden;
}

.skills-page .skill-list-header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding-top: 2px;
}

.skills-page .skill-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--shell-text, #f1f5f9);
}

.skills-page .skill-list-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  padding: 0 10px;
  height: 24px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.14);
  color: var(--shell-active, #18a058);
  font-size: 12px;
  font-weight: 600;
}

.skills-page .skill-list-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: visible;
}

.skills-page .field-input {
  min-width: 0;
}

.skills-page .field-input :deep(.el-input__wrapper) {
  background: var(--gc-surface-elevated, var(--shell-bg, #0f172a));
  box-shadow: 0 0 0 1px var(--shell-border, #334155) inset;
}

.skills-page .field-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--shell-active, #18a058) inset;
}

.skills-page .field-input :deep(.el-input__inner) {
  color: var(--shell-text, #f1f5f9);
}

.skills-page .skill-search {
  margin: 0;
}

.skills-page .skill-list {
  display: grid;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 0;
}

.skills-page .skill-detail-column,
.skills-page .skill-log-column {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
  min-height: 0;
  padding-left: 20px;
  align-content: start;
}

.skills-page .skill-detail-panel {
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.skills-page .active-skill-card,
.skills-page .skill-preview {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem;
}

.skills-page .skill-preview {
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
}

.skills-page .governance-panel,
.skills-page .asset-section,
.skills-page .asset-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.skills-page .meta-row {
  display: flex;
  gap: 0.9rem;
}

.skills-page .toggle-button,
.skills-page .hero-button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.skills-page .toggle-button.secondary,
.skills-page .hero-button.secondary {
  color: var(--text-muted);
}

.skills-page .hero-button.active {
  border-color: rgba(76, 189, 255, 0.4);
  background: rgba(76, 189, 255, 0.08);
}

.skills-page .toggle-button:disabled,
.skills-page .hero-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.skills-page .meta-row {
  flex-wrap: wrap;
}

.skills-page .meta-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.skills-page .meta-chip.active-chip {
  border-color: rgba(89, 207, 155, 0.35);
  color: var(--success);
}

.skills-page .meta-chip.governance-enabled {
  border-color: rgba(76, 189, 255, 0.3);
  color: var(--accent);
}

.skills-page .meta-chip.governance-disabled {
  border-color: rgba(255, 107, 107, 0.35);
  color: var(--danger);
}

.skills-page .detail-line,
.skills-page .empty-state {
  color: var(--shell-text-tertiary, var(--text-muted));
}

.skills-page .muted-text {
  color: var(--text-muted);
}

.skills-page .warning-text {
  color: #b77c15;
}

.skills-page .governance-panel,
.skills-page .asset-section {
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
  padding: 0.9rem;
  background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
}

.skills-page .governance-actions,
.skills-page .asset-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.skills-page .trust-level-field {
  display: grid;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.skills-page .trust-level-field select {
  min-width: 160px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  padding: 0.4rem 0.75rem;
}

.skills-page .asset-list {
  display: grid;
  gap: 0.75rem;
}

.skills-page .asset-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem;
  background: var(--gc-atmosphere-1);
}

.skills-page .empty-state.compact {
  padding: 0;
}

.skills-page .skill-log-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  padding: 1rem 0;
  color: var(--shell-text-tertiary, var(--text-muted));
}

.skills-page .markdown-preview {
  margin-top: 1rem;
  color: var(--text);
}

.skills-page .markdown-preview h1,
.skills-page .markdown-preview h2,
.skills-page .markdown-preview h3 {
  margin-top: 0.8rem;
  margin-bottom: 0.45rem;
}

.skills-page .markdown-preview p,
.skills-page .markdown-preview li {
  line-height: 1.6;
}

.skills-page .markdown-preview ol,
.skills-page .markdown-preview ul {
  padding-left: 1.5rem;
}

.skills-page :deep(.view-header-action.active) {
  border-color: var(--gc-accent);
  box-shadow: var(--gc-focus-shadow);
}

@media (max-width: 800px) {
  .skills-sidebar {
    width: 180px;
  }

  .skills-main {
    padding: 16px;
  }
}

@media (max-width: 1100px) {
  .skills-page .skills-layout {
    grid-template-columns: 1fr;
  }

  .skills-page .skill-list-column {
    padding-right: 0;
    padding-bottom: 12px;
    border-right: none;
    border-bottom: 1px solid var(--shell-border, #334155);
  }

  .skills-page .skill-detail-column,
  .skills-page .skill-log-column {
    width: 100%;
    padding-left: 0;
    padding-top: 12px;
  }

  .skills-page .governance-actions,
  .skills-page .asset-header {
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .skills-inner {
    flex-direction: column;
  }

  .skills-sidebar {
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

  .skills-main {
    padding: 12px;
  }

  .skills-page .skill-list-header {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

</style>
