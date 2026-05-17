import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type WallpaperAdjustments,
  type WallpaperConfig,
  type WallpaperOverlays,
  type WallpaperPreset,
  DEFAULT_WALLPAPER_ADJUSTMENTS,
  DEFAULT_WALLPAPER_CONFIG,
  DEFAULT_WALLPAPER_OVERLAYS,
} from '@/shared/wallpaper/types'
import { wallpaperPresets } from '@/shared/wallpaper/presets'

const STORAGE_KEY = 'garlic-claw:wallpaper'

function readPersisted(): Partial<WallpaperConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<WallpaperConfig>) : null
  } catch {
    return null
  }
}

function writePersisted(config: WallpaperConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export const useWallpaperStore = defineStore('wallpaper', () => {
  const persisted = readPersisted()

  const sourceKind = ref(persisted?.sourceKind ?? DEFAULT_WALLPAPER_CONFIG.sourceKind)
  const sourceUrl = ref(persisted?.sourceUrl ?? DEFAULT_WALLPAPER_CONFIG.sourceUrl)
  const displayMode = ref(persisted?.displayMode ?? DEFAULT_WALLPAPER_CONFIG.displayMode)
  const overlays = ref<WallpaperOverlays>({
    ...DEFAULT_WALLPAPER_OVERLAYS,
    ...persisted?.overlays,
  })
  const adjustments = ref<WallpaperAdjustments>({
    ...DEFAULT_WALLPAPER_ADJUSTMENTS,
    ...persisted?.adjustments,
  })

  const config = computed<WallpaperConfig>(() => ({
    sourceKind: sourceKind.value,
    sourceUrl: sourceUrl.value,
    displayMode: displayMode.value,
    overlays: { ...overlays.value },
    adjustments: { ...adjustments.value },
  }))

  const isActive = computed(() => sourceKind.value !== 'preset' || sourceUrl.value !== '')

  const activePreset = computed<WallpaperPreset | null>(() => {
    if (sourceKind.value !== 'preset') return null
    return wallpaperPresets.find((p) => p.sourceUrl === sourceUrl.value) ?? null
  })

  const presets = wallpaperPresets

  function applyPreset(preset: WallpaperPreset): void {
    if (preset.id === 'none') {
      sourceKind.value = 'preset'
      sourceUrl.value = ''
      persist()
      return
    }
    sourceKind.value = preset.sourceKind
    sourceUrl.value = preset.sourceUrl
    persist()
  }

  function setSourceUrl(url: string, kind: typeof sourceKind.value): void {
    sourceKind.value = kind
    sourceUrl.value = url
    persist()
  }

  function setDisplayMode(mode: typeof displayMode.value): void {
    displayMode.value = mode
    persist()
  }

  function setOverlay(key: keyof WallpaperOverlays, value: boolean): void {
    overlays.value = { ...overlays.value, [key]: value }
    persist()
  }

  function setAdjustment(key: keyof WallpaperAdjustments, value: number): void {
    adjustments.value = { ...adjustments.value, [key]: value }
    persist()
  }

  function resetAdjustments(): void {
    adjustments.value = { ...DEFAULT_WALLPAPER_ADJUSTMENTS }
    persist()
  }

  function resetAll(): void {
    sourceKind.value = DEFAULT_WALLPAPER_CONFIG.sourceKind
    sourceUrl.value = DEFAULT_WALLPAPER_CONFIG.sourceUrl
    displayMode.value = DEFAULT_WALLPAPER_CONFIG.displayMode
    overlays.value = { ...DEFAULT_WALLPAPER_OVERLAYS }
    adjustments.value = { ...DEFAULT_WALLPAPER_ADJUSTMENTS }
    persist()
  }

  function persist(): void {
    writePersisted(config.value)
  }

  return {
    sourceKind,
    sourceUrl,
    displayMode,
    overlays,
    adjustments,
    config,
    isActive,
    activePreset,
    presets,
    applyPreset,
    setSourceUrl,
    setDisplayMode,
    setOverlay,
    setAdjustment,
    resetAdjustments,
    resetAll,
  }
})
