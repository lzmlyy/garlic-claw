<template>
  <ConsolePage class="ai-settings-page" no-padding>
    <template #header>
      <header class="page-header">
        <h1><Icon class="hero-icon" :icon="codeBold" aria-hidden="true" />AI 设置</h1>
      </header>
    </template>
    <div class="ai-settings-inner">
      <aside class="ai-settings-sidebar">
        <nav class="sider-menu">
          <ElButton
            v-for="item in navItems"
            :key="item.id"
            class="menu-item"
            native-type="button"
            :class="{ active: activeSection === item.id, 'menu-item--divided': item.divided }"
            @click="activeSection = item.id"
          >
            <Icon class="menu-icon" :icon="item.icon" aria-hidden="true" />
            <span class="menu-label">{{ item.label }}</span>
          </ElButton>
        </nav>
    </aside>

    <main class="ai-settings-content">
      <!-- ═══ 服务商 & 模型 ═══ -->
      <section v-if="activeSection === 'provider-models'" class="provider-models-section">
        <div class="provider-column">
          <div class="provider-list-header">
            <span class="provider-list-title">服务商列表</span>
            <span class="provider-list-count">{{ providerListCountLabel }}</span>
          </div>

          <div class="column-toolbar">
            <ElInput
              v-model="providerSearch"
              class="field-input provider-search-input"
              placeholder="搜索服务商…"
            />
            <ElButton
              type="primary"
              class="toolbar-icon-button"
              aria-label="新增服务商"
              title="新增服务商"
              @click="openCreateDialog"
            >
              <Icon :icon="addCircleBold" aria-hidden="true" />
            </ElButton>
          </div>

          <div class="provider-list-shell">
            <p v-if="error" class="msg-error provider-list-message">{{ error }}</p>
            <div v-else-if="loadingProviders" class="provider-list-empty">
              <p class="msg-muted provider-list-empty-text">加载中…</p>
            </div>
            <div v-else-if="filteredProviders.length === 0" class="provider-list-empty">
              <p class="msg-muted provider-list-empty-text">{{ providerEmptyText }}</p>
            </div>

            <div v-else class="provider-list">
              <button
                v-for="p in filteredProviders"
                :key="p.id"
                type="button"
                class="provider-row"
                :class="{
                  active: p.id === selectedProviderId,
                  'provider-row--ok': p.available,
                  'provider-row--warn': !p.available,
                }"
                @click="selectProvider(p.id)"
              >
                <div class="provider-row-main">
                  <div class="provider-row-title">
                    <span class="provider-name">{{ p.name }}</span>
                  </div>
                  <div class="provider-row-subline">
                    <span class="provider-driver">{{ getProviderDriverLabel(p, catalog) }}</span>
                    <span class="provider-kind">{{ getProviderKindLabel(p, catalog) }}</span>
                  </div>
                </div>
                <div class="provider-row-meta">
                  <span class="provider-model-count">{{ p.modelCount }} 个模型</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div class="model-column">
          <template v-if="!selectedProvider">
            <p class="msg-muted placeholder">← 选择服务商</p>
          </template>
          <template v-else>
            <div class="column-toolbar">
              <div class="toolbar-left">
                <span class="current-provider-name">{{ selectedProvider.name }}</span>
                <span class="default-badge" v-if="currentDefaultLabel">默认：{{ currentDefaultLabel }}</span>
              </div>
              <div class="toolbar-right">
                <ElButton :disabled="discoveringModels" @click="openDiscoveryDialog">
                  {{ discoveringModels ? '发现中…' : '发现模型' }}
                </ElButton>
                <ElButton :disabled="testingConnection" @click="testProviderConnection">
                  {{ testingConnection ? '测试中…' : '测试连接' }}
                </ElButton>
                <ElButton @click="openEditDialog">编辑</ElButton>
                <ElButton type="danger" @click="deleteSelectedProvider">删除</ElButton>
              </div>
            </div>

            <p v-if="connectionResult" class="msg-status" :class="connectionResult.kind">{{ connectionResult.text }}</p>

            <div class="add-model-row">
              <ElInput v-model="newModelId" class="field-input add-model-input add-model-input-id" placeholder="模型 ID" />
              <ElInput v-model="newModelName" class="field-input add-model-input add-model-input-name" placeholder="名称（可选）" />
              <ElButton class="add-model-button" type="primary" :disabled="!newModelId.trim()" @click="handleAddModel">添加</ElButton>
            </div>

            <p class="msg-muted capability-note">
              推理 / 工具 / 图片为能力标记：用于展示模型特征，并给图片候选筛选等流程提供提示。
            </p>

            <div class="column-toolbar" v-if="selectedModels.length > 0">
              <ElInput
                v-model="modelSearch"
                class="field-input"
                placeholder="搜索模型…"
              />
              <span class="toolbar-count" v-if="modelSearch">匹配 {{ filteredModels.length }} / {{ selectedModels.length }}</span>
            </div>

            <p v-if="selectedModels.length === 0" class="msg-muted">暂无模型</p>
            <p v-else-if="filteredModels.length === 0" class="msg-muted">无匹配模型</p>

            <div v-else class="model-list">
              <div
                v-for="m in filteredModels"
                :key="m.id"
                class="model-row"
              >
                <div class="model-info">
                  <div class="model-name-row">
                    <strong>{{ m.name }}</strong>
                    <code>{{ m.id }}</code>
                  </div>
                  <div class="model-cap-row">
                    <ElCheckbox
                      :model-value="m.capabilities.reasoning"
                      @change="emitCapToggle(m, 'reasoning', $event)"
                    >
                      推理
                    </ElCheckbox>
                    <ElCheckbox
                      :model-value="m.capabilities.toolCall"
                      @change="emitCapToggle(m, 'toolCall', $event)"
                    >
                      工具
                    </ElCheckbox>
                    <ElCheckbox
                      :model-value="m.capabilities.input.image"
                      @change="emitCapImageToggle(m, $event)"
                    >
                      图片
                    </ElCheckbox>
                    <span class="cap-field">
                      上下文
                      <ElInput
                        :data-test="`context-length-input-${m.id}`"
                        class="field-input field-input-sm"
                        :model-value="ctxDrafts[m.id] ?? String(m.contextLength)"
                        min="1"
                        type="number"
                        @input="handleCtxInput(m.id, $event)"
                        @blur="flushCtxSave(m)"
                      />
                    </span>
                  </div>
                </div>
                <div class="model-actions">
                  <span v-if="isDefaultModel(m.id)" class="default-chip">默认</span>
                  <ElButton v-else size="small" @click="setDefaultModel(m.id)">设为当前默认</ElButton>
                  <ElButton size="small" type="danger" @click="deleteModel(m.id)">删除</ElButton>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- ═══ 其他设置面板 ═══ -->
      <VisionFallbackPanel
        v-if="activeSection === 'vision'"
        :config="visionConfig"
        :options="visionOptions"
        :saving="savingVision"
        @save="saveVisionConfig"
      />

      <HostModelRoutingPanel
        v-if="activeSection === 'routing'"
        :config="hostModelRoutingConfig"
        :options="hostModelRoutingOptions"
        :saving="savingHostModelRoutingConfig"
        @save="saveHostModelRoutingConfig"
      />

      <section v-if="activeSection === 'runtime-tools'" class="settings-stack">
        <RuntimeToolsSettingsPanel
          :snapshot="runtimeToolsConfigSnapshot"
          :saving="savingRuntimeToolsConfig"
          @save="saveRuntimeToolsConfig"
        />
      </section>

      <section v-if="activeSection === 'subagent'" class="settings-stack">
        <SubagentSettingsPanel
          :snapshot="subagentConfigSnapshot"
          :saving="savingSubagentConfig"
          @save="saveSubagentConfig"
        />
      </section>

      <ContextGovernanceSettingsPanel
        v-if="activeSection === 'context'"
        :snapshot="contextGovernanceConfigSnapshot"
        :saving="savingContextGovernanceConfig"
        @save="saveContextGovernanceConfig"
      />
    </main>
    </div>
  </ConsolePage>

  <AiProviderEditorDialog
    :catalog="catalog"
    :initial-config="editingProvider"
    :title="editingProvider ? '编辑服务商' : '新增服务商'"
    :visible="showProviderDialog"
    @close="showProviderDialog = false"
    @save="saveProvider"
  />

  <AiModelDiscoveryDialog
    :loading="discoveringModels"
    :models="discoveredModels"
    :title="selectedProvider ? `发现 ${selectedProvider.name} 的模型` : '发现模型'"
    :visible="showDiscoveryDialog"
    @add="importDiscoveredModels"
    @close="showDiscoveryDialog = false"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElCheckbox, ElInput } from 'element-plus'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import type { AiModelConfig } from '@garlic-claw/shared'
import serverBold from '@iconify-icons/solar/server-bold'
import galleryBold from '@iconify-icons/solar/gallery-bold'
import linkRoundBold from '@iconify-icons/solar/link-round-bold'
import codeBold from '@iconify-icons/solar/code-bold'
import cpuBold from '@iconify-icons/solar/cpu-bold'
import documentTextBold from '@iconify-icons/solar/document-text-bold'
import addCircleBold from '@iconify-icons/solar/add-circle-bold'

import AiModelDiscoveryDialog from '@/modules/ai-settings/components/AiModelDiscoveryDialog.vue'
import AiProviderEditorDialog from '@/modules/ai-settings/components/AiProviderEditorDialog.vue'
import ContextGovernanceSettingsPanel from '@/modules/ai-settings/components/ContextGovernanceSettingsPanel.vue'
import HostModelRoutingPanel from '@/modules/ai-settings/components/HostModelRoutingPanel.vue'
import RuntimeToolsSettingsPanel from '@/modules/ai-settings/components/RuntimeToolsSettingsPanel.vue'
import SubagentSettingsPanel from '@/modules/ai-settings/components/SubagentSettingsPanel.vue'
import VisionFallbackPanel from '@/modules/ai-settings/components/VisionFallbackPanel.vue'
import { getProviderDriverLabel, getProviderKindLabel } from '@/modules/ai-settings/components/provider-catalog'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import { useProviderSettings } from '@/modules/ai-settings/composables/use-provider-settings'

const activeSection = ref('provider-models')

const navItems: Array<{ id: string; label: string; icon: IconifyIcon; divided?: boolean }> = [
  { id: 'provider-models', label: '服务商 & 模型', icon: serverBold },
  { id: 'vision', label: '视觉回退', icon: galleryBold },
  { id: 'routing', label: '模型回退链', icon: linkRoundBold },
  { id: 'runtime-tools', label: '执行工具', icon: codeBold, divided: true },
  { id: 'subagent', label: '子代理', icon: cpuBold },
  { id: 'context', label: '上下文设置', icon: documentTextBold },
]

const {
  loadingProviders,
  savingVision,
  savingHostModelRoutingConfig,
  savingRuntimeToolsConfig,
  savingSubagentConfig,
  savingContextGovernanceConfig,
  discoveringModels,
  testingConnection,
  error,
  catalog,
  defaultSelection,
  providers,
  selectedProviderId,
  selectedProvider,
  selectedModels,
  visionConfig,
  hostModelRoutingConfig,
  runtimeToolsConfigSnapshot,
  subagentConfigSnapshot,
  contextGovernanceConfigSnapshot,
  visionOptions,
  hostModelRoutingOptions,
  showProviderDialog,
  showDiscoveryDialog,
  editingProvider,
  discoveredModels,
  connectionResult,
  selectProvider,
  openCreateDialog,
  openEditDialog,
  saveProvider,
  deleteSelectedProvider,
  addModel,
  openDiscoveryDialog,
  importDiscoveredModels,
  deleteModel,
  setDefaultModel,
  updateCapabilities,
  updateContextLength,
  testProviderConnection,
  saveVisionConfig,
  saveHostModelRoutingConfig,
  saveRuntimeToolsConfig,
  saveSubagentConfig,
  saveContextGovernanceConfig,
} = useProviderSettings()

/* ── 服务商搜索 ── */
const providerSearch = ref('')
const filteredProviders = computed(() => {
  const kw = providerSearch.value.trim().toLowerCase()
  if (!kw) return providers.value
  return providers.value.filter(p =>
    `${p.name} ${p.id} ${p.driver}`.toLowerCase().includes(kw),
  )
})
const providerListCountLabel = computed(() => {
  if (providerSearch.value.trim()) {
    return `${filteredProviders.value.length} / ${providers.value.length}`
  }
  return `${providers.value.length} 项`
})
const providerEmptyText = computed(() =>
  providerSearch.value.trim() ? '没有匹配的服务商' : '暂无服务商',
)

/* ── 模型搜索 ── */
const modelSearch = ref('')
const filteredModels = computed(() => {
  const kw = modelSearch.value.trim().toLowerCase()
  if (!kw) return selectedModels.value
  return selectedModels.value.filter(m =>
    `${m.name} ${m.id}`.toLowerCase().includes(kw),
  )
})
watch(() => selectedProviderId.value, () => { modelSearch.value = '' })

/* ── 当前默认标签 ── */
const currentDefaultLabel = computed(() => {
  if (!defaultSelection.value.providerId || !defaultSelection.value.modelId) return ''
  return `${defaultSelection.value.providerId} / ${defaultSelection.value.modelId}`
})
function isDefaultModel(modelId: string) {
  return selectedProvider.value?.id === defaultSelection.value.providerId
    && defaultSelection.value.modelId === modelId
}

/* ── 新增模型 ── */
const newModelId = ref('')
const newModelName = ref('')
function handleAddModel() {
  addModel({ modelId: newModelId.value.trim(), name: newModelName.value.trim() || undefined })
  newModelId.value = ''
  newModelName.value = ''
}

/* ── 能力开关 ── */
function emitCapToggle(model: AiModelConfig, key: 'reasoning' | 'toolCall', checked: string | number | boolean) {
  const enabled = checked === true
  updateCapabilities({
    modelId: model.id,
    capabilities: { ...model.capabilities, [key]: enabled },
  })
}
function emitCapImageToggle(model: AiModelConfig, checked: string | number | boolean) {
  const enabled = checked === true
  updateCapabilities({
    modelId: model.id,
    capabilities: {
      ...model.capabilities,
      input: { ...model.capabilities.input, image: enabled },
    },
  })
}

/* ── 上下文长度 ── */
const ctxDrafts = ref<Record<string, string>>({})
const ctxBases = ref<Record<string, string>>({})
watch(() => selectedModels.value, (models) => {
  const nextDrafts: Record<string, string> = {}
  const nextBases: Record<string, string> = {}
  for (const m of models) {
    const base = String(m.contextLength)
    const prevBase = ctxBases.value[m.id]
    const prevDraft = ctxDrafts.value[m.id]
    nextBases[m.id] = base
    nextDrafts[m.id] = prevDraft !== undefined && prevBase === base ? prevDraft : base
  }
  ctxBases.value = nextBases
  ctxDrafts.value = nextDrafts
}, { immediate: true })
function handleCtxInput(modelId: string, value: string) {
  ctxDrafts.value = { ...ctxDrafts.value, [modelId]: value }
}
function canSaveCtx(model: AiModelConfig) {
  const draft = Number(ctxDrafts.value[model.id] ?? model.contextLength)
  return Number.isInteger(draft) && draft > 0 && draft !== model.contextLength
}
function flushCtxSave(model: AiModelConfig) {
  if (!canSaveCtx(model)) {
    ctxDrafts.value = {
      ...ctxDrafts.value,
      [model.id]: String(model.contextLength),
    }
    return
  }
  saveCtx(model)
}
function saveCtx(model: AiModelConfig) {
  const val = Number(ctxDrafts.value[model.id] ?? model.contextLength)
  if (Number.isInteger(val) && val > 0) updateContextLength({ modelId: model.id, contextLength: val })
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════
   布局
   ═══════════════════════════════════════════════════════════════════════ */
.ai-settings-page {
  background: transparent;
  --provider-row-hover-bg: rgba(255, 255, 255, 0.08);
  --provider-row-driver-hover-bg: rgba(255, 255, 255, 0.12);
  --provider-row-kind-hover-bg: rgba(255, 255, 255, 0.1);
}

:global(html.light) .ai-settings-page {
  --provider-row-hover-bg: rgba(15, 23, 42, 0.06);
  --provider-row-driver-hover-bg: rgba(15, 23, 42, 0.08);
  --provider-row-kind-hover-bg: rgba(15, 23, 42, 0.06);
}

.ai-settings-inner {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
}

/* ── 侧边栏 ── */
.ai-settings-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border, #334155);
  color: var(--shell-text, #f1f5f9);
  overflow-y: auto;
}
.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}
.sider-menu { flex: 1; overflow-y: auto; padding: 12px 8px; }
.sider-menu::-webkit-scrollbar { display: none; }

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  border: none;
  border-radius: 8px;
  padding: 0 20px;
  background: transparent;
  box-shadow: none;
  margin: 0;
  color: var(--shell-text-secondary, #cbd5e1);
  font-size: 14px;
  text-align: left;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.menu-item:hover { background: var(--shell-bg-hover, #334155); color: var(--shell-text, #f1f5f9); }
.menu-item.active { color: var(--shell-active, #18a058); background: rgba(24, 160, 88, 0.1); }
.menu-item--divided { margin-top: 14px; }
.menu-item--divided::before {
  content: '';
  position: absolute;
  left: 16px; right: 16px; top: -8px;
  height: 1px;
  background: var(--shell-border, #334155);
  opacity: 0.9;
}
.menu-icon { width: 20px; min-width: 20px; font-size: 20px; flex-shrink: 0; }
.menu-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── 内容区 ── */
.ai-settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.settings-stack {
  display: grid;
  gap: 16px;
}

/* ═══════════════════════════════════════════════════════════════════════
   服务商 & 模型 双栏
   ═══════════════════════════════════════════════════════════════════════ */
.provider-models-section {
  display: grid;
  flex: 1;
  grid-template-columns: 280px 1fr;
  gap: 0;
  min-height: 0;
  min-width: 0;
}

.provider-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--shell-border, #334155);
  min-height: 0;
  padding-right: 16px;
  overflow: hidden;
}
.model-column {
  min-height: 0;
  padding-left: 20px;
  overflow-y: auto;
}

/* ── 工具栏 ── */
.column-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.column-toolbar > .field-input {
  flex: 1 1 280px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.provider-search-input {
  flex: 1;
}
.toolbar-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  margin-left: auto;
  border-radius: 8px;
}
.current-provider-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--shell-text, #f1f5f9);
}
.toolbar-count {
  font-size: 12px;
  color: var(--shell-text-tertiary, #94a3b8);
}

.provider-search-input {
  flex: 1;
}
.capability-note {
  margin: 0 0 12px;
}
.default-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.15);
  color: var(--shell-active, #18a058);
  font-size: 12px;
}

/* ── 通用字段输入 ── */
.field-input {
  min-width: 0;
  width: 100%;
}

.field-input :deep(.el-input__wrapper) {
  background: var(--gc-surface-elevated, var(--shell-bg, #0f172a));
  box-shadow: 0 0 0 1px var(--shell-border, #334155) inset;
}

.field-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--shell-active, #18a058) inset;
}

.field-input :deep(.el-input__inner) {
  color: var(--shell-text, #f1f5f9);
}

.field-input-sm { width: 72px; padding: 3px 6px; text-align: right; }

/* ── 消息文本 ── */
.msg-muted { color: var(--shell-text-tertiary, #94a3b8); font-size: 13px; margin: 8px 0; }
.msg-error { color: var(--danger); font-size: 13px; margin: 8px 0; }
.msg-status { padding: 6px 10px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.msg-status.success { background: var(--surface-success-soft); color: var(--success); }
.msg-status.error { background: var(--surface-danger-soft); color: var(--danger); }
.placeholder { margin-top: 24px; }

/* ── 服务商列表 ── */
.provider-list {
  display: grid;
  gap: 0;
  min-height: 0;
  overflow-y: auto;
}
.provider-list-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: hidden;
}
.provider-list-header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 2px 0 0;
}
.provider-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--shell-text, #f1f5f9);
}
.provider-list-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 0 8px;
  height: 24px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.14);
  color: var(--shell-active, #18a058);
  font-size: 12px;
  font-weight: 600;
}
.provider-list-message {
  margin: 0;
  padding: 14px 16px 0;
}
.provider-list-empty {
  display: flex;
  flex: 1;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.provider-list-empty-text {
  margin: 0;
  text-align: center;
}
.provider-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 68px;
  padding: 12px 10px 12px 18px;
  margin: 0;
  border: none;
  border-bottom: 1px solid var(--shell-border, #334155);
  border-radius: 0;
  background: transparent;
  color: var(--shell-text-secondary, #cbd5e1);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}
.provider-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0;
  opacity: 0.9;
}
.provider-row--ok::before { background: #22c55e; }
.provider-row--warn::before { background: #f59e0b; }
.provider-row:last-child { border-bottom: none; }
.provider-row:hover {
  background: var(--provider-row-hover-bg);
}
.provider-row:hover .provider-driver {
  background: var(--provider-row-driver-hover-bg);
}
.provider-row:hover .provider-kind {
  background: var(--provider-row-kind-hover-bg);
}
.provider-row.active {
  background: color-mix(in srgb, var(--shell-active, #18a058) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-active, #18a058) 18%, transparent);
  color: var(--shell-text, #f1f5f9);
}
.provider-row.active::before {
  width: 4px;
  opacity: 1;
}
.provider-row-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.provider-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.provider-row-subline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow: hidden;
}
.provider-name {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  color: var(--shell-text, #f1f5f9);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-kind,
.provider-driver {
  font-size: 11px;
}
.provider-driver,
.provider-kind {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 6px;
  white-space: nowrap;
}
.provider-driver {
  background: var(--shell-bg-hover, #334155);
  color: var(--shell-text-tertiary, #94a3b8);
}
.provider-kind {
  background: var(--surface-subtle, rgba(255, 255, 255, 0.03));
  color: var(--shell-text-secondary, #cbd5e1);
}
.provider-row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  justify-self: end;
}
.provider-model-count {
  font-size: 12px;
  color: var(--shell-text-tertiary, #94a3b8);
  white-space: nowrap;
}

/* ── 模型列表 ── */
.add-model-row {
  display: flex;
  gap: 8px;
  margin: 10px 0 16px;
  flex-wrap: nowrap;
  align-items: center;
}
.add-model-input {
  flex: 1 1 0;
}
.add-model-input-id {
  min-width: 220px;
}
.add-model-input-name {
  min-width: 180px;
}
.add-model-button {
  flex: 0 0 auto;
}
.model-list {
  display: grid;
  gap: 0;
}
.model-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--shell-border, #334155);
}
.model-row:last-child { border-bottom: none; }
.model-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.model-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.model-name-row strong { font-size: 14px; color: var(--shell-text, #f1f5f9); }
.model-name-row code { font-size: 12px; color: var(--shell-text-tertiary, #94a3b8); }
.model-cap-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cap-field {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--shell-text-secondary, #cbd5e1);
}
.model-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.default-chip {
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(24, 160, 88, 0.15);
  color: var(--shell-active, #18a058);
  font-size: 11px;
  line-height: 20px;
}

/* ── 响应式 ── */
@media (max-width: 960px) {
  .ai-settings-sidebar { width: 180px; }
  .provider-models-section { grid-template-columns: 1fr; }
  .provider-column { border-right: none; border-bottom: 1px solid var(--shell-border, #334155); padding: 0 0 12px; }
  .model-column { padding: 12px 0 0; }
  .ai-settings-content { padding: 16px; }
  .add-model-row { flex-wrap: wrap; }
}
@media (max-width: 720px) {
  .ai-settings-page { padding: 1rem; }
  .ai-settings-sidebar { width: 100%; max-height: 110px; flex-shrink: 0; border-right: none; border-bottom: 1px solid var(--shell-border, #334155); }
  .sider-menu { display: flex; gap: 4px; padding: 0 12px 8px; overflow-x: auto; overflow-y: hidden; }
  .menu-item { min-height: 40px; padding: 0 14px; white-space: nowrap; flex-shrink: 0; }
  .menu-item--divided { margin-top: 0; }
  .menu-item--divided::before { display: none; }
  .provider-models-section { grid-template-columns: 1fr; }
  .ai-settings-content { padding: 12px; }
  .provider-list-header {
    grid-template-columns: 1fr;
    align-items: start;
    padding-top: 0;
  }
  .provider-row {
    grid-template-columns: 1fr;
    align-items: start;
  }
  .provider-row-meta {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }
}
</style>

<!-- 子组件玻璃拟态 → 干净深色 -->
<style>
/* ── 卡片背景 ── */
.ai-settings-content .panel-card,
.ai-settings-content .sidebar-card,
.ai-settings-content .panel-shell,
.ai-settings-content .model-card {
  background: var(--gc-surface-glass) !important;
  backdrop-filter: blur(var(--gc-blur-deep)) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(var(--gc-blur-deep)) saturate(1.2) !important;
}

/* ── 内部元素 ── */
.ai-settings-content .provider-item,
.ai-settings-content .model-item,
.ai-settings-content .status-text {
  background: var(--gc-surface-elevated) !important;
  backdrop-filter: blur(var(--gc-blur-standard)) saturate(1.1) !important;
  -webkit-backdrop-filter: blur(var(--gc-blur-standard)) saturate(1.1) !important;
}

.ai-settings-content .provider-item:hover,
.ai-settings-content .model-item:hover {
  background: var(--shell-bg-hover, #334155) !important;
}

.ai-settings-content .provider-item.active {
  background: rgba(24, 160, 88, 0.1) !important;
  border-color: var(--shell-active, #18a058) !important;
}
</style>
