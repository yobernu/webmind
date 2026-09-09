import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The Readability-based extractor, built as a standalone classic script that
// the background worker injects with chrome.scripting.executeScript. Kept out
// of the declared content script so its weight is not paid on every page load.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/extract/index.ts', import.meta.url)),
      formats: ['iife'],
      name: 'WebMindExtract',
      fileName: () => 'extract.js',
    },
  },
})
