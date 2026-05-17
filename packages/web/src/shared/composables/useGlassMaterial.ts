import { computed, ref, type ComputedRef, type StyleValue } from 'vue'
import { materialRuntimeConfig } from '@/shared/theme/material-config'
import { ALIAS, DEPTH } from '@/shared/theme/registry'

export interface GlassMaterialProps {
  elevation?: 'base' | 'elevated' | 'floating' | 'overlay' | 'glass'
  reflectionIntensity?: number
  edgeLighting?: boolean
  noiseEnabled?: boolean
  hoverable?: boolean
}

export interface GlassMaterialComputed {
  baseTint: ComputedRef<StyleValue>
  backdropBlur: ComputedRef<StyleValue>
  reflection: ComputedRef<StyleValue>
  edgeLighting: ComputedRef<StyleValue>
  noise: ComputedRef<StyleValue>
  shadow: ComputedRef<StyleValue>
  isHovered: ComputedRef<boolean>
  grainDrift: ComputedRef<StyleValue>
  container: ComputedRef<StyleValue>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const ELEVATION_SURFACE: Record<string, string> = {
  base: DEPTH.gcSurfaceBase,
  elevated: DEPTH.gcSurfaceElevated,
  floating: DEPTH.gcSurfaceFloating,
  overlay: DEPTH.gcSurfaceOverlay,
  glass: DEPTH.gcSurfaceGlass,
}

const ELEVATION_SHADOW: Record<string, string> = {
  base: DEPTH.gcShadowXs,
  elevated: DEPTH.gcShadowSm,
  floating: DEPTH.gcShadowLg,
  overlay: DEPTH.gcShadowXs,
  glass: DEPTH.gcShadowMd,
}

/**
 * Composable that computes reactive CSS styles for a 6-layer glass surface.
 *
 * Layers (bottom → top):
 *   1. Shadow separation
 *   2. Base tint (atmosphere color wash)
 *   3. Backdrop blur (single layer — GPU constrained)
 *   4. Noise grain (SVG filter, ultra-fine)
 *   5. Reflection (atmosphere-tinted top sheen, soft-light)
 *   6. Edge lighting (Fresnel, nearly invisible)
 *
 * All defaults are dialled 20% below intuition threshold.
 * Target: Arc / macOS / VisionOS wet-matte material, not web glassmorphism.
 */
export function useGlassMaterial(props?: GlassMaterialProps): GlassMaterialComputed {
  const isHovered = ref(false)
  const elevation = props?.elevation ?? 'floating'

  const surfaceVar = ELEVATION_SURFACE[elevation]
  const shadowVar = ELEVATION_SHADOW[elevation]

  const cfg = computed(() => materialRuntimeConfig.value)

  // ═══ Layer 1: Base Tint — atmosphere color wash ═══
  const baseTint = computed<StyleValue>(() => ({
    position: 'absolute' as const,
    inset: '0',
    borderRadius: 'inherit',
    background: `var(${ALIAS.gcRefractionTint})`,
    mixBlendMode: 'color' as const,
    pointerEvents: 'none' as const,
  }))

  // ═══ Layer 2: Backdrop Blur — single layer, minimal saturation ═══
  const backdropBlur = computed<StyleValue>(() => ({
    position: 'absolute' as const,
    inset: '0',
    borderRadius: 'inherit',
    backdropFilter: `blur(var(${DEPTH.gcBlurStandard})) saturate(1.05)`,
    WebkitBackdropFilter: `blur(var(${DEPTH.gcBlurStandard})) saturate(1.05)`,
    pointerEvents: 'none' as const,
  }))

  // ═══ Layer 3: Noise Grain — SVG filter overlay ═══
  const noiseEnabled = computed(() => props?.noiseEnabled ?? cfg.value.noiseEnabled)

  const noise = computed<StyleValue>(() => {
    if (!noiseEnabled.value) {
      return { display: 'none' }
    }
    return {
      position: 'absolute' as const,
      inset: '0',
      borderRadius: 'inherit',
      filter: `var(${ALIAS.gcGlassNoise})`,
      opacity: `var(${ALIAS.gcGrainOpacity})`,
      mixBlendMode: 'overlay' as const,
      pointerEvents: 'none' as const,
      background: 'transparent',
    }
  })

  // ═══ Layer 4: Reflection — atmosphere-tinted top sheen ═══
  const reflectionIntensity = computed(() => {
    const base = props?.reflectionIntensity ?? cfg.value.reflectionIntensity
    return (base / 100) * 0.75
  })

  const reflection = computed<StyleValue>(() => {
    const hoverBoost = props?.hoverable && isHovered.value ? 1.10 : 1
    const opacity = clamp01(reflectionIntensity.value * hoverBoost)
    return {
      position: 'absolute' as const,
      inset: '0',
      borderRadius: 'inherit',
      background: `var(${DEPTH.gcGlassReflection})`,
      opacity,
      mixBlendMode: 'soft-light' as const,
      pointerEvents: 'none' as const,
      transition: props?.hoverable ? 'opacity 300ms var(--gc-easing-standard)' : undefined,
    }
  })

  // ═══ Layer 5: Edge Lighting — Fresnel, barely visible ═══
  const edgeEnabled = computed(() => props?.edgeLighting ?? cfg.value.edgeLighting)

  const edgeLighting = computed<StyleValue>(() => {
    if (!edgeEnabled.value) {
      return { display: 'none' }
    }
    const hoverBoost = props?.hoverable && isHovered.value ? 1.10 : 1
    return {
      position: 'absolute' as const,
      inset: '0',
      borderRadius: 'inherit',
      background: `var(${ALIAS.gcEdgeLight})`,
      opacity: hoverBoost,
      pointerEvents: 'none' as const,
      transition: props?.hoverable ? 'opacity 300ms var(--gc-easing-standard)' : undefined,
    }
  })

  // ═══ Layer 6: Shadow Separation — elevation-aware depth ═══
  const shadow = computed<StyleValue>(() => {
    const lift = props?.hoverable && isHovered.value
      ? '-1px'
      : '0px'
    const enhance = props?.hoverable && isHovered.value
      ? '1.08'
      : '1'

    return {
      position: 'absolute' as const,
      inset: '0',
      borderRadius: 'inherit',
      boxShadow: `var(${shadowVar})`,
      pointerEvents: 'none' as const,
      transform: `translateY(${lift}) scale(${enhance})`,
      transition: props?.hoverable
        ? 'transform 300ms var(--gc-easing-standard), box-shadow 300ms var(--gc-easing-standard)'
        : undefined,
    }
  })

  // ═══ Grain drift animation — transform only ═══
  const grainDrift = computed<StyleValue>(() => ({
    animation: 'gc-grain-drift 22s ease-in-out infinite',
    willChange: 'transform',
  }))

  // ═══ Container — background + border ═══
  const container = computed<StyleValue>(() => ({
    background: `color-mix(in oklab, var(${surfaceVar}) 62%, transparent)`,
    border: `1px solid var(${ALIAS.gcGlassBorder})`,
  }))

  // ═══ Hover handlers ═══
  function onMouseEnter(): void {
    if (props?.hoverable) isHovered.value = true
  }
  function onMouseLeave(): void {
    if (props?.hoverable) isHovered.value = false
  }

  return {
    baseTint,
    backdropBlur,
    reflection,
    edgeLighting,
    noise,
    shadow,
    isHovered: computed(() => isHovered.value),
    grainDrift,
    container,
    onMouseEnter,
    onMouseLeave,
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
