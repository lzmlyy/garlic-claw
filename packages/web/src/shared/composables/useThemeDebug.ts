import { watch, onMounted } from 'vue'
import { useAppearanceStore } from '@/shared/stores/appearance'
import { themeDebug } from '@/shared/theme/debug'
import type { ThemeDebugSnapshot } from '@/shared/theme/types'

export interface UseThemeDebugReturn {
  snapshot: () => ThemeDebugSnapshot
  logGroups: () => void
}

/**
 * Development-only composable for debugging theme state.
 * In production, all functions are no-ops.
 *
 * Automatically logs a snapshot on mount and watches for token changes.
 */
export function useThemeDebug(): UseThemeDebugReturn {
  const appearance = useAppearanceStore()

  if (!import.meta.env.DEV) {
    return { snapshot: () => ({ presetId: '', presetName: '', mode: 'system', resolvedMode: 'dark', hue: 0, saturation: 0, tokenCount: 0, timestamp: 0 }), logGroups: () => {} }
  }

  let prevTokens = { ...appearance.tokens }

  onMounted(() => {
    themeDebug.snapshot({
      presetId: appearance.presetId,
      presetName: appearance.currentPreset.name,
      mode: appearance.mode,
      resolvedMode: appearance.resolvedMode,
      hue: appearance.effectiveHue,
      saturation: appearance.effectiveSaturation,
      tokens: appearance.tokens,
    })
  })

  watch(
    () => appearance.tokens,
    (next) => {
      themeDebug.logDiff('reactive update', prevTokens, next)
      prevTokens = { ...next }
    },
    { deep: true },
  )

  function snapshot(): ThemeDebugSnapshot {
    return themeDebug.snapshot({
      presetId: appearance.presetId,
      presetName: appearance.currentPreset.name,
      mode: appearance.mode,
      resolvedMode: appearance.resolvedMode,
      hue: appearance.effectiveHue,
      saturation: appearance.effectiveSaturation,
      tokens: appearance.tokens,
    })
  }

  function logGroups(): void {
    themeDebug.logGroups(appearance.tokens)
  }

  return { snapshot, logGroups }
}
