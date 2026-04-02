import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge, CanvasImageAssetBridge } from '@boardmark/canvas-app'

declare global {
  interface Window {
    boardmarkDocument: BoardmarkDocumentBridge & {
      persistence: CanvasDocumentPersistenceBridge
      imageAssets: CanvasImageAssetBridge
    }
  }
}

export {}
