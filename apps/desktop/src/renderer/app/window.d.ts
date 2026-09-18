import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'
import type { BoardFileBridge } from '../../../../../packages/canvas-repository/src/board-file-contract'
import type {
  CanvasDocumentPersistenceBridge,
  CanvasImageAssetBridge,
  CanvasImageExportBridge
} from '@boardmark/canvas-app'

declare global {
  interface Window {
    boardmarkFiles?: BoardFileBridge
    boardmarkDocument: BoardmarkDocumentBridge & {
      imageExports: CanvasImageExportBridge
      persistence: CanvasDocumentPersistenceBridge
      imageAssets: CanvasImageAssetBridge
    }
  }
}

export {}
