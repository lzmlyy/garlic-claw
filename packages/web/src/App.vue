<template>
  <ThemeProvider>
    <Teleport to="body">
      <WallpaperLayer />
      <AtmosphereLayer />
      <GlassNoiseDef />
    </Teleport>
    <ScreenEffectsRenderer />
    <ScreenEffectsFloatingToggle />
    <div class="app-content">
      <router-view />
    </div>
  </ThemeProvider>
</template>

<script setup lang="ts">
import ThemeProvider from '@/shared/providers/ThemeProvider.vue'
import WallpaperLayer from '@/modules/appearance/components/WallpaperLayer.vue'
import AtmosphereLayer from '@/modules/atmosphere/components/AtmosphereLayer.vue'
import GlassNoiseDef from '@/shared/components/GlassNoiseDef.vue'
import ScreenEffectsRenderer from '@/modules/screen-effects/components/ScreenEffectsRenderer.vue'
import ScreenEffectsFloatingToggle from '@/modules/screen-effects/components/ScreenEffectsFloatingToggle.vue'
import { useScreenEffectsStore } from '@/modules/screen-effects/store/screen-effects'
import { useAtmosphereStore } from '@/shared/stores/atmosphere'
import { useMaterialStore } from '@/shared/stores/material'

// Initialize screen effects store (restores persisted settings)
const fxStore = useScreenEffectsStore()
fxStore.init()

// Initialize atmosphere store (starts wallpaper color sampling)
const atmoStore = useAtmosphereStore()
atmoStore.init()

// Initialize material store (pushes config to reactive bridge)
const materialStore = useMaterialStore()
materialStore.init()
</script>

<style>
.app-content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
}
</style>
