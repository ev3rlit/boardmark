type CanvasDiagnosticLevel = 'debug' | 'warn' | 'error'

export function logCanvasDiagnostic(
  level: CanvasDiagnosticLevel,
  message: string,
  context?: Record<string, unknown>
) {
  const payload = context && Object.keys(context).length > 0 ? context : undefined
  const prefix = `[boardmark] ${message}`

  if (level === 'debug') {
    if (!isCanvasDebugEnabled()) {
      return
    }

    console.info(prefix, payload)
    return
  }

  if (level === 'warn') {
    console.warn(prefix, payload)
    return
  }

  console.error(prefix, payload)
}

function isCanvasDebugEnabled() {
  try {
    if ('__BOARDMARK_DEBUG__' in globalThis && globalThis.__BOARDMARK_DEBUG__ === true) {
      return true
    }

    return globalThis.localStorage?.getItem('boardmark:debug') === '1'
  } catch {
    return false
  }
}

declare global {
  // Debug switch for local troubleshooting without always-on console noise.
  var __BOARDMARK_DEBUG__: boolean | undefined
}
