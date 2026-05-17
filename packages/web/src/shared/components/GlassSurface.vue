<template>
  <div
    class="gc-glass-surface"
    :class="{ 'gc-glass-surface--hoverable': hoverable }"
    :style="containerStyle"
    @mouseenter="material.onMouseEnter"
    @mouseleave="material.onMouseLeave"
  >
    <!-- Layer 0: Shadow separation -->
    <div class="gc-glass-layer" :style="material.shadow.value" />

    <!-- Layer 1: Base tint (atmosphere color wash) -->
    <div class="gc-glass-layer" :style="material.baseTint.value" />

    <!-- Layer 2: Backdrop blur (single layer — GPU constraint) -->
    <div class="gc-glass-layer" :style="material.backdropBlur.value" />

    <!-- Layer 3: Noise grain (SVG filter) -->
    <div class="gc-glass-layer" :style="[material.noise.value, material.grainDrift.value]" />

    <!-- Layer 4: Reflection (atmosphere-tinted top sheen) -->
    <div class="gc-glass-layer" :style="material.reflection.value" />

    <!-- Layer 5: Edge lighting (Fresnel) -->
    <div class="gc-glass-layer" :style="material.edgeLighting.value" />

    <!-- Content -->
    <div class="gc-glass-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import { useGlassMaterial, type GlassMaterialProps } from '@/shared/composables/useGlassMaterial'

const props = withDefaults(defineProps<{
  elevation?: GlassMaterialProps['elevation']
  reflectionIntensity?: number
  edgeLighting?: boolean
  noiseEnabled?: boolean
  hoverable?: boolean
  borderRadius?: string
}>(), {
  elevation: 'floating',
  hoverable: false,
  borderRadius: 'var(--gc-radius)',
})

const material = useGlassMaterial({
  elevation: props.elevation,
  reflectionIntensity: props.reflectionIntensity,
  edgeLighting: props.edgeLighting,
  noiseEnabled: props.noiseEnabled,
  hoverable: props.hoverable,
})

const containerStyle = computed<StyleValue>(() => ({
  ...material.container.value,
  borderRadius: props.borderRadius,
}))
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   GlassSurface — 6-layer material shell

   GPU constraints:
   - Single backdrop-filter layer (layer 2 only)
   - No animating blur/filter
   - Grain drift: transform only
   - Glow/hover: opacity + transform only
   - isolation: isolate prevents backdrop-filter bleed
   ═══════════════════════════════════════════════════════════ */

.gc-glass-surface {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.gc-glass-layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

/* ── Grain drift: ultra-slow, sub-pixel, transform-only ── */
@keyframes gc-grain-drift {
  0%, 100% {
    transform: translate(0, 0);
  }
  20% {
    transform: translate(0.25%, -0.15%);
  }
  40% {
    transform: translate(-0.18%, 0.22%);
  }
  60% {
    transform: translate(0.12%, 0.18%);
  }
  80% {
    transform: translate(-0.22%, -0.12%);
  }
}

.gc-glass-content {
  position: relative;
  z-index: 10;
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .gc-glass-layer {
    animation: none !important;
  }
}
</style>
