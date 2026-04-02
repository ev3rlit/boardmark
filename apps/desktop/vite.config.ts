import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
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
      '@boardmark/canvas-repository': resolve(
        currentDirectory,
        '../../packages/canvas-repository/src/index.ts'
      ),
      '@boardmark/canvas-app/': `${resolve(currentDirectory, '../../packages/canvas-app/src')}/`,
      '@boardmark/canvas-app': resolve(
        currentDirectory,
        '../../packages/canvas-app/src/index.ts'
      )
    }
  },
  server: {
    sourcemapIgnoreList: () => false
  },
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    electron({
      main: {
        entry: 'src/main/index.ts'
      },
      preload: {
        input: 'src/preload/index.ts'
      },
      renderer: {}
    })
  ],
  build: {
    outDir: 'dist'
  }
})
