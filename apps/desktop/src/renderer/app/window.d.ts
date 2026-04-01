import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@boardmark/canvas-app'

declare global {
  interface Window {
    boardmarkDocument: BoardmarkDocumentBridge & {
      persistence: CanvasDocumentPersistenceBridge
    }
  }
}

export {}
