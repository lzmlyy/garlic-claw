<script setup lang="ts">
import { ElButton } from 'element-plus'
import { computed } from 'vue'

interface HeaderViewOption {
  label: string
  value: string
  disabled?: boolean
  title?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: readonly HeaderViewOption[]
  ariaLabel?: string
  fullWidth?: boolean
  activeColor?: string
  activeTextColor?: string
  size?: 'default' | 'small'
}>(), {
  ariaLabel: '页面视图切换',
  fullWidth: false,
  activeColor: 'var(--el-color-primary)',
  activeTextColor: '#fff',
  size: 'default',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const componentStyle = computed(() => ({
  '--segmented-active-color': props.activeColor,
  '--segmented-active-text-color': props.activeTextColor,
}))

function handleSelect(value: string, disabled?: boolean) {
  if (disabled || value === props.modelValue) {
    return
  }
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<template>
  <div
    class="segmented-switch"
    :class="{
      'segmented-switch--full': fullWidth,
      'segmented-switch--small': size === 'small',
    }"
    :style="componentStyle"
    role="radiogroup"
    :aria-label="ariaLabel"
  >
    <ElButton
      v-for="option in options"
      :key="option.value"
      class="segmented-switch__option"
      native-type="button"
      :class="{
        'is-active': modelValue === option.value,
        'is-disabled': option.disabled,
      }"
      :aria-checked="modelValue === option.value"
      :title="option.title || option.label"
      :disabled="option.disabled"
      role="radio"
      @click="handleSelect(option.value, option.disabled)"
    >
      <span class="segmented-switch__label">{{ option.label }}</span>
    </ElButton>
  </div>
</template>

<style scoped>
.segmented-switch {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius-sm);
  background: var(--gc-surface-elevated);
}

.segmented-switch:not(.segmented-switch--full) {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.segmented-switch:not(.segmented-switch--full)::-webkit-scrollbar {
  display: none;
}

.segmented-switch--full {
  display: flex;
  width: 100%;
  overflow: hidden;
}

.segmented-switch__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  flex-shrink: 0;
  padding: 8px 16px;
  border: none;
  border-radius: 0;
  border-right: 1px solid var(--gc-border);
  background: transparent;
  box-shadow: none;
  margin: 0;
  color: var(--gc-text-muted);
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  text-align: center;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.segmented-switch--small .segmented-switch__option {
  padding: 6px 12px;
  font-size: 13px;
}

.segmented-switch--full .segmented-switch__option {
  flex: 1;
  min-width: 0;
}

.segmented-switch__option:last-child {
  border-right: none;
}

.segmented-switch__option:first-child,
.segmented-switch__option:last-child,
.segmented-switch__option.is-active,
.segmented-switch__option:hover {
  border-radius: 0;
}

.segmented-switch__option:hover {
  color: var(--gc-accent);
  background: var(--gc-accent-bg);
}

.segmented-switch__option:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--segmented-active-color);
  outline-offset: -2px;
}

.segmented-switch__option.is-active {
  background: var(--segmented-active-color);
  color: var(--segmented-active-text-color);
}

.segmented-switch__option.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.segmented-switch__label {
  display: block;
  min-width: 0;
  white-space: nowrap;
}
</style>
