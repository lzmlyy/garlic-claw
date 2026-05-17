// Types
export type {
  ThemeMode,
  ResolvedMode,
  ThemeModeConfig,
  ThemePreset,
  TokenMap,
  AppearanceState,
  TokenGroupId,
  TokenGroup,
  TokenGroupMap,
  TokenDiff,
  ThemeDebugSnapshot,
} from './types'

// Constants & presets
export { STORAGE_KEY, DEFAULT_PRESET_ID, themePresets, presetMap, getPreset } from './constants'

// Registry
export { PRIMITIVE, ALIAS, DEPTH, ALIAS_TO_PRIMITIVE, PRIMITIVE_KEYS, ALIAS_KEYS, DEPTH_KEYS, ALL_TOKEN_KEYS } from './registry'

// Groups
export { TOKEN_GROUPS, GROUP_IDS, GROUP_LIST, TOKEN_TO_GROUP, getGroup, getTokenGroup } from './groups'

// Token computation
export { computePrimitives } from './tokens'
export { computeAliases, computeAllTokens, validateAliases } from './aliases'
export { computeLegacyTokens } from './legacy'
export { computeDepthTokens } from './depth'

// Diff engine
export { computeDiff } from './diff'

// Pipeline
export { scheduleBatch, applySync, resetPipeline } from './pipeline'

// Hydration
export { hydrateTheme } from './hydration'

// Debug (tree-shaken in production)
export { themeDebug } from './debug'
