// Webview-side bridge. Translates the `BoardmarkDocumentBridge` shape used by
// `canvas-app` into postMessage exchanges with the extension host.
//
// Phase 1 scope: receive `document/sync` and surface the source to the canvas.
// Phase 2 will route edit / save / picker calls through the host.
//
// The repository / picker / persistence / image-asset bridges are NOT
// implemented yet — they are the next slice of work. They will be backed by
// request/response messages with correlation ids over the same channel.

import {
  isHostToWebviewMessage,
  type DocumentRevision,
  type HostToWebviewMessage,
  type WebviewToHostMessage
} from '../shared/protocol'
import { getVsCodeApi } from './vscode-api'

export type DocumentSnapshot = {
  readonly uri: string
  readonly source: string
  readonly revision: DocumentRevision
}

export type HostBridge = {
  readonly snapshot: () => DocumentSnapshot | null
  readonly subscribe: (listener: (snapshot: DocumentSnapshot) => void) => () => void
  readonly sendEdit: (nextSource: string) => void
  readonly notifyReady: () => void
}

export function createHostBridge(): HostBridge {
  const api = getVsCodeApi()
  let current: DocumentSnapshot | null = null
  const listeners = new Set<(snapshot: DocumentSnapshot) => void>()

  const handleHostMessage = (event: MessageEvent<unknown>) => {
    const data = event.data
    if (!isHostToWebviewMessage(data)) {
      return
    }
    applyHostMessage(data)
  }

  const applyHostMessage = (message: HostToWebviewMessage) => {
    switch (message.type) {
      case 'document/sync': {
        current = {
          uri: message.uri,
          source: message.source,
          revision: message.revision
        }
        for (const listener of listeners) {
          listener(current)
        }
        return
      }
      case 'document/saved': {
        // Phase 2: clear dirty indicator on the canvas store.
        return
      }
      case 'theme/changed': {
        // Phase 2: route to design token swap.
        return
      }
    }
  }

  window.addEventListener('message', handleHostMessage)

  const post = (message: WebviewToHostMessage) => {
    api.postMessage(message)
  }

  return {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sendEdit: (nextSource) => {
      if (!current) {
        return
      }
      post({
        type: 'document/edit',
        revision: current.revision,
        nextSource
      })
    },
    notifyReady: () => {
      post({ type: 'document/ready' })
    }
  }
}
