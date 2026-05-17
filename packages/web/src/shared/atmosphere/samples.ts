/**
 * Reactive bridge between the Atmosphere store and the ThemeEngine pipeline.
 *
 * The atmosphere store writes wallpaper-sampled colors here after extraction.
 * The theme pipeline (tokens.ts) reads from here to override atmosphere tokens
 * when wallpaper sampling is active.
 *
 * This avoids a circular dependency between Pinia stores and the theme engine.
 */
import { ref, readonly, type DeepReadonly } from 'vue'
import type { SampledColors } from './types'

const _samples = ref<SampledColors | null>(null)

/** Current wallpaper-sampled atmosphere colors (readonly). */
export const atmosphereSamples: DeepReadonly<ReturnType<typeof ref<SampledColors | null>>> = readonly(_samples)

/** Write sampled colors from the atmosphere store. */
export function setAtmosphereSamples(samples: SampledColors | null): void {
  _samples.value = samples
}
