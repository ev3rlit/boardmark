import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['apps/desktop/src/test/setup.ts'],
    include: [
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx'
    ],
    coverage: {
      reporter: ['text', 'html']
    }
  }
})
