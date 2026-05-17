<template>
  <button
    class="preset-card"
    :class="{ 'is-active': isActive }"
    @click="$emit('select', preset.id)"
  >
    <!-- Color swatches -->
    <div class="preset-card__swatches">
      <div
        class="preset-card__swatch preset-card__swatch--bg"
        :style="{ background: swatchBg }"
      />
      <div
        class="preset-card__swatch preset-card__swatch--card"
        :style="{ background: swatchCard }"
      />
      <div
        class="preset-card__swatch preset-card__swatch--accent"
        :style="{ background: swatchAccent }"
      />
    </div>

    <!-- Name -->
    <span class="preset-card__name">{{ preset.name }}</span>

    <!-- Active indicator -->
    <span v-if="isActive" class="preset-card__badge">当前</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ThemePreset } from '@/shared/theme/types'

const props = defineProps<{
  preset: ThemePreset
  isActive: boolean
}>()

defineEmits<{
  select: [id: string]
}>()

const d = computed(() => props.preset.dark)
const accentHue = computed(() => ((props.preset.hue + d.value.accentHueShift) + 360) % 360)

const swatchBg = computed(() => {
  const sat = Math.min(props.preset.saturation, 20)
  return `hsl(${props.preset.hue} ${sat}% ${d.value.backgroundLightness}%)`
})

const swatchCard = computed(() => {
  const sat = Math.min(props.preset.saturation, 20)
  return `hsl(${props.preset.hue} ${sat}% ${d.value.cardLightness}%)`
})

const swatchAccent = computed(() => {
  return `hsl(${accentHue.value} ${d.value.accentSaturation}% ${d.value.accentLightness}%)`
})
</script>

<style scoped>
.preset-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--gc-glass-border);
  background: var(--gc-glass-bg);
  backdrop-filter: blur(var(--gc-blur-light));
  -webkit-backdrop-filter: blur(var(--gc-blur-light));
  cursor: pointer;
  color: var(--gc-foreground);
  font-size: 13px;
  font-family: inherit;
  transition:
    border-color var(--gc-transition-fast),
    box-shadow var(--gc-transition-fast),
    transform var(--gc-transition-fast);
}

.preset-card:hover {
  border-color: var(--gc-primary);
  box-shadow: var(--gc-shadow-glow);
  transform: translateY(var(--gc-hover-lift));
}

.preset-card.is-active {
  border-color: var(--gc-primary);
  box-shadow: var(--gc-focus-shadow);
}

/* ── Swatches ── */
.preset-card__swatches {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.preset-card__swatch {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, var(--gc-border-alpha-subtle));
}

/* ── Name ── */
.preset-card__name {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

/* ── Badge ── */
.preset-card__badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--gc-primary);
  color: var(--gc-primary-foreground);
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
