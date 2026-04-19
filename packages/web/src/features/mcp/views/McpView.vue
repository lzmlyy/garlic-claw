<template>
  <div class="mcp-page">
    <section class="mcp-hero">
      <header>
        <span class="hero-kicker">MCP Workspace</span>
        <h1>MCP 管理</h1>
        <p>集中管理 MCP server 配置，并在同一页面治理对应工具源和工具列表。</p>
      </header>
    </section>

    <ToolGovernancePanel
      ref="toolGovernancePanel"
      source-kind="mcp"
      title="MCP 工具治理"
      description="这里展示所有 MCP server 的运行状态、治理动作和工具启用开关。"
      empty-title="暂无 MCP 工具源"
      empty-description="先在下方添加 MCP server，保存后这里会出现对应工具源。"
      @update:selected-source-id="selectedSourceId = $event"
    />

    <McpConfigPanel
      :preferred-server-name="selectedSourceId"
      @changed="refreshToolGovernance"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import McpConfigPanel from '@/features/tools/components/McpConfigPanel.vue'
import ToolGovernancePanel from '@/features/tools/components/ToolGovernancePanel.vue'

const toolGovernancePanel = ref<InstanceType<typeof ToolGovernancePanel> | null>(null)
const selectedSourceId = ref<string | null>(null)

function refreshToolGovernance() {
  void toolGovernancePanel.value?.refresh()
}
</script>

<style scoped>
.mcp-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
}

.mcp-hero {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(11, 21, 35, 0.72);
}

.hero-kicker,
.mcp-hero p {
  color: var(--text-muted);
}

.mcp-hero h1,
.mcp-hero p {
  margin: 0;
}

@media (max-width: 720px) {
  .mcp-page {
    padding: 1rem;
  }
}
</style>
