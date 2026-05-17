<template>
  <div v-if="store.isActive" class="wallpaper-root">
    <svg style="display:none" aria-hidden="true">
      <defs>
        <filter id="gc-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
    </svg>
    <!-- ═══ Layer 1: Media ═══ -->
    <div class="wallpaper-media" :class="modeClass" :style="parallaxStyle">
      <img
        v-if="mediaType === 'image'"
        :src="store.sourceUrl"
        alt=""
        class="wallpaper-media__img"
        :class="{ 'wallpaper-media__img--gif-high-blur': isGif && store.adjustments.blur > 40 }"
        :style="adjustmentFilter"
      />
      <video
        v-else-if="mediaType === 'video'"
        :src="store.sourceUrl"
        autoplay
        loop
        muted
        playsinline
        class="wallpaper-media__video"
        :style="[adjustmentFilter, videoLiftFilter]"
      />
      <div
        v-else-if="mediaType === 'gradient'"
        class="wallpaper-media__gradient"
        :style="[gradientBg, adjustmentFilter]"
      />
    </div>

    <!-- ═══ Layer 2: Effect Overlays ═══ -->
    <div class="wallpaper-overlays">
      <!-- Blur: duplicated static media + gradient mask for spatial depth -->
      <div
        v-if="store.overlays.blur && mediaType !== 'video' && !isGif"
        class="overlay overlay--blur"
      >
        <img
          v-if="mediaType === 'image'"
          :src="store.sourceUrl"
          alt=""
          class="overlay--blur__media"
        />
        <div
          v-else-if="mediaType === 'gradient'"
          class="overlay--blur__media"
          :style="gradientBg"
        />
      </div>

      <!-- Vignette: ultra-subtle edge darkening, always present -->
      <div class="overlay overlay--vignette" />

      <!-- Dim: dynamic rgba mask with eased brightness response -->
      <div v-if="store.overlays.dim" class="overlay overlay--dim" :style="dimStyle" />

      <!-- Glow: asymmetric aura + drift animation + dynamic blend mode -->
      <div v-if="store.overlays.glow" class="overlay overlay--glow" :style="glowStyle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWallpaperStore } from '@/shared/stores/wallpaper'

const store = useWallpaperStore()

// ── Easing helpers ──
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

const mediaType = computed(() => {
  const kind = store.sourceKind
  const url = store.sourceUrl
  if (kind === 'video') return 'video'
  if (kind === 'gradient') return 'gradient'
  if (kind === 'image') return 'image'
  if (!url) return 'gradient'
  if (url.startsWith('linear-gradient(') || url.startsWith('radial-gradient(')) return 'gradient'
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'mp4' || ext === 'webm' || ext === 'mov') return 'video'
  return 'image'
})

const isGif = computed(() => {
  const url = store.sourceUrl
  if (!url) return false
  return url.split('?')[0].toLowerCase().endsWith('.gif')
})

const modeClass = computed(() => {
  const mode = store.displayMode
  if (mode === 'parallax') return 'wallpaper-media--parallax'
  if (mode === 'fixed') return 'wallpaper-media--fixed'
  if (mode === 'contain') return 'wallpaper-media--contain'
  return 'wallpaper-media--cover'
})

const adjustmentFilter = computed(() => {
  const a = store.adjustments
  const parts: string[] = []
  if (a.blur > 0) parts.push(`blur(${a.blur}px)`)
  parts.push(`opacity(${a.opacity})`)
  parts.push(`saturate(${a.saturation / 100})`)
  parts.push(`brightness(${a.brightness / 100})`)
  parts.push(`contrast(${a.contrast / 100})`)
  return { filter: parts.join(' ') }
})

// Video: subtle contrast lift + slight desaturate to mask MP4 compression
const videoLiftFilter = computed(() => ({
  filter: 'contrast(1.04) saturate(0.96)',
}))

const gradientBg = computed(() => ({
  background: store.sourceUrl,
}))

// ── Parallax: CSS-variable driven, no hardcoded size ──
const parallaxStyle = computed(() => ({
  '--parallax-offset': '0px',
  transform: store.displayMode === 'parallax'
    ? 'translateY(var(--parallax-offset))'
    : undefined,
}))

// ── Dim: eased brightness→opacity mapping ──
const dimStyle = computed(() => {
  const b = store.adjustments.brightness / 100 // 0–2
  // Map brightness to a 0–1 range, then apply easeOutCubic
  const t = Math.max(0, Math.min(1, (1.5 - b) / 1.2))
  const eased = easeOutCubic(t)
  const opacity = 0.12 + eased * 0.35
  return {
    background: `rgba(0, 0, 0, ${opacity.toFixed(3)})`,
    transition: 'background 1s cubic-bezier(0.4, 0, 0.2, 1)',
  }
})

// ── Glow: asymmetric aura + dynamic blend mode + eased opacity ──
const glowStyle = computed(() => {
  const b = store.adjustments.brightness / 100 // 0–2

  // Blend mode selection
  let blendMode: string
  if (b > 1.3) {
    blendMode = 'multiply'
  } else if (b > 1.05) {
    blendMode = 'overlay'
  } else if (b < 0.7) {
    blendMode = 'screen'
  } else if (b < 0.9) {
    blendMode = 'lighten'
  } else {
    blendMode = 'soft-light'
  }

  // Eased glow intensity: strongest in mid-brightness range
  const midDist = 1 - Math.abs(b - 1)
  const easedIntensity = easeInOutSine(midDist)
  const glowOpacity = 0.50 + easedIntensity * 0.45

  // Three asymmetric radial gradients — not centered, creates environmental light feel
  const upperLeft = `radial-gradient(
    ellipse 48% 36% at 28% 22%,
    color-mix(in oklch, var(--gc-accent, oklch(62% 0.14 186)) 26%, transparent) 0%,
    color-mix(in oklch, var(--gc-accent, oklch(62% 0.14 186)) 7%, transparent) 55%,
    transparent 100%
  )`

  const lowerRight = `radial-gradient(
    ellipse 55% 34% at 72% 58%,
    color-mix(in oklch, var(--gc-accent, oklch(62% 0.14 186)) 18%, transparent) 0%,
    color-mix(in oklch, var(--gc-accent, oklch(62% 0.14 186)) 5%, transparent) 60%,
    transparent 100%
  )`

  const bottomAmbient = `radial-gradient(
    ellipse 78% 50% at 50% 75%,
    color-mix(in oklch, var(--gc-accent, oklch(62% 0.14 186)) 12%, transparent) 0%,
    transparent 75%
  )`

  return {
    background: `${upperLeft}, ${lowerRight}, ${bottomAmbient}`,
    mixBlendMode: blendMode as 'multiply' | 'overlay' | 'screen' | 'lighten' | 'soft-light',
    opacity: glowOpacity,
    transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
  }
})
</script>

<style scoped>
/* ═══ Root: fixed background, no compositing isolation ═══ */
.wallpaper-root {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.wallpaper-root,
.wallpaper-root * {
  pointer-events: none;
}

/* ═══ Layer 1: Media ═══ */
.wallpaper-media {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.wallpaper-media__img,
.wallpaper-media__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* GIF: limit GPU promotion under high blur */
.wallpaper-media__img--gif-high-blur {
  will-change: auto;
  image-rendering: auto;
}

.wallpaper-media--cover .wallpaper-media__img,
.wallpaper-media--cover .wallpaper-media__video {
  object-fit: cover;
}

.wallpaper-media--contain .wallpaper-media__img,
.wallpaper-media--contain .wallpaper-media__video {
  object-fit: contain;
  background: #000;
}

.wallpaper-media--fixed .wallpaper-media__img,
.wallpaper-media--fixed .wallpaper-media__video {
  object-fit: cover;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.wallpaper-media--parallax {
  position: absolute;
  inset: -5%;
  width: 110%;
  height: 110%;
}

.wallpaper-media--parallax .wallpaper-media__img,
.wallpaper-media--parallax .wallpaper-media__video {
  object-fit: cover;
  width: 100%;
  height: 100%;
}

.wallpaper-media__gradient {
  position: absolute;
  inset: 0;
}

/* ═══ Layer 2: Overlays ═══ */
.wallpaper-overlays {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.overlay {
  position: absolute;
  inset: 0;
}

/* ── Blur: duplicated static media + gradient depth mask ── */
.overlay--blur {
  overflow: hidden;
  mask-image: radial-gradient(
    ellipse 65% 55% at 50% 50%,
    rgba(0, 0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.92) 65%,
    rgba(0, 0, 0, 1) 100%
  );
  -webkit-mask-image: radial-gradient(
    ellipse 65% 55% at 50% 50%,
    rgba(0, 0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.92) 65%,
    rgba(0, 0, 0, 1) 100%
  );
  transition: opacity 1s cubic-bezier(0.4, 0, 0.2, 1);
}

.overlay--blur__media {
  position: absolute;
  inset: -16px;
  width: calc(100% + 32px);
  height: calc(100% + 32px);
  object-fit: cover;
  filter: blur(20px) brightness(1.08) saturate(1.2);
  opacity: 0.85;
}

/* ── Vignette: ultra-subtle edge darkening, always on ── */
.overlay--vignette {
  background: radial-gradient(
    ellipse 75% 60% at 50% 50%,
    transparent 30%,
    rgba(0, 0, 0, 0.08) 60%,
    rgba(0, 0, 0, 0.18) 100%
  );
  pointer-events: none;
}

/* ── Dim: driven by dynamic inline style ── */
.overlay--dim {
  /* background + transition set via :style */
}

/* ── Glow: asymmetric aura + slow drift animation ── */
.overlay--glow {
  animation: glow-drift 26s ease-in-out infinite;
  will-change: transform;
}

@keyframes glow-drift {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  20% {
    transform: translate(0.35%, -0.25%) scale(1.004);
  }
  40% {
    transform: translate(-0.28%, 0.42%) scale(1.002);
  }
  60% {
    transform: translate(0.22%, 0.18%) scale(1.005);
  }
  80% {
    transform: translate(-0.32%, -0.35%) scale(1.003);
  }
}
</style>
