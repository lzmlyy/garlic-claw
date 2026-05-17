import type { SampledColors, ExtractionResult } from './types'

/**
 * Extract atmosphere colors from a wallpaper image URL.
 *
 * Uses an offscreen Canvas scaled to 100×100 for performance.
 * Color quantization into 8×8×8 = 512 bins for frequency analysis.
 * Falls back gracefully — returns null if extraction is impossible
 * (cross-origin, non-image source, etc.).
 */
export async function extractColors(
  sourceUrl: string,
  sourceKind: 'image' | 'video' | 'gradient' | 'preset',
): Promise<ExtractionResult> {
  // Only image sources can be sampled
  if (sourceKind !== 'image' && sourceKind !== 'preset') {
    return { samples: null, error: `Cannot sample source kind: ${sourceKind}` }
  }

  if (!sourceUrl) {
    return { samples: null, error: 'No source URL' }
  }

  // Detect if it's actually a CSS gradient string
  if (sourceUrl.startsWith('linear-gradient') || sourceUrl.startsWith('radial-gradient')) {
    return { samples: null, error: 'CSS gradients cannot be canvas-sampled' }
  }

  try {
    const img = await loadImage(sourceUrl)
    const samples = sampleImage(img)
    return { samples }
  } catch (err) {
    return { samples: null, error: err instanceof Error ? err.message : 'Unknown extraction error' }
  }
}

/**
 * Load an image with CORS support for cross-origin wallpaper URLs.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    const cleanup = () => {
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
    }

    const onLoad = () => {
      cleanup()
      resolve(img)
    }

    const onError = () => {
      cleanup()
      // Retry without CORS for same-origin / blob URLs
      if (img.crossOrigin) {
        const retry = new Image()
        retry.addEventListener('load', () => {
          cleanup()
          resolve(retry)
        })
        retry.addEventListener('error', () => {
          cleanup()
          reject(new Error('Failed to load wallpaper image'))
        })
        retry.src = url
      } else {
        reject(new Error('Failed to load wallpaper image'))
      }
    }

    img.addEventListener('load', onLoad)
    img.addEventListener('error', onError)
    img.src = url
  })
}

/**
 * Sample an image: draw to offscreen canvas, quantize, analyze.
 */
function sampleImage(img: HTMLImageElement): SampledColors {
  const SIZE = 100
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  // Draw scaled
  ctx.drawImage(img, 0, 0, SIZE, SIZE)
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data
  const pixelCount = SIZE * SIZE

  // ── Color Quantization: 8×8×8 = 512 bins ──
  const BINS_PER_CHANNEL = 8
  const BIN_SIZE = 256 / BINS_PER_CHANNEL
  const TOTAL_BINS = BINS_PER_CHANNEL ** 3
  const bins = new Uint32Array(TOTAL_BINS)

  // Also track per-pixel data for luminance and position analysis
  let totalLuminance = 0
  const brightPixels: Array<{ x: number; y: number; lum: number }> = []
  const allLuminances: number[] = []

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const a = data[offset + 3]

    // Skip fully transparent pixels
    if (a < 128) continue

    // Bin index
    const ri = Math.min(BINS_PER_CHANNEL - 1, Math.floor(r / BIN_SIZE))
    const gi = Math.min(BINS_PER_CHANNEL - 1, Math.floor(g / BIN_SIZE))
    const bi = Math.min(BINS_PER_CHANNEL - 1, Math.floor(b / BIN_SIZE))
    const binIdx = ri * BINS_PER_CHANNEL * BINS_PER_CHANNEL + gi * BINS_PER_CHANNEL + bi
    bins[binIdx]++

    // Luminance (perceived brightness)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    totalLuminance += lum
    allLuminances.push(lum)

    const x = i % SIZE
    const y = Math.floor(i / SIZE)
    brightPixels.push({ x, y, lum })
  }

  const validPixels = allLuminances.length
  if (validPixels === 0) {
    return fallbackSample()
  }

  // ── Dominant color: most frequent bin ──
  let maxCount = 0
  let dominantBin = 0
  for (let i = 0; i < TOTAL_BINS; i++) {
    if (bins[i] > maxCount) {
      maxCount = bins[i]
      dominantBin = i
    }
  }

  const domR = (Math.floor(dominantBin / (BINS_PER_CHANNEL * BINS_PER_CHANNEL)) + 0.5) * BIN_SIZE
  const domG = ((Math.floor(dominantBin / BINS_PER_CHANNEL) % BINS_PER_CHANNEL) + 0.5) * BIN_SIZE
  const domB = ((dominantBin % BINS_PER_CHANNEL) + 0.5) * BIN_SIZE

  const [domH, domS, domL] = rgbToOklch(domR, domG, domB)

  // ── Accent color: most saturated among top 5 bins ──
  const topBins = getTopBins(bins, 5)
  let bestSat = -1
  let accentR = domR, accentG = domG, accentB = domB

  for (const binIdx of topBins) {
    const ar = (Math.floor(binIdx / (BINS_PER_CHANNEL * BINS_PER_CHANNEL)) + 0.5) * BIN_SIZE
    const ag = ((Math.floor(binIdx / BINS_PER_CHANNEL) % BINS_PER_CHANNEL) + 0.5) * BIN_SIZE
    const ab = ((binIdx % BINS_PER_CHANNEL) + 0.5) * BIN_SIZE

    // Simple saturation proxy: max(r,g,b) - min(r,g,b)
    const sat = Math.max(ar, ag, ab) - Math.min(ar, ag, ab)
    if (sat > bestSat) {
      bestSat = sat
      accentR = ar; accentG = ag; accentB = ab
    }
  }

  const [accH, accS, accL] = rgbToOklch(accentR, accentG, accentB)

  // ── Average luminance ──
  const avgLum = totalLuminance / validPixels // 0–255

  // ── Bright spot: 80th percentile luminance threshold ──
  const sortedLum = [...allLuminances].sort((a, b) => a - b)
  const brightThreshold = sortedLum[Math.floor(validPixels * 0.80)]

  let brightSumX = 0, brightSumY = 0, brightCount = 0
  for (const p of brightPixels) {
    if (p.lum >= brightThreshold) {
      brightSumX += p.x
      brightSumY += p.y
      brightCount++
    }
  }

  const brightSpotX = brightCount > 0 ? brightSumX / brightCount / SIZE : 0.5
  const brightSpotY = brightCount > 0 ? brightSumY / brightCount / SIZE : 0.5

  // ── Dark spot: 20th percentile ──
  const darkThreshold = sortedLum[Math.floor(validPixels * 0.20)]
  let darkSumX = 0, darkSumY = 0, darkCount = 0
  for (const p of brightPixels) {
    if (p.lum <= darkThreshold) {
      darkSumX += p.x
      darkSumY += p.y
      darkCount++
    }
  }

  const darkSpotX = darkCount > 0 ? darkSumX / darkCount / SIZE : 0.5
  const darkSpotY = darkCount > 0 ? darkSumY / darkCount / SIZE : 0.5

  return {
    dominantHue: domH,
    dominantSaturation: domS,
    dominantLightness: (avgLum / 255) * 100,
    accentHue: accH,
    accentSaturation: accS,
    accentLightness: accL,
    averageLuminance: (avgLum / 255) * 100,
    brightSpotX,
    brightSpotY,
    darkSpotX,
    darkSpotY,
    sampledAt: Date.now(),
  }
}

// ── Helpers ──

/** Get indices of the top N bins by count. */
function getTopBins(bins: Uint32Array, n: number): number[] {
  const indexed = Array.from(bins, (count, idx) => ({ idx, count }))
  indexed.sort((a, b) => b.count - a.count)
  return indexed.slice(0, n).map((e) => e.idx)
}

/**
 * Convert sRGB (0–255) to oklch (hue 0–360, saturation 0–1, lightness 0–100).
 * Uses the sRGB → linear → LMS → oklab → oklch pipeline.
 */
function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  // sRGB to linear
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)

  // Linear to LMS
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  // LMS cube root
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)

  // LMS to oklab
  const okl = 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot
  const oka = 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot
  const okb = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot

  // oklab to oklch
  const C = Math.sqrt(oka * oka + okb * okb)
  const H = Math.atan2(okb, oka) * (180 / Math.PI)
  const hue = ((H % 360) + 360) % 360
  const sat = Math.min(1, C / 0.4) // normalize: typical max chroma ~0.4
  const lightness = Math.max(0, Math.min(100, okl * 100))

  return [hue, sat, lightness]
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Fallback when extraction produces no valid pixels. */
function fallbackSample(): SampledColors {
  return {
    dominantHue: 200,
    dominantSaturation: 0.05,
    dominantLightness: 50,
    accentHue: 200,
    accentSaturation: 0.15,
    accentLightness: 55,
    averageLuminance: 50,
    brightSpotX: 0.55,
    brightSpotY: 0.15,
    darkSpotX: 0.5,
    darkSpotY: 0.5,
    sampledAt: Date.now(),
  }
}
