import type { StoreApi } from 'zustand'
import type {
  CanvasEdge,
  CanvasLoadState,
  CanvasNode,
  CanvasParseIssue,
  CanvasSaveState,
  CanvasViewport
} from '@boardmark/canvas-domain'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@canvas-app/document/canvas-document-persistence'
import type { CanvasDocumentState } from '@canvas-app/document/canvas-document-state'

export type ToolMode = 'select' | 'pan'

export type CanvasDropState =
  | { status: 'idle' }
  | { status: 'active' }
  | { status: 'opened'; name: string }
  | { status: 'error'; message: string }

export type CanvasEditingState =
  | { status: 'idle' }
  | { status: 'note'; objectId: string; markdown: string }
  | { status: 'shape'; objectId: string; markdown: string }
  | { status: 'edge'; edgeId: string; markdown: string }

export type CanvasConflictState =
  | { status: 'idle' }
  | { status: 'conflict'; diskSource: string }

export type CanvasInvalidState =
  | { status: 'valid' }
  | { status: 'invalid'; message: string }

export type CanvasInteractionOverrides = Record<
  string,
  Partial<{
    x: number
    y: number
    w: number
    h: number
  }>
>

export type CanvasStoreOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
  templateSource: string
}

export type CanvasStoreState = {
  document: CanvasDocumentRecord | null
  lastParsedDocument: CanvasDocumentRecord | null
  documentState: CanvasDocumentState | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  toolMode: ToolMode
  panShortcutActive: boolean
  loadState: CanvasLoadState
  saveState: CanvasSaveState
  parseIssues: CanvasParseIssue[]
  draftSource: string | null
  persistedSnapshotSource: string | null
  isDirty: boolean
  lastSavedAt: number | null
  dropState: CanvasDropState
  interactionOverrides: CanvasInteractionOverrides
  editingState: CanvasEditingState
  conflictState: CanvasConflictState
  invalidState: CanvasInvalidState
  operationError: string | null
  hydrateTemplate: () => Promise<void>
  resetToTemplate: () => Promise<void>
  createNewDocument: () => Promise<void>
  openDocument: () => Promise<void>
  openDroppedDocument: (input: { name: string; source: string }) => Promise<void>
  saveCurrentDocument: () => Promise<void>
  setPrimarySelectedNode: (nodeId: string | null) => void
  toggleSelectedNode: (nodeId: string) => void
  replaceSelectedNodes: (nodeIds: string[]) => void
  replaceSelectedEdges: (edgeIds: string[]) => void
  clearSelection: () => void
  clearSelectedNodes: () => void
  setDropActive: (active: boolean) => void
  setDropError: (message: string) => void
  setViewport: (viewport: CanvasViewport) => void
  setToolMode: (mode: ToolMode) => void
  setPanShortcutActive: (active: boolean) => void
  previewNodeMove: (nodeId: string, x: number, y: number) => void
  commitNodeMove: (nodeId: string, x: number, y: number) => Promise<void>
  previewNodeResize: (nodeId: string, geometry: {
    x: number
    y: number
    width: number
    height: number
  }) => void
  commitNodeResize: (nodeId: string, geometry: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<void>
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  createEdgeFromConnection: (from: string, to: string) => Promise<void>
  createNoteAtViewport: () => Promise<void>
  createShapeAtViewport: (input: {
    body: string
    component: string
    height: number
    width: number
  }) => Promise<void>
  createFrameAtViewport: () => Promise<void>
  deleteSelection: () => Promise<void>
  startNoteEditing: (nodeId: string) => void
  startShapeEditing: (nodeId: string) => void
  startEdgeEditing: (edgeId: string) => void
  updateEditingMarkdown: (markdown: string) => void
  commitInlineEditing: () => Promise<void>
  cancelInlineEditing: () => void
  reloadFromDisk: () => Promise<void>
  keepLocalDraft: () => void
}

export type CanvasStoreSetState = StoreApi<CanvasStoreState>['setState']
export type CanvasStoreGetState = StoreApi<CanvasStoreState>['getState']
