<template>
  <div class="capability-layout">
    <section class="capability-section">
      <header class="section-header">
        <p>能力标记</p>
        <h4>推理与工具</h4>
        <span>用于展示模型特征，并给工具、候选筛选等流程提供能力提示。</span>
      </header>

      <div class="toggle-grid">
        <label
          class="capability-card capability-card--reasoning"
          :class="{ active: capabilities.reasoning }"
        >
          <ElCheckbox :model-value="capabilities.reasoning" @change="toggleReasoning" />
          <strong>推理</strong>
          <small>标记该模型具备推理能力。</small>
          <span class="state-pill">{{ capabilities.reasoning ? '已标记' : '未标记' }}</span>
        </label>

        <label
          class="capability-card capability-card--tool"
          :class="{ active: capabilities.toolCall }"
        >
          <ElCheckbox :model-value="capabilities.toolCall" @change="toggleToolCall" />
          <strong>工具调用</strong>
          <small>标记该模型支持工具调用。</small>
          <span class="state-pill">{{ capabilities.toolCall ? '已标记' : '未标记' }}</span>
        </label>
      </div>
    </section>

    <section class="capability-section">
      <header class="section-header">
        <p>模态标记</p>
        <h4>图片输入与输出</h4>
        <span>用于聊天图片能力展示，以及视觉候选模型筛选。</span>
      </header>

      <div class="toggle-grid">
        <label
          class="capability-card capability-card--input"
          :class="{ active: capabilities.input.image }"
        >
          <ElCheckbox :model-value="capabilities.input.image" @change="toggleImageInput" />
          <strong>输入图片</strong>
          <small>标记该模型可直接读取用户上传的图片内容。</small>
          <span class="state-pill">{{ capabilities.input.image ? '已标记' : '未标记' }}</span>
        </label>

        <label
          class="capability-card capability-card--output"
          :class="{ active: capabilities.output.image }"
        >
          <ElCheckbox :model-value="capabilities.output.image" @change="toggleImageOutput" />
          <strong>输出图片</strong>
          <small>标记该模型声明支持图片输出。</small>
          <span class="state-pill">{{ capabilities.output.image ? '已标记' : '未标记' }}</span>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { AiModelConfig } from '@garlic-claw/shared'
import { ElCheckbox } from 'element-plus'

const props = defineProps<{
  capabilities: AiModelConfig['capabilities']
}>()

const emit = defineEmits<{
  (event: 'update', capabilities: AiModelConfig['capabilities']): void
}>()

type CapabilityPatch = {
  reasoning?: boolean
  toolCall?: boolean
  input?: Partial<AiModelConfig['capabilities']['input']>
  output?: Partial<AiModelConfig['capabilities']['output']>
}

/**
 * 基于当前能力对象生成下一个能力状态。
 * @param patch 本次要覆盖的能力片段
 */
function emitCapabilities(patch: CapabilityPatch) {
  emit('update', {
    ...props.capabilities,
    ...patch,
    input: {
      ...props.capabilities.input,
      ...patch.input,
    },
    output: {
      ...props.capabilities.output,
      ...patch.output,
    },
  })
}

function toggleReasoning() {
  emitCapabilities({
    reasoning: !props.capabilities.reasoning,
  })
}

function toggleToolCall() {
  emitCapabilities({
    toolCall: !props.capabilities.toolCall,
  })
}

function toggleImageInput() {
  emitCapabilities({
    input: {
      image: !props.capabilities.input.image,
    },
  })
}

function toggleImageOutput() {
  emitCapabilities({
    output: {
      image: !props.capabilities.output.image,
    },
  })
}
</script>

<style scoped>
.capability-layout {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}

.capability-section {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-subtle) 100%, transparent), transparent),
    color-mix(in srgb, var(--surface-panel-hover-faint) 90%, transparent);
}

.section-header {
  display: grid;
  gap: 4px;
}

.section-header p,
.section-header h4,
.section-header span {
  margin: 0;
}

.section-header p {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-muted) 90%, transparent);
}

.section-header h4 {
  font-size: 16px;
  color: var(--text);
}

.section-header span {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.capability-card {
  position: relative;
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  border-radius: 16px;
  background: var(--surface-subtle);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.capability-card :deep(.el-checkbox) {
  position: absolute;
  inset: 14px 14px auto auto;
}

.capability-card:hover {
  transform: translateY(-1px);
}

.capability-card.active {
  box-shadow: var(--gc-shadow-md);
}

.capability-card strong {
  padding-right: 28px;
  color: var(--text);
  font-size: 15px;
}

.capability-card small {
  color: var(--text-muted);
  line-height: 1.5;
}

.state-pill {
  justify-self: start;
  margin-top: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--surface-subtle-strong);
  color: var(--text);
}

.capability-card--reasoning.active {
  border-color: rgba(101, 202, 255, 0.34);
  background: linear-gradient(135deg, rgba(101, 202, 255, 0.14), rgba(255, 255, 255, 0.04));
}

.capability-card--tool.active {
  border-color: rgba(255, 179, 71, 0.34);
  background: linear-gradient(135deg, rgba(255, 179, 71, 0.14), rgba(255, 255, 255, 0.04));
}

.capability-card--input.active {
  border-color: rgba(68, 204, 136, 0.34);
  background: linear-gradient(135deg, rgba(68, 204, 136, 0.14), rgba(255, 255, 255, 0.04));
}

.capability-card--output.active {
  border-color: rgba(255, 112, 161, 0.32);
  background: linear-gradient(135deg, rgba(255, 112, 161, 0.14), rgba(255, 255, 255, 0.04));
}

@media (max-width: 720px) {
  .toggle-grid {
    grid-template-columns: 1fr;
  }

  .capability-section {
    padding: 12px;
  }
}
</style>
