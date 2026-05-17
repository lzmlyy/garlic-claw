<template>
  <article
    class="skill-card"
    :class="[statusClass(skill.governance.loadPolicy), { active: selected }]"
    @click="$emit('select', skill.id)"
  >
    <div class="skill-card-top">
      <div>
        <strong class="skill-card-title">{{ skill.name }}</strong>
        <p class="skill-card-description">{{ skill.description || '当前技能没有额外说明。' }}</p>
      </div>
    </div>
    <div v-if="skill.tags.length > 0" class="skill-card-tags">
      <span v-for="tag in skill.tags" :key="tag" class="skill-card-tag">
        {{ tag }}
      </span>
    </div>
    <div class="skill-card-footer">
      <span class="skill-card-path">{{ skill.entryPath }}</span>
      <span class="skill-card-assets">{{ skill.assets.length }} 个资产</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { SkillDetail, SkillLoadPolicy } from '@garlic-claw/shared'

defineProps<{
  skill: SkillDetail
  selected: boolean
}>()

defineEmits<{
  (event: 'select', skillId: string): void
}>()

function statusClass(loadPolicy: SkillLoadPolicy): string {
  switch (loadPolicy) {
    case 'deny':
      return 'policy-deny'
    case 'ask':
      return 'policy-ask'
    default:
      return 'policy-allow'
  }
}
</script>

<style scoped>
.skill-card {
  position: relative;
  display: grid;
  gap: 0.75rem;
  cursor: pointer;
  border: 1px solid var(--border, rgba(133, 163, 199, 0.24));
  border-left: 4px solid var(--success);
  border-radius: 12px;
  padding: 0.95rem 1rem;
  background: var(--surface-panel, color-mix(in oklch, var(--gc-surface-elevated, oklch(0.25 0.01 240)) 86%, var(--gc-surface-tint) 4%));
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.skill-card:hover {
  border-color: color-mix(in srgb, var(--shell-active, #18a058) 26%, var(--border, rgba(133, 163, 199, 0.24)));
  background: var(--provider-row-hover-bg, color-mix(in oklch, var(--gc-surface-elevated, oklch(0.25 0.01 240)) 76%, var(--gc-surface-tint) 8%));
}

.skill-card.active {
  border-color: rgba(76, 189, 255, 0.35);
  box-shadow: 0 0 0 1px rgba(76, 189, 255, 0.18);
}

.skill-card.policy-allow {
  border-left-color: var(--success);
}

.skill-card.policy-ask {
  border-left-color: #f0b24b;
}

.skill-card.policy-deny {
  border-left-color: #f36c6c;
}

.skill-card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.9rem;
}

.skill-card-title {
  display: block;
  font-size: 0.95rem;
  color: var(--shell-text, var(--text));
}

.skill-card-description {
  margin: 0.3rem 0 0;
  color: var(--shell-text-secondary, var(--text-muted));
}

.skill-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.skill-card-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  background: var(--shell-bg-hover, #334155);
  color: var(--shell-text-tertiary, #94a3b8);
  font-size: 0.74rem;
}

.skill-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--shell-text-tertiary, var(--text-muted));
  font-size: 0.78rem;
}

.skill-card-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .skill-card-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
