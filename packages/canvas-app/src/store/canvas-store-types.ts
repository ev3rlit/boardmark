import type { StoreApi } from 'zustand'
import type { JSONContent } from '@tiptap/core'
import type {
  BuiltInImageResolution,
  CanvasEdge,
  CanvasGroup,
  CanvasGroupMembership,
  CanvasLoadState,
  CanvasNode,
  CanvasObjectAt,
  CanvasObjectStyle,
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
import type { CanvasImageAssetBridge } from '@canvas-app/document/canvas-image-asset-bridge'
import type { CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import type { CanvasObjectArrangeMode } from '@canvas-app/canvas-object-types'

export type ToolMode = 'select' | 'pan'

export type CanvasDropState =
  | { status: 'idle' }
  | { status: 'active' }
  | { status: 'opened'; name: string }
  | { status: 'error'; message: string }

export type CanvasEditingTarget =
  | { kind: 'object-body'; component: string; objectId: string }
  | { kind: 'edge-label'; edgeId: string }

export type CanvasEditingSurface = 'textarea' | 'wysiwyg'

export type CanvasEditingFlushState =
  | { status: 'idle' }
  | { status: 'debouncing' }
  | { reason: 'auto' | 'blur' | 'explicit' | 'close' | 'file-action'; status: 'flushing' }

export type CanvasEditingBlockMode =
  | { status: 'none' }
  | { status: 'code-fenced-source' }
  | {
      blockKind: 'mermaid' | 'sandpack'
      status: 'special-fenced-source'
    }
  | { status: 'html-fallback' }

export type CanvasEditingInteractionState = 'active' | 'inactive'

export type CanvasEditingSessionState = {
  baselineDocument: JSONContent | null
  baselineMarkdown: string
  blockMode: CanvasEditingBlockMode
  draftDocument: JSONContent | null
  dirty: boolean
  draftMarkdown: string
  error: string | null
  flushStatus: CanvasEditingFlushState
  interaction: CanvasEditingInteractionState
  status: 'active'
  surface: CanvasEditingSurface
  target: CanvasEditingTarget
}

export type CanvasEditingState =
  | { status: 'idle' }
  | CanvasEditingSessionState

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

export type CanvasPointer = {
  x: number
  y: number
}

export type CanvasViewportSize = {
  width: number
  height: number
}

export type CanvasTemporaryPanState = 'active' | 'deferred' | 'inactive'

export type CanvasPointerInteractionState =
  | { status: 'idle' }
  | {
      phase: 'dragging' | 'pending'
      status: 'selection-box'
    }
  | { status: 'node-drag' }
  | { status: 'edge-reconnect' }
  | {
      source: 'temporary-pan' | 'tool'
      status: 'pane-pan'
    }

export type CanvasNodeMove = {
  nodeId: string
  x: number
  y: number
}

export type CanvasClipboardPayload = {
  edges: CanvasClipboardEdge[]
  groups: CanvasClipboardGroup[]
  nodes: CanvasClipboardNode[]
  origin: CanvasPointer | null
}

export type CanvasClipboardNode = {
  id: string
  component: string
  at: CanvasObjectAt
  z?: number
  locked?: boolean
  style?: CanvasObjectStyle
  body?: string
  src?: string
  alt?: string
  title?: string
  lockAspectRatio?: boolean
}

export type CanvasClipboardEdge = {
  id: string
  from: string
  to: string
  z?: number
  locked?: boolean
  style?: CanvasObjectStyle
  body?: string
}

export type CanvasClipboardGroup = {
  id: string
  z?: number
  locked?: boolean
  body?: string
  members: CanvasGroupMembership
}

export type CanvasClipboardState =
  | { status: 'empty' }
  | { status: 'ready'; payload: CanvasClipboardPayload }

export type CanvasGroupSelectionState =
  | { status: 'idle' }
  | { status: 'group-selected'; groupId: string }
  | { status: 'drilldown'; groupId: string; nodeId: string }

export type CanvasSelectionToolbarState = {
  nodeId: string | null
  target: 'bg' | 'stroke' | null
  customPickerOpen: boolean
}

export type CanvasHistoryEntry = {
  label: string
  source: string
  selectedGroupIds: string[]
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
}

export type CanvasHistoryState = {
  past: CanvasHistoryEntry[]
  future: CanvasHistoryEntry[]
}

export type CanvasSmartGuidesState = {
  gridSnappingEnabled: boolean
}

export type CanvasStoreOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
  imageAssetBridge?: CanvasImageAssetBridge
  templateSource: string
}

export type CanvasStoreState = {
  document: CanvasDocumentRecord | null
  lastParsedDocument: CanvasDocumentRecord | null
  documentState: CanvasDocumentState | null
  groups: CanvasGroup[]
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedGroupIds: string[]
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  toolMode: ToolMode
  temporaryPanState: CanvasTemporaryPanState
  pointerInteractionState: CanvasPointerInteractionState
  lastCanvasPointer: CanvasPointer | null
  viewportSize: CanvasViewportSize
  smartGuides: CanvasSmartGuidesState
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
  history: CanvasHistoryState
  clipboardState: CanvasClipboardState
  groupSelectionState: CanvasGroupSelectionState
  selectionToolbarState: CanvasSelectionToolbarState
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
  setViewportSize: (size: CanvasViewportSize) => void
  setGridSnappingEnabled: (enabled: boolean) => void
  setToolMode: (mode: ToolMode) => void
  setTemporaryPanState: (state: CanvasTemporaryPanState) => void
  setPointerInteractionState: (state: CanvasPointerInteractionState) => void
  setLastCanvasPointer: (pointer: CanvasPointer | null) => void
  previewNodeMove: (nodeId: string, x: number, y: number) => void
  commitNodeMove: (nodeId: string, x: number, y: number) => Promise<void>
  commitNodeMoves: (moves: CanvasNodeMove[]) => Promise<void>
  previewNodeResize: (nodeId: string, geometry: {
    x: number
    y: number
    width: number
    height: number
    preserveAutoHeight?: boolean
  }) => void
  commitNodeResize: (nodeId: string, geometry: {
    x: number
    y: number
    width: number
    height: number
    preserveAutoHeight?: boolean
  }) => Promise<void>
  resetNodeHeight: (nodeId: string) => Promise<void>
  setSelectedObjectColor: (target: 'bg' | 'stroke', color: string) => Promise<void>
  setSelectionToolbarState: (state: CanvasSelectionToolbarState) => void
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  createEdgeFromConnection: (from: string, to: string) => Promise<void>
  createNoteAtViewport: () => Promise<void>
  createShapeAtViewport: (input: {
    body: string
    component: string
    height: number
    width: number
  }) => Promise<void>
  insertImageFromLink: (input: {
    alt: string
    lockAspectRatio?: boolean
    src: string
    title?: string
  }) => Promise<void>
  insertImageFromFile: (file: File) => Promise<void>
  insertImageFromClipboard: (file: File) => Promise<void>
  insertImageFromDrop: (file: File) => Promise<void>
  createMarkdownImageAsset: (file: File) => Promise<string | null>
  replaceSelectedImageFromFile: (file: File) => Promise<void>
  openSelectedImageSource: () => Promise<void>
  revealSelectedImageSource: () => Promise<void>
  toggleSelectedImageLockAspectRatio: () => Promise<void>
  updateSelectedImageAltText: (alt: string) => Promise<void>
  resolveImageSource: (src: string) => Promise<BuiltInImageResolution>
  createFrameAtViewport: () => Promise<void>
  deleteSelection: () => Promise<void>
  selectAllObjects: () => void
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
    groupSelectionState?: CanvasGroupSelectionState
  }) => void
  selectNodeFromCanvas: (nodeId: string, additive: boolean) => void
  selectEdgeFromCanvas: (edgeId: string, additive: boolean) => void
  copySelection: () => Promise<void>
  cutSelection: () => Promise<void>
  pasteClipboard: () => Promise<void>
  pasteClipboardInPlace: () => Promise<void>
  duplicateSelection: () => Promise<void>
  nudgeSelection: (dx: number, dy: number) => Promise<void>
  arrangeSelection: (mode: CanvasObjectArrangeMode) => Promise<void>
  setSelectionLocked: (locked: boolean) => Promise<void>
  groupSelection: () => Promise<void>
  ungroupSelection: () => Promise<void>
  startObjectEditing: (nodeId: string) => void
  startEdgeEditing: (edgeId: string) => void
  updateEditingDocument: (content: JSONContent) => void
  updateEditingMarkdown: (markdown: string) => void
  setEditingBlockMode: (blockMode: CanvasEditingBlockMode) => void
  setEditingInteraction: (interaction: CanvasEditingInteractionState) => void
  flushEditingSession: (options?: {
    close?: boolean
    reason?: 'auto' | 'blur' | 'explicit' | 'close' | 'file-action'
  }) => Promise<boolean>
  commitInlineEditing: () => Promise<boolean>
  cancelInlineEditing: () => void
  reloadFromDisk: () => Promise<void>
  keepLocalDraft: () => void
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export type CanvasStoreSetState = StoreApi<CanvasStoreState>['setState']
export type CanvasStoreGetState = StoreApi<CanvasStoreState>['getState']
