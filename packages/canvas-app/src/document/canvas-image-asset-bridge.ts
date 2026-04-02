import type { AsyncResult, CanvasDocumentRecord } from '@boardmark/canvas-repository'
import type { CanvasDocumentState } from '@canvas-app/document/canvas-document-state'

export type CanvasImageAssetErrorCode =
  | 'cancelled'
  | 'import-failed'
  | 'resolve-failed'
  | 'open-failed'
  | 'reveal-failed'
  | 'permission-denied'
  | 'unsupported'

export type CanvasImageAssetError = {
  code: CanvasImageAssetErrorCode
  message: string
}

export type CanvasImageAssetImportInput = {
  document: CanvasDocumentRecord
  documentState: CanvasDocumentState
  bytes: Uint8Array
  fileName: string
}

export type CanvasImageAssetImportPayload = {
  src: string
}

export type CanvasImageAssetResolvePayload = {
  src: string
}

export type CanvasImageAssetBridge = {
  ensureDocumentAssetAccess?: (
    input: {
      document: CanvasDocumentRecord
      documentState: CanvasDocumentState
    }
  ) => Promise<AsyncResult<FileSystemDirectoryHandle | null, CanvasImageAssetError>>
  importImageAsset: (
    input: CanvasImageAssetImportInput
  ) => Promise<AsyncResult<CanvasImageAssetImportPayload, CanvasImageAssetError>>
  resolveImageSource: (
    input: {
      document: CanvasDocumentRecord | null
      documentState: CanvasDocumentState | null
      src: string
    }
  ) => Promise<AsyncResult<CanvasImageAssetResolvePayload, CanvasImageAssetError>>
  openSource: (
    input: {
      document: CanvasDocumentRecord | null
      documentState: CanvasDocumentState | null
      src: string
    }
  ) => Promise<AsyncResult<void, CanvasImageAssetError>>
  revealSource?: (
    input: {
      document: CanvasDocumentRecord | null
      documentState: CanvasDocumentState | null
      src: string
    }
  ) => Promise<AsyncResult<void, CanvasImageAssetError>>
}
