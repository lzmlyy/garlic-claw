import type { TokenMap } from './types'
import { PRIMITIVE, DEPTH } from './registry'
import { atmosphereSamples } from '@/shared/atmosphere/samples'
import { materialRuntimeConfig } from './material-config'
import type { SampledColors } from '@/shared/atmosphere/types'

/**
 * Compute all material-specific tokens from primitives, atmosphere samples,
 * and material runtime config.
 *
 * Every color value is in oklch(). Zero hardcoded rgba/hex.
 * Reflection is atmosphere-tinted — never pure white.
 * All defaults are dialled below 50% perceived intensity by design.
 */
export function computeMaterialTokens(primitives: TokenMap): TokenMap {
  const p = (key: string): string => primitives[key] ?? ''

  const h = parseFloat(p(PRIMITIVE.hue)) || 200
  const bgL = parseFloat(p(PRIMITIVE.lightness)) || 16
  const isDark = bgL < 50
  const glowRatio = parseFloat(p(PRIMITIVE.glowStrength)) || 0.5
  const glassRatio = parseFloat(p(PRIMITIVE.glassOpacity)) || 0.5

  const samples: SampledColors | null = atmosphereSamples.value
  const cfg = materialRuntimeConfig.value

  // ── Reflection intensity: config drives base, atmosphere glow amplifies ──
  // Range 0.11–0.35 at max config — recalibrated for neutrality
  const reflIntensity = clamp01((cfg.reflectionIntensity / 100) * (0.35 + glowRatio * 0.22))

  // ── Grain opacity: 0.008–0.020 range mapped from grainAmount (0–100) ──
  // Ultra-fine — barely perceptible, never a visible noise pattern
  const grainOp = 0.008 + (cfg.grainAmount / 100) * 0.012

  // ── Blur density: 8px–44px range mapped from blurDensity (0–100) ──
  // Default at 40% → ~22px, subtle not heavy
  const blurPx = 8 + (cfg.blurDensity / 100) * 36

  // ── Atmosphere temperature: determines reflection warm/cool tint ──
  const atmoHue = samples ? samples.accentHue : h
  // Clamp saturation to prevent color pollution from high-sat wallpapers (neon, etc.)
  const rawAtmoSat = samples ? samples.accentSaturation : 0.05
  const atmoSat = Math.min(rawAtmoSat, 0.40)

  // Warm (0–140, 300–360) vs Cool (160–280)
  const isWarmAtmo = atmoHue < 140 || atmoHue > 300

  // Reflection light source: warm atmosphere → warm white, cool → cool white
  // Chroma kept very low so it reads as "tinted white" not "colored glow"
  const reflHue = isWarmAtmo ? 50 : 215
  const reflChroma = isWarmAtmo ? 0.003 : 0.002
  const reflLightness = isDark ? 95 : 98

  // ── Edge light: Fresnel-style top-left highlight ──
  const edgeEnabled = cfg.edgeLighting
  const edgeHue = atmoHue
  const edgeChroma = atmoSat * 0.05
  // Base alpha extremely low — edge light is subconscious, not visible
  const edgeAlphaBase = isDark ? 0.025 : 0.035
  const edgeAlpha = edgeAlphaBase * (0.35 + glowRatio * 0.22)

  // ── Refraction tint: subtle warm/cool color wash ──
  const tintHue = atmoHue
  const tintChroma = atmoSat * 0.02
  // Alpha 0.008–0.018 — barely perceptible color cast
  const tintAlpha = 0.008 + (cfg.glassOpacity / 100) * 0.010

  // ── Glass reflection: atmosphere-tinted top sheen ──
  // Base alpha 0.010–0.045 — subtle, subconscious
  const reflAlpha = 0.015 + reflIntensity * 0.055

  // Wallpaper luminance influences reflection strength
  const wallLum = samples ? samples.averageLuminance : 50
  const wallIsDark = wallLum < 40
  const wallIsLight = wallLum > 65

  // Dark wallpaper → slightly stronger reflection (contrast)
  // Light wallpaper → slightly weaker — narrowed range for stability
  const lumFactor = wallIsDark ? 1.18 : wallIsLight ? 0.80 : 1.0
  const finalReflAlpha = clamp01(reflAlpha * lumFactor)
  const reflFalloff = wallIsDark ? 16 : wallIsLight ? 8 : 12

  const reflColor = `oklch(${reflLightness.toFixed(0)}% ${reflChroma.toFixed(3)} ${reflHue.toFixed(0)} / ${finalReflAlpha.toFixed(4)})`

  return {
    // ═══ Scalars ═══
    [PRIMITIVE.reflectionIntensity]: reflIntensity.toFixed(4),
    [PRIMITIVE.grainOpacity]: grainOp.toFixed(4),
    [PRIMITIVE.blurDensity]: `${blurPx.toFixed(0)}px`,

    // ═══ Edge light: Fresnel gradient at top-left ═══
    [PRIMITIVE.edgeLight]: edgeEnabled
      ? `linear-gradient(135deg, oklch(${reflLightness.toFixed(0)}% ${edgeChroma.toFixed(3)} ${edgeHue.toFixed(0)} / ${edgeAlpha.toFixed(4)}) 0%, transparent 50%)`
      : 'none',

    // ═══ Refraction tint: subtle warm/cool wash ═══
    [PRIMITIVE.refractionTint]: `oklch(50% ${tintChroma.toFixed(3)} ${tintHue.toFixed(0)} / ${tintAlpha.toFixed(4)})`,

    // ═══ Glass noise filter ref ═══
    [PRIMITIVE.glassNoise]: cfg.noiseEnabled ? 'url(#gc-glass-noise)' : 'none',

    // ═══ Glass reflection: atmosphere-tinted, wallpaper-luminance-aware ═══
    [DEPTH.gcGlassReflection]: `linear-gradient(180deg, ${reflColor} 0%, transparent ${reflFalloff.toFixed(0)}px)`,

    // ═══ Blur density: override depth.ts standard blur with material-aware value ═══
    [DEPTH.gcBlurStandard]: `${blurPx.toFixed(0)}px`,
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
