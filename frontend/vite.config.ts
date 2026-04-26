/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    coverage: {
      exclude: [
        'wailsjs/**',
        'node_modules/**',
        '**/node_modules/**',
        '**/*.test.ts',
        '**/test-utils/**',
      ],
    },
  },
})
