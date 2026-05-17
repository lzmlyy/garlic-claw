import type { TokenMap, TokenDiff } from './types'
import { computeDiff } from './diff'

// ── Pipeline State ──

let prevTokens: TokenMap = {}
let pendingTokens: TokenMap | null = null
let rafId: number | null = null

/**
 * Batch-schedule a token update via requestAnimationFrame.
 * Multiple calls within the same frame are coalesced — only the
 * most recent token map is applied. This avoids repeated
 * setProperty calls causing layout/reflow thrashing.
 *
 * Use this for reactive (post-mount) updates.
 */
export function scheduleBatch(tokens: TokenMap): void {
  pendingTokens = tokens

  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      rafId = null
      const final = pendingTokens
      pendingTokens = null
      if (final) {
        flush(final)
      }
    })
  }
}

/**
 * Synchronously apply tokens to :root. Only changed properties
 * are written — unchanged values are skipped entirely.
 *
 * Use this for pre-mount hydration where rAF is not appropriate.
 */
export function applySync(tokens: TokenMap): void {
  if (typeof document === 'undefined') return

  const diff = computeDiff(prevTokens, tokens)
  if (diff.set && Object.keys(diff.set).length === 0 && diff.remove.length === 0) {
    return
  }

  applyDiff(diff)
  prevTokens = { ...tokens }
}

// ── Internal ──

function flush(tokens: TokenMap): void {
  if (typeof document === 'undefined') return

  const diff = computeDiff(prevTokens, tokens)
  if (Object.keys(diff.set).length === 0 && diff.remove.length === 0) {
    return
  }

  applyDiff(diff)
  prevTokens = { ...tokens }
}

function applyDiff(diff: TokenDiff): void {
  const root = document.documentElement

  for (const key of diff.remove) {
    root.style.removeProperty(key)
  }

  for (const [key, value] of Object.entries(diff.set)) {
    root.style.setProperty(key, value)
  }
}

// ── Reset (for testing / hot-reload) ──

export function resetPipeline(): void {
  prevTokens = {}
  pendingTokens = null
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}
