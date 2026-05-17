<script setup lang="ts">
import { useThemeStore } from '@/shared/stores/theme'
import moonBold from '@iconify-icons/solar/moon-bold'
import sunBold from '@iconify-icons/solar/sun-bold'
import { Icon } from '@iconify/vue'
import { ElSwitch } from 'element-plus'

withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false,
})

const emit = defineEmits<{
  select: []
}>()

const theme = useThemeStore()

function handleLightMode() {
  theme.setLightMode()
  emit('select')
}

function handleDarkMode() {
  theme.setDarkMode()
  emit('select')
}
</script>

<template>
  <div class="theme-panel-content" :class="{ 'theme-panel-content--compact': compact }">
    <div class="theme-title">主题设置</div>
    <div class="theme-options">
      <div
        class="theme-option"
        :class="{ active: !theme.followSystem && !theme.isDark }"
        @click="handleLightMode"
      >
        <Icon :icon="sunBold" class="option-icon" />
        <span>浅色</span>
      </div>
      <div
        class="theme-option"
        :class="{ active: !theme.followSystem && theme.isDark }"
        @click="handleDarkMode"
      >
        <Icon :icon="moonBold" class="option-icon" />
        <span>深色</span>
      </div>
    </div>
    <div class="theme-divider" />
    <div class="follow-system-row">
      <Icon
        v-if="compact"
        icon="material-symbols:brightness-auto-outline-rounded"
        class="row-icon"
      />
      <span class="follow-system-label">跟随系统</span>
      <ElSwitch
        :model-value="theme.followSystem"
        @update:model-value="(val: string | number | boolean) => theme.setFollowSystem(!!val)"
      />
    </div>
  </div>
</template>

<style scoped>
.theme-panel-content {
  padding: 16px 20px;
  min-width: 140px;
}

.theme-panel-content--compact {
  padding: 0;
}

.theme-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--gc-text);
  position: relative;
  margin-left: 12px;
  margin-bottom: 12px;
}

.theme-title::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  border-radius: 4px;
  background: var(--gc-accent);
}

.theme-options {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: var(--gc-radius-sm);
  cursor: pointer;
  border: 1px solid var(--gc-border);
  color: var(--gc-text-muted);
  transition: all 0.2s;
}

.theme-option:hover {
  border-color: var(--gc-accent);
  color: var(--gc-accent);
}

.theme-option.active {
  border-color: var(--gc-accent);
  background: var(--gc-accent-bg);
  color: var(--gc-accent);
}

.theme-option .option-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--gc-accent);
}

.row-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--gc-accent);
}

.theme-option span {
  font-size: 12px;
}

.theme-divider {
  height: 1px;
  background: var(--gc-border);
  margin: 8px 0;
}

.follow-system-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--gc-text);
}

.follow-system-label {
  margin-right: auto;
}

.theme-panel-content--compact .theme-option {
  flex-direction: row;
  gap: 6px;
  min-height: 36px;
}

.theme-panel-content--compact .follow-system-row {
  padding-left: 12px;
}
</style>
