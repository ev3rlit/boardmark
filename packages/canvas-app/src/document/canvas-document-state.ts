import type { CanvasDocumentLocator, CanvasDocumentRecord } from '@boardmark/canvas-repository'

export type CanvasDocumentState = {
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  isPersisted: boolean
  currentSource: string
  persistedSnapshotSource: string | null
  isDirty: boolean
}

export function createCanvasDocumentState(params: {
  record: CanvasDocumentRecord
  fileHandle?: FileSystemFileHandle | null
  isPersisted: boolean
  persistedSnapshotSource?: string | null
  currentSource?: string
}): CanvasDocumentState {
  const currentSource = params.currentSource ?? params.record.source
  const persistedSnapshotSource = params.persistedSnapshotSource ?? null

  return {
    locator: params.record.locator,
    fileHandle: params.fileHandle ?? null,
    isPersisted: params.isPersisted,
    currentSource,
    persistedSnapshotSource,
    isDirty: readCanvasDocumentDirtyState(currentSource, persistedSnapshotSource)
  }
}

export function readCanvasDocumentDirtyState(
  currentSource: string,
  persistedSnapshotSource: string | null
) {
  if (persistedSnapshotSource === null) {
    return true
  }

  return currentSource !== persistedSnapshotSource
}
