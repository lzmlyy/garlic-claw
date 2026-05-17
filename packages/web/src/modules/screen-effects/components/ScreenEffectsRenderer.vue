<template>
  <Teleport to="body">
    <canvas
      ref="canvasRef"
      class="screen-effects-canvas"
      aria-hidden="true"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScreenEffectsStore } from '../store/screen-effects'
import { useScreenEffects } from '../composables/useScreenEffects'

const store = useScreenEffectsStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const hasActiveEffects = computed(() => store.hasActiveEffects)

// Toggle visibility via CSS — canvas always exists, avoiding mount/unmount race
watch(hasActiveEffects, (active) => {
  const canvas = canvasRef.value
  if (canvas) {
    canvas.style.display = active ? 'block' : 'none'
  }
}, { immediate: true })

useScreenEffects(canvasRef)
</script>

<style>
.screen-effects-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  width: 100vw;
  height: 100vh;
}
</style>
