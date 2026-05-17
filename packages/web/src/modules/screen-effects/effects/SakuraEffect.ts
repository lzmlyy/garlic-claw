import type { ScreenEffect, EffectConfig } from './types'

interface SakuraPetal {
  x: number
  y: number
  size: number
  rotation: number
  rotationSpeed: number
  fallSpeed: number
  driftSpeed: number
  driftPhase: number
  driftAmplitude: number
  opacity: number
  depth: number // 0 (near) to 1 (far)
  shape: number // petal shape variant
  hue: number // slight pink variations
  saturation: number
  lightness: number
  wobblePhase: number
  wobbleSpeed: number
}

// Simple 2D noise approximation for wind
function noise2D(x: number, y: number, t: number): number {
  const n = Math.sin(x * 1.2 + t * 0.7) * Math.cos(y * 0.8 + t * 0.5) +
    Math.sin((x + y) * 0.6 + t * 1.1) * 0.5 +
    Math.cos(x * 1.8 - y * 0.4 + t * 0.9) * 0.3
  return n / 1.8
}

export class SakuraEffect implements ScreenEffect {
  readonly type = 'sakura' as const
  private petals: SakuraPetal[] = []
  private time = 0
  private windTime = 0
  private width = 0
  private height = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {
    this.width = width
    this.height = height
    this.time += dt
    this.windTime += dt * (config.speed / 50) * 0.3

    const countScale = config.count / 100
    const speedScale = config.speed / 100
    const intensityScale = config.intensity / 100
    const targetCount = Math.floor(60 * countScale * intensityScale + 10)
    const windStrength = 0.6 + intensityScale * 1.4

    // Spawn new petals if needed
    while (this.petals.length < targetCount) {
      this.spawnPetal()
    }

    // Remove excess petals
    while (this.petals.length > targetCount) {
      this.petals.pop()
    }

    const dtSec = dt / 1000

    for (const petal of this.petals) {
      // Wind offset sampled from noise field
      const windX = noise2D(petal.x * 0.01, petal.y * 0.005, this.windTime) * windStrength
      const windY = noise2D(petal.x * 0.005, petal.y * 0.008, this.windTime + 100) * 0.3

      // Parallax: deeper petals move slower
      const parallax = 0.4 + (1 - petal.depth) * 0.6

      // Horizontal drift (wind + sinusoidal drift)
      const drift = Math.sin(petal.driftPhase + this.time * 0.0003 * speedScale) * petal.driftAmplitude
      petal.x += (windX * petal.driftSpeed + drift * 0.3) * parallax * dtSec * 60

      // Fall speed with atmosphere floating
      const floatY = Math.sin(this.time * 0.001 * speedScale + petal.wobblePhase) * 0.4
      petal.y += (petal.fallSpeed + windY + floatY) * parallax * dtSec * 60

      // Rotation
      petal.rotation += petal.rotationSpeed * parallax * dtSec * 60
      petal.wobblePhase += petal.wobbleSpeed * dtSec

      // Wrap around edges
      if (petal.y > height + 40) {
        this.resetPetal(petal, true)
      }
      if (petal.x > width + 60) {
        petal.x = -petal.size * 2
      }
      if (petal.x < -60) {
        petal.x = width + petal.size * 2
      }
    }
  }

  private spawnPetal(): void {
    const p = this.createPetal()
    // Randomize initial position
    p.y = Math.random() * -this.height * 0.8
    p.x = Math.random() * (this.width + 120) - 60
    // Fade in from top
    if (p.y > -20) {
      p.opacity = Math.max(0.1, (p.y + this.height * 0.8) / (this.height * 0.8))
    }
    this.petals.push(p)
  }

  private createPetal(): SakuraPetal {
    const depth = Math.random()
    const intensityScale = 0.5 + depth * 0.5

    return {
      x: Math.random() * (this.width + 120) - 60,
      y: -Math.random() * this.height * 0.8,
      size: 8 + Math.random() * 18 * intensityScale,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.04,
      fallSpeed: 0.6 + Math.random() * 1.2 * intensityScale,
      driftSpeed: 0.3 + Math.random() * 0.8,
      driftPhase: Math.random() * Math.PI * 2,
      driftAmplitude: 20 + Math.random() * 60,
      opacity: 0.3 + Math.random() * 0.7,
      depth,
      shape: Math.random(),
      hue: 340 + Math.random() * 20, // pink range
      saturation: 60 + Math.random() * 40,
      lightness: 70 + Math.random() * 20,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 1.5,
    }
  }

  private resetPetal(petal: SakuraPetal, fromBottom: boolean): void {
    if (fromBottom) {
      petal.y = -petal.size * 2 - Math.random() * 40
      petal.x = Math.random() * (this.width + 120) - 60
    }
    petal.depth = Math.random()
    petal.opacity = 0.3 + Math.random() * 0.7
    petal.rotation = Math.random() * Math.PI * 2
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    // Sort petals by depth for proper layering (far first)
    const sorted = [...this.petals].sort((a, b) => b.depth - a.depth)

    for (const petal of sorted) {
      this.renderPetal(ctx, petal)
    }
  }

  private renderPetal(ctx: CanvasRenderingContext2D, petal: SakuraPetal): void {
    const { x, y, size, rotation, depth, opacity } = petal

    // Depth-based visual properties
    const depthScale = 0.5 + (1 - depth) * 0.5 // near = larger
    const s = size * depthScale
    const alpha = opacity * (0.6 + (1 - depth) * 0.4) // near = more opaque
    const blurAmount = depth * 4 // far = more blur

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)

    // Apply blur via filter
    if (blurAmount > 0.5) {
      ctx.filter = `blur(${blurAmount.toFixed(1)}px)`
    }

    // Draw sakura petal shape
    const hue = petal.hue
    const sat = petal.saturation
    const light = petal.lightness - depth * 15

    // Petal gradient for depth/shading
    const grad = ctx.createRadialGradient(0, -s * 0.2, s * 0.1, 0, 0, s * 0.7)
    grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 10}%, ${alpha})`)
    grad.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.9})`)
    grad.addColorStop(1, `hsla(${hue}, ${sat - 10}%, ${light - 10}%, ${alpha * 0.5})`)

    ctx.fillStyle = grad
    ctx.beginPath()

    // Draw a realistic sakura petal (heart-shaped / cleft petal)
    const cleft = s * 0.2
    ctx.moveTo(0, -s * 0.2) // top center base

    // Left lobe
    ctx.bezierCurveTo(
      -s * 0.5, -s * 0.15,
      -s * 0.7, -s * 0.6,
      -s * 0.15, -s * 0.85,
    )
    ctx.bezierCurveTo(
      -s * 0.25, -s * 0.9,
      -s * 0.05, -s * 0.65,
      0, -s * 0.5 - cleft,
    )

    // Cleft notch
    ctx.bezierCurveTo(
      -s * 0.08, -s * 0.45 - cleft,
      s * 0.08, -s * 0.45 - cleft,
      0, -s * 0.5 - cleft,
    )

    // Right lobe
    ctx.bezierCurveTo(
      s * 0.05, -s * 0.65,
      s * 0.25, -s * 0.9,
      s * 0.15, -s * 0.85,
    )
    ctx.bezierCurveTo(
      s * 0.7, -s * 0.6,
      s * 0.5, -s * 0.15,
      0, -s * 0.2,
    )

    ctx.closePath()
    ctx.fill()

    // Subtle vein line
    ctx.strokeStyle = `hsla(${hue - 10}, ${sat - 20}%, ${light - 15}%, ${alpha * 0.3})`
    ctx.lineWidth = s * 0.04
    ctx.beginPath()
    ctx.moveTo(0, -s * 0.2)
    ctx.bezierCurveTo(0, -s * 0.4, 0, -s * 0.7, 0, -s * 0.85)
    ctx.stroke()

    ctx.restore()
  }

  resize(_width: number, _height: number): void {
    this.width = _width
    this.height = _height
  }

  dispose(): void {
    this.petals = []
  }
}
