<template>
  <section
    v-if="remote"
    class="remote-access-panel"
    data-test="plugin-remote-access-panel"
  >
    <div class="panel-header">
      <div>
        <h3>远程接入配置</h3>
      </div>
      <ElButton
        type="primary"
        class="save-button"
        data-test="plugin-remote-access-save"
        :disabled="saving || !dirty || !canSave"
        @click="handleSave"
      >
        {{ saving ? '保存中...' : '保存接入配置' }}
      </ElButton>
    </div>

    <p class="panel-note">
      宿主会保存接入地址和静态 Key，并在远端建连时按远程环境与鉴权模式进行校验。
    </p>

    <div class="panel-grid">
      <label class="field">
        <span>接入地址</span>
        <ElInput
          v-model.trim="serverUrl"
          data-test="plugin-remote-access-server-url"
          placeholder="ws://127.0.0.1:23331"
        />
      </label>

      <label v-if="showAccessKey" class="field">
        <span>接入 Key</span>
        <ElInput
          v-model="accessKey"
          data-test="plugin-remote-access-key"
          show-password
          :placeholder="accessKeyPlaceholder"
        />
      </label>

      <div class="field readonly">
        <span>远程环境</span>
        <strong>{{ environmentLabel }}</strong>
      </div>

      <div class="field readonly">
        <span>鉴权模式</span>
        <strong>{{ authModeLabel }}</strong>
      </div>

      <div class="field readonly">
        <span>能力类型</span>
        <strong>{{ capabilityProfileLabel }}</strong>
      </div>

      <div class="field readonly">
        <span>缓存状态</span>
        <strong>{{ metadataCacheLabel }}</strong>
      </div>
    </div>

    <p v-if="validationMessage" class="validation-error">
      {{ validationMessage }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElInput } from 'element-plus'
import type { PluginInfo } from '@garlic-claw/shared'

const props = defineProps<{
  plugin: PluginInfo
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', payload: {
    access: {
      accessKey: string | null
      serverUrl: string | null
    }
    description?: string
    displayName?: string
    remote: NonNullable<PluginInfo['remote']>['descriptor']
    version?: string
  }): void
}>()

const remote = computed(() => props.plugin.remote)
const serverUrl = ref('')
const accessKey = ref('')

watch(
  remote,
  (value) => {
    serverUrl.value = value?.access.serverUrl ?? ''
    accessKey.value = value?.access.accessKey ?? ''
  },
  { immediate: true },
)

const showAccessKey = computed(() => remote.value?.descriptor.auth.mode !== 'none')
const environmentLabel = computed(() => remote.value?.descriptor.remoteEnvironment === 'iot' ? 'IoT 远程插件' : 'API 远程插件')
const authModeLabel = computed(() => {
  switch (remote.value?.descriptor.auth.mode) {
    case 'none':
      return '无需鉴权'
    case 'optional':
      return '可选 Key'
    case 'required':
      return '必须 Key'
    default:
      return '未知'
  }
})
const capabilityProfileLabel = computed(() => {
  switch (remote.value?.descriptor.capabilityProfile) {
    case 'query':
      return '查询型'
    case 'actuate':
      return '控制型'
    case 'hybrid':
      return '混合型'
    default:
      return '未知'
  }
})
const metadataCacheLabel = computed(() => remote.value?.metadataCache.status === 'cached' ? '已有缓存' : '尚未缓存')
const accessKeyPlaceholder = computed(() => {
  return remote.value?.descriptor.auth.mode === 'required'
    ? '此远程插件必须填写 Key'
    : '可留空，留空时按无 Key 接入'
})
const normalizedServerUrl = computed(() => serverUrl.value.trim() || null)
const normalizedAccessKey = computed(() => accessKey.value.trim() || null)
const dirty = computed(() => {
  return normalizedServerUrl.value !== (remote.value?.access.serverUrl ?? null)
    || normalizedAccessKey.value !== (remote.value?.access.accessKey ?? null)
})
const validationMessage = computed(() => {
  if (!remote.value) {
    return null
  }
  if (!normalizedServerUrl.value) {
    return '接入地址不能为空。'
  }
  if (remote.value.descriptor.auth.mode === 'required' && !normalizedAccessKey.value) {
    return '当前远程插件要求必须填写接入 Key。'
  }
  return null
})
const canSave = computed(() => !validationMessage.value)

function handleSave() {
  if (!remote.value || !canSave.value) {
    return
  }
  emit('save', {
    access: {
      accessKey: normalizedAccessKey.value,
      serverUrl: normalizedServerUrl.value,
    },
    ...(props.plugin.description ? { description: props.plugin.description } : {}),
    ...(props.plugin.displayName ? { displayName: props.plugin.displayName } : {}),
    remote: remote.value.descriptor,
    ...(props.plugin.version ? { version: props.plugin.version } : {}),
  })
}
</script>

<style scoped>
.remote-access-panel {
  display: grid;
  gap: 14px;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid rgba(133, 163, 199, 0.16);
  background: rgba(12, 18, 31, 0.84);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.panel-header h3,
.panel-note,
.validation-error {
  margin: 0;
}

.panel-note {
  color: var(--text-muted);
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.field.readonly {
  min-height: 42px;
  padding: 0.72rem 0.85rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--gc-atmosphere-1);
}

.field.readonly {
  align-content: center;
}

.save-button {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
}

.validation-error {
  color: #ffb1b1;
}

@media (max-width: 720px) {
  .panel-header {
    display: grid;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
