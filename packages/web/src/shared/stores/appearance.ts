import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ThemeMode, ResolvedMode, ThemePreset, ThemeModeConfig } from '@/shared/theme/types'
import { STORAGE_KEY, DEFAULT_PRESET_ID, getPreset } from '@/shared/theme/constants'
import { computePrimitives } from '@/shared/theme/tokens'
import { computeAllTokens } from '@/shared/theme/aliases'

// ── Persistence helpers (pure, no dependencies) ──

function readStored(): {
  presetId: string
  mode: ThemeMode
  customHue: number | null
  customSaturation: number | null
  customBrightness: number | null
  customGlowStrength: number | null
  customGlassOpacity: number | null
  customBlurStrength: number | null
} | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      presetId: typeof parsed.presetId === 'string' ? parsed.presetId : DEFAULT_PRESET_ID,
      mode: ['light', 'dark', 'system'].includes(parsed.mode) ? parsed.mode : 'system',
      customHue: typeof parsed.customHue === 'number' ? parsed.customHue : null,
      customSaturation: typeof parsed.customSaturation === 'number' ? parsed.customSaturation : null,
      customBrightness: typeof parsed.customBrightness === 'number' ? parsed.customBrightness : null,
      customGlowStrength: typeof parsed.customGlowStrength === 'number' ? parsed.customGlowStrength : null,
      customGlassOpacity: typeof parsed.customGlassOpacity === 'number' ? parsed.customGlassOpacity : null,
      customBlurStrength: typeof parsed.customBlurStrength === 'number' ? parsed.customBlurStrength : null,
    }
  } catch {
    return null
  }
}

function writeStored(state: {
  presetId: string
  mode: ThemeMode
  customHue: number | null
  customSaturation: number | null
  customBrightness: number | null
  customGlowStrength: number | null
  customGlassOpacity: number | null
  customBlurStrength: number | null
}): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable
  }
}

function querySystemDark(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// ── Store ──

export const useAppearanceStore = defineStore('appearance', () => {
  // ── State ──
  const presetId = ref<string>(DEFAULT_PRESET_ID)
  const mode = ref<ThemeMode>('system')
  const customHue = ref<number | null>(null)
  const customSaturation = ref<number | null>(null)
  const customBrightness = ref<number | null>(null)
  const customGlowStrength = ref<number | null>(null)
  const customGlassOpacity = ref<number | null>(null)
  const customBlurStrength = ref<number | null>(null)
  const systemDark = ref<boolean>(querySystemDark())

  let systemQuery: MediaQueryList | null = null
  let initialized = false

  // ── Computed ──

  const resolvedMode = computed<ResolvedMode>(() => {
    if (mode.value === 'system') return systemDark.value ? 'dark' : 'light'
    return mode.value
  })

  const currentPreset = computed<ThemePreset>(() => getPreset(presetId.value))

  const currentModeConfig = computed<ThemeModeConfig>(() => {
    return resolvedMode.value === 'light' ? currentPreset.value.light : currentPreset.value.dark
  })

  const effectiveHue = computed<number>(() => customHue.value ?? currentPreset.value.hue)

  const effectiveSaturation = computed<number>(() => customSaturation.value ?? currentPreset.value.saturation)

  const effectiveBrightness = computed<number>(() => customBrightness.value ?? 50)

  const effectiveGlowStrength = computed<number>(() => customGlowStrength.value ?? 50)

  const effectiveGlassOpacity = computed<number>(() => customGlassOpacity.value ?? 50)

  const effectiveBlurStrength = computed<number>(() => customBlurStrength.value ?? 50)

  /** Primitive tokens computed from current preset + mode + overrides */
  const primitiveTokens = computed(() => {
    return computePrimitives(currentPreset.value, currentModeConfig.value, {
      hue: customHue.value ?? undefined,
      saturation: customSaturation.value ?? undefined,
      brightness: effectiveBrightness.value,
      glowStrength: effectiveGlowStrength.value / 100,
      glassOpacity: effectiveGlassOpacity.value / 100,
      blurStrength: effectiveBlurStrength.value / 100,
    })
  })

  /** Full token map: primitives + --gc-* aliases */
  const tokens = computed(() => {
    return computeAllTokens(primitiveTokens.value)
  })

  // ── Actions ──

  function persist(): void {
    writeStored({
      presetId: presetId.value,
      mode: mode.value,
      customHue: customHue.value,
      customSaturation: customSaturation.value,
      customBrightness: customBrightness.value,
      customGlowStrength: customGlowStrength.value,
      customGlassOpacity: customGlassOpacity.value,
      customBlurStrength: customBlurStrength.value,
    })
  }

  function handleSystemChange(event: MediaQueryListEvent): void {
    systemDark.value = event.matches
    // When mode is 'system', resolvedMode recomputes automatically,
    // which triggers token recomputation and the pipeline.
  }

  function setPreset(id: string): void {
    const preset = getPreset(id)
    presetId.value = preset.id
    // Reset all overrides when switching presets
    customHue.value = null
    customSaturation.value = null
    customBrightness.value = null
    customGlowStrength.value = null
    customGlassOpacity.value = null
    customBlurStrength.value = null
    persist()
  }

  function setMode(value: ThemeMode): void {
    mode.value = value
    persist()
  }

  function setHue(value: number | null): void {
    if (value !== null) {
      customHue.value = ((value % 360) + 360) % 360
    } else {
      customHue.value = null
    }
    persist()
  }

  function setSaturation(value: number | null): void {
    if (value !== null) {
      customSaturation.value = Math.max(0, Math.min(100, value))
    } else {
      customSaturation.value = null
    }
    persist()
  }

  function setBrightness(value: number | null): void {
    if (value !== null) {
      customBrightness.value = Math.max(0, Math.min(100, value))
    } else {
      customBrightness.value = null
    }
    persist()
  }

  function setGlowStrength(value: number | null): void {
    if (value !== null) {
      customGlowStrength.value = Math.max(0, Math.min(100, value))
    } else {
      customGlowStrength.value = null
    }
    persist()
  }

  function setGlassOpacity(value: number | null): void {
    if (value !== null) {
      customGlassOpacity.value = Math.max(0, Math.min(100, value))
    } else {
      customGlassOpacity.value = null
    }
    persist()
  }

  function setBlurStrength(value: number | null): void {
    if (value !== null) {
      customBlurStrength.value = Math.max(0, Math.min(100, value))
    } else {
      customBlurStrength.value = null
    }
    persist()
  }

  function init(): void {
    if (initialized) return
    initialized = true

    // Restore persisted state
    const stored = readStored()
    if (stored) {
      presetId.value = stored.presetId
      mode.value = stored.mode
      customHue.value = stored.customHue
      customSaturation.value = stored.customSaturation
      customBrightness.value = stored.customBrightness
      customGlowStrength.value = stored.customGlowStrength
      customGlassOpacity.value = stored.customGlassOpacity
      customBlurStrength.value = stored.customBlurStrength
    }

    // Listen for system color-scheme changes
    if (typeof window !== 'undefined') {
      systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
      systemQuery.addEventListener('change', handleSystemChange)
    }
  }

  // ── Public API ──
  return {
    // State
    presetId,
    mode,
    customHue,
    customSaturation,
    customBrightness,
    customGlowStrength,
    customGlassOpacity,
    customBlurStrength,
    // Computed
    resolvedMode,
    currentPreset,
    currentModeConfig,
    effectiveHue,
    effectiveSaturation,
    effectiveBrightness,
    effectiveGlowStrength,
    effectiveGlassOpacity,
    effectiveBlurStrength,
    primitiveTokens,
    tokens,
    // Actions
    init,
    setPreset,
    setMode,
    setHue,
    setSaturation,
    setBrightness,
    setGlowStrength,
    setGlassOpacity,
    setBlurStrength,
  }
})
