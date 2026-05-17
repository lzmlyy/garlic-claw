<script setup lang="ts">
import { useThemeStore } from '@/shared/stores/theme'
import moonBold from '@iconify-icons/solar/moon-bold'
import sunBold from '@iconify-icons/solar/sun-bold'
import { Icon } from '@iconify/vue'
import { ElButton } from 'element-plus'
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import ThemePanel from './ThemePanel.vue'

const theme = useThemeStore()

const wrapperRef = ref<HTMLElement>()
const triggerRef = ref<typeof ElButton>()
const panelOpen = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

function toggleTheme() {
  if (theme.followSystem) {
    theme.setFollowSystem(false)
    theme.isDark ? theme.setLightMode() : theme.setDarkMode()
  } else {
    theme.isDark ? theme.setLightMode() : theme.setDarkMode()
  }
}

function openPanel() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  panelOpen.value = true
}

function closePanel() {
  panelOpen.value = false
}

function scheduleClose() {
  closeTimer = setTimeout(() => {
    panelOpen.value = false
  }, 150)
}

function cancelClose() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function handleClickOutside(e: MouseEvent) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    closePanel()
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside, true))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside, true))

const panelStyle = computed(() => {
  const el = (wrapperRef.value?.querySelector('.theme-trigger') as HTMLElement) ?? wrapperRef.value
  if (!el) return {}
  const rect = el.getBoundingClientRect()
  return {
    position: 'fixed' as const,
    top: `${rect.bottom + 8}px`,
    right: `${window.innerWidth - rect.right}px`,
  }
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="theme-toggle-wrapper"
    @mouseenter="openPanel"
    @mouseleave="scheduleClose"
  >
    <ElButton
      ref="triggerRef"
      class="theme-trigger"
      :title="theme.isDark && !theme.followSystem ? '深色模式' : '浅色模式'"
      @click="toggleTheme"
    >
      <Icon :icon="theme.isDark ? moonBold : sunBold" />
    </ElButton>

    <Teleport to="body">
      <Transition name="theme-dropdown">
        <div
          v-if="panelOpen"
          class="theme-panel"
          :style="panelStyle"
          @mouseenter="cancelClose"
          @mouseleave="scheduleClose"
        >
          <ThemePanel @select="closePanel()" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.theme-toggle-wrapper {
  display: flex;
  align-items: center;
}

.theme-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--gc-radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--gc-text-muted);
  font-size: 20px;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}

.theme-trigger:hover {
  color: var(--gc-text);
  background: var(--gc-surface-base);
}

.theme-panel {
  z-index: 9999;
  min-width: 180px;
  border-radius: var(--gc-radius);
  border: 1px solid var(--gc-border);
  background: var(--gc-surface-floating);
  box-shadow: var(--gc-shadow-lg);
}

/* panel transition */
.theme-dropdown-enter-active,
.theme-dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.theme-dropdown-enter-from,
.theme-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
