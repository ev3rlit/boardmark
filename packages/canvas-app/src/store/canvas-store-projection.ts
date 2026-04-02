import { DEFAULT_CANVAS_VIEWPORT, type CanvasSaveState, type CanvasViewport } from '@boardmark/canvas-domain'
import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import { createEmptyCanvasHistoryState } from '@canvas-app/services/canvas-history-service'
import type {
  CanvasDropState,
  CanvasHistoryState,
  CanvasStoreState
} from '@canvas-app/store/canvas-store-types'

type CanvasDocumentRecordPatchOptions = {
  documentState?: CanvasDocumentState
  saveState?: CanvasSaveState
  lastSavedAt?: number | null
  dropState?: CanvasDropState
  viewport?: CanvasViewport
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  history?: CanvasHistoryState
}

export function createCanvasDocumentRecordPatch(
  record: CanvasDocumentRecord,
  options?: CanvasDocumentRecordPatchOptions
): Partial<CanvasStoreState> {
  const documentState =
    options?.documentState ??
    createCanvasDocumentState({
      record,
      assetDirectoryHandle: options?.documentState?.assetDirectoryHandle,
      isPersisted: record.locator.kind === 'file',
      persistedSnapshotSource: record.locator.kind === 'file' ? record.source : null
    })

  return {
    document: record,
    lastParsedDocument: record,
    documentState,
    nodes: record.ast.nodes,
    edges: record.ast.edges,
    viewport: options?.viewport ?? record.ast.frontmatter.viewport ?? DEFAULT_CANVAS_VIEWPORT,
    selectedNodeIds: options?.selectedNodeIds ?? [],
    selectedEdgeIds: options?.selectedEdgeIds ?? [],
    parseIssues: record.issues,
    loadState: { status: 'ready' },
    saveState: options?.saveState ?? { status: 'idle' },
    draftSource: documentState.currentSource,
    persistedSnapshotSource: documentState.persistedSnapshotSource,
    isDirty: documentState.isDirty,
    lastSavedAt: options?.lastSavedAt ?? null,
    dropState: options?.dropState ?? { status: 'idle' },
    interactionOverrides: {},
    editingState: { status: 'idle' },
    conflictState: { status: 'idle' },
    invalidState: { status: 'valid' },
    history: options?.history ?? createEmptyCanvasHistoryState(),
    operationError: null
  }
}

export function createCanvasInvalidDocumentPatch(
  state: CanvasStoreState,
  documentState: CanvasDocumentState,
  message: string
): Partial<CanvasStoreState> {
  return {
    documentState,
    draftSource: documentState.currentSource,
    persistedSnapshotSource: documentState.persistedSnapshotSource,
    isDirty: documentState.isDirty,
    invalidState: {
      status: 'invalid',
      message
    },
    history: state.history,
    parseIssues: [
      {
        level: 'error',
        kind: 'invalid-node',
        message
      }
    ],
    operationError: message,
    document: state.lastParsedDocument,
    lastParsedDocument: state.lastParsedDocument,
    nodes: state.lastParsedDocument?.ast.nodes ?? state.nodes,
    edges: state.lastParsedDocument?.ast.edges ?? state.edges
  }
}
