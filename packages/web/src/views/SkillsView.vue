<template>
  <div class="skills-page">
    <section class="skill-hero">
      <header class="skill-hero-header">
        <div>
          <span class="hero-kicker">Skill Workspace</span>
          <h1>Skill 工作台</h1>
          <p>把高层 workflow / prompt 资产挂到当前会话，不再把编排逻辑散落在聊天输入里。</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="hero-button" :disabled="refreshing" @click="refreshAll()">
            {{ refreshing ? '刷新中...' : '刷新目录' }}
          </button>
          <button
            type="button"
            class="hero-button secondary"
            :disabled="!chat.currentConversationId || activeCount === 0"
            @click="clearConversationSkills()"
          >
            清空当前会话
          </button>
        </div>
      </header>

      <div class="overview-grid">
        <article class="overview-card accent">
          <span class="overview-label">Skill 总数</span>
          <strong>{{ totalCount }}</strong>
          <p>来自项目本地或用户目录的 `SKILL.md` 资产。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">当前会话已激活</span>
          <strong>{{ activeCount }}</strong>
          <p>会话级激活后，会在模型调用前统一注入提示和工具策略。</p>
        </article>
        <article class="overview-card neutral">
          <span class="overview-label">Skill Package</span>
          <strong>{{ packageCount }}</strong>
          <p>其中 {{ restrictedCount }} 个还声明了工具 allow / deny 策略。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">全局禁用</span>
          <strong>{{ disabledCount }}</strong>
          <p>被禁用的 skill 不能再加入任何会话，但目录资产仍可见。</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <div class="skills-layout">
      <section class="skill-list-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">Catalog</span>
            <h2>Skill 目录</h2>
            <p>当前会话可激活的 skills。项目内置和用户自定义都统一在这里治理。</p>
          </div>
        </div>

        <input
          v-model="searchKeyword"
          class="skill-search"
          type="text"
          placeholder="搜索 skill 名称、说明、标签"
        >

        <div v-if="loading" class="empty-state">加载中...</div>
        <div v-else-if="filteredSkills.length === 0" class="empty-state">当前筛选下没有 skill。</div>
        <div v-else class="skill-list">
          <article
            v-for="skill in filteredSkills"
            :key="skill.id"
            class="skill-card"
            :class="{ active: selectedSkill?.id === skill.id }"
            @click="selectSkill(skill.id)"
          >
            <div class="skill-card-top">
              <div>
                <strong>{{ skill.name }}</strong>
                <p>{{ skill.description || '当前 skill 没有额外说明。' }}</p>
              </div>
              <button
                type="button"
                class="toggle-button"
                :disabled="isToggleDisabled(skill)"
                @click.stop="toggleSkill(skill.id)"
              >
                {{ skillToggleLabel(skill) }}
              </button>
            </div>
            <div class="meta-row">
              <span class="meta-chip">{{ skill.id }}</span>
              <span class="meta-chip">{{ skill.sourceKind === 'project' ? '项目' : '用户' }}</span>
              <span
                class="meta-chip"
                :class="skill.governance.enabled ? 'governance-enabled' : 'governance-disabled'"
              >
                {{ skill.governance.enabled ? '全局启用' : '全局禁用' }}
              </span>
              <span class="meta-chip">{{ trustLevelLabel(skill.governance.trustLevel) }}</span>
              <span class="meta-chip">{{ skill.assets.length }} 个资产</span>
              <span v-if="isSkillActive(skill.id)" class="meta-chip active-chip">当前会话已激活</span>
            </div>
            <p v-if="skill.tags.length > 0" class="detail-line">标签: {{ skill.tags.join(' · ') }}</p>
            <p class="detail-line">入口: {{ skill.entryPath }}</p>
            <p v-if="skill.assets.length > 0" class="detail-line">资产: {{ skill.assets.map((asset) => asset.path).join(' · ') }}</p>
            <p v-if="!skill.governance.enabled" class="detail-line warning-text">
              当前 skill 已被全局禁用，不能再激活到新的会话。
            </p>
          </article>
        </div>
      </section>

      <aside class="skill-detail-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">Session</span>
            <h2>当前会话已激活</h2>
            <p v-if="chat.currentConversationId">会话 ID: {{ chat.currentConversationId }}</p>
            <p v-else>先选择一个会话，再激活 skill。</p>
          </div>
        </div>

        <div v-if="conversationSkillState?.activeSkills?.length" class="active-skill-list">
          <article
            v-for="skill in conversationSkillState.activeSkills"
            :key="skill.id"
            class="active-skill-card"
          >
            <div class="skill-card-top">
              <strong>{{ skill.name }}</strong>
              <button
                type="button"
                class="toggle-button secondary"
                @click="toggleSkill(skill.id)"
              >
                移除
              </button>
            </div>
            <p class="detail-line">{{ skill.description }}</p>
            <p class="detail-line">ID: {{ skill.id }}</p>
            <p class="detail-line">信任: {{ trustLevelLabel(skill.governance.trustLevel) }}</p>
          </article>
        </div>
        <div v-else class="empty-state">
          当前会话还没有激活 skill。
        </div>

        <article v-if="selectedSkill" class="skill-preview">
          <header class="preview-header">
            <div>
              <span class="panel-kicker">Preview</span>
              <h3>{{ selectedSkill.name }}</h3>
            </div>
            <div class="meta-row">
              <span class="meta-chip">{{ selectedSkill.sourceKind === 'project' ? '项目' : '用户' }}</span>
              <span class="meta-chip">{{ selectedSkill.entryPath }}</span>
            </div>
          </header>

          <p class="detail-line">{{ selectedSkill.description }}</p>
          <section class="governance-panel">
            <div class="meta-row">
              <span
                class="meta-chip"
                :class="selectedSkill.governance.enabled ? 'governance-enabled' : 'governance-disabled'"
              >
                {{ selectedSkill.governance.enabled ? '全局启用' : '全局禁用' }}
              </span>
              <span class="meta-chip">{{ trustLevelLabel(selectedSkill.governance.trustLevel) }}</span>
              <span class="meta-chip">{{ selectedSkill.assets.length }} 个资产</span>
            </div>
            <p class="detail-line muted-text">
              {{ trustLevelDescription(selectedSkill.governance.trustLevel) }}
            </p>
            <div class="governance-actions">
              <button
                type="button"
                class="toggle-button"
                :disabled="selectedSkillBusy || selectedSkill.governance.enabled"
                @click="setSelectedSkillEnabled(true)"
              >
                {{ selectedSkillBusy ? '更新中...' : '全局启用' }}
              </button>
              <button
                type="button"
                class="toggle-button secondary"
                :disabled="selectedSkillBusy || !selectedSkill.governance.enabled"
                @click="setSelectedSkillEnabled(false)"
              >
                {{ selectedSkillBusy ? '更新中...' : '全局禁用' }}
              </button>
              <label class="trust-level-field">
                <span>信任等级</span>
                <select
                  :value="selectedSkill.governance.trustLevel"
                  :disabled="selectedSkillBusy"
                  @change="setSelectedSkillTrustLevel"
                >
                  <option
                    v-for="option in trustLevelOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>
            </div>
          </section>
          <p v-if="selectedSkill.toolPolicy.allow.length > 0" class="detail-line">
            允许工具: {{ selectedSkill.toolPolicy.allow.join(' · ') }}
          </p>
          <p v-if="selectedSkill.toolPolicy.deny.length > 0" class="detail-line warning-text">
            禁止工具: {{ selectedSkill.toolPolicy.deny.join(' · ') }}
          </p>

          <section class="asset-section">
            <header class="asset-header">
              <div>
                <span class="panel-kicker">Package</span>
                <h4>目录资产</h4>
              </div>
              <span class="meta-chip">{{ selectedSkill.assets.length }} 项</span>
            </header>
            <p class="detail-line muted-text">
              资产读取和脚本执行都依赖当前会话激活状态，以及这里设定的信任等级。
            </p>
            <div v-if="selectedSkill.assets.length === 0" class="empty-state compact">
              当前 skill 没有附属资产。
            </div>
            <div v-else class="asset-list">
              <article
                v-for="asset in selectedSkill.assets"
                :key="asset.path"
                class="asset-card"
              >
                <strong>{{ asset.path }}</strong>
                <div class="meta-row">
                  <span class="meta-chip">{{ assetKindLabel(asset.kind) }}</span>
                  <span v-if="asset.textReadable" class="meta-chip governance-enabled">可读</span>
                  <span v-if="asset.executable" class="meta-chip active-chip">可执行</span>
                </div>
              </article>
            </div>
          </section>

          <div class="markdown-preview" v-html="renderedSkillContent" />
        </article>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SkillAssetKind, SkillDetail, SkillTrustLevel } from '@garlic-claw/shared'
import { marked } from 'marked'
import { useSkillManagement } from '../composables/use-skill-management'
import { useChatStore } from '../stores/chat'

const chat = useChatStore()
const {
  loading,
  refreshing,
  error,
  mutatingSkillId,
  searchKeyword,
  filteredSkills,
  selectedSkill,
  conversationSkillState,
  totalCount,
  activeCount,
  restrictedCount,
  packageCount,
  disabledCount,
  selectSkill,
  toggleSkill,
  clearConversationSkills,
  updateSkillGovernance,
  refreshAll,
} = useSkillManagement(chat)

const trustLevelOptions: Array<{
  value: SkillTrustLevel
  label: string
}> = [
  {
    value: 'prompt-only',
    label: 'Prompt Only',
  },
  {
    value: 'asset-read',
    label: 'Asset Read',
  },
  {
    value: 'local-script',
    label: 'Local Script',
  },
]
const selectedSkillBusy = computed(() =>
  selectedSkill.value ? mutatingSkillId.value === selectedSkill.value.id : false,
)
const renderedSkillContent = computed(() => {
  if (!selectedSkill.value) {
    return ''
  }

  return String(marked.parse(selectedSkill.value.content))
})

function isSkillActive(skillId: string): boolean {
  return conversationSkillState.value?.activeSkillIds.includes(skillId) ?? false
}

function isToggleDisabled(skill: SkillDetail): boolean {
  if (!chat.currentConversationId) {
    return true
  }

  if (!isSkillActive(skill.id) && !skill.governance.enabled) {
    return true
  }

  return mutatingSkillId.value === skill.id
}

function skillToggleLabel(skill: SkillDetail): string {
  if (!skill.governance.enabled && !isSkillActive(skill.id)) {
    return '已禁用'
  }

  if (mutatingSkillId.value === skill.id) {
    return '更新中...'
  }

  return isSkillActive(skill.id) ? '停用' : '激活'
}

function setSelectedSkillEnabled(enabled: boolean) {
  if (!selectedSkill.value) {
    return
  }

  void updateSkillGovernance(selectedSkill.value.id, {
    enabled,
  })
}

function setSelectedSkillTrustLevel(event: Event) {
  if (!selectedSkill.value) {
    return
  }

  const nextTrustLevel = (event.target as HTMLSelectElement).value as SkillTrustLevel
  if (nextTrustLevel === selectedSkill.value.governance.trustLevel) {
    return
  }

  void updateSkillGovernance(selectedSkill.value.id, {
    trustLevel: nextTrustLevel,
  })
}

function trustLevelLabel(trustLevel: SkillTrustLevel): string {
  switch (trustLevel) {
    case 'asset-read':
      return '可读资产'
    case 'local-script':
      return '可执行脚本'
    default:
      return '仅提示'
  }
}

function trustLevelDescription(trustLevel: SkillTrustLevel): string {
  switch (trustLevel) {
    case 'asset-read':
      return '当前会话激活后，模型可以通过统一 skill 工具读取模板、参考资料和脚本文本。'
    case 'local-script':
      return '当前会话激活后，模型既可以读取资产，也可以通过统一 skill 工具执行本地脚本。'
    default:
      return '当前 skill 只会作为提示和工作流资产注入上下文，不会开放附属文件读取或脚本执行。'
  }
}

function assetKindLabel(kind: SkillAssetKind): string {
  switch (kind) {
    case 'script':
      return '脚本'
    case 'template':
      return '模板'
    case 'reference':
      return '参考'
    case 'asset':
      return '资源'
    default:
      return '其他'
  }
}
</script>

<style scoped>
.skills-page,
.skill-hero,
.skill-list-panel,
.skill-detail-panel,
.skill-hero-header,
.skills-layout,
.panel-header,
.skill-card-top,
.overview-grid,
.meta-row,
.hero-actions {
  display: flex;
  gap: 0.9rem;
}

.skills-page {
  flex-direction: column;
  min-height: 0;
}

.skill-hero,
.skill-list-panel,
.skill-detail-panel {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.2);
  background: var(--bg-card);
  padding: 1rem;
}

.skill-hero,
.skill-list-panel,
.skill-detail-panel,
.skill-list,
.active-skill-list {
  display: flex;
  flex-direction: column;
}

.skill-hero-header,
.panel-header,
.skill-card-top {
  justify-content: space-between;
}

.hero-kicker,
.panel-kicker,
.overview-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-grid {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.overview-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.skills-layout {
  align-items: flex-start;
}

.skill-list-panel {
  flex: 1 1 0;
  min-width: 0;
}

.skill-detail-panel {
  width: 420px;
  flex-shrink: 0;
}

.skill-search {
  margin: 1rem 0 0.75rem;
}

.skill-list,
.active-skill-list {
  gap: 0.75rem;
}

.skill-card,
.active-skill-card,
.skill-preview {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.9rem;
}

.governance-panel,
.asset-section,
.asset-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.skill-card {
  cursor: pointer;
}

.skill-card.active {
  border-color: rgba(76, 189, 255, 0.4);
  background: rgba(76, 189, 255, 0.05);
}

.toggle-button,
.hero-button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.toggle-button.secondary,
.hero-button.secondary {
  color: var(--text-muted);
}

.toggle-button:disabled,
.hero-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.meta-row {
  flex-wrap: wrap;
}

.meta-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.meta-chip.active-chip {
  border-color: rgba(89, 207, 155, 0.35);
  color: var(--success);
}

.meta-chip.governance-enabled {
  border-color: rgba(76, 189, 255, 0.3);
  color: var(--accent);
}

.meta-chip.governance-disabled {
  border-color: rgba(255, 107, 107, 0.35);
  color: var(--danger);
}

.detail-line,
.empty-state {
  color: var(--text-muted);
}

.muted-text {
  color: var(--text-muted);
}

.warning-text {
  color: #b77c15;
}

.governance-panel,
.asset-section {
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
  padding: 0.9rem;
  background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
}

.governance-actions,
.asset-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.trust-level-field {
  display: grid;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.trust-level-field select {
  min-width: 160px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  padding: 0.4rem 0.75rem;
}

.asset-list {
  display: grid;
  gap: 0.75rem;
}

.asset-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
}

.empty-state.compact {
  padding: 0;
}

.markdown-preview {
  margin-top: 1rem;
  color: var(--text);
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin-top: 0.8rem;
  margin-bottom: 0.45rem;
}

.markdown-preview :deep(p),
.markdown-preview :deep(li) {
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .skills-layout {
    flex-direction: column;
  }

  .skill-detail-panel {
    width: 100%;
  }

  .governance-actions,
  .asset-header {
    align-items: flex-start;
  }
}
</style>
