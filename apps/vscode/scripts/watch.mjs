import { spawn } from 'node:child_process'

const commands = [
  ['webview', ['run', 'watch:webview']],
  ['extension', ['run', 'watch:extension']]
]

const children = commands.map(([label, args]) => {
  const child = spawn('pnpm', args, {
    cwd: new URL('..', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(prefixLines(label, chunk))
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(prefixLines(label, chunk))
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }

    shutdown()
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 0}`
    console.error(`[${label}] watcher stopped with ${reason}`)
    process.exit(code ?? 1)
  })

  return child
})

let shuttingDown = false

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function shutdown() {
  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }
}

function prefixLines(label, chunk) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => {
      if (index === lines.length - 1 && line.length === 0) {
        return ''
      }

      return `[${label}] ${line}`
    })
    .join('\n')
}
