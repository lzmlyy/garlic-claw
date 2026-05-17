import type { ScreenEffect, EffectConfig } from './types'

interface Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  speed: number
  lineWidth: number
}

export class WaterRippleEffect implements ScreenEffect {
  readonly type = 'waterRipple' as const
  private ripples: Ripple[] = []
  private timeSinceLastRipple = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {

    const speedScale = config.speed / 100
    const countScale = config.count / 100
    const intensityScale = config.intensity / 100

    // Auto-generate ripples
    const rippleInterval = 1500 - 1000 * countScale
    this.timeSinceLastRipple += dt

    if (this.timeSinceLastRipple > rippleInterval && this.ripples.length < Math.ceil(8 * countScale + 2)) {
      this.timeSinceLastRipple = 0
      this.ripples.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.6 + height * 0.2,
        radius: 0,
        maxRadius: 40 + Math.random() * 100 * intensityScale,
        alpha: 0.3 + intensityScale * 0.5,
        speed: 0.8 + speedScale * 2,
        lineWidth: 1 + intensityScale * 1.5,
      })
    }

    const dtSec = dt / 1000

    for (const r of this.ripples) {
      r.radius += r.speed * dtSec * 30
      if (r.radius > r.maxRadius * 0.7) {
        r.alpha -= 0.01 * dtSec * 60
      }
    }

    this.ripples = this.ripples.filter((r) => r.alpha > 0 && r.radius < r.maxRadius)
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    for (const r of this.ripples) {
      const progress = r.radius / r.maxRadius
      const alpha = r.alpha * (1 - progress)

      ctx.strokeStyle = `hsla(200, 60%, 70%, ${alpha})`
      ctx.lineWidth = r.lineWidth * (1 - progress * 0.7)
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
      ctx.stroke()

      // Inner echo
      if (r.radius > 15) {
        ctx.strokeStyle = `hsla(200, 50%, 80%, ${alpha * 0.4})`
        ctx.lineWidth = r.lineWidth * 0.5
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.radius * 0.7, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  resize(_width: number, _height: number): void {
    // Canvas size handled by renderer
  }

  dispose(): void { this.ripples = [] }
}
