<template>
  <nav class="appearance-tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      role="tab"
      class="appearance-tab"
      :class="{ 'is-active': tab.id === modelValue }"
      :aria-selected="tab.id === modelValue"
      @click="$emit('update:modelValue', tab.id)"
    >
      <span class="appearance-tab__icon" v-html="tab.icon" />
      <span class="appearance-tab__label">{{ tab.label }}</span>
    </button>
  </nav>

  <!-- Tab content -->
  <div class="appearance-tab-content" :key="modelValue">
    <slot :name="modelValue">
      <!-- Fallback: empty state for unimplemented tabs -->
      <div v-if="modelValue !== 'theme'" class="appearance-placeholder">
        <div class="appearance-placeholder__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <span class="appearance-placeholder__title">{{ activeTab?.label }}</span>
        <span class="appearance-placeholder__text">即将推出</span>
      </div>
    </slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface TabItem {
  id: string
  label: string
  icon: string
}

const props = defineProps<{
  modelValue: string
  tabs: TabItem[]
}>()

defineEmits<{
  'update:modelValue': [id: string]
}>()

const activeTab = computed(() => props.tabs.find((t) => t.id === props.modelValue))
</script>

<style scoped>
/* ── Tab bar ── */
.appearance-tabs {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: 12px;
  background: var(--gc-muted);
  border: 1px solid var(--gc-glass-border);
}

.appearance-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  justify-content: center;
  padding: 6px 8px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: var(--gc-muted-foreground);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
  white-space: nowrap;
}

.appearance-tab:hover {
  color: var(--gc-foreground);
  background: var(--gc-glass-bg);
}

.appearance-tab.is-active {
  background: var(--gc-card);
  color: var(--gc-foreground);
  box-shadow:
    0 1px 3px var(--gc-shadow-color),
    0 0 0 1px var(--gc-glass-border);
}

.appearance-tab__icon {
  display: flex;
  align-items: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.appearance-tab__icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.appearance-tab__label {
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* ── Tab content ── */
.appearance-tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ── Placeholder for unimplemented tabs ── */
.appearance-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--gc-muted-foreground);
}

.appearance-placeholder__icon {
  opacity: 0.4;
}

.appearance-placeholder__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--gc-foreground);
}

.appearance-placeholder__text {
  font-size: 12px;
}
</style>
