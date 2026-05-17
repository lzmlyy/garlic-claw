/**
 * Development-only theme debug utilities.
 * All functions are no-ops in production (tree-shaken by bundler).
 */

import type { TokenMap, TokenDiff, ThemeDebugSnapshot, ThemeMode, ResolvedMode } from './types'
import { computeDiff } from './diff'
import { GROUP_LIST } from './groups'

// ── Public API ──

export interface ThemeDebugger {
  /** Log current theme state snapshot */
  snapshot(state: DebugStateInput): ThemeDebugSnapshot
  /** Log token diff between two states */
  logDiff(label: string, prev: TokenMap, next: TokenMap): TokenDiff
  /** Log a group summary (token count per group) */
  logGroups(tokens: TokenMap): void
  /** Log pipeline apply event */
  logApply(tokenCount: number, changedCount: number, removedCount: number): void
}

export interface DebugStateInput {
  presetId: string
  presetName: string
  mode: ThemeMode
  resolvedMode: ResolvedMode
  hue: number
  saturation: number
  tokens: TokenMap
}

function createNoopDebugger(): ThemeDebugger {
  const noop = () => {}
  return {
    snapshot: () => ({ presetId: '', presetName: '', mode: 'system', resolvedMode: 'dark', hue: 0, saturation: 0, tokenCount: 0, timestamp: 0 }),
    logDiff: () => ({ set: {}, remove: [], unchanged: 0 }),
    logGroups: noop,
    logApply: noop,
  }
}

function createDevDebugger(): ThemeDebugger {
  const styles = {
    header: 'color: #67c7cf; font-weight: bold',
    label: 'color: #94a3b8',
    value: 'color: #e2e8f0',
    diff: 'color: #f59e0b',
    group: 'color: #a78bfa',
  }

  function snapshot(state: DebugStateInput): ThemeDebugSnapshot {
    const snap: ThemeDebugSnapshot = {
      presetId: state.presetId,
      presetName: state.presetName,
      mode: state.mode,
      resolvedMode: state.resolvedMode,
      hue: state.hue,
      saturation: state.saturation,
      tokenCount: Object.keys(state.tokens).length,
      timestamp: Date.now(),
    }

    console.groupCollapsed(
      `%c[Theme] %cSnapshot %c@ ${new Date(snap.timestamp).toLocaleTimeString()}`,
      styles.header, styles.label, styles.value,
    )
    console.log('%c  preset:    %c%s', styles.label, styles.value, `${snap.presetName} (${snap.presetId})`)
    console.log('%c  mode:      %c%s %c→ %c%s', styles.label, styles.value, snap.mode, styles.label, styles.value, snap.resolvedMode)
    console.log('%c  hue:       %c%s°', styles.label, styles.value, snap.hue)
    console.log('%c  saturation:%c%s%', styles.label, styles.value, snap.saturation)
    console.log('%c  tokens:    %c%s', styles.label, styles.value, snap.tokenCount)
    console.groupEnd()

    return snap
  }

  function logDiff(label: string, prev: TokenMap, next: TokenMap): TokenDiff {
    const diff = computeDiff(prev, next)
    const changedCount = Object.keys(diff.set).length

    if (changedCount === 0 && diff.remove.length === 0) {
      console.log(
        `%c[Theme] %cDiff "%s" %c— no changes`,
        styles.header, styles.label, label, styles.value,
      )
      return diff
    }

    console.groupCollapsed(
      `%c[Theme] %cDiff "%s" %c— %d changed, %d removed, %d unchanged`,
      styles.header, styles.label, label, styles.diff,
      changedCount, diff.remove.length, diff.unchanged,
    )

    if (changedCount > 0) {
      console.groupCollapsed('%c  changed:', styles.diff)
      for (const [key, value] of Object.entries(diff.set)) {
        const prevVal = prev[key] ?? '(new)'
        console.log(`%c    ${key}: %c${prevVal} %c→ %c${value}`, styles.label, styles.value, styles.diff, styles.value)
      }
      console.groupEnd()
    }

    if (diff.remove.length > 0) {
      console.log('%c  removed: %c%s', styles.diff, styles.value, diff.remove.join(', '))
    }

    console.groupEnd()

    return diff
  }

  function logGroups(tokens: TokenMap): void {
    console.groupCollapsed('%c[Theme] %cToken Groups', styles.header, styles.group)
    for (const group of GROUP_LIST) {
      const count = group.keys.filter((k) => k in tokens).length
      const total = group.keys.length
      console.log(`%c  ${group.label}: %c${count}/${total}`, styles.label, styles.value)
      for (const key of group.keys) {
        const val = tokens[key]
        if (val) {
          console.log(`%c    ${key}: %c${val}`, styles.label, styles.value)
        } else {
          console.log(`%c    ${key}: %c(missing)`, styles.label, 'color: #ef4444')
        }
      }
    }
    console.groupEnd()
  }

  function logApply(tokenCount: number, changedCount: number, removedCount: number): void {
    if (changedCount === 0 && removedCount === 0) return
    console.log(
      `%c[Theme] %cApply %c→ %d total, %d set, %d removed`,
      styles.header, styles.label, styles.value,
      tokenCount, changedCount, removedCount,
    )
  }

  return { snapshot, logDiff, logGroups, logApply }
}

export const themeDebug: ThemeDebugger = import.meta.env.DEV
  ? createDevDebugger()
  : createNoopDebugger()
