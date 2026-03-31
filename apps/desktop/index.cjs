const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const builtMainPath = join(__dirname, 'dist-electron', 'index.js')

if (!existsSync(builtMainPath)) {
  throw new Error(
    'Boardmark desktop build output is missing. Run "pnpm build" or "pnpm dev" from the repository root first.'
  )
} else {
  import(pathToFileURL(builtMainPath).href).catch((error) => {
    console.error('Failed to launch Boardmark desktop app.')
    console.error(error)
    process.exitCode = 1
  })
}
