// ── Primitive token keys (internal implementation) ──

export const PRIMITIVE = {
  hue: '--hue',
  saturation: '--saturation',
  lightness: '--lightness',
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  border: '--border',
  ring: '--ring',
  glow: '--glow',
  shadowColor: '--shadow-color',
  glassBg: '--glass-bg',
  glassBorder: '--glass-border',

  // Slider controllers (stored as 0-1 ratio)
  glowStrength: '--glow-strength',
  glassOpacity: '--glass-opacity',
  blurStrength: '--blur-strength',

  // Atmosphere colors (accent-hue ambient layers)
  atmosphere1: '--atmosphere-1',
  atmosphere2: '--atmosphere-2',
  atmosphere3: '--atmosphere-3',

  // Environmental surface tint + backdrop noise
  surfaceTint: '--surface-tint',
  backdropNoise: '--backdrop-noise',

  // Atmosphere glow (wallpaper-sampled focal bloom)
  atmosphereGlow: '--atmosphere-glow',

  // Glass surface reflection (top sheen gradient)
  glassReflection: '--glass-reflection',

  // Material scalars (0-1 or px)
  reflectionIntensity: '--reflection-intensity',
  grainOpacity: '--grain-opacity',
  blurDensity: '--blur-density',

  // Material colors (oklch)
  edgeLight: '--edge-light',
  refractionTint: '--refraction-tint',

  // Material SVG filter ref
  glassNoise: '--glass-noise',
} as const

// ── Alias token keys (public API — what components consume) ──

export const ALIAS = {
  // Base
  gcHue: '--gc-hue',
  gcSaturation: '--gc-saturation',
  gcLightness: '--gc-lightness',
  // Surface
  gcBackground: '--gc-background',
  gcCard: '--gc-card',
  gcMuted: '--gc-muted',
  // Text
  gcForeground: '--gc-foreground',
  gcMutedForeground: '--gc-muted-foreground',
  gcPrimaryForeground: '--gc-primary-foreground',
  gcAccentForeground: '--gc-accent-foreground',
  // Interactive
  gcPrimary: '--gc-primary',
  gcAccent: '--gc-accent',
  gcRing: '--gc-ring',
  // Overlay
  gcGlassBg: '--gc-glass-bg',
  gcGlassBorder: '--gc-glass-border',
  // Effect
  gcGlow: '--gc-glow',
  gcShadowColor: '--gc-shadow-color',
  gcBorder: '--gc-border',

  // Slider controllers
  gcGlowStrength: '--gc-glow-strength',
  gcGlassOpacity: '--gc-glass-opacity',
  gcBlurStrength: '--gc-blur-strength',

  // Atmosphere
  gcAtmosphere1: '--gc-atmosphere-1',
  gcAtmosphere2: '--gc-atmosphere-2',
  gcAtmosphere3: '--gc-atmosphere-3',

  // Environmental
  gcSurfaceTint: '--gc-surface-tint',
  gcBackdropNoise: '--gc-backdrop-noise',

  // Atmosphere glow + glass reflection
  gcAtmosphereGlow: '--gc-atmosphere-glow',
  gcGlassReflection: '--gc-glass-reflection',

  // Material
  gcReflectionIntensity: '--gc-reflection-intensity',
  gcGrainOpacity: '--gc-grain-opacity',
  gcBlurDensity: '--gc-blur-density',
  gcEdgeLight: '--gc-edge-light',
  gcRefractionTint: '--gc-refraction-tint',
  gcGlassNoise: '--gc-glass-noise',

  // Interactive states
  gcInteractiveHoverBg: '--gc-interactive-hover-bg',
  gcInteractiveActiveBg: '--gc-interactive-active-bg',
  gcInteractiveFocusRing: '--gc-interactive-focus-ring',
  gcInteractiveGlow: '--gc-interactive-glow',
} as const

// ── Alias → Primitive mapping ──

export const ALIAS_TO_PRIMITIVE: Record<string, string> = {
  [ALIAS.gcHue]: PRIMITIVE.hue,
  [ALIAS.gcSaturation]: PRIMITIVE.saturation,
  [ALIAS.gcLightness]: PRIMITIVE.lightness,
  [ALIAS.gcBackground]: PRIMITIVE.background,
  [ALIAS.gcCard]: PRIMITIVE.card,
  [ALIAS.gcMuted]: PRIMITIVE.muted,
  [ALIAS.gcForeground]: PRIMITIVE.foreground,
  [ALIAS.gcMutedForeground]: PRIMITIVE.mutedForeground,
  [ALIAS.gcPrimaryForeground]: PRIMITIVE.primaryForeground,
  [ALIAS.gcAccentForeground]: PRIMITIVE.accentForeground,
  [ALIAS.gcPrimary]: PRIMITIVE.primary,
  [ALIAS.gcAccent]: PRIMITIVE.accent,
  [ALIAS.gcRing]: PRIMITIVE.ring,
  [ALIAS.gcGlassBg]: PRIMITIVE.glassBg,
  [ALIAS.gcGlassBorder]: PRIMITIVE.glassBorder,
  [ALIAS.gcGlow]: PRIMITIVE.glow,
  [ALIAS.gcShadowColor]: PRIMITIVE.shadowColor,
  [ALIAS.gcBorder]: PRIMITIVE.border,
  [ALIAS.gcGlowStrength]: PRIMITIVE.glowStrength,
  [ALIAS.gcGlassOpacity]: PRIMITIVE.glassOpacity,
  [ALIAS.gcBlurStrength]: PRIMITIVE.blurStrength,
  [ALIAS.gcAtmosphere1]: PRIMITIVE.atmosphere1,
  [ALIAS.gcAtmosphere2]: PRIMITIVE.atmosphere2,
  [ALIAS.gcAtmosphere3]: PRIMITIVE.atmosphere3,
  [ALIAS.gcSurfaceTint]: PRIMITIVE.surfaceTint,
  [ALIAS.gcBackdropNoise]: PRIMITIVE.backdropNoise,
  [ALIAS.gcAtmosphereGlow]: PRIMITIVE.atmosphereGlow,
  [ALIAS.gcGlassReflection]: PRIMITIVE.glassReflection,
  [ALIAS.gcReflectionIntensity]: PRIMITIVE.reflectionIntensity,
  [ALIAS.gcGrainOpacity]: PRIMITIVE.grainOpacity,
  [ALIAS.gcBlurDensity]: PRIMITIVE.blurDensity,
  [ALIAS.gcEdgeLight]: PRIMITIVE.edgeLight,
  [ALIAS.gcRefractionTint]: PRIMITIVE.refractionTint,
  [ALIAS.gcGlassNoise]: PRIMITIVE.glassNoise,
}

// ── Depth token keys (runtime visual depth system) ──

export const DEPTH = {
  // Shadow scale (6 levels)
  gcShadowXs: '--gc-shadow-xs',
  gcShadowSm: '--gc-shadow-sm',
  gcShadowMd: '--gc-shadow-md',
  gcShadowLg: '--gc-shadow-lg',
  gcShadowXl: '--gc-shadow-xl',
  gcShadowGlow: '--gc-shadow-glow',

  // Glass blur scale (3 levels)
  gcBlurLight: '--gc-blur-light',
  gcBlurStandard: '--gc-blur-standard',
  gcBlurDeep: '--gc-blur-deep',

  // Surface layers (5 levels)
  gcSurfaceBase: '--gc-surface-base',
  gcSurfaceElevated: '--gc-surface-elevated',
  gcSurfaceFloating: '--gc-surface-floating',
  gcSurfaceOverlay: '--gc-surface-overlay',
  gcSurfaceGlass: '--gc-surface-glass',

  // Surface alpha (5 levels)
  gcSurfaceAlphaBase: '--gc-surface-alpha-base',
  gcSurfaceAlphaElevated: '--gc-surface-alpha-elevated',
  gcSurfaceAlphaFloating: '--gc-surface-alpha-floating',
  gcSurfaceAlphaOverlay: '--gc-surface-alpha-overlay',
  gcSurfaceAlphaGlass: '--gc-surface-alpha-glass',

  // Border alpha (3 levels)
  gcBorderAlphaSubtle: '--gc-border-alpha-subtle',
  gcBorderAlphaStandard: '--gc-border-alpha-standard',
  gcBorderAlphaStrong: '--gc-border-alpha-strong',

  // Dynamic border colors (2 levels — "standard" is the ALIAS gcBorder)
  gcBorderSubtle: '--gc-border-subtle',
  gcBorderStrong: '--gc-border-strong',

  // Z-index hierarchy (6 levels)
  gcZBase: '--gc-z-base',
  gcZCard: '--gc-z-card',
  gcZFloating: '--gc-z-floating',
  gcZDropdown: '--gc-z-dropdown',
  gcZModal: '--gc-z-modal',
  gcZTooltip: '--gc-z-tooltip',

  // Unified transitions (3 speeds + 1 easing)
  gcTransitionFast: '--gc-transition-fast',
  gcTransitionNormal: '--gc-transition-normal',
  gcTransitionSlow: '--gc-transition-slow',
  gcEasingStandard: '--gc-easing-standard',

  // Hover depth (3 tokens)
  gcHoverLift: '--gc-hover-lift',
  gcHoverLiftStrong: '--gc-hover-lift-strong',
  gcHoverShadowEnhance: '--gc-hover-shadow-enhance',

  // Input focus depth
  gcFocusShadow: '--gc-focus-shadow',

  // Scrollbar depth
  gcScrollbarThumbBg: '--gc-scrollbar-thumb-bg',
  gcScrollbarThumbHoverBg: '--gc-scrollbar-thumb-hover-bg',

  // Ambient light + spatial depth
  gcAmbientLight: '--gc-ambient-light',
  gcSurfaceReflection: '--gc-surface-reflection',
  gcGlassReflection: '--gc-glass-reflection',
  gcVignette: '--gc-vignette',

  // Interactive states (derived via color-mix from atmosphere + surface)
  gcInteractiveHoverBg: '--gc-interactive-hover-bg',
  gcInteractiveActiveBg: '--gc-interactive-active-bg',
  gcInteractiveFocusRing: '--gc-interactive-focus-ring',
  gcInteractiveGlow: '--gc-interactive-glow',
} as const

// ── All primitive keys as a flat readonly array ──

export const PRIMITIVE_KEYS: readonly string[] = Object.values(PRIMITIVE)

// ── All alias keys as a flat readonly array ──

export const ALIAS_KEYS: readonly string[] = Object.values(ALIAS)

// ── All depth keys as a flat readonly array ──

export const DEPTH_KEYS: readonly string[] = Object.values(DEPTH)

// ── Complete set of all managed token keys ──

export const ALL_TOKEN_KEYS: readonly string[] = [...PRIMITIVE_KEYS, ...ALIAS_KEYS, ...DEPTH_KEYS]
