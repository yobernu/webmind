import { defineConfig } from 'vitest/config'

// Unit tests for the pure parts of the extension: anchoring, URL and time
// helpers. happy-dom supplies the DOM the anchoring code walks.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
