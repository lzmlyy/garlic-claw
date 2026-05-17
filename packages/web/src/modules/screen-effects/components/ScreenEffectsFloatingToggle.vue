<template>
  <Teleport to="body">
    <button
      type="button"
      class="fx-floating-toggle"
      :class="{ active: store.masterEnabled }"
      :title="store.masterEnabled ? '屏幕特效 (开)' : '屏幕特效 (关)'"
      aria-label="切换屏幕特效总开关"
      @click="store.toggleMaster()"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
        <path d="M12 6v6l4 2" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="14" r="1" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="10" cy="17" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="15" cy="16" r="1" fill="currentColor" stroke="none" />
      </svg>
    </button>
  </Teleport>
</template>

<script setup lang="ts">
import { useScreenEffectsStore } from '../store/screen-effects'
const store = useScreenEffectsStore()
</script>

<style>
.fx-floating-toggle {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9998;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--gc-border);
  background: var(--gc-surface-floating);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: var(--gc-shadow);
  color: var(--gc-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.5;
}

.fx-floating-toggle:hover {
  opacity: 1;
  border-color: var(--gc-border-strong);
  color: var(--gc-text);
  transform: scale(1.05);
}

.fx-floating-toggle.active {
  opacity: 0.8;
  color: var(--gc-accent);
  border-color: var(--gc-accent-bg);
}
</style>
