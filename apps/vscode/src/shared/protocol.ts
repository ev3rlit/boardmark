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

export type ThemeKind = 'light' | 'dark' | 'high-contrast'

// ---------- Host → Webview ----------

export type HostToWebviewMessage =
  | {
      readonly type: 'document/sync'
      readonly revision: DocumentRevision
      readonly source: string
      readonly uri: string
    }
  | {
      readonly type: 'document/saved'
      readonly revision: DocumentRevision
    }
  | {
      readonly type: 'theme/changed'
      readonly kind: ThemeKind
    }

// ---------- Webview → Host ----------

export type WebviewToHostMessage =
  | {
      readonly type: 'document/ready'
    }
  | {
      readonly type: 'document/edit'
      readonly revision: DocumentRevision
      readonly nextSource: string
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
      return typeof value.revision === 'number' && typeof value.nextSource === 'string'
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
    case 'document/saved':
      return typeof value.revision === 'number'
    case 'theme/changed':
      return value.kind === 'light' || value.kind === 'dark' || value.kind === 'high-contrast'
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
