import type { ScreenEffect, EffectConfig } from './types'

interface DustParticle {
  x: number
  y: number
  size: number
  speed: number
  wobbleAmp: number
  wobbleFreq: number
  phase: number
  alpha: number
  hue: number
}

export class FloatingDustEffect implements ScreenEffect {
  readonly type = 'floatingDust' as const
  private particles: DustParticle[] = []
  private time = 0
  private width = 0
  private height = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {
    this.width = width
    this.height = height
    this.time += dt

    const countScale = config.count / 100
    const speedScale = config.speed / 100
    const targetCount = Math.floor(50 * countScale + 10)

    while (this.particles.length < targetCount) {
      this.particles.push(this.createParticle())
    }
    while (this.particles.length > targetCount) {
      this.particles.pop()
    }

    const dtSec = dt / 1000

    for (const p of this.particles) {
      const wobble = Math.sin(this.time * 0.001 * p.wobbleFreq + p.phase) * p.wobbleAmp
      p.x += wobble * dtSec * 60 * speedScale
      p.y -= p.speed * dtSec * 60 * speedScale

      if (p.y < -p.size * 2) {
        p.y = height + p.size * 2
        p.x = Math.random() * width
      }
      if (p.x < -p.size * 2) p.x = width + p.size
      if (p.x > width + p.size * 2) p.x = -p.size
    }
  }

  private createParticle(): DustParticle {
    return {
      x: Math.random() * (this.width || 1920),
      y: Math.random() * (this.height || 1080),
      size: 1 + Math.random() * 3,
      speed: 0.1 + Math.random() * 0.4,
      wobbleAmp: 0.2 + Math.random() * 0.8,
      wobbleFreq: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.15 + Math.random() * 0.35,
      hue: 40 + Math.random() * 20, // warm golden
    }
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    for (const p of this.particles) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
      grad.addColorStop(0, `hsla(${p.hue}, 40%, 80%, ${p.alpha})`)
      grad.addColorStop(1, `hsla(${p.hue}, 30%, 70%, 0)`)

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  resize(_width: number, _height: number): void {
    this.width = _width
    this.height = _height
  }

  dispose(): void { this.particles = [] }
}
