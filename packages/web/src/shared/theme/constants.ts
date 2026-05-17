import type { ThemePreset } from './types'

export const STORAGE_KEY = 'garlic-claw:appearance'

export const DEFAULT_PRESET_ID = 'moss-cyan'

export const themePresets: ThemePreset[] = [
  {
    id: 'moss-cyan',
    name: 'Moss Cyan',
    hue: 200,
    saturation: 18,
    light: {
      backgroundLightness: 97,
      foregroundLightness: 10,
      cardLightness: 100,
      borderLightness: 88,
      mutedForegroundLightness: 42,
      accentHueShift: -14,
      accentSaturation: 48,
      accentLightness: 42,
      brightness: 50,
    },
    dark: {
      backgroundLightness: 16,
      foregroundLightness: 88,
      cardLightness: 22,
      borderLightness: 28,
      mutedForegroundLightness: 57,
      accentHueShift: -14,
      accentSaturation: 42,
      accentLightness: 62,
      brightness: 50,
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    hue: 255,
    saturation: 20,
    light: {
      backgroundLightness: 97,
      foregroundLightness: 10,
      cardLightness: 100,
      borderLightness: 88,
      mutedForegroundLightness: 42,
      accentHueShift: 10,
      accentSaturation: 55,
      accentLightness: 48,
      brightness: 50,
    },
    dark: {
      backgroundLightness: 16,
      foregroundLightness: 88,
      cardLightness: 22,
      borderLightness: 28,
      mutedForegroundLightness: 58,
      accentHueShift: 10,
      accentSaturation: 48,
      accentLightness: 64,
      brightness: 50,
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    hue: 150,
    saturation: 16,
    light: {
      backgroundLightness: 97,
      foregroundLightness: 10,
      cardLightness: 100,
      borderLightness: 88,
      mutedForegroundLightness: 42,
      accentHueShift: 8,
      accentSaturation: 45,
      accentLightness: 38,
      brightness: 50,
    },
    dark: {
      backgroundLightness: 16,
      foregroundLightness: 88,
      cardLightness: 22,
      borderLightness: 28,
      mutedForegroundLightness: 57,
      accentHueShift: 8,
      accentSaturation: 38,
      accentLightness: 56,
      brightness: 50,
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    hue: 345,
    saturation: 16,
    light: {
      backgroundLightness: 97,
      foregroundLightness: 10,
      cardLightness: 100,
      borderLightness: 88,
      mutedForegroundLightness: 42,
      accentHueShift: 5,
      accentSaturation: 50,
      accentLightness: 46,
      brightness: 50,
    },
    dark: {
      backgroundLightness: 16,
      foregroundLightness: 88,
      cardLightness: 22,
      borderLightness: 28,
      mutedForegroundLightness: 57,
      accentHueShift: 5,
      accentSaturation: 42,
      accentLightness: 60,
      brightness: 50,
    },
  },
]

export const presetMap: Record<string, ThemePreset> = Object.fromEntries(
  themePresets.map((p) => [p.id, p]),
)

export function getPreset(id: string): ThemePreset {
  return presetMap[id] ?? presetMap[DEFAULT_PRESET_ID]
}
