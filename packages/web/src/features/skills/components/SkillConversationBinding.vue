<template>
  <div>
    <div class="panel-header">
      <div>
        <span class="panel-kicker">Session</span>
        <h2>当前会话已激活</h2>
        <p v-if="conversationId">会话 ID: {{ conversationId }}</p>
        <p v-else>先选择一个会话，再激活技能。</p>
      </div>
    </div>

    <div v-if="activeSkills.length > 0" class="active-skill-list">
      <article
        v-for="skill in activeSkills"
        :key="skill.id"
        class="active-skill-card"
      >
        <div class="skill-card-top">
          <strong>{{ skill.name }}</strong>
          <SkillActiveStateToggle
            label="移除"
            variant="secondary"
            @click="$emit('toggle-skill', skill.id)"
          />
        </div>
        <p class="detail-line">{{ skill.description }}</p>
        <p class="detail-line">ID: {{ skill.id }}</p>
        <p class="detail-line">信任: {{ trustLevelLabel(skill.governance.trustLevel) }}</p>
      </article>
    </div>
    <div v-else class="empty-state">
      当前会话还没有激活技能。
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConversationSkillState, SkillTrustLevel } from '@garlic-claw/shared'
import SkillActiveStateToggle from './SkillActiveStateToggle.vue'

defineProps<{
  conversationId: string | null
  activeSkills: ConversationSkillState['activeSkills']
}>()

defineEmits<{
  (event: 'toggle-skill', skillId: string): void
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
