import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 23333,
    proxy: {
      '/api': {
        target: 'http://localhost:23330',
        changeOrigin: true,
      },
    },
  },
})
