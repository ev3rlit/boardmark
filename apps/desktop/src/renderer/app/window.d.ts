import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'

declare global {
  interface Window {
    boardmarkDocument: BoardmarkDocumentBridge
  }
}

export {}
