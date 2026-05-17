import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAppearanceStore } from './appearance'

/**
 * Legacy theme store — delegates to useAppearanceStore.
 *
 * All mode state and persistence is owned by the appearance store.
 * This store exists for backward compatibility with components that
 * use the old isDark/followSystem API (ThemePanel, ThemeToggle, etc.).
 */

const OLD_STORAGE_KEY = 'garlic-claw:theme'

export const useThemeStore = defineStore('theme', () => {
  const appearance = useAppearanceStore()

  // ── Computed (derived from appearance store) ──

  const isDark = computed(() => appearance.resolvedMode === 'dark')

  const followSystem = computed(() => appearance.mode === 'system')

  // ── Actions (delegate to appearance store) ──

  function setLightMode() {
    appearance.setMode('light')
  }

  function setDarkMode() {
    appearance.setMode('dark')
  }

  function setFollowSystem(value: boolean) {
    if (value) {
      appearance.setMode('system')
    } else {
      // Keep current resolved mode as explicit choice
      appearance.setMode(appearance.resolvedMode)
    }
  }

  /** Migrate old storage key → new key, then initialize appearance store. */
  function initTheme() {
    // One-time migration: if old key exists but new key doesn't, transfer the value
    if (typeof window !== 'undefined') {
      try {
        const oldRaw = window.localStorage.getItem(OLD_STORAGE_KEY)
        const newRaw = window.localStorage.getItem('garlic-claw:appearance')
        if (oldRaw && !newRaw) {
          const old = JSON.parse(oldRaw)
          const mode =
            old === 'system'
              ? 'system'
              : old === 'light'
                ? 'light'
                : 'dark'
          window.localStorage.setItem(
            'garlic-claw:appearance',
            JSON.stringify({
              presetId: 'moss-cyan',
              mode,
              customHue: null,
              customSaturation: null,
            }),
          )
          // Clean up old key after migration
          window.localStorage.removeItem(OLD_STORAGE_KEY)
        }
      } catch {
        // Corrupted storage — appearance store handles defaults
      }
    }

    // Appearance store handles its own initialization (called from ThemeProvider)
  }

  return {
    isDark,
    followSystem,
    initTheme,
    setLightMode,
    setDarkMode,
    setFollowSystem,
  }
})
