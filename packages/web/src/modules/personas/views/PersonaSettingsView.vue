<script setup lang="ts">
import ConsolePage from '@/shared/components/ConsolePage.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import trashBinTrashBold from '@iconify-icons/solar/trash-bin-trash-bold'
import userIdBold from '@iconify-icons/solar/user-id-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import type { IconifyIcon } from '@iconify/types'
import { Icon } from '@iconify/vue'
import { ElButton, ElInput, ElOption, ElSelect, ElSwitch } from 'element-plus'
import { ref } from 'vue'
import type { PersonaPresetDraftInput } from '../composables/use-persona-settings'
import { usePersonaSettings } from '../composables/use-persona-settings'

const {
  loading,
  loadingCurrentPersona,
  loadingSelectedPersona,
  applyingPersona,
  savingPersona,
  deletingPersona,
  error,
  personas,
  selectedPersonaId,
  selectedPersona,
  currentPersona,
  currentConversationId,
  currentConversationTitle,
  availableConversations,
  canApplySelectedPersona,
  canApplySelectedPersonaToBatch,
  canDeleteSelectedPersona,
  selectedPersonaStatus,
  editorMode,
  editorDraft,
  deleteResult,
  batchConversationIds,
  batchApplyingPersona,
  batchApplyResult,
  refreshAll,
  selectPersona,
  beginCreatePersona,
  loadPresetDraft,
  resetEditorDraft,
  addBeginDialog,
  removeBeginDialog,
  savePersonaDraft,
  deleteSelectedPersona,
  applySelectedPersona,
  toggleBatchConversation,
  selectAllBatchConversations,
  clearBatchConversations,
  applySelectedPersonaToBatch,
} = usePersonaSettings()

const sourceLabelMap = {
  context: '上下文覆盖',
  conversation: '会话设置',
  default: '默认回退',
} satisfies Record<'context' | 'conversation' | 'default', string>

const listModeOptions = [
  { label: '全部', value: 'all' },
  { label: '禁用', value: 'none' },
  { label: '指定列表', value: 'selected' },
] as const

const avatarInput = ref<HTMLInputElement | null>(null)
const uploadingAvatar = ref(false)
type PersonaPanelId = 'editor' | 'batch' | 'presets'

const currentPanel = ref<PersonaPanelId>('editor')
const panelOptions: ReadonlyArray<{ label: string; value: PersonaPanelId; icon: IconifyIcon }> = [
  { label: '人设仓库', value: 'editor', icon: userIdBold },
  { label: '批量修改', value: 'batch', icon: listCheckBold },
  { label: '模板 / 预设', value: 'presets', icon: magicStick3Bold },
]

const personaPresetCards: ReadonlyArray<{
  badge: string
  draft: PersonaPresetDraftInput
  id: string
  summary: string
  title: string
}> = [
  {
    badge: '写作',
    draft: {
      beginDialogs: [
        { role: 'assistant', content: '我会先给出结构，再补全文案。' },
      ],
      description: '适合文章起草、润色和风格统一。',
      name: '写作助手',
      prompt: '你是一名注重结构与节奏的中文写作助手。先识别目标读者、文体和信息密度，再给出清晰、自然、可直接交付的内容。避免空话，优先输出成品。',
      toolInput: 'memory.search',
      toolMode: 'selected',
    },
    id: 'preset-writer',
    summary: '面向文章、公告、邮件和长文改写的通用写作人格。',
    title: '写作助手',
  },
  {
    badge: '产品',
    draft: {
      beginDialogs: [
        { role: 'assistant', content: '我会先梳理目标、约束和优先级。' },
      ],
      description: '适合需求拆解、方案评审和信息对齐。',
      name: '产品策划',
      prompt: '你是一名讲求判断依据的产品策划助手。面对需求时，先明确目标、用户、约束和成功标准，再输出结构化结论。优先识别风险、边界和实现成本。',
      toolMode: 'all',
    },
    id: 'preset-product',
    summary: '适合 PRD、需求评审、优先级排序和方案比较。',
    title: '产品策划',
  },
  {
    badge: '审阅',
    draft: {
      beginDialogs: [
        { role: 'assistant', content: '我会先指出高风险问题，再补充次要建议。' },
      ],
      customErrorMessage: '当前审阅人格暂时无法完成此次分析。',
      description: '适合代码审阅、文案审稿和质量把关。',
      name: '严格审阅者',
      prompt: '你是一名严格、克制的审阅者。输出时优先指出会导致错误、歧义、返工或体验下滑的问题，要求结论有依据、有优先级，并给出最小可执行修正建议。',
      toolInput: 'memory.search',
      toolMode: 'selected',
    },
    id: 'preset-reviewer',
    summary: '强调问题优先级、风险识别和可执行修改建议。',
    title: '严格审阅者',
  },
]

function triggerAvatarUpload() { avatarInput.value?.click() }

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !selectedPersona.value) return
  uploadingAvatar.value = true
  try {
    const token = localStorage.getItem('accessToken')
    const form = new FormData()
    form.append('file', file)
    await fetch(`/api/personas/${selectedPersona.value.id}/avatar`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
    await refreshAll()
  } finally { uploadingAvatar.value = false; input.value = '' }
}

function readPersonaAvatarLabel(name?: string | null) {
  const normalized = name?.trim()
  return normalized ? normalized.slice(0, 1) : '人'
}

function readPersonaAvatarAlt(name?: string | null) {
  return `${name?.trim() || 'Persona'} 头像`
}

function openPreset(preset: PersonaPresetDraftInput) {
  loadPresetDraft(preset)
  currentPanel.value = 'editor'
}

function readToolModeLabel(mode: 'all' | 'none' | 'selected') {
  if (mode === 'selected') {
    return '指定工具'
  }
  return mode === 'none' ? '禁用工具' : '全部工具'
}
</script>

<template>
  <ConsolePage class="persona-page" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="人设管理"
        :icon="userIdBold"
      >
        <template #actions>
          <ElButton class="ghost-button refresh-button view-header-action" :disabled="loading" title="刷新" @click="refreshAll">
            <Icon :icon="refreshBold" class="refresh-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton type="primary" class="primary-button" @click="beginCreatePersona">
            <Icon :icon="addCircleBold" class="button-icon" aria-hidden="true" />
            新建人设
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <div class="persona-inner">
      <aside class="persona-sidebar">
        <nav class="detail-nav" aria-label="人设管理面板切换">
          <div class="detail-nav-group">
            <ElButton
              v-for="panel in panelOptions"
              :key="panel.value"
              class="detail-nav-button"
              native-type="button"
              :title="panel.label"
              :class="{ active: currentPanel === panel.value }"
              @click="currentPanel = panel.value"
            >
              <Icon class="nav-icon" :icon="panel.icon" aria-hidden="true" />
              <span class="nav-label">{{ panel.label }}</span>
            </ElButton>
          </div>
        </nav>
      </aside>

      <main class="persona-main">
        <p v-if="error" class="page-error">{{ error }}</p>
        <p v-if="deleteResult" class="page-hint">
          已删除 <strong>{{ deleteResult.deletedPersonaId }}</strong>，共回退 {{ deleteResult.reassignedConversationCount }} 个对话到
          <strong>{{ deleteResult.fallbackPersonaId }}</strong>。
        </p>
        <section v-if="currentPanel === 'batch'" class="persona-overview-card">
          <div class="section-header">
            <div>
              <h2>批量修改会话人设</h2>
              <p>把当前选中的人设批量应用到多个主会话。</p>
            </div>
            <div class="editor-actions">
              <ElButton class="ghost-button" :disabled="availableConversations.length === 0" @click="selectAllBatchConversations">
                全选
              </ElButton>
              <ElButton class="ghost-button" :disabled="batchConversationIds.length === 0" @click="clearBatchConversations">
                清空
              </ElButton>
            </div>
          </div>
          <div class="detail-summary">
            <div class="summary-item">
              <span class="summary-label">当前选中人设</span>
              <span>{{ selectedPersona?.name ?? '请先在仓库中选择一个人设' }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">已选会话</span>
              <span>{{ batchConversationIds.length }} 个</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">当前对话</span>
              <span>{{ currentConversationTitle ?? '当前未选中对话' }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">仓库状态</span>
              <span>{{ selectedPersonaStatus }}</span>
            </div>
          </div>
          <div v-if="availableConversations.length === 0" class="section-state">
            暂无可批量修改的主会话。
          </div>
          <div v-else class="conversation-selector-list">
            <label
              v-for="conversation in availableConversations"
              :key="conversation.id"
              class="conversation-selector-item"
            >
              <input
                class="conversation-selector-checkbox"
                type="checkbox"
                :checked="batchConversationIds.includes(conversation.id)"
                @change="toggleBatchConversation(conversation.id)"
              >
              <div class="conversation-selector-copy">
                <div class="conversation-selector-row">
                  <strong>{{ conversation.title || '未命名对话' }}</strong>
                  <span v-if="conversation.id === currentConversationId" class="persona-badge">当前</span>
                </div>
                <p>{{ conversation.id }}</p>
              </div>
            </label>
          </div>
          <p v-if="batchApplyResult" class="page-hint">
            已将 <strong>{{ batchApplyResult.personaName }}</strong> 应用到 <strong>{{ batchApplyResult.appliedConversationCount }}</strong> 个会话。
            <span v-if="batchApplyResult.failedConversationIds.length > 0">
              失败 {{ batchApplyResult.failedConversationIds.length }} 个。
            </span>
          </p>
          <div class="footer-actions">
            <ElButton
              type="primary"
              class="primary-button"
              :disabled="!canApplySelectedPersonaToBatch || batchApplyingPersona"
              @click="applySelectedPersonaToBatch"
            >
              {{ batchApplyingPersona ? '批量应用中...' : `应用到选中会话（${batchConversationIds.length}）` }}
            </ElButton>
          </div>
        </section>
        <section v-else-if="currentPanel === 'presets'" class="persona-overview-card">
          <div class="section-header">
            <div>
              <h2>模板 / 预设</h2>
              <p>从常用人设草稿开始，减少重复配置。</p>
            </div>
          </div>
          <div class="preset-grid">
            <article v-for="preset in personaPresetCards" :key="preset.id" class="preset-card">
              <div class="preset-card-head">
                <div class="preset-card-copy">
                  <h3>{{ preset.title }}</h3>
                  <p>{{ preset.summary }}</p>
                </div>
                <span class="preset-tag">{{ preset.badge }}</span>
              </div>
              <div class="preset-meta">
                <div class="summary-item">
                  <span class="summary-label">默认名称</span>
                  <span>{{ preset.draft.name }}</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">工具策略</span>
                  <span>{{ readToolModeLabel(preset.draft.toolMode ?? 'all') }}</span>
                </div>
              </div>
              <ElButton class="ghost-button" @click="openPreset(preset.draft)">
                <Icon :icon="widgetBold" class="button-icon" aria-hidden="true" />
                套用到编辑器
              </ElButton>
            </article>
          </div>
        </section>

        <div v-else class="persona-grid">
          <section class="persona-list-card">
            <div class="section-header">
              <div>
                <h2>人设仓库</h2>
              </div>
              <span class="section-meta">{{ personas.length }} 个</span>
            </div>

            <article class="hero-card hero-card-inline">
              <div v-if="currentPersona" class="persona-identity">
                <div class="persona-avatar persona-avatar-large" data-persona-avatar="current">
                  <img v-if="currentPersona.avatar" :src="currentPersona.avatar" :alt="readPersonaAvatarAlt(currentPersona.name)" class="persona-avatar-image" />
                  <span v-else>{{ readPersonaAvatarLabel(currentPersona.name) }}</span>
                </div>
                <div class="persona-identity-copy">
                  <h2>{{ currentConversationTitle ?? '当前未选中对话' }}</h2>
                  <p>
                    当前生效人设：
                    <strong>{{ currentPersona.name }}</strong>
                    <span class="persona-source">来源：{{ sourceLabelMap[currentPersona.source] }}</span>
                  </p>
                </div>
              </div>
              <h2 v-else>{{ currentConversationTitle ?? '当前未选中对话' }}</h2>
              <p v-if="!currentPersona">
                无会话级人设
              </p>
            </article>

            <div v-if="loading" class="section-state">加载中...</div>
            <div v-else-if="personas.length === 0" class="section-state">
              当前还没有可用人设。
            </div>
            <div v-else class="persona-list">
              <button
                v-for="persona in personas"
                :key="persona.id"
                type="button"
                class="persona-list-item"
                :class="{ active: persona.id === selectedPersonaId && editorMode === 'edit' }"
                @click="selectPersona(persona.id)"
              >
                <div class="persona-list-head">
                  <div class="persona-avatar persona-avatar-small" :data-persona-avatar="`list-${persona.id}`">
                    <img v-if="persona.avatar" :src="persona.avatar" :alt="readPersonaAvatarAlt(persona.name)" class="persona-avatar-image" />
                    <span v-else>{{ readPersonaAvatarLabel(persona.name) }}</span>
                  </div>
                  <div class="persona-list-copy">
                    <div class="persona-list-row">
                      <strong>{{ persona.name }}</strong>
                      <span v-if="persona.isDefault" class="persona-badge">默认</span>
                    </div>
                    <p>{{ persona.description ?? '当前人设没有额外描述。' }}</p>
                  </div>
                </div>
                <code>{{ persona.id }}</code>
              </button>
            </div>
          </section>

          <section class="persona-detail-card">
            <div class="section-header">
              <div class="persona-heading">
                <div v-if="editorMode === 'edit' && selectedPersona" class="persona-avatar persona-avatar-medium" data-persona-avatar="selected-detail" style="cursor:pointer;position:relative" @click="triggerAvatarUpload">
                  <img v-if="selectedPersona.avatar" :src="selectedPersona.avatar" :alt="readPersonaAvatarAlt(selectedPersona.name)" class="persona-avatar-image" />
                  <span v-else>{{ readPersonaAvatarLabel(selectedPersona.name) }}</span>
                  <span class="avatar-upload-hint">点击上传</span>
                </div>
                <input ref="avatarInput" type="file" accept="image/*" style="display:none" @change="handleAvatarUpload" />
                <div class="persona-heading-copy">
                  <h2>{{ editorMode === 'create' ? '新建人设' : (selectedPersona?.name ?? '选择一个人设') }}</h2>
                </div>
              </div>
              <div class="editor-actions">
                <ElButton
                  class="ghost-button"
                  :disabled="savingPersona"
                  @click="resetEditorDraft"
                >
                  重置
                </ElButton>
                <ElButton
                  type="primary"
                  class="primary-button"
                  :disabled="savingPersona"
                  @click="savePersonaDraft"
                >
                  {{ savingPersona ? '保存中...' : (editorMode === 'create' ? '创建人设' : '保存人设') }}
                </ElButton>
              </div>
            </div>

            <div v-if="loadingSelectedPersona" class="section-state">
              读取详情中...
            </div>
            <template v-else>
              <div class="detail-summary">
                <div class="summary-item">
                  <span class="summary-label">当前会话状态</span>
                  <span>{{ selectedPersonaStatus }}</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">当前生效人设</span>
                  <span v-if="loadingCurrentPersona">读取中...</span>
                  <span v-else-if="currentPersona">
                    {{ currentPersona.name }}
                  </span>
                  <span v-else>未读取到当前会话人设</span>
                </div>
              </div>

              <div class="detail-grid">
                <label class="field-block">
                  <span class="summary-label">名称</span>
                  <ElInput v-model.trim="editorDraft.name" class="field-input" placeholder="Writer" />
                </label>

                <label class="field-block">
                  <span class="summary-label">人设 ID</span>
                  <ElInput v-model.trim="editorDraft.id" class="field-input" :disabled="editorMode === 'edit'" placeholder="如 persona.writer，留空时根据名称自动生成" />
                </label>

                <label class="field-block field-block-full">
                  <span class="summary-label">描述</span>
                  <ElInput v-model="editorDraft.description" class="field-textarea compact-textarea" type="textarea" :rows="4" placeholder="说明这个人设适合什么场景。" />
                </label>

                <label class="field-block field-block-full">
                  <span class="summary-label">系统提示词</span>
                  <ElInput v-model="editorDraft.prompt" class="field-textarea prompt-textarea" type="textarea" :rows="8" placeholder="输入人设的系统提示词。" />
                </label>

                <label class="field-block field-block-full">
                  <span class="summary-label">自定义失败文案</span>
                  <ElInput v-model="editorDraft.customErrorMessage" class="field-textarea compact-textarea" type="textarea" :rows="4" placeholder="仅主对话主回复失败时，用这条文案直接回复用户；subagent、标题、总结不使用它。留空则显示默认错误。" />
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-row-copy">
                  <span class="summary-label">默认人设</span>
                  <span>设为默认人设</span>
                </div>
                <ElSwitch v-model="editorDraft.isDefault" />
              </div>

              <div class="detail-block">
                <div class="block-header">
                  <span class="summary-label">Begin Dialogs</span>
                  <ElButton class="ghost-button small-button" @click="addBeginDialog">
                    添加对话
                  </ElButton>
                </div>
                <div v-if="editorDraft.beginDialogs.length === 0" class="section-state">
                  无预置对话。
                </div>
                <div v-else class="dialog-list">
                  <div
                    v-for="(dialog, index) in editorDraft.beginDialogs"
                    :key="`dialog-${index}`"
                    class="dialog-item"
                  >
                    <ElSelect v-model="dialog.role" class="field-select">
                      <ElOption value="assistant" label="assistant" />
                      <ElOption value="user" label="user" />
                    </ElSelect>
                    <ElInput v-model="dialog.content" class="field-textarea compact-textarea" type="textarea" :rows="4" placeholder="输入预置对话内容。" />
                    <ElButton class="ghost-button small-button" @click="removeBeginDialog(index)">
                      删除
                    </ElButton>
                  </div>
                </div>
              </div>

              <div class="detail-grid">
                <div class="detail-block">
                  <span class="summary-label">Tools 约束</span>
                  <ElSelect v-model="editorDraft.toolMode" class="field-select">
                    <ElOption v-for="option in listModeOptions" :key="option.value" :value="option.value" :label="option.label" />
                  </ElSelect>
                  <ElInput
                    v-if="editorDraft.toolMode === 'selected'"
                    v-model="editorDraft.toolInput"
                    class="field-textarea compact-textarea"
                    type="textarea"
                    :rows="4"
                    placeholder="每行一个 tool 名称，也可以用逗号分隔。"
                  />
                </div>
              </div>

              <div class="footer-actions">
                <ElButton
                  type="primary"
                  class="primary-button"
                  :disabled="!canApplySelectedPersona || applyingPersona || editorMode === 'create'"
                  @click="applySelectedPersona"
                >
                  {{ applyingPersona ? '应用中...' : '应用到当前对话' }}
                </ElButton>
                <ElButton
                  class="danger-button"
                  :disabled="!canDeleteSelectedPersona || deletingPersona"
                  @click="deleteSelectedPersona"
                >
                  <Icon :icon="trashBinTrashBold" class="button-icon" aria-hidden="true" />
                  {{ deletingPersona ? '删除中...' : '删除人设' }}
                </ElButton>
              </div>
            </template>
          </section>
        </div>
      </main>
    </div>
  </ConsolePage>
</template>

<style scoped>
.persona-page {
  background: transparent;
}

.persona-inner {
  display: flex;
  height: 100%;
  overflow: visible;
}

.persona-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.persona-main {
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

.persona-grid,
.section-header,
 .persona-heading,
 .persona-list-head,
 .persona-identity,
  .persona-list-row,
  .detail-summary,
  .detail-grid,
.editor-actions,
.footer-actions,
.dialog-item,
.block-header {
  display: grid;
  gap: 16px;
}

.header-actions,
.editor-actions,
.footer-actions {
  grid-auto-flow: column;
  justify-content: end;
  align-items: center;
}

.persona-heading,
.persona-list-head,
.persona-identity {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

.persona-identity-copy,
.persona-list-copy,
.persona-heading-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.hero-card h2,
.preset-card h3,
.hero-card p,
.section-header h2,
.detail-block p {
  margin: 0;
}

.section-header p,
.preset-card p,
.conversation-selector-copy p {
  margin: 0;
}

.page-header p,
.section-meta,
.section-header p,
.persona-list-item p,
.conversation-selector-copy p,
.preset-card p,
.section-state {
  color: var(--text-muted);
}

.ghost-button,
.primary-button,
.danger-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  font-weight: 600;
}

.primary-button {
  background: var(--gc-accent);
  color: var(--gc-accent-foreground);
}

.danger-button {
  background: rgba(214, 48, 49, 0.16);
  color: #ffb4b4;
  border: 1px solid rgba(214, 48, 49, 0.3);
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border, rgba(133, 163, 199, 0.24));
  color: var(--text);
}

.small-button {
  min-height: 32px;
  padding: 0 12px;
}

.button-icon {
  width: 16px;
  height: 16px;
}

.hero-card,
.persona-overview-card,
.persona-list-card,
.persona-detail-card,
.preset-card,
.conversation-selector-item {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  background: var(--surface-card-gradient);
  border: 1px solid var(--border, rgba(133, 163, 199, 0.16));
  min-width: 0;
}

.persona-list-card,
.persona-detail-card {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.hero-card {
  padding: 16px;
  border-radius: 16px;
  background: var(--surface-hero-gradient);
}

.hero-card-inline {
  padding: 14px 16px;
}

.persona-overview-card {
  padding: 18px;
  border-radius: 20px;
  background: var(--surface-card-gradient);
  border: 1px solid var(--border, rgba(133, 163, 199, 0.16));
}

.conversation-selector-list,
.preset-grid {
  display: grid;
  gap: 12px;
}

.conversation-selector-item {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  cursor: pointer;
  padding: 14px 16px;
}

.conversation-selector-checkbox {
  margin-top: 3px;
}

.conversation-selector-copy,
.preset-card-copy,
.preset-meta {
  display: grid;
  gap: 8px;
}

.conversation-selector-row,
.preset-card-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.preset-card {
  padding: 16px;
  border-radius: 18px;
  background: var(--surface-panel-soft-strong);
}

.preset-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(11, 99, 181, 0.14);
  color: #78b8ff;
  font-size: 12px;
  font-weight: 600;
}

.summary-label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.persona-source,
.persona-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 0.8rem;
}

.persona-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: color-mix(in srgb, var(--accent) 72%, white 28%);
  font-weight: 700;
  flex: 0 0 auto;
}

.persona-avatar-small {
  width: 38px;
  height: 38px;
}

.persona-avatar-medium {
  width: 52px;
  height: 52px;
}

.persona-avatar-large {
  width: 60px;
  height: 60px;
}

.persona-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-upload-hint {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: var(--surface-overlay-strong);
  color: var(--gc-foreground);
  font-size: 10px;
  text-align: center;
  padding: 2px 0;
  border-radius: 0 0 6px 6px;
  opacity: 0;
  transition: opacity .15s;
}
.persona-avatar:hover .avatar-upload-hint { opacity: 1; }

.page-error {
  margin: 0;
  color: var(--danger);
}

.page-hint {
  margin: 0;
  color: var(--text-muted);
}

.persona-grid {
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 0;
  min-height: 0;
}

.section-header {
  grid-template-columns: 1fr auto;
  align-items: start;
}

.persona-list-card {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  padding-right: 16px;
  border-right: 1px solid var(--shell-border, #334155);
  overflow: hidden;
}

.persona-detail-card {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
  padding-left: 20px;
}

.persona-list-card .section-header {
  padding-top: 2px;
}

.section-meta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.14);
  color: var(--shell-active, #18a058);
  font-size: 12px;
  font-weight: 600;
}

.persona-list {
  display: grid;
  gap: 0;
  min-height: 0;
  overflow-y: auto;
}

.persona-list-item {
  position: relative;
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 14px 10px 14px 18px;
  border: none;
  border-bottom: 1px solid var(--shell-border, #334155);
  border-radius: 0;
  background: transparent;
  color: var(--shell-text-secondary, var(--text));
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}

.persona-list-item::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--accent);
  opacity: 0.9;
}

.persona-list-item strong {
  color: var(--shell-text, var(--text));
}

.persona-list-item code {
  color: var(--shell-text-tertiary, var(--text-muted));
}

.persona-list-item:last-child {
  border-bottom: none;
}

.persona-list-item:hover {
  background: var(--provider-row-hover-bg);
}

.persona-list-item.active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
}

.persona-list-item.active::before {
  width: 4px;
  opacity: 1;
}

.persona-list-row {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.detail-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
}

.field-block,
.summary-item,
.detail-block,
.setting-row-copy {
  display: grid;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.field-block-full {
  grid-column: 1 / -1;
}

.field-input,
.field-select,
.field-textarea {
  width: 100%;
  min-width: 0;
}

.field-input :deep(.el-input),
.field-select :deep(.el-select),
.field-textarea :deep(.el-textarea) {
  width: 100%;
  min-width: 0;
}

.field-input :deep(.el-input__wrapper),
.field-select :deep(.el-select__wrapper) {
  width: 100%;
  min-height: 46px;
  border-radius: 14px;
  background: var(--surface-panel-soft-strong);
  box-shadow: 0 0 0 1px var(--border, rgba(133, 163, 199, 0.18)) inset;
}

.field-textarea :deep(.el-textarea__inner) {
  width: 100%;
  box-sizing: border-box;
  min-height: 120px;
  resize: vertical;
  border-radius: 14px;
  border: 1px solid var(--border, rgba(133, 163, 199, 0.18));
  background: var(--surface-panel-soft-strong);
  color: var(--text);
  padding: 12px 14px;
}

.compact-textarea :deep(.el-textarea__inner) {
  min-height: 92px;
}

.prompt-textarea :deep(.el-textarea__inner) {
  min-height: 180px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--surface-panel-muted-strong);
  border: 1px solid var(--border, rgba(133, 163, 199, 0.16));
}

.dialog-list {
  display: grid;
  gap: 10px;
}

.dialog-item {
  grid-template-columns: 160px minmax(0, 1fr) auto;
  align-items: start;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  min-width: 38px;
  min-height: 38px;
  padding: 0;
  border-radius: 12px;
}

.refresh-icon {
  width: 18px;
  height: 18px;
  color: var(--text);
}

@media (max-width: 1080px) {
  .persona-grid,
  .detail-summary,
  .detail-grid,
  .dialog-item {
    grid-template-columns: 1fr;
  }

  .persona-list-card {
    padding-right: 0;
    padding-bottom: 12px;
    border-right: none;
    border-bottom: 1px solid var(--shell-border, #334155);
  }

  .persona-detail-card {
    padding-top: 12px;
    padding-left: 0;
  }
}

@media (max-width: 800px) {
  .persona-sidebar {
    width: 180px;
  }

  .persona-main {
    padding: 16px;
  }
}

@media (max-width: 720px) {
  .persona-inner {
    flex-direction: column;
  }

  .persona-sidebar {
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

  .persona-main {
    padding: 12px;
  }

  .page-header,
  .section-header,
  .header-actions,
  .editor-actions,
  .footer-actions {
    grid-template-columns: 1fr;
    grid-auto-flow: row;
    justify-content: stretch;
  }
}
</style>
