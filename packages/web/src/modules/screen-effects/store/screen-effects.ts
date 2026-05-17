import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { EffectType, EffectStateMap, ScreenEffectsSettings, EffectConfig } from '../effects/types'
import { EFFECT_DEFAULTS, isMobile, prefersReducedMotion } from '../effects/types'

const STORAGE_KEY = 'garlic-claw:screen-effects'

function readStored(): ScreenEffectsSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : false,
      effects: mergeDefaults(parsed.effects ?? {}),
    }
  } catch {
    return null
  }
}

function mergeDefaults(stored: Partial<Record<EffectType, Partial<EffectStateMap[EffectType]>>>): EffectStateMap {
  const result = structuredClone(EFFECT_DEFAULTS)
  for (const key of Object.keys(stored) as EffectType[]) {
    const storedEffect = stored[key]
    if (!storedEffect) continue
    if (typeof storedEffect.enabled === 'boolean') {
      result[key].enabled = storedEffect.enabled
    }
    if (storedEffect.config) {
      if (typeof storedEffect.config.intensity === 'number') {
        result[key].config.intensity = storedEffect.config.intensity
      }
      if (typeof storedEffect.config.count === 'number') {
        result[key].config.count = storedEffect.config.count
      }
      if (typeof storedEffect.config.speed === 'number') {
        result[key].config.speed = storedEffect.config.speed
      }
    }
  }
  return result
}

function writeStored(state: ScreenEffectsSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable
  }
}

export const useScreenEffectsStore = defineStore('screenEffects', () => {
  const masterEnabled = ref<boolean>(false)
  const effects = ref<EffectStateMap>(structuredClone(EFFECT_DEFAULTS))
  const panelOpen = ref(false)

  let initialized = false

  const isMobileDevice = computed(() => isMobile())
  const reducedMotion = computed(() => prefersReducedMotion())

  const activeEffects = computed<EffectType[]>(() => {
    if (!masterEnabled.value) return []
    return (Object.keys(effects.value) as EffectType[]).filter(
      (key) => effects.value[key].enabled,
    )
  })

  const hasActiveEffects = computed(() => activeEffects.value.length > 0)

  function getEffectConfig(type: EffectType): EffectConfig {
    const base = effects.value[type].config
    const scale = isMobileDevice.value ? 0.4 : 1
    const motionScale = reducedMotion.value ? 0.5 : 1
    return {
      intensity: base.intensity * scale * motionScale,
      count: base.count * scale,
      speed: base.speed * motionScale,
    }
  }

  function persist(): void {
    writeStored({
      masterEnabled: masterEnabled.value,
      effects: effects.value,
    })
  }

  function init(): void {
    if (initialized) return
    initialized = true

    const stored = readStored()
    if (stored) {
      masterEnabled.value = stored.masterEnabled
      effects.value = stored.effects
    }
  }

  function toggleMaster(): void {
    masterEnabled.value = !masterEnabled.value
    persist()
  }

  function toggleEffect(type: EffectType): void {
    effects.value[type].enabled = !effects.value[type].enabled
    persist()
  }

  function setEffectConfig(type: EffectType, config: Partial<EffectConfig>): void {
    const current = effects.value[type].config
    if (typeof config.intensity === 'number') {
      current.intensity = Math.max(0, Math.min(100, config.intensity))
    }
    if (typeof config.count === 'number') {
      current.count = Math.max(0, Math.min(100, config.count))
    }
    if (typeof config.speed === 'number') {
      current.speed = Math.max(0, Math.min(100, config.speed))
    }
    persist()
  }

  function togglePanel(): void {
    panelOpen.value = !panelOpen.value
  }

  function openPanel(): void {
    panelOpen.value = true
  }

  function closePanel(): void {
    panelOpen.value = false
  }

  return {
    masterEnabled,
    effects,
    panelOpen,
    isMobileDevice,
    reducedMotion,
    activeEffects,
    hasActiveEffects,
    getEffectConfig,
    init,
    persist,
    toggleMaster,
    toggleEffect,
    setEffectConfig,
    togglePanel,
    openPanel,
    closePanel,
  }
})
