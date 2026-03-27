<template>
  <div class="capability-layout">
    <section class="capability-section">
      <header class="section-header">
        <p>能力开关</p>
        <h4>推理与工具</h4>
        <span>控制模型是否按当前能力参与思考和工具调用。</span>
      </header>

      <div class="toggle-grid">
        <label
          class="capability-card capability-card--reasoning"
          :class="{ active: capabilities.reasoning }"
        >
          <input :checked="capabilities.reasoning" type="checkbox" @change="toggleReasoning" />
          <span class="card-kicker">Thinking</span>
          <strong>推理</strong>
          <small>允许该模型进入思考/推理模式。</small>
          <span class="state-pill">{{ capabilities.reasoning ? '已启用' : '已关闭' }}</span>
        </label>

        <label
          class="capability-card capability-card--tool"
          :class="{ active: capabilities.toolCall }"
        >
          <input :checked="capabilities.toolCall" type="checkbox" @change="toggleToolCall" />
          <span class="card-kicker">Tools</span>
          <strong>工具调用</strong>
          <small>允许模型调用系统工具与自动化能力。</small>
          <span class="state-pill">{{ capabilities.toolCall ? '已启用' : '已关闭' }}</span>
        </label>
      </div>
    </section>

    <section class="capability-section">
      <header class="section-header">
        <p>模态能力</p>
        <h4>图片输入与输出</h4>
        <span>用于聊天上传图片、视觉转述和图片输出能力编排。</span>
      </header>

      <div class="toggle-grid">
        <label
          class="capability-card capability-card--input"
          :class="{ active: capabilities.input.image }"
        >
          <input :checked="capabilities.input.image" type="checkbox" @change="toggleImageInput" />
          <span class="card-kicker">Input</span>
          <strong>输入图片</strong>
          <small>允许直接读取用户上传的图片内容。</small>
          <span class="state-pill">{{ capabilities.input.image ? '支持' : '不支持' }}</span>
        </label>

        <label
          class="capability-card capability-card--output"
          :class="{ active: capabilities.output.image }"
        >
          <input :checked="capabilities.output.image" type="checkbox" @change="toggleImageOutput" />
          <span class="card-kicker">Output</span>
          <strong>输出图片</strong>
          <small>允许模型返回图像或图片生成结果。</small>
          <span class="state-pill">{{ capabilities.output.image ? '支持' : '不支持' }}</span>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { AiModelConfig } from '@garlic-claw/shared'

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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01)),
    rgba(9, 11, 18, 0.4);
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
  color: rgba(255, 255, 255, 0.46);
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.capability-card input {
  position: absolute;
  inset: 14px 14px auto auto;
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.capability-card:hover {
  transform: translateY(-1px);
}

.capability-card.active {
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
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

.card-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}

.state-pill {
  justify-self: start;
  margin-top: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
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
