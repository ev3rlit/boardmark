import type { AsyncResult } from '@boardmark/canvas-repository'

export type CanvasImageExportErrorCode =
  | 'cancelled'
  | 'save-failed'
  | 'unsupported'

export type CanvasImageExportError = {
  code: CanvasImageExportErrorCode
  message: string
}

export type CanvasImageExportSaveInput = {
  bytes: Uint8Array
  fileName: string
  mimeType: 'image/jpeg' | 'image/png'
}

export type CanvasImageExportBridge = {
  saveImage: (
    input: CanvasImageExportSaveInput
  ) => Promise<AsyncResult<void, CanvasImageExportError>>
}
