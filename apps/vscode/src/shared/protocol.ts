// Message protocol shared by extension host and webview.
// Both sides MUST validate inbound messages at the boundary (CLAUDE §6).
// Webview is a separate process; treat all incoming messages as untrusted.

/**
 * Monotonic, per-document revision counter.
 * Used to break edit loops:
 *  - Host increments on every TextDocument change it pushes to the webview.
 *  - Webview tags every outgoing edit with the revision it last hydrated from.
 *  - Host ignores webview edits whose revision is stale.
 *  - Webview ignores host syncs whose revision matches an edit it just sent.
 */
export type DocumentRevision = number
export type RequestId = string

export type HostRequestMethod =
  | 'document/pick-open'
  | 'image/import'
  | 'image/resolve'
  | 'image/open'
  | 'image/reveal'
  | 'image-export/save'

// ---------- Host → Webview ----------

export type HostToWebviewMessage =
  | {
      readonly type: 'document/sync'
      readonly revision: DocumentRevision
      readonly source: string
      readonly uri: string
    }
  | {
      readonly type: 'document/error'
      readonly message: string
      readonly uri: string
    }
  | {
      readonly type: 'document/saved'
      readonly revision: DocumentRevision
    }
  | {
      readonly type: 'response'
      readonly id: RequestId
      readonly ok: true
      readonly value?: unknown
    }
  | {
      readonly type: 'response'
      readonly id: RequestId
      readonly ok: false
      readonly error: string
    }

// ---------- Webview → Host ----------

export type WebviewToHostMessage =
  | {
      readonly type: 'document/ready'
    }
  | {
      readonly type: 'document/edit'
      readonly id: RequestId
      readonly revision: DocumentRevision
      readonly nextSource: string
    }
  | {
      readonly type: 'document/save'
      readonly id: RequestId
    }
  | {
      readonly type: 'request'
      readonly id: RequestId
      readonly method: HostRequestMethod
      readonly payload?: unknown
    }
  | {
      readonly type: 'command/run'
      readonly id: string
      readonly args?: unknown
    }
  | {
      readonly type: 'log'
      readonly level: 'debug' | 'info' | 'warn' | 'error'
      readonly message: string
      readonly context?: Record<string, unknown>
    }

// ---------- Type guards ----------

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }
  switch (value.type) {
    case 'document/ready':
      return true
    case 'document/edit':
      return (
        typeof value.id === 'string' &&
        typeof value.revision === 'number' &&
        typeof value.nextSource === 'string'
      )
    case 'document/save':
      return typeof value.id === 'string'
    case 'request':
      return typeof value.id === 'string' && isHostRequestMethod(value.method)
    case 'command/run':
      return typeof value.id === 'string'
    case 'log':
      return typeof value.level === 'string' && typeof value.message === 'string'
    default:
      return false
  }
}

export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }
  switch (value.type) {
    case 'document/sync':
      return (
        typeof value.revision === 'number' &&
        typeof value.source === 'string' &&
        typeof value.uri === 'string'
      )
    case 'document/error':
      return typeof value.message === 'string' && typeof value.uri === 'string'
    case 'document/saved':
      return typeof value.revision === 'number'
    case 'response':
      if (typeof value.id !== 'string' || typeof value.ok !== 'boolean') {
        return false
      }

      return value.ok ? true : typeof value.error === 'string'
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHostRequestMethod(value: unknown): value is HostRequestMethod {
  return (
    value === 'document/pick-open' ||
    value === 'image/import' ||
    value === 'image/resolve' ||
    value === 'image/open' ||
    value === 'image/reveal' ||
    value === 'image-export/save'
  )
}
