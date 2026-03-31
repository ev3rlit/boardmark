import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import { parseCanvasDocument } from '@boardmark/canvas-parser'
import {
  DEFAULT_CANVAS_VIEWPORT,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  ZOOM_STEP,
  type CanvasDocumentState,
  type CanvasEdge,
  type CanvasEntryState,
  type CanvasLoadState,
  type CanvasNode,
  type CanvasParseIssue,
  type CanvasSaveState,
  type CanvasViewport,
  type DocumentGateway
} from '@boardmark/canvas-domain'

export type ToolMode = 'select' | 'pan'

export type ViewerStoreState = {
  document: CanvasDocumentState | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedNodeId: string | null
  toolMode: ToolMode
  loadState: CanvasLoadState
  saveState: CanvasSaveState
  entryState: CanvasEntryState
  parseIssues: CanvasParseIssue[]
  hydrateTemplate: (source: string) => void
  createNewDocument: () => Promise<void>
  openDocumentFromDisk: () => Promise<void>
  saveCurrentDocument: () => Promise<void>
  setSelectedNodeId: (nodeId: string | null) => void
  setViewport: (viewport: CanvasViewport) => void
  setToolMode: (mode: ToolMode) => void
}

export type ViewerStore = ReturnType<typeof createViewerStore>

export function createViewerStore(documentGateway: DocumentGateway) {
  return create<ViewerStoreState>((set, get) => ({
    document: null,
    nodes: [],
    edges: [],
    viewport: DEFAULT_CANVAS_VIEWPORT,
    selectedNodeId: null,
    toolMode: 'select',
    loadState: { status: 'idle' },
    saveState: { status: 'idle' },
    entryState: { showActions: true },
    parseIssues: [],

    hydrateTemplate(source) {
      applyDocumentSource(set, {
        path: null,
        source,
        isTemplate: true
      })
    },

    async createNewDocument() {
      set({
        loadState: { status: 'loading' }
      })

      const result = await documentGateway.newFileFromTemplate()

      if (!result.ok) {
        if (result.error.code === 'cancelled') {
          set({
            loadState: { status: 'ready' }
          })
          return
        }

        set({
          loadState: {
            status: 'error',
            message: result.error.message
          }
        })
        return
      }

      applyDocumentSource(set, {
        path: result.value.path,
        source: result.value.source,
        isTemplate: false
      })
    },

    async openDocumentFromDisk() {
      set({
        loadState: { status: 'loading' }
      })

      const result = await documentGateway.openFile()

      if (!result.ok) {
        if (result.error.code === 'cancelled') {
          set({
            loadState: { status: 'ready' }
          })
          return
        }

        set({
          loadState: {
            status: 'error',
            message: result.error.message
          }
        })
        return
      }

      applyDocumentSource(set, {
        path: result.value.path,
        source: result.value.source,
        isTemplate: false
      })
    },

    async saveCurrentDocument() {
      const state = get()

      if (!state.document) {
        return
      }

      set({
        saveState: { status: 'saving' }
      })

      const result = await documentGateway.saveFile({
        path: state.document.path,
        content: state.document.source
      })

      if (!result.ok) {
        if (result.error.code === 'cancelled') {
          set({
            saveState: { status: 'idle' }
          })
          return
        }

        set({
          saveState: {
            status: 'error',
            message: result.error.message
          }
        })
        return
      }

      set((current) => ({
        document: current.document
          ? {
              ...current.document,
              path: result.value.path,
              name: readDocumentName(result.value.path),
              isTemplate: false
            }
          : current.document,
        saveState: {
          status: 'saved',
          path: result.value.path
        }
      }))
    },

    setSelectedNodeId(nodeId) {
      set((state) => {
        if (state.selectedNodeId === nodeId) {
          return state
        }

        return {
          ...state,
          selectedNodeId: nodeId
        }
      })
    },

    setViewport(viewport) {
      set((state) => {
        const nextViewport = clampViewport(viewport)

        if (isSameViewport(state.viewport, nextViewport)) {
          return state
        }

        return {
          ...state,
          viewport: nextViewport
        }
      })
    },

    setToolMode(mode) {
      set({
        toolMode: mode
      })
    }
  }))
}

function applyDocumentSource(
  set: StoreApi<ViewerStoreState>['setState'],
  input: {
    path: string | null
    source: string
    isTemplate: boolean
  }
) {
  const result = parseCanvasDocument(input.source)

  if (result.isErr()) {
    set({
      document: {
        path: input.path,
        source: input.source,
        isTemplate: input.isTemplate,
        name: readDocumentName(input.path)
      },
      nodes: [],
      edges: [],
      viewport: DEFAULT_CANVAS_VIEWPORT,
      selectedNodeId: null,
      parseIssues: [
        {
          kind: 'invalid-frontmatter',
          level: 'error',
          message: result.error.message
        }
      ],
      loadState: {
        status: 'error',
        message: result.error.message
      }
    })
    return
  }

  set({
    document: {
      path: input.path,
      source: input.source,
      isTemplate: input.isTemplate,
      name: readDocumentName(input.path)
    },
    nodes: result.value.ast.nodes,
    edges: result.value.ast.edges,
    viewport: result.value.ast.frontmatter.viewport ?? DEFAULT_CANVAS_VIEWPORT,
    selectedNodeId: null,
    parseIssues: result.value.issues,
    loadState: { status: 'ready' },
    saveState: { status: 'idle' }
  })
}

function clampZoom(zoom: number) {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number(zoom.toFixed(2))))
}

function clampViewport(viewport: CanvasViewport): CanvasViewport {
  return {
    x: Number(viewport.x.toFixed(2)),
    y: Number(viewport.y.toFixed(2)),
    zoom: clampZoom(viewport.zoom)
  }
}

function isSameViewport(left: CanvasViewport, right: CanvasViewport) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom
}

function readDocumentName(path: string | null) {
  if (!path) {
    return 'untitled.canvas.md'
  }

  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'untitled.canvas.md'
}
