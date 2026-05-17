<template>
  <Transition name="cc" appear>
    <div v-if="isOpen" class="cc-overlay" @click.self="close">
      <!-- ═══ Atmosphere ambient bloom ═══ -->
      <div class="cc-atmosphere" />

      <!-- ═══ Left: Preview zone (transparent — shows real scaled app behind) ═══ -->
      <div class="cc-preview-zone">
        <div class="cc-preview-vignette" />
        <div class="cc-preview-sheen" />
        <!-- Subtle spatial frame hint -->
        <div class="cc-preview-border" />
      </div>

      <!-- ═══ Right: Glass control panel ═══ -->
      <aside class="cc-panel" @click.stop>
        <!-- Edge environment glow — color sampled from theme accent -->
        <div class="cc-panel-glow" />

        <!-- Header -->
        <header class="cc-panel-header">
          <div class="cc-panel-header-left">
            <span class="cc-panel-dot" aria-hidden="true" />
            <h2 class="cc-panel-title">外观</h2>
          </div>
          <button
            class="cc-panel-close"
            @click="close"
            aria-label="关闭外观控制中心"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <!-- Tab navigation -->
        <nav class="cc-tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            role="tab"
            class="cc-tab"
            :class="{ 'is-active': activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            <span class="cc-tab-icon" v-html="tab.icon" />
            <span class="cc-tab-label">{{ tab.label }}</span>
          </button>
        </nav>

        <!-- Tab content -->
        <div class="cc-panel-content">
          <!-- Theme -->
          <div v-if="activeTab === 'theme'" class="cc-tab-body">
            <section class="cc-section">
              <span class="cc-section-label">预设主题</span>
              <div class="cc-preset-grid">
                <ThemePresetCard
                  v-for="preset in presets"
                  :key="preset.id"
                  :preset="preset"
                  :is-active="preset.id === appearance.presetId"
                  @select="appearance.setPreset"
                />
              </div>
            </section>
            <section class="cc-section">
              <span class="cc-section-label">微调</span>
              <ThemeSliders />
            </section>
          </div>

          <!-- Wallpaper -->
          <div v-else-if="activeTab === 'wallpaper'" class="cc-tab-body">
            <WallpaperSettings />
          </div>

          <!-- Effects -->
          <div v-else-if="activeTab === 'effects'" class="cc-tab-body">
            <ScreenEffectsSettings />
          </div>

          <!-- Navbar / Banner / Motion — refined placeholder -->
          <div v-else class="cc-tab-body cc-placeholder-body">
            <div class="cc-placeholder">
              <div class="cc-placeholder-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="12" r="8" stroke-dasharray="2 3" />
                </svg>
              </div>
              <span class="cc-placeholder-title">{{ activeTabLabel }}</span>
              <span class="cc-placeholder-desc">该模块正在精细设计当中，<br />将在后续版本中开放。</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAppearancePanel } from '@/modules/appearance/composables/useAppearancePanel'
import { useAppearanceStore } from '@/shared/stores/appearance'
import { useScreenEffectsStore } from '@/modules/screen-effects/store/screen-effects'
import { themePresets } from '@/shared/theme/constants'
import ThemePresetCard from './ThemePresetCard.vue'
import ThemeSliders from './ThemeSliders.vue'
import WallpaperSettings from './WallpaperSettings.vue'
import ScreenEffectsSettings from './ScreenEffectsSettings.vue'

const { isOpen, close } = useAppearancePanel()
const appearance = useAppearanceStore()
const presets = themePresets

// Initialize screen effects store
useScreenEffectsStore().init()

const activeTab = ref('theme')

interface TabItem {
  id: string
  label: string
  icon: string
}

const tabs: TabItem[] = [
  {
    id: 'theme',
    label: '主题',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>',
  },
  {
    id: 'wallpaper',
    label: '壁纸',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>',
  },
  {
    id: 'effects',
    label: '特效',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/></svg>',
  },
  {
    id: 'navbar',
    label: '导航栏',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  },
  {
    id: 'banner',
    label: '横幅',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 3 8 3 4-1 4-1V3s-1 1-4 1-5-3-8-3-4 1-4 1z"/></svg>',
  },
  {
    id: 'motion',
    label: '动效',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  },
]

const activeTabLabel = computed(() => {
  return tabs.find((t) => t.id === activeTab.value)?.label ?? ''
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   Appearance Control Center — Full-Screen Overlay
   ═══════════════════════════════════════════════════════ */

.cc-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  /* Preview zone takes remaining space, panel has fixed width */
}

/* ── Atmosphere ambient bloom ── */
.cc-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 80% 40% at 75% 50%,
      color-mix(in oklch, var(--gc-accent) 8%, transparent) 0%,
      transparent 60%
    ),
    radial-gradient(
      ellipse 60% 50% at 25% 45%,
      color-mix(in oklch, var(--gc-accent) 3%, transparent) 0%,
      transparent 50%
    );
  transition: opacity 800ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* ═══ Left: Preview Zone ═══ */
.cc-preview-zone {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Padding gives the scaled app breathing room */
  padding: 5vh 3vw 5vh 4vw;
  pointer-events: none;
}

/* Subtle vignette: darkens edges to create spatial depth */
.cc-preview-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 70% 55% at 50% 50%,
    transparent 40%,
    rgba(0, 0, 0, 0.08) 70%,
    rgba(0, 0, 0, 0.18) 100%
  );
}

/* Ultra-subtle screen sheen — top-left highlight */
.cc-preview-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.025) 0%,
    transparent 35%
  );
}

/* Spatial frame — subtle border around the preview area */
.cc-preview-border {
  position: absolute;
  inset: 5vh 3vw 5vh 4vw;
  border-radius: 18px;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(0, 0, 0, 0.06);
}

/* ═══ Right: Glass Control Panel ═══ */
.cc-panel {
  position: relative;
  width: 440px;
  max-width: 44vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  /* ── True glass material ── */
  background: color-mix(in oklab, var(--gc-surface-floating) 72%, transparent);
  backdrop-filter: blur(30px) saturate(1.4);
  -webkit-backdrop-filter: blur(30px) saturate(1.4);

  /* ── Left edge border ── */
  border-left: 1px solid var(--gc-glass-border);

  /* ── Multi-layer shadow for depth ── */
  box-shadow:
    -8px 0 40px var(--gc-shadow-color),
    -2px 0 12px var(--gc-shadow-color),
    -1px 0 3px var(--gc-shadow-color);
}

/* ── Panel edge environment glow ── */
.cc-panel-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow:
    inset -1px 0 0 rgba(255, 255, 255, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  /* Left edge colored glow — follows theme accent */
  background:
    linear-gradient(
      90deg,
      color-mix(in oklch, var(--gc-accent) 6%, transparent) 0%,
      transparent 12px
    );
}

/* ── Header ── */
.cc-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 14px;
  flex-shrink: 0;
}

.cc-panel-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cc-panel-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gc-accent);
  box-shadow: 0 0 10px var(--gc-glow);
  flex-shrink: 0;
}

.cc-panel-title {
  font-size: 17px;
  font-weight: 650;
  color: var(--gc-foreground);
  letter-spacing: -0.01em;
  margin: 0;
}

.cc-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid var(--gc-glass-border);
  background: color-mix(in oklab, var(--gc-surface-floating) 60%, transparent);
  color: var(--gc-muted-foreground);
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease,
    transform 120ms ease;
}

.cc-panel-close:hover {
  color: var(--gc-foreground);
  border-color: var(--gc-border);
  background: var(--gc-muted);
  transform: scale(1.05);
}

.cc-panel-close:active {
  transform: scale(0.95);
}

/* ── Tab navigation ── */
.cc-tabs {
  display: flex;
  gap: 2px;
  padding: 4px;
  margin: 0 20px;
  border-radius: 12px;
  background: var(--gc-muted);
  border: 1px solid var(--gc-glass-border);
  flex-shrink: 0;
}

.cc-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  padding: 7px 6px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: var(--gc-muted-foreground);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease;
  white-space: nowrap;
}

.cc-tab:hover {
  color: var(--gc-foreground);
  background: var(--gc-glass-bg);
}

.cc-tab.is-active {
  background: var(--gc-card);
  color: var(--gc-foreground);
  box-shadow:
    0 1px 3px var(--gc-shadow-color),
    0 0 0 1px var(--gc-glass-border);
}

.cc-tab-icon {
  display: flex;
  align-items: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.cc-tab-icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.cc-tab-label {
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* ═══ Panel scrollable content ═══ */
.cc-panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  /* Custom scrollbar */
  scrollbar-width: thin;
  scrollbar-color: var(--gc-scrollbar-thumb-bg) transparent;
}

.cc-panel-content::-webkit-scrollbar {
  width: 5px;
}

.cc-panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.cc-panel-content::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--gc-scrollbar-thumb-bg);
}

.cc-panel-content::-webkit-scrollbar-thumb:hover {
  background: var(--gc-scrollbar-thumb-hover-bg);
}

/* ── Tab body ── */
.cc-tab-body {
  padding: 16px 24px 24px;
}

/* ── Sections ── */
.cc-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.cc-section:last-child {
  margin-bottom: 0;
}

.cc-section-label {
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--gc-muted-foreground);
  opacity: 0.7;
}

/* ── Preset grid ── */
.cc-preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* ═══ Placeholder ═══ */
.cc-placeholder-body {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.cc-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
}

.cc-placeholder-icon {
  color: var(--gc-muted-foreground);
  opacity: 0.35;
}

.cc-placeholder-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--gc-foreground);
}

.cc-placeholder-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--gc-muted-foreground);
}

/* ═══════════════════════════════════════════════════════
   Transition System
   ═══════════════════════════════════════════════════════ */

/* Overlay fade */
.cc-enter-active {
  transition: opacity 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-leave-active {
  transition: opacity 350ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-enter-from,
.cc-leave-to {
  opacity: 0;
}

/* Atmosphere bloom: slower fade-in */
.cc-enter-active .cc-atmosphere {
  transition: opacity 800ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-leave-active .cc-atmosphere {
  transition: opacity 400ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-enter-from .cc-atmosphere,
.cc-leave-to .cc-atmosphere {
  opacity: 0;
}

/* Panel: slide in from right with slight scale */
.cc-enter-active .cc-panel {
  transition:
    transform 550ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 450ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-leave-active .cc-panel {
  transition:
    transform 400ms cubic-bezier(0.5, 0, 0.75, 0),
    opacity 300ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-enter-from .cc-panel {
  transform: translateX(60px);
  opacity: 0;
}
.cc-leave-to .cc-panel {
  transform: translateX(40px);
  opacity: 0;
}

/* Preview zone: subtle delayed fade-in for spatial depth */
.cc-enter-active .cc-preview-zone {
  transition: opacity 600ms cubic-bezier(0.32, 0.72, 0, 1) 80ms;
}
.cc-leave-active .cc-preview-zone {
  transition: opacity 300ms cubic-bezier(0.32, 0.72, 0, 1);
}
.cc-enter-from .cc-preview-zone,
.cc-leave-to .cc-preview-zone {
  opacity: 0;
}

/* ═══ Responsive ═══ */
@media (max-width: 860px) {
  .cc-panel {
    width: 100vw;
    max-width: 100vw;
  }

  .cc-preview-zone {
    display: none;
  }

  .cc-enter-active .cc-panel {
    transition:
      transform 450ms cubic-bezier(0.32, 0.72, 0, 1),
      opacity 400ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .cc-enter-from .cc-panel {
    transform: translateY(30px);
  }
  .cc-leave-to .cc-panel {
    transform: translateY(20px);
  }
}
</style>
