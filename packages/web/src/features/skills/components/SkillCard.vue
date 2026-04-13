<template>
  <article
    class="skill-card"
    :class="{ active: selected }"
    @click="$emit('select', skill.id)"
  >
    <div class="skill-card-top">
      <div>
        <strong>{{ skill.name }}</strong>
        <p>{{ skill.description || '当前技能没有额外说明。' }}</p>
      </div>
      <SkillActiveStateToggle
        :label="toggleLabel"
        :disabled="toggleDisabled"
        @click.stop="$emit('toggle', skill.id)"
      />
    </div>
    <div class="meta-row">
      <span class="meta-chip">{{ skill.id }}</span>
      <span class="meta-chip">{{ skill.sourceKind === 'project' ? '项目' : '用户' }}</span>
      <span class="meta-chip">{{ trustLevelLabel(skill.governance.trustLevel) }}</span>
      <span class="meta-chip">{{ skill.assets.length }} 个资产</span>
      <span v-if="active" class="meta-chip active-chip">当前会话已激活</span>
    </div>
    <p v-if="skill.tags.length > 0" class="detail-line">标签: {{ skill.tags.join(' · ') }}</p>
    <p class="detail-line">入口: {{ skill.entryPath }}</p>
    <p v-if="skill.assets.length > 0" class="detail-line">资产: {{ skill.assets.map((asset) => asset.path).join(' · ') }}</p>
  </article>
</template>

<script setup lang="ts">
import type { SkillDetail, SkillTrustLevel } from '@garlic-claw/shared'
import SkillActiveStateToggle from './SkillActiveStateToggle.vue'

defineProps<{
  skill: SkillDetail
  selected: boolean
  active: boolean
  toggleDisabled: boolean
  toggleLabel: string
}>()

defineEmits<{
  (event: 'select', skillId: string): void
  (event: 'toggle', skillId: string): void
}>()

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
</script>
