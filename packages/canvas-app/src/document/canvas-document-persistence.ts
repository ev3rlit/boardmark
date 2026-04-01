import type {
  AsyncResult,
  CanvasDocumentLocator,
  CanvasDocumentPickerError
} from '@boardmark/canvas-repository'

export type CanvasDocumentPersistencePayload = {
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  source: string
}

export type CanvasDocumentPersistenceSaveInput = {
  defaultName: string
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  source: string
}

export type CanvasDocumentPersistenceBridge = {
  openDocument: () => Promise<
    AsyncResult<CanvasDocumentPersistencePayload, CanvasDocumentPickerError>
  >
  saveDocument: (
    input: CanvasDocumentPersistenceSaveInput
  ) => Promise<AsyncResult<CanvasDocumentPersistencePayload, CanvasDocumentPickerError>>
  saveDocumentAs: (
    input: Omit<CanvasDocumentPersistenceSaveInput, 'fileHandle'>
  ) => Promise<AsyncResult<CanvasDocumentPersistencePayload, CanvasDocumentPickerError>>
  subscribeExternalChanges?: (input: {
    locator: CanvasDocumentLocator
    fileHandle: FileSystemFileHandle | null
    onExternalChange: (source: string) => void
  }) => Promise<() => void> | (() => void)
}
