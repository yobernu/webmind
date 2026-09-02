import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Content scripts run as classic scripts, so they must be a single self
// contained IIFE bundle. Emitted into the same `dist/` as the main build.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
      formats: ['iife'],
      name: 'WebMindContent',
      fileName: () => 'content.js',
    },
  },
})
