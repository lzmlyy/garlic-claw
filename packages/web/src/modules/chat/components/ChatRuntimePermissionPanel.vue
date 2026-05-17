<script setup lang="ts">
import { ElButton } from 'element-plus'
import type { RuntimePermissionDecision } from '@garlic-claw/shared'
import type { ChatPendingRuntimePermission } from '@/modules/chat/store/chat-store.types'

const props = defineProps<{
  requests: ChatPendingRuntimePermission[]
}>()

const emit = defineEmits<{
  reply: [requestId: string, decision: RuntimePermissionDecision]
}>()

function onReply(requestId: string, decision: RuntimePermissionDecision) {
  emit('reply', requestId, decision)
}

function formatOperationLabel(value: ChatPendingRuntimePermission['operations'][number]) {
  switch (value) {
    case 'command.execute':
      return '执行命令'
    case 'file.delete':
      return '删除文件'
    case 'file.edit':
      return '编辑文件'
    case 'file.list':
      return '遍历文件'
    case 'file.read':
      return '读取文件'
    case 'file.symlink':
      return '创建链接'
    case 'file.write':
      return '写入文件'
    case 'network.access':
      return '访问网络'
    default:
      return value
  }
}
</script>

<template>
  <section v-if="props.requests.length > 0" class="permission-panel">
    <div class="permission-header">
      <h3>运行时权限审批</h3>
      <span class="permission-count">{{ props.requests.length }}</span>
    </div>
    <div class="permission-list">
      <article
        v-for="request in props.requests"
        :key="request.id"
        class="permission-card"
      >
        <div class="permission-main">
          <div class="permission-title-row">
            <strong>{{ request.toolName }}</strong>
            <span class="permission-backend">{{ request.backendKind }}</span>
          </div>
          <p class="permission-summary">{{ request.summary }}</p>
          <div class="permission-capabilities">
            <span
              v-for="operation in request.operations"
              :key="operation"
              class="capability-chip"
            >
              {{ formatOperationLabel(operation) }}
            </span>
          </div>
          <pre v-if="request.metadata !== undefined" class="permission-metadata">{{ JSON.stringify(request.metadata, null, 2) }}</pre>
        </div>
        <div class="permission-actions">
          <ElButton
            class="permission-action"
            native-type="button"
            :disabled="request.resolving"
            @click="onReply(request.id, 'once')"
          >
            允许一次
          </ElButton>
          <ElButton
            class="permission-action"
            native-type="button"
            :disabled="request.resolving"
            @click="onReply(request.id, 'always')"
          >
            始终允许
          </ElButton>
          <ElButton
            class="permission-action danger"
            native-type="button"
            :disabled="request.resolving"
            @click="onReply(request.id, 'reject')"
          >
            拒绝
          </ElButton>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.permission-panel {
  border: 1px solid color-mix(in oklch, var(--warning) 24%, transparent);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, var(--surface-warning-soft), transparent),
    var(--surface-panel-muted-strong);
  padding: 14px 16px;
  display: grid;
  gap: 12px;
}

.permission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.permission-header h3 {
  margin: 0;
  font-size: 14px;
}

.permission-count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-warning-soft);
  color: var(--warning);
  font-size: 12px;
  font-weight: 700;
}

.permission-list {
  display: grid;
  gap: 10px;
}

.permission-card {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--gc-glass-border);
  background: var(--surface-subtle);
}

.permission-main {
  display: grid;
  gap: 8px;
}

.permission-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.permission-backend {
  font-size: 12px;
  color: var(--text-muted);
}

.permission-summary {
  margin: 0;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.permission-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.capability-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-warning-soft);
  color: var(--warning);
  font-size: 12px;
  font-weight: 600;
}

.permission-metadata {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-code);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
}

.permission-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.permission-action {
  border: 1px solid var(--gc-glass-border);
  background: var(--surface-overlay);
  box-shadow: none;
  color: var(--text);
  border-radius: 999px;
  padding: 6px 12px;
}

.permission-action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.permission-action.danger {
  border-color: color-mix(in oklch, var(--danger) 28%, transparent);
  color: var(--danger);
}
</style>
