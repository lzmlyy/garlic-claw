<template>
  <button
    class="appearance-button"
    :class="{ 'is-active': isOpen }"
    @click="toggle"
    :aria-label="isOpen ? '关闭外观设置' : '打开外观设置'"
  >
    <!-- Gradient accent preview ring -->
    <span class="appearance-button__preview" aria-hidden="true">
      <span class="appearance-button__preview-inner" />
    </span>

    <!-- Label -->
    <span class="appearance-button__label">外观</span>

    <!-- Chevron indicator -->
    <svg
      class="appearance-button__chevron"
      :class="{ 'is-open': isOpen }"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { useAppearancePanel } from '@/modules/appearance/composables/useAppearancePanel'
import { useAppearanceStore } from '@/shared/stores/appearance'

const { isOpen, toggle } = useAppearancePanel()
// Ensure the store is instantiated so reactive tokens are available
useAppearanceStore()
</script>

<style scoped>
.appearance-button {
  --btn-glow: var(--gc-glow);
  --btn-shadow: var(--gc-shadow-color);
  --btn-accent: var(--gc-primary);
  --btn-border: var(--gc-glass-border);
  --btn-bg: var(--gc-glass-bg);

  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px 0 6px;
  border-radius: 12px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  backdrop-filter: blur(var(--gc-blur-standard));
  -webkit-backdrop-filter: blur(var(--gc-blur-standard));
  cursor: pointer;
  color: var(--gc-foreground);
  font-size: 13px;
  font-family: inherit;
  user-select: none;
  transition:
    transform var(--gc-transition-slow),
    box-shadow var(--gc-transition-slow),
    border-color var(--gc-transition-slow),
    background var(--gc-transition-slow);
  box-shadow: var(--gc-shadow-xs);
}

.appearance-button:hover {
  transform: translateY(var(--gc-hover-lift-strong));
  box-shadow: var(--gc-shadow-md);
  border-color: var(--btn-accent);
}

.appearance-button:active {
  transform: translateY(0);
  box-shadow: var(--gc-shadow-xs);
}

.appearance-button.is-active {
  border-color: var(--btn-accent);
  box-shadow: var(--gc-shadow-sm);
  background: var(--gc-muted);
}

/* ── Accent preview ring ── */
.appearance-button__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    hsl(var(--gc-hue), var(--gc-saturation), 65%),
    hsl(var(--gc-hue), var(--gc-saturation), 45%),
    hsl(var(--gc-hue), var(--gc-saturation), 30%),
    hsl(var(--gc-hue), var(--gc-saturation), 45%),
    hsl(var(--gc-hue), var(--gc-saturation), 65%)
  );
  flex-shrink: 0;
}

.appearance-button__preview-inner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gc-accent);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, var(--gc-border-alpha-strong));
}

/* ── Label ── */
.appearance-button__label {
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* ── Chevron ── */
.appearance-button__chevron {
  transition: transform var(--gc-transition-fast);
  opacity: 0.5;
  flex-shrink: 0;
}

.appearance-button__chevron.is-open {
  transform: rotate(180deg);
}
</style>
