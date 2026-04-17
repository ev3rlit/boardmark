// Thin wrapper over the VS Code webview API exposed via `acquireVsCodeApi()`.
// `acquireVsCodeApi` may only be called once per webview, so we cache the handle.
//
// In a non-VS Code environment (e.g. running the bundle in `vite dev` for
// component work), the wrapper degrades to a no-op so the canvas-app can still
// mount and render.

import type { WebviewToHostMessage } from '../shared/protocol'

type VsCodeApi = {
  postMessage: (message: WebviewToHostMessage) => void
  setState: (state: unknown) => void
  getState: () => unknown
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi
  }
}

let cachedApi: VsCodeApi | null = null

export function getVsCodeApi(): VsCodeApi {
  if (cachedApi) {
    return cachedApi
  }
  if (typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function') {
    cachedApi = window.acquireVsCodeApi()
    return cachedApi
  }
  cachedApi = createNoopApi()
  return cachedApi
}

function createNoopApi(): VsCodeApi {
  let state: unknown = null
  return {
    postMessage: () => {},
    setState: (next) => {
      state = next
    },
    getState: () => state
  }
}
