import type { ThemeMode } from './types'
import { STORAGE_KEY, DEFAULT_PRESET_ID, getPreset } from './constants'
import { computePrimitives } from './tokens'
import { computeAllTokens } from './aliases'
import { applySync, resetPipeline } from './pipeline'

const OLD_STORAGE_KEY = 'garlic-claw:theme'

/**
 * Restore theme state from localStorage and apply tokens to :root
 * BEFORE Vue mounts. Call this synchronously in main.ts before createApp().
 *
 * This eliminates FOUC (Flash Of Unstyled Content) by ensuring
 * CSS custom properties are present on :root when the first paint occurs.
 */
export function hydrateTheme(): void {
  if (typeof window === 'undefined') return

  // Reset pipeline state so prevTokens doesn't carry stale values
  resetPipeline()

  // 1. Migrate old storage key → new key (one-time)
  migrateOldKey()

  // 2. Restore persisted state
  const stored = readHydrationState()

  // 3. Resolve effective mode
  const resolvedMode = resolveMode(stored.mode)

  // 4. Set html class immediately (existing CSS depends on this)
  applyHTMLClass(resolvedMode)

  // 5. Get preset and compute tokens
  const preset = getPreset(stored.presetId)
  const modeConfig = resolvedMode === 'light' ? preset.light : preset.dark

  const overrides = {
    hue: stored.customHue ?? undefined,
    saturation: stored.customSaturation ?? undefined,
    brightness: stored.customBrightness ?? undefined,
    glowStrength: stored.customGlowStrength !== null ? stored.customGlowStrength / 100 : undefined,
    glassOpacity: stored.customGlassOpacity !== null ? stored.customGlassOpacity / 100 : undefined,
    blurStrength: stored.customBlurStrength !== null ? stored.customBlurStrength / 100 : undefined,
  }

  const primitives = computePrimitives(preset, modeConfig, overrides)
  const allTokens = computeAllTokens(primitives)

  // 6. Apply tokens to :root synchronously
  applySync(allTokens)
}

/** One-time: if old garlic-claw:theme key exists but new key doesn't, migrate it. */
function migrateOldKey(): void {
  try {
    const oldRaw = window.localStorage.getItem(OLD_STORAGE_KEY)
    if (!oldRaw) return

    const newRaw = window.localStorage.getItem(STORAGE_KEY)
    if (newRaw) return // New key already exists — skip migration

    // Parse old format: stored as "dark", "light", or "system"
    let mode: ThemeMode = 'system'
    if (oldRaw === '"dark"' || oldRaw === '"light"' || oldRaw === '"system"') {
      mode = JSON.parse(oldRaw)
    } else if (oldRaw === 'dark' || oldRaw === 'light' || oldRaw === 'system') {
      mode = oldRaw as ThemeMode
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        presetId: DEFAULT_PRESET_ID,
        mode,
        customHue: null,
        customSaturation: null,
      }),
    )

    // Remove old key after successful migration
    window.localStorage.removeItem(OLD_STORAGE_KEY)
  } catch {
    // Corrupted storage — fall through to defaults
  }
}

// ── Internal helpers ──

function readHydrationState(): {
  presetId: string
  mode: ThemeMode
  customHue: number | null
  customSaturation: number | null
  customBrightness: number | null
  customGlowStrength: number | null
  customGlassOpacity: number | null
  customBlurStrength: number | null
} {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
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
      }
    }
  } catch {
    // Corrupted storage — use defaults
  }

  return {
    presetId: DEFAULT_PRESET_ID,
    mode: 'system',
    customHue: null,
    customSaturation: null,
    customBrightness: null,
    customGlowStrength: null,
    customGlassOpacity: null,
    customBlurStrength: null,
  }
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function applyHTMLClass(resolvedMode: 'light' | 'dark'): void {
  const root = document.documentElement
  if (resolvedMode === 'dark') {
    root.classList.remove('light')
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
    root.classList.add('light')
  }
}
