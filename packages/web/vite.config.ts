import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const webSourceRoot = fileURLToPath(new URL('./src', import.meta.url))
const sharedSourceRoot = fileURLToPath(new URL('../shared/src', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: webSourceRoot,
      },
      {
        find: '@garlic-claw/shared',
        replacement: fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      },
      {
        find: /^@garlic-claw\/shared\/(.*)$/,
        replacement: `${sharedSourceRoot}/$1`,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
  server: {
    port: 23333,
    proxy: {
      '^/api/': {
        target: 'http://localhost:23330',
        changeOrigin: true,
      },
    },
  },
})
