import type { ScreenEffect, EffectConfig } from './types'

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  length: number
  alpha: number
  size: number
  hue: number
  tailPoints: Array<{ x: number; y: number }>
}

export class MeteorEffect implements ScreenEffect {
  readonly type = 'meteor' as const
  private meteors: Meteor[] = []
  private timeSinceLastSpawn = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {

    const speedScale = config.speed / 100
    const intensityScale = config.intensity / 100
    const countScale = config.count / 100

    const spawnInterval = 800 - 500 * speedScale * countScale
    this.timeSinceLastSpawn += dt

    const maxMeteors = Math.ceil(5 * countScale)
    if (this.timeSinceLastSpawn > spawnInterval && this.meteors.length < maxMeteors) {
      this.timeSinceLastSpawn = 0
      this.meteors.push(this.createMeteor(intensityScale, width))
    }

    const dtSec = dt / 1000

    for (const m of this.meteors) {
      // Store tail point
      m.tailPoints.push({ x: m.x, y: m.y })
      if (m.tailPoints.length > m.length) m.tailPoints.shift()

      m.x += m.vx * dtSec * 60 * speedScale
      m.y += m.vy * dtSec * 60 * speedScale
      m.alpha -= 0.003 * dtSec * 60
    }

    this.meteors = this.meteors.filter(
      (m) =>
        m.alpha > 0 &&
        m.x > -200 &&
        m.x < width + 200 &&
        m.y < height + 200,
    )
  }

  private createMeteor(intensity: number, viewWidth: number): Meteor {
    const angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.5
    const speed = 6 + Math.random() * 10 * intensity
    const startX = Math.random() * viewWidth * 0.8
    return {
      x: startX,
      y: -20 - Math.random() * 100,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: Math.floor(15 + Math.random() * 30),
      alpha: 0.6 + Math.random() * 0.4,
      size: 1 + Math.random() * 2,
      hue: 30 + Math.random() * 20, // warm orange-yellow
      tailPoints: [],
    }
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    for (const m of this.meteors) {
      if (m.tailPoints.length < 2) continue

      // Draw tail as gradient line
      for (let i = 1; i < m.tailPoints.length; i++) {
        const t = i / m.tailPoints.length
        const alpha = m.alpha * t * 0.8

        ctx.strokeStyle = `hsla(${m.hue}, 100%, ${70 + t * 30}%, ${alpha})`
        ctx.lineWidth = m.size * t * 2
        ctx.beginPath()
        ctx.moveTo(m.tailPoints[i - 1].x, m.tailPoints[i - 1].y)
        ctx.lineTo(m.tailPoints[i].x, m.tailPoints[i].y)
        ctx.stroke()
      }

      // Draw meteor head glow
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 6)
      grad.addColorStop(0, `hsla(${m.hue}, 100%, 90%, ${m.alpha})`)
      grad.addColorStop(0.3, `hsla(${m.hue}, 100%, 70%, ${m.alpha * 0.5})`)
      grad.addColorStop(1, `hsla(${m.hue}, 100%, 50%, 0)`)

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.size * 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  resize(_width: number, _height: number): void {
    // Canvas size handled by renderer
  }

  dispose(): void { this.meteors = [] }
}
