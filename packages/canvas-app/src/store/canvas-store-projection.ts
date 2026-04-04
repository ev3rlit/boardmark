import { DEFAULT_CANVAS_VIEWPORT, type CanvasSaveState, type CanvasViewport } from '@boardmark/canvas-domain'
import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import { createEmptyCanvasHistoryState } from '@canvas-app/services/canvas-history-service'
import type {
  CanvasClipboardState,
  CanvasDropState,
  CanvasGroupSelectionState,
  CanvasHistoryState,
  CanvasStoreState
} from '@canvas-app/store/canvas-store-types'

type CanvasDocumentRecordPatchOptions = {
  documentState?: CanvasDocumentState
  saveState?: CanvasSaveState
  lastSavedAt?: number | null
  dropState?: CanvasDropState
  viewport?: CanvasViewport
  selectedGroupIds?: string[]
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  clipboardState?: CanvasClipboardState
  groupSelectionState?: CanvasGroupSelectionState
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
    groups: record.ast.groups,
    nodes: record.ast.nodes,
    edges: record.ast.edges,
    viewport: options?.viewport ?? record.ast.frontmatter.viewport ?? DEFAULT_CANVAS_VIEWPORT,
    selectedGroupIds: options?.selectedGroupIds ?? [],
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
    clipboardState: options?.clipboardState ?? { status: 'empty' },
    groupSelectionState: options?.groupSelectionState ?? { status: 'idle' },
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
    clipboardState: state.clipboardState,
    groupSelectionState: state.groupSelectionState,
    groups: state.lastParsedDocument?.ast.groups ?? state.groups,
    nodes: state.lastParsedDocument?.ast.nodes ?? state.nodes,
    edges: state.lastParsedDocument?.ast.edges ?? state.edges
  }
}
