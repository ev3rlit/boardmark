import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'
import type {
  CanvasDocumentPersistenceBridge,
  CanvasImageAssetBridge,
  CanvasImageExportBridge
} from '@boardmark/canvas-app'

declare global {
  interface Window {
    boardmarkDocument: BoardmarkDocumentBridge & {
      imageExports: CanvasImageExportBridge
      persistence: CanvasDocumentPersistenceBridge
      imageAssets: CanvasImageAssetBridge
    }
  }
}

export {}
