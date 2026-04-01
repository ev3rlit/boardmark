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
      '@canvas-app/': `${resolve(currentDirectory, '../../packages/canvas-app/src')}/`,
      '@canvas-app': resolve(
        currentDirectory,
        '../../packages/canvas-app/src/index.ts'
      ),
      '@fixtures': resolve(currentDirectory, '../../fixtures'),
      '@boardmark/canvas-app/': `${resolve(currentDirectory, '../../packages/canvas-app/src')}/`,
      '@boardmark/canvas-app': resolve(
        currentDirectory,
        '../../packages/canvas-app/src/index.ts'
      )
    }
  },
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: 'dist'
  }
})
