import type { TokenGroupMap, TokenGroup, TokenGroupId } from './types'
import { ALIAS, DEPTH } from './registry'

// ── Token Group Definitions ──
//
// Groups organise alias tokens by their semantic role.
// Every --gc-* token belongs to exactly one group.
// This structure is used by debug tooling, devtools panels,
// and future group-level theme operations (e.g. "swap surface palette").

export const TOKEN_GROUPS: TokenGroupMap = {
  base: {
    id: 'base',
    label: 'Base',
    keys: [ALIAS.gcHue, ALIAS.gcSaturation, ALIAS.gcLightness],
  },
  surface: {
    id: 'surface',
    label: 'Surface',
    keys: [ALIAS.gcBackground, ALIAS.gcCard, ALIAS.gcMuted],
  },
  text: {
    id: 'text',
    label: 'Text',
    keys: [
      ALIAS.gcForeground,
      ALIAS.gcMutedForeground,
      ALIAS.gcPrimaryForeground,
      ALIAS.gcAccentForeground,
    ],
  },
  interactive: {
    id: 'interactive',
    label: 'Interactive',
    keys: [ALIAS.gcPrimary, ALIAS.gcAccent, ALIAS.gcRing],
  },
  overlay: {
    id: 'overlay',
    label: 'Overlay',
    keys: [ALIAS.gcGlassBg, ALIAS.gcGlassBorder],
  },
  effect: {
    id: 'effect',
    label: 'Effect',
    keys: [ALIAS.gcGlow, ALIAS.gcShadowColor, ALIAS.gcBorder],
  },
  atmosphere: {
    id: 'atmosphere',
    label: 'Atmosphere',
    keys: [
      ALIAS.gcGlowStrength, ALIAS.gcGlassOpacity, ALIAS.gcBlurStrength,
      ALIAS.gcAtmosphere1, ALIAS.gcAtmosphere2, ALIAS.gcAtmosphere3,
      ALIAS.gcSurfaceTint,
    ],
  },
  material: {
    id: 'material',
    label: 'Material',
    keys: [
      ALIAS.gcReflectionIntensity, ALIAS.gcGrainOpacity, ALIAS.gcBlurDensity,
      ALIAS.gcEdgeLight, ALIAS.gcRefractionTint, ALIAS.gcGlassNoise,
      ALIAS.gcGlassReflection,
    ],
  },
  depth: {
    id: 'depth',
    label: 'Depth',
    keys: [
      DEPTH.gcShadowXs, DEPTH.gcShadowSm, DEPTH.gcShadowMd, DEPTH.gcShadowLg, DEPTH.gcShadowXl, DEPTH.gcShadowGlow,
      DEPTH.gcBlurLight, DEPTH.gcBlurStandard, DEPTH.gcBlurDeep,
      DEPTH.gcSurfaceBase, DEPTH.gcSurfaceElevated, DEPTH.gcSurfaceFloating, DEPTH.gcSurfaceOverlay, DEPTH.gcSurfaceGlass,
      DEPTH.gcSurfaceAlphaBase, DEPTH.gcSurfaceAlphaElevated, DEPTH.gcSurfaceAlphaFloating, DEPTH.gcSurfaceAlphaOverlay, DEPTH.gcSurfaceAlphaGlass,
      DEPTH.gcBorderAlphaSubtle, DEPTH.gcBorderAlphaStandard, DEPTH.gcBorderAlphaStrong,
      DEPTH.gcZBase, DEPTH.gcZCard, DEPTH.gcZFloating, DEPTH.gcZDropdown, DEPTH.gcZModal, DEPTH.gcZTooltip,
      DEPTH.gcTransitionFast, DEPTH.gcTransitionNormal, DEPTH.gcTransitionSlow, DEPTH.gcEasingStandard,
      DEPTH.gcHoverLift, DEPTH.gcHoverLiftStrong, DEPTH.gcHoverShadowEnhance,
      DEPTH.gcFocusShadow,
      DEPTH.gcScrollbarThumbBg, DEPTH.gcScrollbarThumbHoverBg,
      DEPTH.gcAmbientLight, DEPTH.gcSurfaceReflection, DEPTH.gcVignette,
      DEPTH.gcInteractiveHoverBg, DEPTH.gcInteractiveActiveBg, DEPTH.gcInteractiveFocusRing, DEPTH.gcInteractiveGlow,
    ],
  },
}

export const GROUP_IDS: readonly TokenGroupId[] = Object.keys(TOKEN_GROUPS) as TokenGroupId[]

export const GROUP_LIST: readonly TokenGroup[] = Object.values(TOKEN_GROUPS)

/** Reverse lookup: token key → group id */
export const TOKEN_TO_GROUP: Record<string, TokenGroupId> = {}
for (const group of GROUP_LIST) {
  for (const key of group.keys) {
    TOKEN_TO_GROUP[key] = group.id
  }
}

export function getGroup(id: TokenGroupId): TokenGroup {
  return TOKEN_GROUPS[id]
}

export function getTokenGroup(key: string): TokenGroupId | undefined {
  return TOKEN_TO_GROUP[key]
}
