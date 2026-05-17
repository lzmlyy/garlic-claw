<template>
  <div v-if="store.hasSamples && store.enabled" class="atmosphere-root">
    <!-- ═══ Layer 1: Asymmetric ambient glow gradients ═══ -->
    <div class="atmosphere-glow" :style="glowStyle" />

    <!-- ═══ Layer 2: Vignette edge darkening ═══ -->
    <div class="atmosphere-vignette" :style="vignetteStyle" />

    <!-- ═══ Layer 3: Global surface tint wash ═══ -->
    <div class="atmosphere-wash" :style="washStyle" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAtmosphereStore } from '@/shared/stores/atmosphere'

const store = useAtmosphereStore()

// ═══════════════════════════════════════════════════════════
// Glow: asymmetric radial gradients at wallpaper bright spots
// ═══════════════════════════════════════════════════════════
const glowStyle = computed(() => {
  const s = store.samples
  if (!s) return {}

  const c = store.config
  const i = c.intensity

  // Position: bias toward wallpaper's bright region
  const bx = s.brightSpotX * 100
  const by = s.brightSpotY * 100
  const dx = s.darkSpotX * 100
  const dy = s.darkSpotY * 100

  // Dominant color with low opacity for ambient spread
  const domColor = `oklch(${s.dominantLightness.toFixed(1)}% ${(s.dominantSaturation * 0.6).toFixed(3)} ${s.dominantHue.toFixed(1)} / ${(0.10 * i).toFixed(3)})`

  // Accent color with moderate opacity for the focal glow
  const accentGlow = `oklch(${s.accentLightness.toFixed(1)}% ${(s.accentSaturation * 0.8).toFixed(3)} ${s.accentHue.toFixed(1)} / ${(0.16 * i).toFixed(3)})`

  // Warm/cool ambient fill in the opposite corner
  const oppositeHue = (s.accentHue + 60) % 360
  const ambientFill = `oklch(${s.dominantLightness.toFixed(1)}% ${(s.dominantSaturation * 0.3).toFixed(3)} ${oppositeHue.toFixed(1)} / ${(0.06 * i).toFixed(3)})`

  const glowScale = c.glowScale

  // Primary glow: positioned at the bright spot
  const primaryGlow = `radial-gradient(
    ellipse ${(50 * glowScale).toFixed(0)}% ${(38 * glowScale).toFixed(0)}% at ${bx.toFixed(0)}% ${by.toFixed(0)}%,
    ${accentGlow} 0%,
    color-mix(in oklch, ${accentGlow.split(' / ')[0]} / 0.04, transparent) 50%,
    transparent 100%
  )`

  // Secondary: positioned at dark spot (creates light/shadow balance)
  const secondaryGlow = `radial-gradient(
    ellipse ${(42 * glowScale).toFixed(0)}% ${(30 * glowScale).toFixed(0)}% at ${dx.toFixed(0)}% ${dy.toFixed(0)}%,
    ${domColor} 0%,
    transparent 60%
  )`

  // Ambient fill: opposite corner for balance
  const ambient = `radial-gradient(
    ellipse 60% 45% at ${(100 - bx).toFixed(0)}% ${(100 - by).toFixed(0)}%,
    ${ambientFill} 0%,
    transparent 65%
  )`

  return {
    background: `${primaryGlow}, ${secondaryGlow}, ${ambient}`,
    opacity: i,
  }
})

// ═══════════════════════════════════════════════════════════
// Vignette: edge darkening based on wallpaper luminance
// ═══════════════════════════════════════════════════════════
const vignetteStyle = computed(() => {
  const s = store.samples
  const c = store.config
  const v = c.vignetteStrength

  // Dark wallpaper → lighter vignette (it's already dark)
  // Light wallpaper → stronger vignette (create depth)
  const isBrightWallpaper = s ? s.averageLuminance > 55 : false
  const edgeAlpha = isBrightWallpaper ? 0.06 + v * 0.14 : 0.03 + v * 0.08

  return {
    background: `radial-gradient(
      ellipse 75% 60% at 50% 50%,
      transparent 30%,
      rgba(0, 0, 0, ${(edgeAlpha * 0.4).toFixed(3)}) 65%,
      rgba(0, 0, 0, ${edgeAlpha.toFixed(3)}) 100%
    )`,
  }
})

// ═══════════════════════════════════════════════════════════
// Wash: global surface tint — subtle color cast over everything
// ═══════════════════════════════════════════════════════════
const washStyle = computed(() => {
  const s = store.samples
  if (!s) return {}

  // Ultra-subtle uniform color wash — barely perceptible
  const washColor = `oklch(${s.dominantLightness.toFixed(1)}% ${(s.dominantSaturation * 0.5).toFixed(3)} ${s.dominantHue.toFixed(1)} / ${(0.04 * store.config.intensity).toFixed(3)})`

  return {
    background: washColor,
    mixBlendMode: 'color' as const,
  }
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   Atmosphere Layer — between wallpaper and effects
   z-index: 0 (same as wallpaper), renders on top of it
   ═══════════════════════════════════════════════════════════ */

.atmosphere-root {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  /* Sits between WallpaperLayer (first in DOM) and ScreenEffectsRenderer */
}

.atmosphere-glow,
.atmosphere-vignette,
.atmosphere-wash {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* ── Glow layer: ultra-slow drift for "spatial breathing" ── */
.atmosphere-glow {
  animation: atmosphere-drift 24s ease-in-out infinite;
  will-change: transform;
}

@keyframes atmosphere-drift {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  15% {
    transform: translate(0.4%, -0.3%) scale(1.003);
  }
  30% {
    transform: translate(-0.35%, 0.5%) scale(1.006);
  }
  50% {
    transform: translate(0.25%, 0.2%) scale(1.002);
  }
  65% {
    transform: translate(-0.3%, -0.4%) scale(1.005);
  }
  80% {
    transform: translate(0.2%, 0.35%) scale(1.004);
  }
}

/* ── Vignette: subtle breathing — pulse in sync with drift ── */
.atmosphere-vignette {
  animation: vignette-breathe 18s ease-in-out infinite;
}

@keyframes vignette-breathe {
  0%, 100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
}

/* ── Wash: ultra-slow color cast drift ── */
.atmosphere-wash {
  animation: wash-drift 30s ease-in-out infinite;
}

@keyframes wash-drift {
  0%, 100% {
    opacity: 0.6;
  }
  33% {
    opacity: 0.8;
  }
  66% {
    opacity: 0.5;
  }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .atmosphere-glow,
  .atmosphere-vignette,
  .atmosphere-wash {
    animation: none;
  }
}
</style>
