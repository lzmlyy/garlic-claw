import type { ScreenEffect, EffectConfig } from './types'

interface Star {
  x: number
  y: number
  size: number
  twinkleSpeed: number
  twinklePhase: number
  alpha: number
  hue: number
}

export class StarfieldEffect implements ScreenEffect {
  readonly type = 'starfield' as const
  private stars: Star[] = []
  private time = 0
  private width = 0
  private height = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {
    this.width = width
    this.height = height
    this.time += dt

    const countScale = config.count / 100
    const targetCount = Math.floor(150 * countScale + 20)

    while (this.stars.length < targetCount) {
      this.stars.push(this.createStar())
    }
    while (this.stars.length > targetCount) {
      this.stars.pop()
    }
  }

  private createStar(): Star {
    return {
      x: Math.random() * (this.width || 1920),
      y: Math.random() * (this.height || 1080),
      size: 0.5 + Math.random() * 2.5,
      twinkleSpeed: 0.5 + Math.random() * 3,
      twinklePhase: Math.random() * Math.PI * 2,
      alpha: 0.3 + Math.random() * 0.7,
      hue: Math.random() < 0.1 ? 30 + Math.random() * 20 : 220 + Math.random() * 40, // mostly blue-white, some warm
    }
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    for (const star of this.stars) {
      const twinkle = Math.sin(this.time * 0.002 * star.twinkleSpeed + star.twinklePhase) * 0.4 + 0.6
      const alpha = star.alpha * twinkle

      // Draw starburst for brighter stars
      if (star.size > 1.8 && alpha > 0.6) {
        this.drawStarburst(ctx, star.x, star.y, star.size, alpha, star.hue)
      } else {
        const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 2)
        grad.addColorStop(0, `hsla(${star.hue}, 30%, 90%, ${alpha})`)
        grad.addColorStop(1, `hsla(${star.hue}, 20%, 80%, 0)`)

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawStarburst(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, hue: number): void {
    const spikes = 4
    const outerR = size * 4
    const innerR = size

    ctx.save()
    ctx.fillStyle = `hsla(${hue}, 20%, 90%, ${alpha * 0.15})`
    ctx.beginPath()
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR
      const angle = (Math.PI * 2 * i) / (spikes * 2) - Math.PI / 2
      const sx = x + Math.cos(angle) * r
      const sy = y + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.closePath()
    ctx.fill()

    // Core
    const grad = ctx.createRadialGradient(x, y, 0, x, y, size)
    grad.addColorStop(0, `hsla(${hue}, 10%, 100%, ${alpha})`)
    grad.addColorStop(1, `hsla(${hue}, 20%, 80%, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  resize(_width: number, _height: number): void {
    this.width = _width
    this.height = _height
  }

  dispose(): void { this.stars = [] }
}
