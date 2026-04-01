import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'
import type { ViewerDocumentPersistenceBridge } from '@boardmark/viewer-shell'

declare global {
  interface Window {
    boardmarkDocument: BoardmarkDocumentBridge & {
      persistence: ViewerDocumentPersistenceBridge
    }
  }
}

export {}
