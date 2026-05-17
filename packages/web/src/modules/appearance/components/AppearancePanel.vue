<template>
  <Teleport to="body">
    <Transition name="panel" appear>
      <div v-if="isOpen" class="appearance-overlay" @click.self="close">
        <div class="appearance-panel" @click.stop>
          <!-- Glass border glow ring -->
          <div class="appearance-panel__glow" />

          <!-- Header -->
          <header class="appearance-panel__header">
            <h2 class="appearance-panel__title">外观设置</h2>
            <button class="appearance-panel__close" @click="close" aria-label="关闭">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>

          <!-- Tabs -->
          <AppearanceTabs v-model="activeTab" :tabs="tabs">
            <!-- Theme tab content -->
            <template #theme>
              <div class="theme-tab-content">
                <!-- Preset cards -->
                <section class="panel-section">
                  <span class="panel-section__label">预设主题</span>
                  <div class="preset-grid">
                    <ThemePresetCard
                      v-for="preset in presets"
                      :key="preset.id"
                      :preset="preset"
                      :is-active="preset.id === appearance.presetId"
                      @select="appearance.setPreset"
                    />
                  </div>
                </section>

                <!-- Sliders -->
                <section class="panel-section">
                  <span class="panel-section__label">微调</span>
                  <ThemeSliders />
                </section>

                <!-- Preview -->
                <section class="panel-section">
                  <ThemePreview />
                </section>
              </div>
            </template>
            <!-- Effects tab content -->
            <template #effects>
              <div class="theme-tab-content">
                <ScreenEffectsSettings />
              </div>
            </template>
            <!-- Wallpaper tab content -->
            <template #wallpaper>
              <WallpaperSettings />
            </template>
          </AppearanceTabs>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useAppearancePanel } from '@/modules/appearance/composables/useAppearancePanel'
import { useAppearanceStore } from '@/shared/stores/appearance'
import { themePresets } from '@/shared/theme/constants'
import AppearanceTabs from './AppearanceTabs.vue'
import type { TabItem } from './AppearanceTabs.vue'
import ThemePresetCard from './ThemePresetCard.vue'
import ThemeSliders from './ThemeSliders.vue'
import ThemePreview from './ThemePreview.vue'
import WallpaperSettings from './WallpaperSettings.vue'
import ScreenEffectsSettings from './ScreenEffectsSettings.vue'
import { useScreenEffectsStore } from '@/modules/screen-effects/store/screen-effects'

const { isOpen, close } = useAppearancePanel()
const appearance = useAppearanceStore()
const presets = themePresets

// Initialize screen effects store when panel opens
const fxStore = useScreenEffectsStore()
fxStore.init()

const activeTab = ref('theme')

const tabs: TabItem[] = [
  { id: 'theme', label: '主题', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>' },
  { id: 'wallpaper', label: '壁纸', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>' },
  { id: 'effects', label: '特效', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/></svg>' },
  { id: 'navbar', label: '导航栏', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>' },
  { id: 'banner', label: '横幅', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 3 8 3 4-1 4-1V3s-1 1-4 1-5-3-8-3-4 1-4 1z"/></svg>' },
  { id: 'motion', label: '动效', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>' },
]

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', onKeydown)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
/* ── Overlay ── */
.appearance-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--gc-z-tooltip);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gc-surface-overlay);
  backdrop-filter: blur(var(--gc-blur-light));
  -webkit-backdrop-filter: blur(var(--gc-blur-light));
}

/* ── Panel ── */
.appearance-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 720px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  background: var(--gc-glass-bg);
  backdrop-filter: blur(var(--gc-blur-deep)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--gc-blur-deep)) saturate(1.2);
  border-radius: 22px;
  border: 1px solid var(--gc-glass-border);
  box-shadow:
    0 0 0 1px var(--gc-glass-border),
    var(--gc-shadow-lg),
    var(--gc-shadow-xl);
  overflow: hidden;
}

/* ── Subtle inner glow ring ── */
.appearance-panel__glow {
  position: absolute;
  inset: 0;
  border-radius: 22px;
  pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, var(--gc-border-alpha-subtle));
}

/* ── Header ── */
.appearance-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  flex-shrink: 0;
}

.appearance-panel__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--gc-foreground);
  letter-spacing: 0.01em;
}

.appearance-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--gc-glass-border);
  background: var(--gc-glass-bg);
  color: var(--gc-muted-foreground);
  cursor: pointer;
  transition:
    color var(--gc-transition-fast),
    border-color var(--gc-transition-fast),
    background var(--gc-transition-fast);
}

.appearance-panel__close:hover {
  color: var(--gc-foreground);
  border-color: var(--gc-border);
  background: var(--gc-muted);
}

/* ── Theme tab content layout ── */
.theme-tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 20px 20px;
  overflow-y: auto;
  flex: 1;
}

/* ── Sections ── */
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-section__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gc-muted-foreground);
}

/* ── Preset grid ── */
.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* ── Transition ── */
.panel-enter-active {
  transition:
    opacity var(--gc-transition-slow),
    transform var(--gc-transition-slow);
}

.panel-leave-active {
  transition:
    opacity var(--gc-transition-fast),
    transform var(--gc-transition-normal);
}

.panel-enter-from {
  opacity: 0;
}

.panel-enter-from .appearance-panel {
  transform: scale(0.94) translateY(8px);
  opacity: 0;
}

.panel-leave-to {
  opacity: 0;
}

.panel-leave-to .appearance-panel {
  transform: scale(0.96) translateY(4px);
  opacity: 0;
}
</style>
