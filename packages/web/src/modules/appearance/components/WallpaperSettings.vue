<template>
  <div class="wallpaper-settings">
    <!-- Preset grid -->
    <section class="setting-section">
      <span class="section-label">预设壁纸</span>
      <div class="preset-grid">
        <button
          v-for="preset in store.presets"
          :key="preset.id"
          class="preset-card"
          :class="{
            active: preset.id === 'none'
              ? !store.isActive
              : store.sourceKind === 'preset' && store.sourceUrl === preset.sourceUrl,
          }"
          @click="store.applyPreset(preset)"
        >
          <span
            v-if="preset.sourceKind === 'gradient'"
            class="preset-preview"
            :style="[previewGradientStyle(preset.sourceUrl), previewFilterStyle]"
          />
          <span v-else class="preset-preview preset-preview--none" />
          <span class="preset-label">{{ preset.label }}</span>
        </button>
      </div>
    </section>

    <!-- Upload local file -->
    <section class="setting-section">
      <span class="section-label">上传文件</span>
      <div class="upload-row">
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
          style="display: none"
          @change="handleFileSelect"
        />
        <ElButton class="action-btn" @click="fileInput?.click()">
          选择文件
        </ElButton>
        <span class="upload-hint">支持 JPG/PNG/WEBP/GIF/MP4</span>
      </div>
    </section>

    <!-- Online URL -->
    <section class="setting-section">
      <span class="section-label">在线地址</span>
      <div class="url-row">
        <ElInput
          v-model="urlDraft"
          placeholder="粘贴图片或视频链接..."
          @keyup.enter="applyUrl"
        />
        <ElButton class="action-btn" :disabled="!urlDraft.trim()" @click="applyUrl">
          应用
        </ElButton>
      </div>
    </section>

    <!-- Display mode -->
    <section class="setting-section">
      <span class="section-label">显示模式</span>
      <div class="mode-row">
        <button
          v-for="mode in displayModes"
          :key="mode.value"
          class="mode-chip"
          :class="{ active: store.displayMode === mode.value }"
          @click="store.setDisplayMode(mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>
    </section>

    <!-- Overlays -->
    <section class="setting-section">
      <span class="section-label">覆盖层</span>
      <div class="toggle-row">
        <label
          v-for="overlay in overlayOptions"
          :key="overlay.key"
          class="toggle-chip"
        >
          <input
            type="checkbox"
            :checked="store.overlays[overlay.key]"
            @change="store.setOverlay(overlay.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ overlay.label }}</span>
        </label>
      </div>
    </section>

    <!-- Adjustment sliders -->
    <section class="setting-section">
      <span class="section-label">画面调整</span>
      <div class="sliders-grid">
        <label
          v-for="slider in sliders"
          :key="slider.key"
          class="slider-field"
        >
          <span class="slider-field__header">
            <span>{{ slider.label }}</span>
            <span class="slider-field__value">{{ formatSliderValue(slider) }}</span>
          </span>
          <input
            type="range"
            :min="slider.min"
            :max="slider.max"
            :step="slider.step"
            :value="store.adjustments[slider.key]"
            class="slider-input"
            @input="store.setAdjustment(slider.key, Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
      <ElButton class="reset-btn" text @click="store.resetAdjustments">
        重置调整
      </ElButton>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElInput } from 'element-plus'
import { useWallpaperStore } from '@/shared/stores/wallpaper'
import type { WallpaperAdjustments, WallpaperSourceKind } from '@/shared/wallpaper/types'

const store = useWallpaperStore()
const fileInput = ref<HTMLInputElement | null>(null)
const urlDraft = ref('')

// ── Preview filter pipeline: mirrors actual wallpaper adjustments (no blur) ──
const previewFilterStyle = computed(() => {
  const a = store.adjustments
  const parts: string[] = []
  // Omit blur from preview so thumbnails stay recognizable
  parts.push(`opacity(${a.opacity})`)
  parts.push(`saturate(${a.saturation / 100})`)
  parts.push(`brightness(${a.brightness / 100})`)
  parts.push(`contrast(${a.contrast / 100})`)
  return { filter: parts.join(' ') }
})

function previewGradientStyle(gradientUrl: string) {
  return {
    background: gradientUrl,
    position: 'relative' as const,
  }
}

const displayModes = [
  { label: '填充', value: 'cover' as const },
  { label: '包含', value: 'contain' as const },
  { label: '固定', value: 'fixed' as const },
  { label: '视差', value: 'parallax' as const },
]

const overlayOptions = [
  { key: 'blur' as const, label: '模糊' },
  { key: 'dim' as const, label: '变暗' },
  { key: 'glow' as const, label: '发光' },
]

interface SliderDef {
  key: keyof WallpaperAdjustments
  label: string
  min: number
  max: number
  step: number
}

const sliders: SliderDef[] = [
  { key: 'blur', label: '模糊强度', min: 0, max: 100, step: 1 },
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.01 },
  { key: 'saturation', label: '饱和度', min: 0, max: 200, step: 1 },
  { key: 'brightness', label: '亮度', min: 0, max: 200, step: 1 },
  { key: 'contrast', label: '对比度', min: 0, max: 200, step: 1 },
]

function formatSliderValue(slider: SliderDef): string {
  const val = store.adjustments[slider.key]
  if (slider.key === 'blur') return `${val.toFixed(0)}px`
  if (slider.key === 'opacity') return `${(val * 100).toFixed(0)}%`
  return `${val.toFixed(0)}%`
}

function applyUrl(): void {
  const url = urlDraft.value.trim()
  if (!url) return
  const kind = detectSourceKind(url)
  store.setSourceUrl(url, kind)
  urlDraft.value = ''
}

function detectSourceKind(url: string): WallpaperSourceKind {
  const lower = url.split('?')[0].toLowerCase()
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) return 'video'
  if (lower.startsWith('linear-gradient') || lower.startsWith('radial-gradient')) return 'gradient'
  return 'image'
}

function handleFileSelect(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const url = URL.createObjectURL(file)
  const kind: WallpaperSourceKind = file.type.startsWith('video/') ? 'video' : 'image'
  store.setSourceUrl(url, kind)
  input.value = ''
}
</script>

<style scoped>
.wallpaper-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 8px 20px 20px;
  overflow-y: auto;
  flex: 1;
}

.setting-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gc-muted-foreground);
}

/* Presets */
.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--gc-glass-border);
  border-radius: 12px;
  background: var(--gc-glass-bg);
  cursor: pointer;
  transition: border-color var(--gc-transition-fast), background var(--gc-transition-fast);
  color: var(--gc-foreground);
}

.preset-card:hover {
  border-color: var(--gc-border);
}

.preset-card.active {
  border-color: var(--gc-accent);
  background: color-mix(in oklch, var(--gc-accent) 12%, transparent);
}

.preset-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  border: 1px solid var(--gc-glass-border);
  overflow: hidden;
}

.preset-preview--none {
  background: repeating-conic-gradient(var(--gc-border) 0% 25%, transparent 0% 50%) 50% / 12px 12px;
}

.preset-label {
  font-size: 12px;
  text-align: center;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Upload */
.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-hint {
  color: var(--gc-muted-foreground);
  font-size: 13px;
}

/* URL */
.url-row {
  display: flex;
  gap: 10px;
}

.url-row :deep(.el-input) {
  flex: 1;
}

/* Display mode */
.mode-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-chip {
  padding: 8px 14px;
  border: 1px solid var(--gc-glass-border);
  border-radius: 10px;
  background: var(--gc-glass-bg);
  color: var(--gc-foreground);
  cursor: pointer;
  font-size: 13px;
  transition: border-color var(--gc-transition-fast), background var(--gc-transition-fast);
}

.mode-chip:hover {
  border-color: var(--gc-border);
}

.mode-chip.active {
  border-color: var(--gc-accent);
  background: color-mix(in oklch, var(--gc-accent) 14%, transparent);
}

/* Overlay toggles */
.toggle-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--gc-glass-border);
  border-radius: 10px;
  background: var(--gc-glass-bg);
  cursor: pointer;
  font-size: 13px;
  color: var(--gc-foreground);
  transition: border-color var(--gc-transition-fast);
  user-select: none;
}

.toggle-chip:has(input:checked) {
  border-color: var(--gc-accent);
  background: color-mix(in oklch, var(--gc-accent) 12%, transparent);
}

.toggle-chip input {
  accent-color: var(--gc-accent);
}

/* Sliders */
.sliders-grid {
  display: grid;
  gap: 14px;
}

.slider-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slider-field__header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--gc-foreground);
}

.slider-field__value {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  color: var(--gc-muted-foreground);
  font-size: 12px;
}

.slider-input {
  width: 100%;
  height: 6px;
  appearance: none;
  -webkit-appearance: none;
  background: var(--gc-glass-border);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}

.slider-input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--gc-card);
  border: 2px solid var(--gc-accent);
  box-shadow: var(--gc-shadow-sm), 0 0 8px var(--gc-atmosphere-3);
  cursor: pointer;
}

.slider-input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--gc-card);
  border: 2px solid var(--gc-accent);
  box-shadow: var(--gc-shadow-sm), 0 0 8px var(--gc-atmosphere-3);
  cursor: pointer;
}

.action-btn {
  white-space: nowrap;
}

.reset-btn {
  align-self: start;
}

/* Responsive */
@media (max-width: 600px) {
  .preset-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .url-row,
  .upload-row {
    flex-direction: column;
  }

  .url-row :deep(.el-input) {
    width: 100%;
  }
}
</style>
