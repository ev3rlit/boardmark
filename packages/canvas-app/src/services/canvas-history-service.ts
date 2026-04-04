import type { CanvasDocumentRecord, CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import type {
  CanvasHistoryEntry,
  CanvasHistoryState,
  CanvasStoreState
} from '@canvas-app/store/canvas-store-types'

const DEFAULT_MAX_HISTORY_ENTRIES = 100

type CanvasHistoryServiceOptions = {
  documentRepository: CanvasDocumentRepositoryGateway
  maxEntries?: number
}

type CanvasHistoryRestoreResult =
  | { status: 'blocked'; message: string }
  | { status: 'error'; message: string }
  | {
      status: 'restored'
      documentState: CanvasDocumentState
      entry: CanvasHistoryEntry
      record: CanvasDocumentRecord
    }

type CanvasHistoryTransition = {
  history: CanvasHistoryState
  target: CanvasHistoryEntry
}

export type CanvasHistoryService = {
  canRedo: (history: CanvasHistoryState) => boolean
  canUndo: (history: CanvasHistoryState) => boolean
  captureEntry: (
    state: Pick<CanvasStoreState, 'draftSource' | 'selectedEdgeIds' | 'selectedGroupIds' | 'selectedNodeIds'>,
    label: string
  ) => CanvasHistoryEntry | null
  pushEntry: (history: CanvasHistoryState, entry: CanvasHistoryEntry) => CanvasHistoryState
  redo: (history: CanvasHistoryState, currentEntry: CanvasHistoryEntry) => CanvasHistoryTransition | null
  restoreEntry: (input: {
    document: CanvasDocumentRecord | null
    documentState: CanvasDocumentState | null
    entry: CanvasHistoryEntry
  }) => Promise<CanvasHistoryRestoreResult>
  undo: (history: CanvasHistoryState, currentEntry: CanvasHistoryEntry) => CanvasHistoryTransition | null
}

export function createCanvasHistoryService({
  documentRepository,
  maxEntries = DEFAULT_MAX_HISTORY_ENTRIES
}: CanvasHistoryServiceOptions): CanvasHistoryService {
  return {
    canRedo(history) {
      return history.future.length > 0
    },

    canUndo(history) {
      return history.past.length > 0
    },

    captureEntry(state, label) {
      if (!state.draftSource) {
        return null
      }

      return {
        label,
        source: state.draftSource,
        selectedGroupIds: [...state.selectedGroupIds],
        selectedNodeIds: [...state.selectedNodeIds],
        selectedEdgeIds: [...state.selectedEdgeIds]
      }
    },

    pushEntry(history, entry) {
      return {
        past: trimHistoryEntries([...history.past, cloneHistoryEntry(entry)], maxEntries),
        future: []
      }
    },

    redo(history, currentEntry) {
      const target = history.future[0]

      if (!target) {
        return null
      }

      return {
        target: cloneHistoryEntry(target),
        history: {
          past: trimHistoryEntries([...history.past, cloneHistoryEntry(currentEntry)], maxEntries),
          future: history.future.slice(1).map(cloneHistoryEntry)
        }
      }
    },

    async restoreEntry({ document, documentState, entry }) {
      if (!document || !documentState) {
        return {
          status: 'blocked',
          message: 'No editable document is loaded.'
        }
      }

      const result = await documentRepository.readSource({
        locator: document.locator,
        source: entry.source,
        isTemplate: document.isTemplate
      })

      if (!result.ok) {
        return {
          status: 'error',
          message: result.error.message
        }
      }

      return {
        status: 'restored',
        entry: cloneHistoryEntry(entry),
        record: result.value,
        documentState: createCanvasDocumentState({
          record: result.value,
          assetDirectoryHandle: documentState.assetDirectoryHandle,
          fileHandle: documentState.fileHandle,
          isPersisted: documentState.isPersisted,
          persistedSnapshotSource: documentState.persistedSnapshotSource,
          currentSource: entry.source
        })
      }
    },

    undo(history, currentEntry) {
      const target = history.past.at(-1)

      if (!target) {
        return null
      }

      return {
        target: cloneHistoryEntry(target),
        history: {
          past: history.past.slice(0, -1).map(cloneHistoryEntry),
          future: [cloneHistoryEntry(currentEntry), ...history.future.map(cloneHistoryEntry)]
        }
      }
    }
  }
}

export function createEmptyCanvasHistoryState(): CanvasHistoryState {
  return {
    past: [],
    future: []
  }
}

function cloneHistoryEntry(entry: CanvasHistoryEntry): CanvasHistoryEntry {
  return {
    label: entry.label,
    source: entry.source,
    selectedGroupIds: [...entry.selectedGroupIds],
    selectedNodeIds: [...entry.selectedNodeIds],
    selectedEdgeIds: [...entry.selectedEdgeIds]
  }
}

function trimHistoryEntries(entries: CanvasHistoryEntry[], maxEntries: number) {
  if (entries.length <= maxEntries) {
    return entries
  }

  return entries.slice(entries.length - maxEntries)
}
