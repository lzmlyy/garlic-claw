/**
 * Reactive bridge between the Material store and the ThemeEngine pipeline.
 *
 * The material store writes user preferences here. The theme pipeline
 * (material.ts) reads from here to compute material tokens.
 *
 * This avoids a circular dependency between Pinia stores and the theme engine.
 * Pattern mirrors shared/atmosphere/samples.ts.
 */
import { ref, readonly, type DeepReadonly } from 'vue'
import type { MaterialRuntimeConfig } from './types'

export const DEFAULT_MATERIAL_CONFIG: MaterialRuntimeConfig = {
  glassOpacity: 40,
  reflectionIntensity: 35,
  blurDensity: 40,
  grainAmount: 25,
  edgeLighting: true,
  noiseEnabled: true,
}

const _config = ref<MaterialRuntimeConfig>({ ...DEFAULT_MATERIAL_CONFIG })

/** Current material runtime configuration (readonly reactive). */
export const materialRuntimeConfig: DeepReadonly<typeof _config> = readonly(_config)

/** Write material config from the material store. */
export function setMaterialRuntimeConfig(partial: Partial<MaterialRuntimeConfig>): void {
  _config.value = { ..._config.value, ...partial }
}

/** Reset to defaults. */
export function resetMaterialRuntimeConfig(): void {
  _config.value = { ...DEFAULT_MATERIAL_CONFIG }
}
