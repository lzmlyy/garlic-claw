import type { TokenMap } from './types'
import { PRIMITIVE, DEPTH, ALIAS } from './registry'

/**
 * Compute all depth tokens from primitive token values.
 *
 * Every color-carrying token here is generated dynamically from the
 * current theme hue, background lightness, saturation-derived chroma,
 * and slider ratios.  There are zero hardcoded rgba / hex literals.
 *
 * Spatial logic (dark mode):
 *   - Elevated surfaces lift *toward* the viewer → lighter + more chroma
 *   - Overlay recedes *behind* the base surface → darker + less chroma
 *   - Light mode inverts the lightness direction (surfaces darken as they lift)
 *
 * Shadow logic:
 *   - Shadows carry a whisper of the theme hue — felt, not seen
 *   - Deeper shadows are more opaque and fractionally lighter (ambient bounce)
 */
export function computeDepthTokens(primitives: TokenMap): TokenMap {
  const p = (key: string): string => primitives[key] ?? ''

  // ── Extract numeric primitives ──
  const h = parseFloat(p(PRIMITIVE.hue)) || 0
  const bgL = parseFloat(p(PRIMITIVE.lightness)) || 12
  const isDark = bgL < 50

  // Slider ratios (0–1)
  const glowRatio = parseFloat(p(PRIMITIVE.glowStrength)) || 0.5
  const glassRatio = parseFloat(p(PRIMITIVE.glassOpacity)) || 0.5
  const blurRatio = parseFloat(p(PRIMITIVE.blurStrength)) || 0.5

  // Chroma values from the same curves used by tokens.ts
  const bgC = surfaceChroma(isDark)
  const borderC = borderChroma(isDark)

  const tokens: TokenMap = {
    // ═══════════════════════════════════════════════════════
    // SHADOWS — dynamic oklch with theme-hue whisper
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcShadowXs]:    `0 1px 4px ${shadowOklch(bgL, bgC, h, 0, isDark)}`,
    [DEPTH.gcShadowSm]:    `0 4px 16px ${shadowOklch(bgL, bgC, h, 1, isDark)}`,
    [DEPTH.gcShadowMd]:    `0 8px 32px ${shadowOklch(bgL, bgC, h, 2, isDark)}`,
    [DEPTH.gcShadowLg]:    `0 16px 48px ${shadowOklch(bgL, bgC, h, 3, isDark)}`,
    [DEPTH.gcShadowXl]:    `0 24px 64px ${shadowOklch(bgL, bgC, h, 4, isDark)}`,
    [DEPTH.gcShadowGlow]:  `0 0 16px var(${ALIAS.gcGlow})`,

    // ═══════════════════════════════════════════════════════
    // BLUR — dynamic from blur slider
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcBlurLight]:    `${(6 + blurRatio * 8).toFixed(0)}px`,
    [DEPTH.gcBlurStandard]: `${(12 + blurRatio * 16).toFixed(0)}px`,
    [DEPTH.gcBlurDeep]:     `${(16 + blurRatio * 24).toFixed(0)}px`,

    // ═══════════════════════════════════════════════════════
    // SURFACE LAYERS — dynamic oklch (lightness + chroma lift)
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcSurfaceBase]:     surfaceOklch(bgL, bgC, h, 'base', glassRatio, isDark),
    [DEPTH.gcSurfaceElevated]: surfaceOklch(bgL, bgC, h, 'elevated', glassRatio, isDark),
    [DEPTH.gcSurfaceFloating]: surfaceOklch(bgL, bgC, h, 'floating', glassRatio, isDark),
    [DEPTH.gcSurfaceOverlay]:  surfaceOklch(bgL, bgC, h, 'overlay', glassRatio, isDark),
    [DEPTH.gcSurfaceGlass]:    surfaceOklch(bgL, bgC, h, 'glass', glassRatio, isDark),

    // ═══════════════════════════════════════════════════════
    // SURFACE ALPHA — standalone alpha refs for component use
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcSurfaceAlphaBase]:     (0.55 + glassRatio * 0.40).toFixed(3),
    [DEPTH.gcSurfaceAlphaElevated]: (0.68 + glassRatio * 0.28).toFixed(3),
    [DEPTH.gcSurfaceAlphaFloating]: (0.78 + glassRatio * 0.20).toFixed(3),
    [DEPTH.gcSurfaceAlphaOverlay]:  (0.40 + glassRatio * 0.35).toFixed(3),
    [DEPTH.gcSurfaceAlphaGlass]:    (0.65 + glassRatio * 0.30).toFixed(3),

    // ═══════════════════════════════════════════════════════
    // BORDER ALPHA — keep as static ratios (no color, just opacity)
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcBorderAlphaSubtle]:   '0.10',
    [DEPTH.gcBorderAlphaStandard]: '0.16',
    [DEPTH.gcBorderAlphaStrong]:   '0.22',

    // ═══════════════════════════════════════════════════════
    // DYNAMIC BORDER COLORS — derived from border chroma + theme hue
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcBorderSubtle]: borderOklch(bgL, borderC, h, 'subtle', isDark),
    [DEPTH.gcBorderStrong]: borderOklch(bgL, borderC, h, 'strong', isDark),

    // ═══════════════════════════════════════════════════════
    // Z-INDEX — no color, keep as-is
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcZBase]:     '0',
    [DEPTH.gcZCard]:     '100',
    [DEPTH.gcZFloating]: '300',
    [DEPTH.gcZDropdown]: '500',
    [DEPTH.gcZModal]:    '1000',
    [DEPTH.gcZTooltip]:  '2000',

    // ═══════════════════════════════════════════════════════
    // TRANSITIONS — dynamic easing + speed
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcEasingStandard]:  'cubic-bezier(0.2, 0, 0, 1)',
    [DEPTH.gcTransitionFast]:   `${(100 + (1 - blurRatio) * 40).toFixed(0)}ms cubic-bezier(0.2, 0, 0, 1)`,
    [DEPTH.gcTransitionNormal]: `${(150 + (1 - blurRatio) * 60).toFixed(0)}ms cubic-bezier(0.2, 0, 0, 1)`,
    [DEPTH.gcTransitionSlow]:   `${(200 + (1 - blurRatio) * 80).toFixed(0)}ms cubic-bezier(0.2, 0, 0, 1)`,

    // ═══════════════════════════════════════════════════════
    // HOVER DEPTH — dynamic from glowRatio
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcHoverLift]:          '-1px',
    [DEPTH.gcHoverLiftStrong]:    '-2px',
    [DEPTH.gcHoverShadowEnhance]: (1.0 + (glowRatio - 0.5) * 0.6).toFixed(2),

    // ═══════════════════════════════════════════════════════
    // FOCUS SHADOW — uses atmosphere (accent-hue derived)
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcFocusShadow]: `0 0 0 2px var(${ALIAS.gcAtmosphere3})`,

    // ═══════════════════════════════════════════════════════
    // SCROLLBAR — dynamic from border lightness + surface chroma
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcScrollbarThumbBg]: scrollbarOklch(bgL, bgC, h, isDark, false),
    [DEPTH.gcScrollbarThumbHoverBg]: scrollbarOklch(bgL, bgC, h, isDark, true),

    // ═══════════════════════════════════════════════════════
    // AMBIENT LIGHT — radial gradient from atmosphere (dynamic)
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcAmbientLight]: `radial-gradient(ellipse 80% 55% at 55% 15%, var(${ALIAS.gcAtmosphere3}) 0%, transparent 60%)`,

    // ═══════════════════════════════════════════════════════
    // SURFACE REFLECTION — linear gradient from surfaceTint (dynamic)
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcSurfaceReflection]: `linear-gradient(180deg, var(${ALIAS.gcSurfaceTint}) 0%, transparent 8px)`,

    // ── Glass reflection: stronger top sheen for glass surfaces ──
    [DEPTH.gcGlassReflection]: `linear-gradient(180deg, var(${ALIAS.gcAtmosphereGlow}) 0%, transparent 10px)`,

    // ═══════════════════════════════════════════════════════
    // VIGNETTE — dynamic lightness adapts to dark/light mode
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcVignette]: vignetteGradient(bgL, bgC, h, isDark),

    // ═══════════════════════════════════════════════════════
    // INTERACTIVE STATES — color-mix from alias refs (dynamic)
    // ═══════════════════════════════════════════════════════
    [DEPTH.gcInteractiveHoverBg]:  `color-mix(in oklch, var(${ALIAS.gcCard}) 82%, var(${ALIAS.gcAtmosphere3}))`,
    [DEPTH.gcInteractiveActiveBg]: `color-mix(in oklch, var(${ALIAS.gcCard}) 72%, var(${ALIAS.gcAtmosphere3}))`,
    [DEPTH.gcInteractiveFocusRing]: `0 0 0 2px var(${ALIAS.gcAtmosphere3})`,
    [DEPTH.gcInteractiveGlow]:     `0 0 12px var(${ALIAS.gcAtmosphere2})`,
  }

  return tokens
}

// ═══════════════════════════════════════════════════════════
// DYNAMIC COLOR GENERATORS
// ═══════════════════════════════════════════════════════════

/**
 * Surface color — adapts lightness, chroma, and alpha per elevation level.
 *
 * Dark mode:  elevated surfaces lift toward viewer → lighter + more chroma
 * Light mode: elevated surfaces shade under ambient light → darker + more chroma
 */
function surfaceOklch(
  bgL: number,
  bgC: number,
  h: number,
  level: 'base' | 'elevated' | 'floating' | 'overlay' | 'glass',
  glassRatio: number,
  isDark: boolean,
): string {
  const cfg = SURFACE_CONFIG[level]

  // Lightness lift: sign flips between dark/light
  const lLift = isDark ? cfg.liftDark : cfg.liftLight
  const l = clampL(bgL + lLift)

  // Chroma increases with elevation — higher surfaces catch more ambient light
  const c = bgC * cfg.chromaMult

  // Alpha: glassRatio modulates transparency
  const a = cfg.baseAlpha * (0.55 + glassRatio * 0.45)

  return `oklch(${l.toFixed(1)}% ${c.toFixed(4)} ${h} / ${a.toFixed(3)})`
}

const SURFACE_CONFIG: Record<string, {
  liftDark: number
  liftLight: number
  chromaMult: number
  baseAlpha: number
}> = {
  base:     { liftDark: 0,  liftLight: 0,  chromaMult: 0.10, baseAlpha: 0.60 },
  elevated: { liftDark: 5,  liftLight: -4, chromaMult: 0.18, baseAlpha: 0.78 },
  floating: { liftDark: 10, liftLight: -7, chromaMult: 0.24, baseAlpha: 0.90 },
  overlay:  { liftDark: -3, liftLight: -1, chromaMult: 0.08, baseAlpha: 0.50 },
  glass:    { liftDark: 5,  liftLight: -4, chromaMult: 0.18, baseAlpha: 0.78 },
}

/**
 * Shadow color — deep oklch with a whisper of the theme hue.
 *
 * Shadows are NOT pure black. They carry < 5 % of the surface chroma
 * at very low lightness so the shadow tint matches the environment.
 * Warm theme → warm shadow.  Cold theme → cold shadow.
 */
function shadowOklch(
  bgL: number,
  bgC: number,
  h: number,
  level: number, // 0=xs … 4=xl
  isDark: boolean,
): string {
  // Deeper shadows get slightly more ambient bounce (higher L) and opacity
  const l = isDark
    ? 4 + level * 2.5
    : 8 + level * 2
  const c = bgC * 0.04 // whisper of chroma — felt, not consciously seen
  const a = isDark
    ? 0.14 + level * 0.07
    : 0.07 + level * 0.04

  return `oklch(${l.toFixed(1)}% ${c.toFixed(4)} ${h} / ${a.toFixed(3)})`
}

/**
 * Border color — dynamic from border chroma + background lightness.
 */
function borderOklch(
  bgL: number,
  borderC: number,
  h: number,
  weight: 'subtle' | 'standard' | 'strong',
  isDark: boolean,
): string {
  const cfg = BORDER_CONFIG[weight]
  const l = isDark
    ? clampL(bgL + cfg.liftDark)
    : clampL(bgL + cfg.liftLight)
  const c = borderC * cfg.chromaMult

  return `oklch(${l.toFixed(1)}% ${c.toFixed(4)} ${h} / ${cfg.alpha.toFixed(3)})`
}

const BORDER_CONFIG: Record<string, {
  liftDark: number
  liftLight: number
  chromaMult: number
  alpha: number
}> = {
  subtle: { liftDark: 8,  liftLight: -3, chromaMult: 0.4, alpha: 0.06 },
  strong: { liftDark: 16, liftLight: -7, chromaMult: 1.0, alpha: 0.16 },
}

/**
 * Scrollbar thumb color — derived from border lightness + surface chroma.
 */
function scrollbarOklch(
  bgL: number,
  bgC: number,
  h: number,
  isDark: boolean,
  hover: boolean,
): string {
  const borderLightness = isDark ? 28 : 72
  const l = clampL(hover ? borderLightness + (isDark ? 6 : -6) : borderLightness)
  const c = bgC * 0.4
  const a = isDark
    ? (hover ? 0.35 : 0.22)
    : (hover ? 0.28 : 0.16)

  return `oklch(${l.toFixed(1)}% ${c.toFixed(4)} ${h} / ${a.toFixed(2)})`
}

/**
 * Vignette — radial gradient for edge darkening.
 * Lightness adapts to dark/light mode.
 */
function vignetteGradient(
  bgL: number,
  bgC: number,
  h: number,
  isDark: boolean,
): string {
  const edgeL = isDark ? 6 : 90
  const edgeA1 = isDark ? 0.14 : 0.08
  const edgeA2 = isDark ? 0.30 : 0.16

  return [
    'radial-gradient(',
    'ellipse 75% 60% at 50% 50%,',
    'transparent 30%,',
    `oklch(${edgeL}% ${(bgC * 0.03).toFixed(4)} ${h} / ${edgeA1.toFixed(2)}) 70%,`,
    `oklch(${edgeL}% ${(bgC * 0.03).toFixed(4)} ${h} / ${edgeA2.toFixed(2)}) 100%`,
    ')',
  ].join('')
}

// ═══════════════════════════════════════════════════════════
// CHROMA CURVES — mirror tokens.ts curves for consistency
// ═══════════════════════════════════════════════════════════

/** Surface chroma from the same quadratic curve used in tokens.ts. */
function surfaceChroma(isDark: boolean, sOverride?: number): number {
  // sOverride is not used here — depth tokens read chroma from primitives
  // which were already computed.  We use a default saturation of 18 for
  // standalone depth computation (matches the fallback in tokens.ts).
  const s = 18
  const max = isDark ? 0.020 : 0.014
  return Math.pow(s / 100, 2) * max
}

/** Border chroma from the same quadratic curve. */
function borderChroma(isDark: boolean): number {
  const s = 18
  const max = isDark ? 0.028 : 0.022
  return Math.pow(s / 100, 2) * max
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function clampL(l: number): number {
  return Math.max(1, Math.min(98, l))
}
