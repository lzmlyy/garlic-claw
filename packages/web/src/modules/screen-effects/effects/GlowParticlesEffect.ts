import type { ScreenEffect, EffectConfig } from './types'

interface GlowParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hue: number
  alpha: number
  alphaDir: number
  pulsePhase: number
  pulseSpeed: number
}

export class GlowParticlesEffect implements ScreenEffect {
  readonly type = 'glowParticles' as const
  private particles: GlowParticle[] = []
  private time = 0
  private width = 0
  private height = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {
    this.width = width
    this.height = height
    this.time += dt

    const countScale = config.count / 100
    const speedScale = config.speed / 100
    const intensityScale = config.intensity / 100
    const targetCount = Math.floor(25 * countScale + 5)

    while (this.particles.length < targetCount) {
      this.particles.push(this.createParticle())
    }
    while (this.particles.length > targetCount) {
      this.particles.pop()
    }

    const dtSec = dt / 1000

    for (const p of this.particles) {
      p.x += p.vx * speedScale * dtSec * 60
      p.y += p.vy * speedScale * dtSec * 60

      // Pulse alpha
      p.pulsePhase += p.pulseSpeed * dtSec * speedScale
      const pulse = Math.sin(p.pulsePhase) * 0.3 + 0.7
      p.alpha = Math.max(0.1, Math.min(1, pulse * intensityScale))

      // Wrap
      if (p.x < -p.size * 2) p.x = width + p.size
      if (p.x > width + p.size * 2) p.x = -p.size
      if (p.y < -p.size * 2) p.y = height + p.size
      if (p.y > height + p.size * 2) p.y = -p.size
    }
  }

  private createParticle(): GlowParticle {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.1 + Math.random() * 0.4
    return {
      x: Math.random() * (this.width || 1920),
      y: Math.random() * (this.height || 1080),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 12,
      hue: 180 + Math.random() * 120, // cyan to purple
      alpha: 0.2 + Math.random() * 0.5,
      alphaDir: 1,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.3 + Math.random() * 0.7,
    }
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    for (const p of this.particles) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
      grad.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${p.alpha})`)
      grad.addColorStop(0.4, `hsla(${p.hue}, 70%, 60%, ${p.alpha * 0.6})`)
      grad.addColorStop(1, `hsla(${p.hue}, 60%, 50%, 0)`)

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  resize(_width: number, _height: number): void {
    this.width = _width
    this.height = _height
  }

  dispose(): void { this.particles = [] }
}
