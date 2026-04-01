import type {
  AsyncResult,
  CanvasDocumentLocator,
  CanvasDocumentPickerError,
  CanvasDocumentRecord
} from '@boardmark/canvas-repository'

export type ViewerDocumentSession = {
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  isPersisted: boolean
  currentSource: string
  persistedSnapshotSource: string | null
  isDirty: boolean
}

export type ViewerDocumentPersistencePayload = {
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  source: string
}

export type ViewerDocumentPersistenceSaveInput = {
  defaultName: string
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  source: string
}

export type ViewerDocumentPersistenceBridge = {
  openDocument: () => Promise<
    AsyncResult<ViewerDocumentPersistencePayload, CanvasDocumentPickerError>
  >
  saveDocument: (
    input: ViewerDocumentPersistenceSaveInput
  ) => Promise<AsyncResult<ViewerDocumentPersistencePayload, CanvasDocumentPickerError>>
  saveDocumentAs: (
    input: Omit<ViewerDocumentPersistenceSaveInput, 'fileHandle'>
  ) => Promise<AsyncResult<ViewerDocumentPersistencePayload, CanvasDocumentPickerError>>
}

export function createDocumentSession(params: {
  record: CanvasDocumentRecord
  fileHandle?: FileSystemFileHandle | null
  isPersisted: boolean
  persistedSnapshotSource?: string | null
  currentSource?: string
}): ViewerDocumentSession {
  const currentSource = params.currentSource ?? params.record.source
  const persistedSnapshotSource = params.persistedSnapshotSource ?? null

  return {
    locator: params.record.locator,
    fileHandle: params.fileHandle ?? null,
    isPersisted: params.isPersisted,
    currentSource,
    persistedSnapshotSource,
    isDirty: readDirtyState(currentSource, persistedSnapshotSource)
  }
}

export function readDirtyState(
  currentSource: string,
  persistedSnapshotSource: string | null
) {
  if (persistedSnapshotSource === null) {
    return true
  }

  return currentSource !== persistedSnapshotSource
}
