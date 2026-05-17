<template>
  <div class="theme-sliders">
    <!-- Group 1: Color -->
    <div class="slider-section">
      <span class="slider-section__label">颜色</span>
      <div class="slider-group">
        <div class="slider-group__header">
          <label class="slider-group__label" for="appearance-hue">色相</label>
          <span class="slider-group__value">{{ hue }}°</span>
        </div>
        <div class="slider-group__track">
          <input
            id="appearance-hue"
            type="range"
            class="slider slider--hue"
            min="0"
            max="360"
            :value="hue"
            @input="onHueInput"
          />
        </div>
      </div>
      <div class="slider-group">
        <div class="slider-group__header">
          <label class="slider-group__label" for="appearance-saturation">饱和度</label>
          <span class="slider-group__value">{{ saturation }}%</span>
        </div>
        <div class="slider-group__track">
          <input
            id="appearance-saturation"
            type="range"
            class="slider"
            min="0"
            max="100"
            :value="saturation"
            @input="onSaturationInput"
            :style="saturationTrackStyle"
          />
        </div>
      </div>
    </div>

    <!-- Group 2: Depth -->
    <div class="slider-section">
      <span class="slider-section__label">深度</span>
      <div class="slider-group">
        <div class="slider-group__header">
          <label class="slider-group__label" for="appearance-brightness">亮度</label>
          <span class="slider-group__value">{{ brightness }}%</span>
        </div>
        <div class="slider-group__track">
          <input
            id="appearance-brightness"
            type="range"
            class="slider"
            min="0"
            max="100"
            :value="brightness"
            @input="onBrightnessInput"
            :style="brightnessTrackStyle"
          />
        </div>
      </div>
      <div class="slider-group">
        <div class="slider-group__header">
          <label class="slider-group__label" for="appearance-blur">模糊强度</label>
          <span class="slider-group__value">{{ blurStrength }}%</span>
        </div>
        <div class="slider-group__track">
          <input
            id="appearance-blur"
            type="range"
            class="slider"
            min="0"
            max="100"
            :value="blurStrength"
            @input="onBlurInput"
            :style="blurTrackStyle"
          />
        </div>
      </div>
    </div>

    <!-- Group 3: Atmosphere -->
    <div class="slider-section">
      <span class="slider-section__label">氛围</span>
      <div class="slider-group">
        <div class="slider-group__header">
          <label class="slider-group__label" for="appearance-glow">辉光强度</label>
          <span class="slider-group__value">{{ glowStrength }}%</span>
        </div>
        <div class="slider-group__track">
          <input
            id="appearance-glow"
            type="range"
            class="slider"
            min="0"
            max="100"
            :value="glowStrength"
            @input="onGlowInput"
            :style="glowTrackStyle"
          />
        </div>
      </div>
      <div class="slider-group">
        <div class="slider-group__header">
          <label class="slider-group__label" for="appearance-glass">玻璃质感</label>
          <span class="slider-group__value">{{ glassOpacity }}%</span>
        </div>
        <div class="slider-group__track">
          <input
            id="appearance-glass"
            type="range"
            class="slider"
            min="0"
            max="100"
            :value="glassOpacity"
            @input="onGlassInput"
            :style="glassTrackStyle"
          />
        </div>
      </div>
    </div>

    <!-- Reset -->
    <button class="slider-reset" @click="resetAll">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      重置全部
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppearanceStore } from '@/shared/stores/appearance'

const appearance = useAppearanceStore()

const hue = computed(() => appearance.effectiveHue)
const saturation = computed(() => appearance.effectiveSaturation)
const brightness = computed(() => appearance.effectiveBrightness)
const glowStrength = computed(() => appearance.effectiveGlowStrength)
const glassOpacity = computed(() => appearance.effectiveGlassOpacity)
const blurStrength = computed(() => appearance.effectiveBlurStrength)

// ── Track gradient styles ──
const saturationTrackStyle = computed(() => ({
  '--slider-track-end': `oklch(58% ${saturation.value / 100 * 0.22} ${hue.value})`,
}))

const brightnessTrackStyle = computed(() => ({
  '--slider-track-start': 'oklch(5% 0 0)',
  '--slider-track-end': 'oklch(98% 0 0)',
}))

const glowTrackStyle = computed(() => ({
  '--slider-track-end': `oklch(58% ${glowStrength.value / 100 * 0.22} ${hue.value} / 0.8)`,
}))

const blurTrackStyle = computed(() => ({
  '--slider-track-end': `oklch(58% 0.04 ${hue.value} / 0.6)`,
}))

const glassTrackStyle = computed(() => ({
  '--slider-track-end': `oklch(58% 0.04 ${hue.value} / ${glassOpacity.value / 100 * 0.8})`,
}))

// ── Input handlers ──
function onHueInput(event: Event): void {
  appearance.setHue(Number((event.target as HTMLInputElement).value))
}
function onSaturationInput(event: Event): void {
  appearance.setSaturation(Number((event.target as HTMLInputElement).value))
}
function onBrightnessInput(event: Event): void {
  appearance.setBrightness(Number((event.target as HTMLInputElement).value))
}
function onGlowInput(event: Event): void {
  appearance.setGlowStrength(Number((event.target as HTMLInputElement).value))
}
function onGlassInput(event: Event): void {
  appearance.setGlassOpacity(Number((event.target as HTMLInputElement).value))
}
function onBlurInput(event: Event): void {
  appearance.setBlurStrength(Number((event.target as HTMLInputElement).value))
}

function resetAll(): void {
  appearance.setHue(null)
  appearance.setSaturation(null)
  appearance.setBrightness(null)
  appearance.setGlowStrength(null)
  appearance.setGlassOpacity(null)
  appearance.setBlurStrength(null)
}
</script>

<style scoped>
.theme-sliders {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Section ── */
.slider-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slider-section__label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--gc-muted-foreground);
  opacity: 0.7;
}

/* ── Slider group ── */
.slider-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slider-group__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slider-group__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gc-foreground);
}

.slider-group__value {
  font-size: 11px;
  font-weight: 600;
  color: var(--gc-accent);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}

.slider-group__track {
  position: relative;
  height: 24px;
  display: flex;
  align-items: center;
}

/* ── Slider base ── */
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--gc-muted);
  outline: none;
  cursor: pointer;
}

/* ── Hue: rainbow track ── */
.slider--hue::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    oklch(58% 0.22 0),
    oklch(58% 0.22 60),
    oklch(58% 0.22 120),
    oklch(58% 0.22 180),
    oklch(58% 0.22 240),
    oklch(58% 0.22 300),
    oklch(58% 0.22 360)
  );
}

.slider--hue::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    oklch(58% 0.22 0),
    oklch(58% 0.22 60),
    oklch(58% 0.22 120),
    oklch(58% 0.22 180),
    oklch(58% 0.22 240),
    oklch(58% 0.22 300),
    oklch(58% 0.22 360)
  );
}

/* ── Generic slider track ── */
.slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--slider-track-start, var(--gc-muted)) 0%,
    var(--slider-track-end, var(--gc-accent)) 100%
  );
}

.slider::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--slider-track-start, var(--gc-muted)) 0%,
    var(--slider-track-end, var(--gc-accent)) 100%
  );
}

/* ── Thumb (Webkit) ── */
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--gc-card);
  border: 1.5px solid var(--gc-accent);
  cursor: pointer;
  box-shadow:
    0 1px 4px var(--gc-shadow-color),
    0 0 6px var(--gc-glow);
  margin-top: -6px;
  transition: transform var(--gc-transition-fast);
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.slider::-webkit-slider-thumb:active {
  transform: scale(0.9);
}

/* ── Thumb (Firefox) ── */
.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--gc-card);
  border: 1.5px solid var(--gc-accent);
  cursor: pointer;
  box-shadow: 0 1px 4px var(--gc-shadow-color);
}

/* ── Reset button ── */
.slider-reset {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--gc-glass-border);
  background: transparent;
  color: var(--gc-muted-foreground);
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color var(--gc-transition-fast),
    color var(--gc-transition-fast),
    background var(--gc-transition-fast);
}

.slider-reset:hover {
  border-color: var(--gc-accent);
  color: var(--gc-accent);
  background: var(--gc-interactive-hover-bg);
}
</style>
