import type { ScreenEffect, EffectConfig } from './types'

interface AuroraBand {
  offsetY: number
  amplitude: number
  frequency: number
  speed: number
  phase: number
  hueShift: number
  alpha: number
  bandWidth: number
}

export class AuroraEffect implements ScreenEffect {
  readonly type = 'aurora' as const
  private bands: AuroraBand[] = []
  private time = 0
  private offscreen: HTMLCanvasElement | null = null
  private offCtx: CanvasRenderingContext2D | null = null
  private width = 0
  private height = 0

  update(dt: number, config: EffectConfig, width: number, height: number): void {
    this.width = width
    this.height = height
    this.time += dt

    const intensityScale = config.intensity / 100
    const speedScale = config.speed / 100
    const bandCount = Math.floor(3 + intensityScale * 4)

    while (this.bands.length < bandCount) {
      this.bands.push(this.createBand())
    }
    while (this.bands.length > bandCount) {
      this.bands.pop()
    }

    for (const band of this.bands) {
      band.phase += band.speed * 0.004 * speedScale * (dt / 16.67)
    }
  }

  private createBand(): AuroraBand {
    return {
      offsetY: 0.05 + Math.random() * 0.3,
      amplitude: 0.04 + Math.random() * 0.1,
      frequency: 0.5 + Math.random() * 2.5,
      speed: 0.5 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      hueShift: Math.random() * 80,
      alpha: 0.25 + Math.random() * 0.45,
      bandWidth: 0.04 + Math.random() * 0.1,
    }
  }

  render(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement): void {
    const w = this.width
    const h = this.height
    if (w <= 0 || h <= 0) return

    // Ensure offscreen canvas matches CSS pixel dimensions (not physical)
    if (!this.offscreen || this.offscreen.width !== w || this.offscreen.height !== h) {
      this.offscreen = document.createElement('canvas')
      this.offscreen.width = w
      this.offscreen.height = h
      this.offCtx = this.offscreen.getContext('2d')!
    }

    const octx = this.offCtx!
    octx.clearRect(0, 0, w, h)

    for (const band of this.bands) {
      const baseY = h * band.offsetY
      const amp = h * band.amplitude
      const bandH = h * band.bandWidth

      for (let layer = 0; layer < 3; layer++) {
        const layerOffset = (layer - 1) * h * 0.025
        const layerAmp = amp * (1 - layer * 0.2)
        const layerFreq = band.frequency * (1 + layer * 0.4)

        octx.beginPath()
        octx.moveTo(0, baseY + layerOffset)

        for (let x = 0; x <= w; x += 2) {
          const nx = x / w
          const wave1 = Math.sin(nx * layerFreq * Math.PI * 2 + band.phase + layer * 0.9) * layerAmp
          const wave2 = Math.sin(nx * layerFreq * Math.PI * 1.6 + band.phase * 1.3 + layer) * layerAmp * 0.6
          const y = baseY + layerOffset + wave1 + wave2
          octx.lineTo(x, y)
        }

        octx.lineTo(w, baseY + bandH)
        octx.lineTo(0, baseY + bandH)
        octx.closePath()

        const hue = 120 + band.hueShift + layer * 15
        const grad = octx.createLinearGradient(0, baseY - amp, 0, baseY + bandH + amp)
        grad.addColorStop(0, `hsla(${hue}, 80%, 60%, ${band.alpha * (1 - layer * 0.25)})`)
        grad.addColorStop(0.5, `hsla(${hue + 25}, 75%, 55%, ${band.alpha * 0.7})`)
        grad.addColorStop(1, `hsla(${hue + 50}, 60%, 40%, 0)`)

        octx.fillStyle = grad
        octx.fill()
      }
    }

    // Composite onto main canvas with screen blend for glow
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.drawImage(this.offscreen, 0, 0, w, h)
    ctx.restore()
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    if (this.offscreen) {
      this.offscreen.width = width
      this.offscreen.height = height
    }
  }

  dispose(): void {
    this.offscreen = null
    this.offCtx = null
    this.bands = []
  }
}
