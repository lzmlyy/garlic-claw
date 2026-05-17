import type { TokenMap, TokenDiff } from './types'

/** Empty diff singleton — reused to avoid allocations on identical renders */
const EMPTY_DIFF: TokenDiff = { set: {}, remove: [], unchanged: 0 }

/**
 * Compute the minimal set of changes between two token maps.
 * Returns { set, remove, unchanged } — only changed/new/removed tokens
 * are included; identical values are excluded entirely.
 */
export function computeDiff(prev: TokenMap, next: TokenMap): TokenDiff {
  // Fast path: no previous state → all tokens are new
  if (Object.keys(prev).length === 0) {
    return {
      set: { ...next },
      remove: [],
      unchanged: 0,
    }
  }

  // Fast path: same reference → nothing changed
  if (prev === next) {
    return EMPTY_DIFF
  }

  const set: TokenMap = {}
  let setCount = 0

  // Find tokens that changed or are new
  for (const key of Object.keys(next)) {
    const nextVal = next[key]
    if (prev[key] !== nextVal) {
      set[key] = nextVal
      setCount++
    }
  }

  // Find tokens that were removed
  const remove: string[] = []
  for (const key of Object.keys(prev)) {
    if (!(key in next)) {
      remove.push(key)
    }
  }

  // Fast path: nothing meaningful changed
  if (setCount === 0 && remove.length === 0) {
    return EMPTY_DIFF
  }

  const unchanged = Object.keys(next).length - setCount

  return { set, remove, unchanged }
}
