import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

// Extension host bundle.
// Target: Node (VS Code extension host runtime).
// `vscode` is provided at runtime by VS Code and must remain external.
export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    outDir: 'dist/extension',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(currentDirectory, 'src/extension/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs'
    },
    rollupOptions: {
      external: ['vscode']
    }
  }
})
