import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@fixtures': resolve(currentDirectory, '../../fixtures'),
      '@boardmark/viewer-shell/': `${resolve(currentDirectory, '../../packages/viewer-shell/src')}/`,
      '@boardmark/viewer-shell': resolve(
        currentDirectory,
        '../../packages/viewer-shell/src/index.ts'
      )
    }
  },
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: 'dist'
  }
})
