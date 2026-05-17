import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import type { ScreenEffect, EffectType } from '../effects/types'
import { isMobile, prefersReducedMotion } from '../effects/types'
import { createEffect } from '../effects/EffectFactory'
import { useScreenEffectsStore } from '../store/screen-effects'

const MAX_DT = 50 // cap delta to avoid spiral-of-death after tab switch

export function useScreenEffects(canvasRef: Ref<HTMLCanvasElement | null>) {
  const store = useScreenEffectsStore()
  const registry = new Map<EffectType, ScreenEffect>()
  let animFrameId: number | null = null
  let running = false
  let lastTime = 0
  let width = 0
  let height = 0
  let dpr = 1
  let ctx: CanvasRenderingContext2D | null = null

  // ── Canvas context acquisition ──
  function acquireCtx(): CanvasRenderingContext2D | null {
    const canvas = canvasRef.value
    if (!canvas) return null

    dpr = isMobile() ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight

    if (canvas.width !== w * dpr || canvas.height !== h * dpr || width !== w || height !== h) {
      width = w
      height = h
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      const newCtx = canvas.getContext('2d', { alpha: true })
      if (newCtx) {
        newCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx = newCtx
        // Notify effects of resize
        for (const [, effect] of registry) {
          effect.resize(w, h)
        }
      }
    }

    return ctx
  }

  // ── Sync registry to active effects ──
  function syncRegistry(): void {
    const active = store.activeEffects
    const activeSet = new Set(active)

    // Remove stale effects
    for (const [type, effect] of registry) {
      if (!activeSet.has(type)) {
        effect.dispose()
        registry.delete(type)
      }
    }

    // Add new effects
    for (const type of active) {
      if (!registry.has(type)) {
        const effect = createEffect(type)
        effect.resize(width, height)
        registry.set(type, effect)
      }
    }
  }

  // ── Main render loop ──
  function loop(now: number): void {
    if (!running) return

    animFrameId = requestAnimationFrame(loop)

    const rawDt = now - lastTime
    lastTime = now
    const dt = Math.min(rawDt, MAX_DT)

    // Skip frame if canvas or context not ready
    if (!acquireCtx()) return
    if (!ctx) return

    // Sync effect instances with store state
    syncRegistry()

    // Clear frame
    ctx.clearRect(0, 0, width, height)

    // Render each active effect with live config
    const activeTypes = store.activeEffects
    for (const type of activeTypes) {
      const effect = registry.get(type)
      if (!effect) continue
      const config = store.getEffectConfig(type)
      effect.update(dt, config, width, height)
      effect.render(ctx!, canvasRef.value!)
    }
  }

  // ── Start / Stop ──
  function start(): void {
    if (running) return
    running = true
    lastTime = performance.now()
    // Ensure canvas ctx is acquired before first frame
    acquireCtx()
    syncRegistry()
    animFrameId = requestAnimationFrame(loop)
  }

  function stop(): void {
    running = false
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    for (const [, effect] of registry) {
      effect.dispose()
    }
    registry.clear()
  }

  // ── Reactivity: watch store for active effects changes ──
  // flush: 'post' ensures DOM (canvas) is updated before we check it
  watch(
    () => store.hasActiveEffects,
    (hasActive) => {
      if (hasActive && !running) {
        start()
      } else if (!hasActive && running) {
        stop()
      }
    },
    { immediate: true, flush: 'post' },
  )

  // ── Reduced motion ──
  const motionQuery = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

  function onMotionChange(event: MediaQueryListEvent): void {
    if (event.matches && running) {
      stop()
    } else if (!event.matches && store.hasActiveEffects && !running) {
      start()
    }
  }

  onMounted(() => {
    motionQuery?.addEventListener('change', onMotionChange)
    // On mount, if store already has active effects (restored from localStorage), start
    if (!prefersReducedMotion() && store.hasActiveEffects && !running) {
      start()
    }
  })

  onUnmounted(() => {
    motionQuery?.removeEventListener('change', onMotionChange)
    stop()
  })

  return { start, stop }
}
