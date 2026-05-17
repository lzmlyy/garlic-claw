<template>
  <Teleport to="body">
    <Transition name="fx-panel">
      <div v-if="store.panelOpen" class="fx-panel-backdrop" @click.self="store.closePanel">
        <div class="fx-panel" @click.stop>
          <header class="fx-panel-header">
            <h3 class="fx-panel-title">Screen Effects</h3>
            <button class="fx-panel-close" @click="store.closePanel" aria-label="Close effects panel">&times;</button>
          </header>

          <div class="fx-panel-body">
            <!-- Master toggle -->
            <div class="fx-master-row">
              <label class="fx-master-label">
                <span class="fx-master-text">Master Switch</span>
                <span class="fx-master-desc">Enable all active screen effects</span>
              </label>
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

            <div v-if="store.masterEnabled" class="fx-effects-list">
              <div
                v-for="type in effectTypes"
                :key="type"
                class="fx-effect-card"
                :class="{ active: store.effects[type].enabled }"
              >
                <div class="fx-effect-header">
                  <button
                    type="button"
                    class="fx-toggle fx-toggle-sm"
                    :class="{ active: store.effects[type].enabled }"
                    role="switch"
                    :aria-checked="store.effects[type].enabled"
                    @click="store.toggleEffect(type)"
                  >
                    <span class="fx-toggle-knob" />
                  </button>
                  <span class="fx-effect-name">{{ labels[type] }}</span>
                </div>

                <Transition name="fx-expand">
                  <div v-if="store.effects[type].enabled" class="fx-effect-controls">
                    <div class="fx-slider-group">
                      <label class="fx-slider-label">
                        <span>Intensity</span>
                        <span class="fx-slider-val">{{ store.effects[type].config.intensity }}</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        :value="store.effects[type].config.intensity"
                        class="fx-slider"
                        @input="(e) => store.setEffectConfig(type, { intensity: Number((e.target as HTMLInputElement).value) })"
                      />
                    </div>
                    <div class="fx-slider-group">
                      <label class="fx-slider-label">
                        <span>Count</span>
                        <span class="fx-slider-val">{{ store.effects[type].config.count }}</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        :value="store.effects[type].config.count"
                        class="fx-slider"
                        @input="(e) => store.setEffectConfig(type, { count: Number((e.target as HTMLInputElement).value) })"
                      />
                    </div>
                    <div class="fx-slider-group">
                      <label class="fx-slider-label">
                        <span>Speed</span>
                        <span class="fx-slider-val">{{ store.effects[type].config.speed }}</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        :value="store.effects[type].config.speed"
                        class="fx-slider"
                        @input="(e) => store.setEffectConfig(type, { speed: Number((e.target as HTMLInputElement).value) })"
                      />
                    </div>
                  </div>
                </Transition>
              </div>
            </div>

            <p v-else class="fx-empty-hint">
              Enable the master switch to configure effects.
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { EffectType } from '../effects/types'
import { EFFECT_LABELS } from '../effects/types'
import { useScreenEffectsStore } from '../store/screen-effects'

const store = useScreenEffectsStore()
const effectTypes = Object.keys(EFFECT_LABELS) as EffectType[]
const labels = EFFECT_LABELS
</script>

<style scoped>
.fx-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fx-panel {
  width: 420px;
  max-width: 94vw;
  max-height: 85vh;
  background: var(--gc-surface-floating);
  border: 1px solid var(--gc-border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fx-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--gc-border);
}

.fx-panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gc-text);
}

.fx-panel-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--gc-text-muted);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.fx-panel-close:hover {
  background: var(--gc-surface-elevated);
  color: var(--gc-text);
}

.fx-panel-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.fx-master-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--gc-border);
  margin-bottom: 8px;
}

.fx-master-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fx-master-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--gc-text);
}

.fx-master-desc {
  font-size: 12px;
  color: var(--gc-text-muted);
}

/* ── Toggle switch ── */
.fx-toggle {
  position: relative;
  width: 44px;
  height: 26px;
  border: none;
  border-radius: 999px;
  background: var(--gc-border);
  cursor: pointer;
  padding: 0;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.fx-toggle.active {
  background: var(--gc-accent);
}

.fx-toggle-sm {
  width: 36px;
  height: 22px;
}

.fx-toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.fx-toggle.active .fx-toggle-knob {
  transform: translateX(18px);
}

.fx-toggle-sm .fx-toggle-knob {
  width: 16px;
  height: 16px;
  top: 3px;
  left: 3px;
}

.fx-toggle-sm.active .fx-toggle-knob {
  transform: translateX(14px);
}

/* ── Effect cards ── */
.fx-effects-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fx-effect-card {
  border: 1px solid var(--gc-border);
  border-radius: 8px;
  padding: 10px 14px;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.fx-effect-card.active {
  border-color: var(--gc-accent-bg);
  background: var(--gc-surface-elevated);
}

.fx-effect-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fx-effect-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--gc-text);
}

/* ── Controls ── */
.fx-effect-controls {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 46px;
}

.fx-slider-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fx-slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--gc-text-muted);
}

.fx-slider-val {
  font-weight: 600;
  color: var(--gc-text);
}

.fx-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--gc-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.fx-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gc-accent);
  border: 2px solid var(--gc-surface-floating);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

.fx-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gc-accent);
  border: 2px solid var(--gc-surface-floating);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

.fx-empty-hint {
  text-align: center;
  color: var(--gc-text-muted);
  font-size: 13px;
  padding: 24px 0;
}

/* ── Transitions ── */
.fx-panel-enter-active,
.fx-panel-leave-active {
  transition: opacity 0.25s ease;
}

.fx-panel-enter-active .fx-panel,
.fx-panel-leave-active .fx-panel {
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;
}

.fx-panel-enter-from,
.fx-panel-leave-to {
  opacity: 0;
}

.fx-panel-enter-from .fx-panel,
.fx-panel-leave-to .fx-panel {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.fx-expand-enter-active,
.fx-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.fx-expand-enter-from,
.fx-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.fx-expand-enter-to,
.fx-expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
