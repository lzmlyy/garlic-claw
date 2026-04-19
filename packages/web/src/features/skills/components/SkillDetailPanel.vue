<template>
  <aside class="skill-detail-panel">
    <SkillConversationBinding
      :conversation-id="conversationId"
      :active-skills="conversationSkillState?.activeSkills ?? []"
      @toggle-skill="(skillId) => $emit('toggle-skill', skillId)"
    />

    <article v-if="skill" class="skill-preview">
      <header class="preview-header">
        <div>
          <span class="panel-kicker">Preview</span>
          <h3>{{ skill.name }}</h3>
        </div>
        <div class="meta-row">
          <span class="meta-chip">{{ skill.sourceKind === 'project' ? '项目' : '用户' }}</span>
          <span class="meta-chip">{{ skill.entryPath }}</span>
        </div>
      </header>

      <p class="detail-line">{{ skill.description }}</p>
      <section class="governance-panel">
        <div class="meta-row">
          <span class="meta-chip">{{ trustLevelLabel(skill.governance.trustLevel) }}</span>
          <span class="meta-chip">{{ skill.assets.length }} 个资产</span>
        </div>
        <p class="detail-line muted-text">
          {{ trustLevelDescription(skill.governance.trustLevel) }}
        </p>
        <p class="detail-line muted-text">
          `技能` 的统一在线启用 / 停用已收敛到本页下方的 `Active Skill Packages` 工具治理区域，这里只保留单个技能的 trust level。
        </p>
        <div class="governance-actions">
          <label class="trust-level-field">
            <span>信任等级</span>
            <select
              :value="skill.governance.trustLevel"
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
      <p v-if="skill.toolPolicy.allow.length > 0" class="detail-line">
        允许工具: {{ skill.toolPolicy.allow.join(' · ') }}
      </p>
      <p v-if="skill.toolPolicy.deny.length > 0" class="detail-line warning-text">
        禁止工具: {{ skill.toolPolicy.deny.join(' · ') }}
      </p>

      <section class="asset-section">
        <header class="asset-header">
          <div>
            <span class="panel-kicker">Package</span>
            <h4>目录资产</h4>
          </div>
          <span class="meta-chip">{{ skill.assets.length }} 项</span>
        </header>
        <p class="detail-line muted-text">
          资产读取和脚本执行都依赖当前会话激活状态，以及这里设定的信任等级。
        </p>
        <div v-if="skill.assets.length === 0" class="empty-state compact">
          当前技能没有附属资产。
        </div>
        <div v-else class="asset-list">
          <article
            v-for="asset in skill.assets"
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
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  ConversationSkillState,
  SkillAssetKind,
  SkillDetail,
  SkillTrustLevel,
} from '@garlic-claw/shared'
import { marked } from 'marked'
import SkillConversationBinding from './SkillConversationBinding.vue'

const props = defineProps<{
  skill: SkillDetail | null
  conversationId: string | null
  conversationSkillState: ConversationSkillState | null
  mutatingSkillId: string | null
}>()

const emit = defineEmits<{
  (event: 'toggle-skill', skillId: string): void
  (event: 'update-trust-level', payload: { skillId: string, trustLevel: SkillTrustLevel }): void
}>()

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
  props.skill ? props.mutatingSkillId === props.skill.id : false,
)

const renderedSkillContent = computed(() => {
  if (!props.skill) {
    return ''
  }

  return String(marked.parse(props.skill.content))
})

function setSelectedSkillTrustLevel(event: Event) {
  if (!props.skill) {
    return
  }

  const nextTrustLevel = (event.target as HTMLSelectElement).value as SkillTrustLevel
  if (nextTrustLevel === props.skill.governance.trustLevel) {
    return
  }

  emit('update-trust-level', {
    skillId: props.skill.id,
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
      return '当前会话激活后，模型可以通过统一技能工具读取模板、参考资料和脚本文本。'
    case 'local-script':
      return '当前会话激活后，模型既可以读取资产，也可以通过统一技能工具执行本地脚本。'
    default:
      return '当前技能只会作为提示和工作流资产注入上下文，不会开放附属文件读取或脚本执行。'
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
