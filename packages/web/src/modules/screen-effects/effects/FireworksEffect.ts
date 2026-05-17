import type { ScreenEffect, EffectConfig } from './types'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  hue: number
  size: number
  decay: number
}

interface Rocket {
  x: number
  y: number
  targetY: number
  speed: number
  hue: number
  trail: Array<{ x: number; y: number; alpha: number }>
  exploded: boolean
}

export class FireworksEffect implements ScreenEffect {
  readonly type = 'fireworks' as const
  private particles: Particle[] = []
  private rockets: Rocket[] = []
  private timeSinceLastLaunch = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {

    const speedScale = config.speed / 100
    const intensityScale = config.intensity / 100

    // Launch rockets
    const launchInterval = 2000 - 1500 * speedScale * intensityScale
    this.timeSinceLastLaunch += dt

    if (this.timeSinceLastLaunch > launchInterval && this.rockets.length < Math.ceil(3 * intensityScale)) {
      this.timeSinceLastLaunch = 0
      this.rockets.push({
        x: Math.random() * width * 0.8 + width * 0.1,
        y: height,
        targetY: height * 0.1 + Math.random() * height * 0.4,
        speed: 4 + Math.random() * 4 * speedScale,
        hue: Math.random() * 360,
        trail: [],
        exploded: false,
      })
    }

    const dtSec = dt / 1000

    // Update rockets
    for (const rocket of this.rockets) {
      if (!rocket.exploded) {
        rocket.trail.push({ x: rocket.x, y: rocket.y, alpha: 1 })
        if (rocket.trail.length > 12) rocket.trail.shift()

        rocket.y -= rocket.speed * dtSec * 60

        if (rocket.y <= rocket.targetY) {
          rocket.exploded = true
          this.explode(rocket, intensityScale)
        }
      }
    }

    // Decay trail
    for (const rocket of this.rockets) {
      for (const t of rocket.trail) {
        t.alpha -= 0.08 * dtSec * 60
      }
    }

    // Remove exploded rockets
    this.rockets = this.rockets.filter((r) => !r.exploded || r.trail.some((t) => t.alpha > 0))

    // Update particles
    for (const p of this.particles) {
      p.vy += 0.03 * dtSec * 60 // gravity
      p.x += p.vx * dtSec * 60
      p.y += p.vy * dtSec * 60
      p.life -= p.decay * dtSec * 60
    }

    this.particles = this.particles.filter((p) => p.life > 0)
  }

  private explode(rocket: Rocket, intensity: number): void {
    const count = Math.floor(40 + intensity * 80)
    const hue = rocket.hue

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3
      const speed = 1 + Math.random() * 5 * intensity
      this.particles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.8,
        hue: hue + (Math.random() - 0.5) * 40,
        size: 1.5 + Math.random() * 2.5,
        decay: 0.3 + Math.random() * 0.4,
      })
    }
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    // Draw rocket trails
    ctx.save()
    for (const rocket of this.rockets) {
      if (rocket.trail.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(rocket.trail[0].x, rocket.trail[0].y)
      for (let i = 1; i < rocket.trail.length; i++) {
        ctx.lineTo(rocket.trail[i].x, rocket.trail[i].y)
      }
      ctx.strokeStyle = `hsla(${rocket.hue}, 100%, 70%, 0.6)`
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Draw particles
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife
      ctx.fillStyle = `hsla(${p.hue}, 100%, ${60 + alpha * 40}%, ${alpha})`
      ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${alpha * 0.8})`
      ctx.shadowBlur = p.size * 3
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
    ctx.restore()
  }

  resize(_width: number, _height: number): void {
    // Canvas size handled by renderer
  }

  dispose(): void { this.particles = []; this.rockets = [] }
}
