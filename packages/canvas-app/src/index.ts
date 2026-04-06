export { CanvasApp, type CanvasAppCapabilities } from '@canvas-app/app/canvas-app'
export {
  MarkdownContentImageActionsProvider,
  useMarkdownContentImageActions,
  type MarkdownContentImageActions,
  type MarkdownContentImageExportOutcome,
  type FencedBlockImageExportRequest,
  type FencedBlockImageExportResult
} from '@boardmark/ui'
export {
  EMPTY_CANVAS_DOCUMENT_NAME,
  EMPTY_CANVAS_SOURCE
} from '@canvas-app/document/empty-canvas'
export {
  createCanvasDocumentState,
  readCanvasDocumentDirtyState,
  type CanvasDocumentState
} from '@canvas-app/document/canvas-document-state'
export {
  type CanvasImageExportBridge,
  type CanvasImageExportError,
  type CanvasImageExportSaveInput
} from '@canvas-app/document/canvas-image-export-bridge'
export {
  type CanvasImageAssetBridge,
  type CanvasImageAssetError,
  type CanvasImageAssetImportInput,
  type CanvasImageAssetImportPayload,
  type CanvasImageAssetResolvePayload
} from '@canvas-app/document/canvas-image-asset-bridge'
export { createFencedBlockImageActions } from '@canvas-app/services/fenced-block-image-actions'
export {
  type CanvasDocumentPersistenceBridge,
  type CanvasDocumentPersistencePayload,
  type CanvasDocumentPersistenceSaveInput
} from '@canvas-app/document/canvas-document-persistence'
export {
  createCanvasDocumentSaveService,
  type CanvasDocumentSaveMode,
  type CanvasDocumentSaveResult,
  type CanvasDocumentSaveService
} from '@canvas-app/services/save-service'
export {
  createCanvasDocumentEditService,
  type CanvasDocumentEditError,
  type CanvasDocumentEditIntent,
  type CanvasDocumentEditService
} from '@canvas-app/services/edit-service'
export {
  createCanvasEditTransactionResolver,
  type CanvasEditTransactionResolver,
  type TransactionResolver
} from '@canvas-app/services/edit-transaction-resolver'
export type {
  CanvasEditAnchor,
  CanvasEditPhase,
  CanvasEditTransaction,
  CanvasEditUnit,
  ResolvedCanvasEditTransaction,
  TransactionApplyError,
  TransactionResolveError
} from '@canvas-app/services/edit-transaction'
export {
  applyZoomStep,
  createCanvasStore,
  type CanvasStore,
  type CanvasConflictState,
  type CanvasEditingState,
  type CanvasHistoryEntry,
  type CanvasHistoryState,
  type CanvasStoreState
} from '@canvas-app/store/canvas-store'
