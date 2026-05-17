import type { TokenMap } from './types'
import { ALIAS, ALIAS_TO_PRIMITIVE, ALIAS_KEYS } from './registry'
import { computeLegacyTokens } from './legacy'
import { computeDepthTokens } from './depth'
import { computeMaterialTokens } from './material'

/**
 * Derive alias tokens from primitive token values.
 * Each --gc-* alias is set to the value of its corresponding primitive.
 */
export function computeAliases(primitives: TokenMap): TokenMap {
  const aliases: TokenMap = {}

  for (const aliasKey of ALIAS_KEYS) {
    const primitiveKey = ALIAS_TO_PRIMITIVE[aliasKey]
    if (primitiveKey && primitiveKey in primitives) {
      aliases[aliasKey] = primitives[primitiveKey]
    }
  }

  return aliases
}

/**
 * Combine primitives, --gc-* aliases, depth tokens, and legacy token
 * overrides into a single TokenMap applied to :root by the pipeline.
 *
 * Layer order (later wins if duplicate keys exist):
 *   1. primitive tokens (--hue, --background, --primary, ...)
 *   2. --gc-* alias tokens
 *   3. depth tokens (--gc-shadow-*, --gc-blur-*, --gc-surface-*, ...)
 *   4. material tokens (--gc-reflection-intensity, --gc-glass-reflection, ...)
 *   5. legacy tokens (--shell-bg, --text, --border, --shadow, ...)
 */
export function computeAllTokens(primitives: TokenMap): TokenMap {
  return {
    ...primitives,
    ...computeAliases(primitives),
    ...computeDepthTokens(primitives),
    ...computeMaterialTokens(primitives),
    ...computeLegacyTokens(primitives),
  }
}

/**
 * Validate that all alias keys have a corresponding primitive mapping.
 * Returns a list of aliases with missing primitives (empty = valid).
 */
export function validateAliases(): string[] {
  const orphans: string[] = []

  for (const aliasKey of ALIAS_KEYS) {
    const primitiveKey = ALIAS_TO_PRIMITIVE[aliasKey]
    if (!primitiveKey) {
      orphans.push(aliasKey)
    }
  }

  return orphans
}

// ── Compile-time guard: ensure ALIAS_TO_PRIMITIVE covers all ALIAS keys ──
// The registry is the source of truth; this catches drift at startup.
const _aliasCoverage: Record<keyof typeof ALIAS, string> = ALIAS_TO_PRIMITIVE
void _aliasCoverage
