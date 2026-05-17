import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MaterialRuntimeConfig } from '@/shared/theme/types'
import {
  DEFAULT_MATERIAL_CONFIG,
  setMaterialRuntimeConfig,
} from '@/shared/theme/material-config'

const STORAGE_KEY = 'garlic-claw:material'

function readStored(): MaterialRuntimeConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      glassOpacity: typeof parsed.glassOpacity === 'number' ? parsed.glassOpacity : DEFAULT_MATERIAL_CONFIG.glassOpacity,
      reflectionIntensity: typeof parsed.reflectionIntensity === 'number' ? parsed.reflectionIntensity : DEFAULT_MATERIAL_CONFIG.reflectionIntensity,
      blurDensity: typeof parsed.blurDensity === 'number' ? parsed.blurDensity : DEFAULT_MATERIAL_CONFIG.blurDensity,
      grainAmount: typeof parsed.grainAmount === 'number' ? parsed.grainAmount : DEFAULT_MATERIAL_CONFIG.grainAmount,
      edgeLighting: typeof parsed.edgeLighting === 'boolean' ? parsed.edgeLighting : DEFAULT_MATERIAL_CONFIG.edgeLighting,
      noiseEnabled: typeof parsed.noiseEnabled === 'boolean' ? parsed.noiseEnabled : DEFAULT_MATERIAL_CONFIG.noiseEnabled,
    }
  } catch {
    return null
  }
}

function writeStored(config: MaterialRuntimeConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Storage full or unavailable
  }
}

export const useMaterialStore = defineStore('material', () => {
  const config = ref<MaterialRuntimeConfig>({ ...DEFAULT_MATERIAL_CONFIG })

  let initialized = false

  function persist(): void {
    writeStored(config.value)
    setMaterialRuntimeConfig(config.value)
  }

  function setConfig(partial: Partial<MaterialRuntimeConfig>): void {
    config.value = { ...config.value, ...partial }
    persist()
  }

  function resetConfig(): void {
    config.value = { ...DEFAULT_MATERIAL_CONFIG }
    persist()
  }

  function init(): void {
    if (initialized) return
    initialized = true

    const stored = readStored()
    if (stored) {
      config.value = stored
    }

    // Push initial config to reactive bridge
    setMaterialRuntimeConfig(config.value)
  }

  return {
    config,
    init,
    setConfig,
    resetConfig,
  }
})
