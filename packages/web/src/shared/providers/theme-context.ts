import type { InjectionKey } from 'vue'
import type { ThemePreset, ThemeMode, ResolvedMode, TokenMap, TokenGroupMap } from '@/shared/theme/types'

export interface ThemeContextValue {
  /** Current active preset */
  preset: ThemePreset
  /** All available presets */
  presets: ThemePreset[]
  /** Token groups (surface, text, interactive, overlay, effect) */
  groups: TokenGroupMap
  /** User-selected mode (light | dark | system) */
  mode: ThemeMode
  /** Resolved effective mode (light | dark) */
  resolvedMode: ResolvedMode
  /** Effective base hue (0-360) */
  hue: number
  /** Effective base saturation (0-100) */
  saturation: number
  /** Full token map (primitives + --gc-* aliases) */
  tokens: TokenMap
  /** Switch to a named preset */
  setPreset: (id: string) => void
  /** Set user mode */
  setMode: (mode: ThemeMode) => void
  /** Override hue (null = use preset default) */
  setHue: (hue: number | null) => void
  /** Override saturation (null = use preset default) */
  setSaturation: (saturation: number | null) => void
}

export const THEME_CONTEXT_KEY: InjectionKey<ThemeContextValue> = Symbol('theme-context')
