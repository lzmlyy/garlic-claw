export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedMode = 'light' | 'dark'

export interface ThemeModeConfig {
  backgroundLightness: number
  foregroundLightness: number
  cardLightness: number
  borderLightness: number
  mutedForegroundLightness: number
  accentHueShift: number
  accentSaturation: number
  accentLightness: number
  brightness: number
}

export interface ThemePreset {
  id: string
  name: string
  hue: number
  saturation: number
  light: ThemeModeConfig
  dark: ThemeModeConfig
}

/** Flat map of CSS custom property key → computed value */
export type TokenMap = Record<string, string>

/** Persisted appearance shape */
export interface AppearanceState {
  presetId: string
  mode: ThemeMode
  customHue: number | null
  customSaturation: number | null
  customBrightness: number | null
  customGlowStrength: number | null
  customGlassOpacity: number | null
  customBlurStrength: number | null
}

// ── Token Groups ──

export type TokenGroupId = 'base' | 'surface' | 'text' | 'interactive' | 'overlay' | 'effect' | 'depth' | 'atmosphere' | 'material'

export interface TokenGroup {
  id: TokenGroupId
  label: string
  keys: readonly string[]
}

export type TokenGroupMap = Record<TokenGroupId, TokenGroup>

// ── Diff ──

export interface TokenDiff {
  /** Tokens to set or update (key → new value) */
  set: TokenMap
  /** Token keys to remove from :root */
  remove: string[]
  /** Count of tokens that did not change */
  unchanged: number
}

// ── Pipeline ──

export type PipelineFlushMode = 'sync' | 'raf'

// ── Hydration ──

export interface HydrationState {
  presetId: string
  mode: ThemeMode
  customHue: number | null
  customSaturation: number | null
  customBrightness: number | null
  customGlowStrength: number | null
  customGlassOpacity: number | null
  customBlurStrength: number | null
}

// ── Material ──

export interface MaterialRuntimeConfig {
  glassOpacity: number
  reflectionIntensity: number
  blurDensity: number
  grainAmount: number
  edgeLighting: boolean
  noiseEnabled: boolean
}

// ── Debug ──

export interface ThemeDebugSnapshot {
  presetId: string
  presetName: string
  mode: ThemeMode
  resolvedMode: ResolvedMode
  hue: number
  saturation: number
  tokenCount: number
  lastDiff?: TokenDiff
  timestamp: number
}
