<template>
  <slot />
</template>

<script setup lang="ts">
import { provide, watch, onMounted, onUnmounted } from 'vue'
import { useAppearanceStore } from '@/shared/stores/appearance'
import { scheduleBatch } from '@/shared/theme/pipeline'
import { themePresets } from '@/shared/theme/constants'
import { TOKEN_GROUPS } from '@/shared/theme/groups'
import { themeDebug } from '@/shared/theme/debug'
import { THEME_CONTEXT_KEY } from './theme-context'
import type { ThemeContextValue } from './theme-context'

const appearance = useAppearanceStore()

// ── Initialize store on mount ──
onMounted(() => {
  appearance.init()
})

// ── Runtime pipeline: batch-schedule token updates ──
// scheduleBatch coalesces multiple updates within a single frame
// and only applies changed properties (diff-based).
watch(
  () => appearance.tokens,
  (tokens) => {
    scheduleBatch(tokens)
    if (import.meta.env.DEV) {
      themeDebug.logApply(
        Object.keys(tokens).length,
        Object.keys(tokens).length, // diff details are internal to pipeline
        0,
      )
    }
  },
  { immediate: true, deep: true },
)

// ── Sync html class with resolvedMode ──
watch(
  () => appearance.resolvedMode,
  (mode) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (mode === 'dark') {
      root.classList.remove('light')
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
      root.classList.add('light')
    }
  },
  { immediate: true },
)

// ── Cleanup on unmount ──
onUnmounted(() => {
  // Store's matchMedia listener persists; this is intentional —
  // the store outlives individual provider instances.
})

// ── Provide theme context ──
provide<ThemeContextValue>(THEME_CONTEXT_KEY, {
  preset: appearance.currentPreset,
  presets: themePresets,
  groups: TOKEN_GROUPS,
  mode: appearance.mode,
  resolvedMode: appearance.resolvedMode,
  hue: appearance.effectiveHue,
  saturation: appearance.effectiveSaturation,
  tokens: appearance.tokens,
  setPreset: appearance.setPreset,
  setMode: appearance.setMode,
  setHue: appearance.setHue,
  setSaturation: appearance.setSaturation,
})
</script>
