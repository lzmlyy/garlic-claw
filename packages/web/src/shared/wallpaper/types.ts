export type WallpaperSourceKind = 'image' | 'video' | 'gradient' | 'preset'

export type WallpaperDisplayMode = 'cover' | 'contain' | 'fixed' | 'parallax'

export interface WallpaperAdjustments {
  blur: number           // 0–100 px
  opacity: number        // 0–1
  saturation: number     // 0–200 (100 = normal)
  brightness: number     // 0–200 (100 = normal)
  contrast: number       // 0–200 (100 = normal)
}

export interface WallpaperOverlays {
  blur: boolean
  dim: boolean
  glow: boolean
}

export interface WallpaperConfig {
  sourceKind: WallpaperSourceKind
  sourceUrl: string
  displayMode: WallpaperDisplayMode
  overlays: WallpaperOverlays
  adjustments: WallpaperAdjustments
}

export interface WallpaperPreset {
  id: string
  label: string
  sourceKind: WallpaperSourceKind
  sourceUrl: string
  thumbnail?: string
}

export const DEFAULT_WALLPAPER_ADJUSTMENTS: WallpaperAdjustments = {
  blur: 0,
  opacity: 1,
  saturation: 100,
  brightness: 100,
  contrast: 100,
}

export const DEFAULT_WALLPAPER_OVERLAYS: WallpaperOverlays = {
  blur: false,
  dim: false,
  glow: false,
}

export const DEFAULT_WALLPAPER_CONFIG: WallpaperConfig = {
  sourceKind: 'preset',
  sourceUrl: '',
  displayMode: 'cover',
  overlays: { ...DEFAULT_WALLPAPER_OVERLAYS },
  adjustments: { ...DEFAULT_WALLPAPER_ADJUSTMENTS },
}
