import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
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
