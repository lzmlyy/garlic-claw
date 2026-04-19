<script setup lang="ts">
import { Icon } from '@iconify/vue'
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import trashBinTrashBold from '@iconify-icons/solar/trash-bin-trash-bold'
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
  currentConversationTitle,
  hasCurrentConversation,
  canApplySelectedPersona,
  canDeleteSelectedPersona,
  selectedPersonaStatus,
  editorMode,
  editorDraft,
  deleteResult,
  refreshAll,
  selectPersona,
  beginCreatePersona,
  resetEditorDraft,
  addBeginDialog,
  removeBeginDialog,
  savePersonaDraft,
  deleteSelectedPersona,
  applySelectedPersona,
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

function readPersonaAvatarLabel(name?: string | null) {
  const normalized = name?.trim()
  return normalized ? normalized.slice(0, 1) : '人'
}

function readPersonaAvatarAlt(name?: string | null) {
  return `${name?.trim() || 'Persona'} 头像`
}
</script>

<template>
  <div class="persona-page">
    <header class="page-header">
      <div>
        <h1>人设管理</h1>
        <p>人设现在是独立资源，服务端会统一消费 prompt、begin dialogs、skills、tools 和错误文案。</p>
      </div>
      <div class="header-actions">
        <button type="button" class="ghost-button refresh-button" :disabled="loading" title="刷新" @click="refreshAll">
          <Icon :icon="refreshBold" class="refresh-icon" aria-hidden="true" />
        </button>
        <button type="button" class="primary-button" @click="beginCreatePersona">
          <Icon :icon="addCircleBold" class="button-icon" aria-hidden="true" />
          新建人设
        </button>
      </div>
    </header>

    <section class="hero-grid">
      <article class="hero-card">
        <span class="hero-kicker">Current Conversation</span>
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
          当前没有会话级人设信息，页面会回退展示默认人设。
        </p>
        <p class="hero-hint">
          {{ hasCurrentConversation
            ? '选中不同对话时，这里的人设状态会同步刷新。'
            : '先在左侧选中一个对话，再把人设应用到该会话。' }}
        </p>
      </article>

      <article class="hero-card">
        <span class="hero-kicker">Selected Persona</span>
        <div v-if="editorMode === 'edit' && selectedPersona" class="persona-identity">
          <div class="persona-avatar persona-avatar-large" data-persona-avatar="selected-hero">
            <img v-if="selectedPersona.avatar" :src="selectedPersona.avatar" :alt="readPersonaAvatarAlt(selectedPersona.name)" class="persona-avatar-image" />
            <span v-else>{{ readPersonaAvatarLabel(selectedPersona.name) }}</span>
          </div>
          <div class="persona-identity-copy">
            <h2>{{ selectedPersona.name }}</h2>
            <p>
              当前选中：
              <strong>{{ selectedPersona.id }}</strong>
              <span v-if="selectedPersona.isDefault" class="persona-badge">默认</span>
            </p>
          </div>
        </div>
        <h2 v-else>{{ editorMode === 'create' ? '创建新的人设' : (selectedPersona?.name ?? '选择一个人设') }}</h2>
        <p v-if="editorMode === 'edit' && selectedPersona">
          当前选中：
          <strong>{{ selectedPersona.id }}</strong>
          <span v-if="selectedPersona.isDefault" class="persona-badge">默认</span>
        </p>
        <p v-else-if="editorMode === 'create'">
          在左侧选中已有的人设，或者直接新建一个。
        </p>
        <p v-if="deleteResult" class="hero-hint">
          已删除 <strong>{{ deleteResult.deletedPersonaId }}</strong>，共回退 {{ deleteResult.reassignedConversationCount }} 个对话到
          <strong>{{ deleteResult.fallbackPersonaId }}</strong>。
        </p>
      </article>
    </section>

    <p v-if="error" class="page-error">{{ error }}</p>

    <div class="persona-grid">
      <section class="persona-list-card">
        <div class="section-header">
          <div>
            <span class="section-kicker">人设索引</span>
            <h2>可用人设</h2>
          </div>
          <span class="section-meta">{{ personas.length }} 个</span>
        </div>

        <div v-if="loading" class="section-state">加载中...</div>
        <div v-else-if="personas.length === 0" class="section-state">
          当前还没有可用人设。
        </div>
        <div v-else class="persona-list">
          <button
            v-for="persona in personas"
            :key="persona.id"
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
            <div v-if="editorMode === 'edit' && selectedPersona" class="persona-avatar persona-avatar-medium" data-persona-avatar="selected-detail">
              <img v-if="selectedPersona.avatar" :src="selectedPersona.avatar" :alt="readPersonaAvatarAlt(selectedPersona.name)" class="persona-avatar-image" />
              <span v-else>{{ readPersonaAvatarLabel(selectedPersona.name) }}</span>
            </div>
            <div class="persona-heading-copy">
              <span class="section-kicker">{{ editorMode === 'create' ? '新建人设' : '编辑人设' }}</span>
              <h2>{{ editorMode === 'create' ? '新建人设' : (selectedPersona?.name ?? '选择一个人设') }}</h2>
            </div>
          </div>
          <div class="editor-actions">
            <button
              class="ghost-button"
              :disabled="savingPersona"
              @click="resetEditorDraft"
            >
              重置
            </button>
            <button
              class="primary-button"
              :disabled="savingPersona"
              @click="savePersonaDraft"
            >
              {{ savingPersona ? '保存中...' : (editorMode === 'create' ? '创建人设' : '保存人设') }}
            </button>
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
              <span class="summary-label">人设 ID</span>
              <input v-model.trim="editorDraft.id" class="field-input" :disabled="editorMode === 'edit'" placeholder="persona.writer" />
            </label>

            <label class="field-block">
              <span class="summary-label">名称</span>
              <input v-model.trim="editorDraft.name" class="field-input" placeholder="Writer" />
            </label>

            <label class="field-block field-block-full">
              <span class="summary-label">描述</span>
              <textarea v-model="editorDraft.description" class="field-textarea compact-textarea" placeholder="说明这个人设适合什么场景。" />
            </label>

            <label class="field-block field-block-full">
              <span class="summary-label">系统提示词</span>
              <textarea v-model="editorDraft.prompt" class="field-textarea prompt-textarea" placeholder="输入人设的系统提示词。" />
            </label>

            <label class="field-block field-block-full">
              <span class="summary-label">自定义失败文案</span>
              <textarea v-model="editorDraft.customErrorMessage" class="field-textarea compact-textarea" placeholder="仅主对话主回复失败时，用这条文案直接回复用户；subagent、标题、总结不使用它。留空则显示默认错误。" />
            </label>
          </div>

          <label class="toggle-row">
            <input v-model="editorDraft.isDefault" type="checkbox" />
            <span>设为默认人设</span>
          </label>

          <div class="detail-block">
            <div class="block-header">
              <span class="summary-label">Begin Dialogs</span>
              <button type="button" class="ghost-button small-button" @click="addBeginDialog">
                添加对话
              </button>
            </div>
            <div v-if="editorDraft.beginDialogs.length === 0" class="section-state">
              当前没有预置对话。
            </div>
            <div v-else class="dialog-list">
              <div
                v-for="(dialog, index) in editorDraft.beginDialogs"
                :key="`dialog-${index}`"
                class="dialog-item"
              >
                <select v-model="dialog.role" class="field-select">
                  <option value="assistant">assistant</option>
                  <option value="user">user</option>
                </select>
                <textarea v-model="dialog.content" class="field-textarea compact-textarea" placeholder="输入预置对话内容。" />
                <button type="button" class="ghost-button small-button" @click="removeBeginDialog(index)">
                  删除
                </button>
              </div>
            </div>
          </div>

          <div class="detail-grid">
            <div class="detail-block">
              <span class="summary-label">Skills 约束</span>
              <select v-model="editorDraft.skillMode" class="field-select">
                <option v-for="option in listModeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <textarea
                v-if="editorDraft.skillMode === 'selected'"
                v-model="editorDraft.skillInput"
                class="field-textarea compact-textarea"
                placeholder="每行一个 skill ID，也可以用逗号分隔。"
              />
            </div>

            <div class="detail-block">
              <span class="summary-label">Tools 约束</span>
              <select v-model="editorDraft.toolMode" class="field-select">
                <option v-for="option in listModeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <textarea
                v-if="editorDraft.toolMode === 'selected'"
                v-model="editorDraft.toolInput"
                class="field-textarea compact-textarea"
                placeholder="每行一个 tool 名称，也可以用逗号分隔。"
              />
            </div>
          </div>

          <div class="footer-actions">
            <button
              class="primary-button"
              :disabled="!canApplySelectedPersona || applyingPersona || editorMode === 'create'"
              @click="applySelectedPersona"
            >
              {{ applyingPersona ? '应用中...' : '应用到当前对话' }}
            </button>
            <button
              class="danger-button"
              :disabled="!canDeleteSelectedPersona || deletingPersona"
              @click="deleteSelectedPersona"
            >
              <Icon :icon="trashBinTrashBold" class="button-icon" aria-hidden="true" />
              {{ deletingPersona ? '删除中...' : '删除人设' }}
            </button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.persona-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
}

.page-header,
.header-actions,
.hero-grid,
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

.page-header {
  grid-template-columns: 1fr auto;
  align-items: start;
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

.page-header h1,
.page-header p,
.hero-card h2,
.hero-card p,
.section-header h2,
.detail-block p {
  margin: 0;
}

.page-header p,
.hero-hint,
.section-meta,
.persona-list-item p,
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
  background: #0b63b5;
  color: #ffffff;
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

.hero-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hero-card,
.persona-list-card,
.persona-detail-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(15, 25, 40, 0.96), rgba(10, 17, 29, 0.96)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
  border: 1px solid var(--border, rgba(133, 163, 199, 0.16));
  min-width: 0;
}

.hero-card {
  background:
    linear-gradient(135deg, rgba(11, 99, 181, 0.12), rgba(39, 174, 96, 0.08)),
    linear-gradient(180deg, rgba(15, 25, 40, 0.96), rgba(10, 17, 29, 0.96));
}

.hero-kicker,
.section-kicker,
.summary-label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-kicker,
.section-kicker {
  color: #0b63b5;
}

.persona-source,
.persona-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(11, 99, 181, 0.12);
  color: #0b63b5;
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
  border: 1px solid rgba(11, 99, 181, 0.22);
  background: rgba(11, 99, 181, 0.12);
  color: #9fd4ff;
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

.page-error {
  margin: 0;
  color: var(--danger);
}

.persona-grid {
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
}

.section-header {
  grid-template-columns: 1fr auto;
  align-items: start;
}

.persona-list-card {
  align-content: start;
}

.persona-list {
  display: grid;
  gap: 8px;
}

.persona-list-item {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--border, rgba(133, 163, 199, 0.16));
  background: rgba(18, 32, 51, 0.82);
  text-align: left;
}

.persona-list-item.active {
  border-color: rgba(11, 99, 181, 0.42);
  box-shadow: 0 0 0 1px rgba(11, 99, 181, 0.16);
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
}

.field-block,
.summary-item,
.detail-block {
  display: grid;
  gap: 8px;
}

.field-block-full {
  grid-column: 1 / -1;
}

.field-input,
.field-select,
.field-textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--border, rgba(133, 163, 199, 0.18));
  background: rgba(13, 23, 38, 0.94);
  color: var(--text);
  padding: 12px 14px;
}

.field-textarea {
  min-height: 120px;
  resize: vertical;
}

.compact-textarea {
  min-height: 92px;
}

.prompt-textarea {
  min-height: 180px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
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
  .hero-grid,
  .persona-grid,
  .detail-summary,
  .detail-grid,
  .dialog-item {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .persona-page {
    padding: 1rem;
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
