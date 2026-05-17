<template>
  <div class="fx-settings">
    <!-- Master toggle -->
    <section class="slider-section">
      <span class="slider-section__label">总开关</span>
      <div class="fx-master-card">
        <div class="fx-master-info">
          <span class="fx-master-name">屏幕特效</span>
          <span class="fx-master-desc">启用后将在背景渲染所选动态效果</span>
        </div>
        <button
          type="button"
          class="fx-toggle"
          :class="{ active: store.masterEnabled }"
          role="switch"
          :aria-checked="store.masterEnabled"
          @click="store.toggleMaster()"
        >
          <span class="fx-toggle-knob" />
        </button>
      </div>
    </section>

    <!-- Effects list -->
    <section class="slider-section">
      <span class="slider-section__label">效果列表</span>
      <div class="fx-effects-grid">
        <div
          v-for="type in effectTypes"
          :key="type"
          class="fx-effect-card"
          :class="{ active: store.effects[type].enabled, muted: !store.masterEnabled }"
        >
          <!-- Effect header — always clickable -->
          <div class="fx-effect-header">
            <button
              type="button"
              class="fx-toggle fx-toggle--sm"
              :class="{ active: store.effects[type].enabled }"
              role="switch"
              :aria-checked="store.effects[type].enabled"
              @click="onToggleEffect(type)"
            >
              <span class="fx-toggle-knob" />
            </button>
            <span class="fx-effect-name">{{ labels[type] }}</span>
          </div>

          <!-- Sliders — visible when enabled -->
          <div v-if="store.effects[type].enabled" class="fx-effect-sliders">
            <div class="slider-group">
              <div class="slider-group__header">
                <label class="slider-group__label">强度</label>
                <span class="slider-group__value">{{ store.effects[type].config.intensity }}</span>
              </div>
              <div class="slider-group__track">
                <input
                  type="range"
                  class="slider"
                  min="0"
                  max="100"
                  :value="store.effects[type].config.intensity"
                  @input="onIntensityInput(type, $event)"
                />
              </div>
            </div>
            <div class="slider-group">
              <div class="slider-group__header">
                <label class="slider-group__label">数量</label>
                <span class="slider-group__value">{{ store.effects[type].config.count }}</span>
              </div>
              <div class="slider-group__track">
                <input
                  type="range"
                  class="slider"
                  min="0"
                  max="100"
                  :value="store.effects[type].config.count"
                  @input="onCountInput(type, $event)"
                />
              </div>
            </div>
            <div class="slider-group">
              <div class="slider-group__header">
                <label class="slider-group__label">速度</label>
                <span class="slider-group__value">{{ store.effects[type].config.speed }}</span>
              </div>
              <div class="slider-group__track">
                <input
                  type="range"
                  class="slider"
                  min="0"
                  max="100"
                  :value="store.effects[type].config.speed"
                  @input="onSpeedInput(type, $event)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

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
import type { EffectType } from '@/modules/screen-effects/effects/types'
import { EFFECT_LABELS, EFFECT_DEFAULTS } from '@/modules/screen-effects/effects/types'
import { useScreenEffectsStore } from '@/modules/screen-effects/store/screen-effects'

const store = useScreenEffectsStore()
const effectTypes = Object.keys(EFFECT_LABELS) as EffectType[]
const labels = EFFECT_LABELS

// ── Event handlers (explicit, no inline arrow functions) ──

function onToggleEffect(type: EffectType): void {
  // Auto-enable master if turning on first effect
  if (!store.effects[type].enabled && !store.masterEnabled) {
    store.masterEnabled = true
  }
  store.toggleEffect(type)
}

function onIntensityInput(type: EffectType, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  store.setEffectConfig(type, { intensity: value })
}

function onCountInput(type: EffectType, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  store.setEffectConfig(type, { count: value })
}

function onSpeedInput(type: EffectType, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  store.setEffectConfig(type, { speed: value })
}

function resetAll(): void {
  store.masterEnabled = false
  store.effects = structuredClone(EFFECT_DEFAULTS)
  store.persist()
}
</script>

<style scoped>
.fx-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

/* ── Master card ── */
.fx-master-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--gc-glass-bg);
  border: 1px solid var(--gc-glass-border);
}

.fx-master-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fx-master-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--gc-foreground);
}

.fx-master-desc {
  font-size: 11px;
  color: var(--gc-muted-foreground);
}

/* ── Toggle switch ── */
.fx-toggle {
  position: relative;
  width: 44px;
  height: 26px;
  border: 1px solid var(--gc-glass-border);
  border-radius: 999px;
  background: var(--gc-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition:
    background var(--gc-transition-fast),
    border-color var(--gc-transition-fast);
}

.fx-toggle.active {
  background: var(--gc-accent);
  border-color: var(--gc-accent);
}

.fx-toggle--sm {
  width: 36px;
  height: 22px;
}

.fx-toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--gc-card);
  box-shadow: 0 1px 3px var(--gc-shadow-color);
  transition: transform var(--gc-transition-fast);
}

.fx-toggle.active .fx-toggle-knob {
  transform: translateX(18px);
}

.fx-toggle--sm .fx-toggle-knob {
  width: 14px;
  height: 14px;
  top: 3px;
  left: 3px;
}

.fx-toggle--sm.active .fx-toggle-knob {
  transform: translateX(14px);
}

/* ── Effects grid ── */
.fx-effects-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Effect card (NO pointer-events: none!) ── */
.fx-effect-card {
  border: 1px solid var(--gc-glass-border);
  border-radius: 12px;
  padding: 10px 14px;
  background: var(--gc-glass-bg);
  transition:
    border-color var(--gc-transition-fast),
    background var(--gc-transition-fast),
    box-shadow var(--gc-transition-fast),
    opacity var(--gc-transition-fast);
}

.fx-effect-card.active {
  border-color: color-mix(in srgb, var(--gc-accent) 30%, transparent);
  background: var(--gc-card);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--gc-accent) 15%, transparent);
}

.fx-effect-card.muted {
  opacity: 0.45;
}

.fx-effect-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fx-effect-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--gc-foreground);
  user-select: none;
}

/* ── Effect sliders ── */
.fx-effect-sliders {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 46px;
}

/* ── Slider group (exact ThemeSliders pattern) ── */
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

/* ── Slider base (exact ThemeSliders pattern) ── */
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

.slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--gc-muted) 0%,
    var(--gc-accent) 100%
  );
}

.slider::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--gc-muted) 0%,
    var(--gc-accent) 100%
  );
}

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

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--gc-card);
  border: 1.5px solid var(--gc-accent);
  cursor: pointer;
  box-shadow: 0 1px 4px var(--gc-shadow-color);
}

/* ── Reset button (exact ThemeSliders pattern) ── */
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
