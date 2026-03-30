<template>
  <div class="settings-page">
    <header class="page-header">
      <div>
        <h1>AI 设置</h1>
        <p>统一管理供应商、模型能力和 Vision Fallback。</p>
      </div>
    </header>

    <AiPluginQuickAccessPanel />

    <div class="settings-grid">
      <AiProviderSidebar
        class="settings-sidebar"
        :error="error"
        :loading="loadingProviders"
        :providers="providers"
        :selected-provider-id="selectedProviderId"
        @create="openCreateDialog"
        @refresh="refreshAll"
        @select="selectProvider"
      />

      <AiProviderModelsPanel
        class="settings-provider-panel"
        :connection-result="connectionResult"
        :discovering-models="discoveringModels"
        :models="selectedModels"
        :provider="selectedProvider"
        :testing-connection="testingConnection"
        @add-model="addModel"
        @delete-model="deleteModel"
        @delete-provider="deleteSelectedProvider"
        @discover-models="openDiscoveryDialog"
        @edit-provider="openEditDialog"
        @set-default-model="setDefaultModel"
        @test-connection="testProviderConnection"
        @update-capabilities="updateCapabilities"
      />

      <VisionFallbackPanel
        class="settings-vision-panel"
        :config="visionConfig"
        :options="visionOptions"
        :saving="savingVision"
        @save="saveVisionConfig"
      />
    </div>

    <AiProviderEditorDialog
      :catalog="catalog"
      :initial-config="editingProvider"
      :title="editingProvider ? '编辑 provider' : '新增 provider'"
      :visible="showProviderDialog"
      @close="showProviderDialog = false"
      @save="saveProvider"
    />

    <AiModelDiscoveryDialog
      :loading="discoveringModels"
      :models="discoveredModels"
      :title="selectedProvider ? `从 ${selectedProvider.name} 拉取并选择要添加的模型` : '拉取并选择模型'"
      :visible="showDiscoveryDialog"
      @add="importDiscoveredModels"
      @close="showDiscoveryDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import AiModelDiscoveryDialog from '../components/ai-settings/AiModelDiscoveryDialog.vue'
import AiPluginQuickAccessPanel from '../components/ai-settings/AiPluginQuickAccessPanel.vue'
import AiProviderEditorDialog from '../components/ai-settings/AiProviderEditorDialog.vue'
import AiProviderModelsPanel from '../components/ai-settings/AiProviderModelsPanel.vue'
import AiProviderSidebar from '../components/ai-settings/AiProviderSidebar.vue'
import VisionFallbackPanel from '../components/ai-settings/VisionFallbackPanel.vue'
import { useProviderSettings } from '../composables/use-provider-settings'

const {
  loadingProviders,
  savingVision,
  discoveringModels,
  testingConnection,
  error,
  catalog,
  providers,
  selectedProviderId,
  selectedProvider,
  selectedModels,
  visionConfig,
  visionOptions,
  showProviderDialog,
  showDiscoveryDialog,
  editingProvider,
  discoveredModels,
  connectionResult,
  refreshAll,
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
  testProviderConnection,
  saveVisionConfig,
} = useProviderSettings()
</script>

<style scoped>
.settings-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
}

.page-header h1,
.page-header p {
  margin: 0;
}

.page-header p {
  margin-top: 6px;
  color: var(--text-muted);
}

.settings-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  grid-template-areas:
    'sidebar provider'
    'vision vision';
  gap: 18px;
  min-width: 0;
}

.settings-sidebar,
.settings-provider-panel,
.settings-vision-panel {
  min-width: 0;
}

.settings-sidebar {
  grid-area: sidebar;
}

.settings-provider-panel {
  grid-area: provider;
}

.settings-vision-panel {
  /* 让 Vision Fallback 独占第二行整宽，避免继续挤在右侧下方。 */
  grid-area: vision;
}

@media (max-width: 960px) {
  .settings-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      'sidebar'
      'provider'
      'vision';
  }
}

@media (max-width: 720px) {
  .settings-page {
    padding: 1rem;
  }
}
</style>
