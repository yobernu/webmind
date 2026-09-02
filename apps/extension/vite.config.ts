import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Builds the extension pages (side panel) plus the background service worker.
// The content script is a classic script and cannot be an ES module, so it is
// built separately by `vite.content.config.ts`.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Dev harness page, harmless inside the packaged extension.
        index: entry('./index.html'),
        sidepanel: entry('./sidepanel.html'),
        background: entry('./src/background/index.ts'),
      },
      output: {
        // manifest.json references `background.js` at the package root.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
