import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import type { SampledColors, AtmosphereConfig } from '@/shared/atmosphere/types'
import { DEFAULT_ATMOSPHERE_CONFIG } from '@/shared/atmosphere/types'
import { extractColors } from '@/shared/atmosphere/colorExtractor'
import { setAtmosphereSamples } from '@/shared/atmosphere/samples'
import { useWallpaperStore } from './wallpaper'

const STORAGE_KEY = 'garlic-claw:atmosphere'

function readConfig(): AtmosphereConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_ATMOSPHERE_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_ATMOSPHERE_CONFIG }
  } catch {
    return { ...DEFAULT_ATMOSPHERE_CONFIG }
  }
}

function writeConfig(config: AtmosphereConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export const useAtmosphereStore = defineStore('atmosphere', () => {
  // ── State ──
  const samples = ref<SampledColors | null>(null)
  const isSampling = ref(false)
  const lastError = ref<string | null>(null)
  const config = ref<AtmosphereConfig>(readConfig())
  const enabled = ref(true)

  // ── Getters ──
  const hasSamples = computed(() => samples.value !== null)
  const dominantColor = computed(() => samples.value
    ? `oklch(${samples.value.dominantLightness.toFixed(1)}% ${samples.value.dominantSaturation.toFixed(3)} ${samples.value.dominantHue.toFixed(1)})`
    : null)
  const accentColor = computed(() => samples.value
    ? `oklch(${samples.value.accentLightness.toFixed(1)}% ${samples.value.accentSaturation.toFixed(3)} ${samples.value.accentHue.toFixed(1)})`
    : null)

  // ── Actions ──
  async function sampleWallpaper(): Promise<void> {
    const wallpaper = useWallpaperStore()
    if (!wallpaper.isActive || !wallpaper.sourceUrl) {
      clearSamples()
      return
    }

    // Skip sampling for gradients — can't extract from CSS gradients
    if (wallpaper.sourceKind === 'gradient') {
      // For gradients, we could parse the gradient string, but for now skip
      clearSamples()
      return
    }

    if (wallpaper.sourceKind === 'video') {
      // Video sampling not yet supported — skip
      clearSamples()
      return
    }

    isSampling.value = true
    lastError.value = null

    try {
      const result = await extractColors(wallpaper.sourceUrl, wallpaper.sourceKind)
      if (result.samples) {
        samples.value = result.samples
        setAtmosphereSamples(result.samples)
      } else {
        lastError.value = result.error ?? null
        clearSamples()
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : 'Sampling failed'
      clearSamples()
    } finally {
      isSampling.value = false
    }
  }

  function clearSamples(): void {
    samples.value = null
    setAtmosphereSamples(null)
  }

  function setConfig(partial: Partial<AtmosphereConfig>): void {
    config.value = { ...config.value, ...partial }
    writeConfig(config.value)
  }

  function resetConfig(): void {
    config.value = { ...DEFAULT_ATMOSPHERE_CONFIG }
    writeConfig(config.value)
  }

  // ── Init ──
  function init(): void {
    // Sample immediately if wallpaper is active
    sampleWallpaper()

    // Watch for wallpaper changes
    const wallpaper = useWallpaperStore()
    watch(
      () => [wallpaper.sourceUrl, wallpaper.sourceKind] as const,
      () => {
        if (enabled.value) {
          sampleWallpaper()
        }
      },
    )
  }

  return {
    samples,
    isSampling,
    lastError,
    config,
    enabled,
    hasSamples,
    dominantColor,
    accentColor,
    sampleWallpaper,
    clearSamples,
    setConfig,
    resetConfig,
    init,
  }
})
