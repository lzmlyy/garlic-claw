/**
 * Sampled atmosphere colors extracted from the current wallpaper.
 *
 * All values are in oklch-compatible ranges:
 *   hue 0–360, saturation 0–1, lightness 0–100
 */
export interface SampledColors {
  /** Most frequent color from the wallpaper (oklch-ready) */
  dominantHue: number
  dominantSaturation: number
  dominantLightness: number

  /** Most vibrant/saturated color — used for accent glow */
  accentHue: number
  accentSaturation: number
  accentLightness: number

  /** Average luminance across the entire wallpaper (0–100) */
  averageLuminance: number

  /** Normalized position of the brightest region (0–1) */
  brightSpotX: number
  brightSpotY: number

  /** Normalized position of the darkest region (0–1) */
  darkSpotX: number
  darkSpotY: number

  /** Timestamp of when this sample was taken */
  sampledAt: number
}

/** Atmosphere intensity configuration */
export interface AtmosphereConfig {
  /** Master intensity multiplier (0–1) */
  intensity: number
  /** Glow bloom radius scale (0.5–2) */
  glowScale: number
  /** Vignette strength (0–1) */
  vignetteStrength: number
  /** Noise grain opacity (0–1) */
  noiseStrength: number
  /** Drift animation speed multiplier (0.5–2) */
  driftSpeed: number
}

export const DEFAULT_ATMOSPHERE_CONFIG: AtmosphereConfig = {
  intensity: 0.65,
  glowScale: 1,
  vignetteStrength: 0.5,
  noiseStrength: 0.12,
  driftSpeed: 1,
}

/** Result from the color extractor */
export interface ExtractionResult {
  samples: SampledColors | null
  /** Why extraction failed, if it did */
  error?: string
}
