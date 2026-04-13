<template>
  <section class="skill-list-panel">
    <div class="panel-header">
      <div>
        <span class="panel-kicker">Catalog</span>
        <h2>技能目录</h2>
        <p>当前会话可激活的技能。项目内置和用户自定义都统一在这里治理。</p>
      </div>
    </div>

    <input
      :value="searchKeyword"
      class="skill-search"
      type="text"
      placeholder="搜索技能名称、说明、标签"
      @input="onSearchInput"
    >

    <div v-if="loading" class="empty-state">加载中...</div>
    <div v-else-if="skills.length === 0" class="empty-state">当前筛选下没有技能。</div>
    <div v-else class="skill-list">
      <SkillCard
        v-for="skill in skills"
        :key="skill.id"
        :skill="skill"
        :selected="modelValue === skill.id"
        :active="isSkillActive(skill.id)"
        :toggle-disabled="isToggleDisabled(skill.id)"
        :toggle-label="skillToggleLabel(skill.id)"
        @select="(skillId) => $emit('update:modelValue', skillId)"
        @toggle="(skillId) => $emit('toggle-skill', skillId)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SkillDetail } from '@garlic-claw/shared'
import SkillCard from './SkillCard.vue'

const props = defineProps<{
  modelValue: string | null
  searchKeyword: string
  skills: SkillDetail[]
  loading: boolean
  activeSkillIds: string[]
  mutatingSkillId: string | null
  currentConversationId: string | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | null): void
  (event: 'update:searchKeyword', value: string): void
  (event: 'toggle-skill', skillId: string): void
}>()

function onSearchInput(event: Event) {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}

function isSkillActive(skillId: string): boolean {
  return props.activeSkillIds.includes(skillId)
}

function isToggleDisabled(skillId: string): boolean {
  if (!props.currentConversationId) {
    return true
  }

  return props.mutatingSkillId === skillId
}

function skillToggleLabel(skillId: string): string {
  if (props.mutatingSkillId === skillId) {
    return '更新中...'
  }

  return isSkillActive(skillId) ? '移除' : '激活'
}
</script>
