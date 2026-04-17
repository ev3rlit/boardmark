import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

// Webview bundle.
// Target: browser (VS Code webview = Chromium with strict CSP).
// Single self-contained bundle that VS Code loads via Webview.html().
export default defineConfig({
  resolve: {
    alias: {
      '@canvas-app/': `${resolve(currentDirectory, '../../packages/canvas-app/src')}/`,
      '@canvas-app': resolve(currentDirectory, '../../packages/canvas-app/src/index.ts'),
      '@boardmark/canvas-app/': `${resolve(currentDirectory, '../../packages/canvas-app/src')}/`,
      '@boardmark/canvas-app': resolve(currentDirectory, '../../packages/canvas-app/src/index.ts'),
      '@boardmark/canvas-repository': resolve(
        currentDirectory,
        '../../packages/canvas-repository/src/index.ts'
      )
    }
  },
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    target: 'es2022',
    outDir: 'dist/webview',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(currentDirectory, 'src/webview/index.html')
    }
  }
})
