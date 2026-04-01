import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import {
  DEFAULT_CANVAS_VIEWPORT,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  ZOOM_STEP,
  type CanvasEdge,
  type CanvasEntryState,
  type CanvasLoadState,
  type CanvasNode,
  type CanvasParseIssue,
  type CanvasSaveState,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'

export type ToolMode = 'select' | 'pan'

type ViewerStoreOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  templateSource: string
}

export type ViewerStoreState = {
  document: CanvasDocumentRecord | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedNodeId: string | null
  toolMode: ToolMode
  loadState: CanvasLoadState
  saveState: CanvasSaveState
  entryState: CanvasEntryState
  parseIssues: CanvasParseIssue[]
  hydrateTemplate: () => Promise<void>
  resetToTemplate: () => Promise<void>
  createNewDocument: () => Promise<void>
  openDocument: () => Promise<void>
  saveCurrentDocument: () => Promise<void>
  setSelectedNodeId: (nodeId: string | null) => void
  setViewport: (viewport: CanvasViewport) => void
  setToolMode: (mode: ToolMode) => void
}

export type ViewerStore = ReturnType<typeof createViewerStore>

export function createViewerStore({
  documentPicker,
  documentRepository,
  templateSource
}: ViewerStoreOptions) {
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

    async hydrateTemplate() {
      await loadTemplate({
        set,
        documentRepository,
        templateSource
      })
    },

    async resetToTemplate() {
      await loadTemplate({
        set,
        documentRepository,
        templateSource
      })
    },

    async createNewDocument() {
      set({
        loadState: { status: 'loading' }
      })

      const locatorResult = await documentPicker.pickSaveLocator('untitled.canvas.md')

      if (!locatorResult.ok) {
        if (locatorResult.error.code === 'cancelled') {
          set({
            loadState: { status: 'ready' }
          })
          return
        }

        set({
          loadState: {
            status: 'error',
            message: locatorResult.error.message
          }
        })
        return
      }

      const saveResult = await documentRepository.save({
        locator: locatorResult.value,
        source: templateSource,
        isTemplate: false
      })

      if (!saveResult.ok) {
        set({
          loadState: {
            status: 'error',
            message: saveResult.error.message
          }
        })
        return
      }

      applyDocumentRecord(set, saveResult.value)
    },

    async openDocument() {
      set({
        loadState: { status: 'loading' }
      })

      const locatorResult = await documentPicker.pickOpenLocator()

      if (!locatorResult.ok) {
        if (locatorResult.error.code === 'cancelled') {
          set({
            loadState: { status: 'ready' }
          })
          return
        }

        set({
          loadState: {
            status: 'error',
            message: locatorResult.error.message
          }
        })
        return
      }

      const readResult = await documentRepository.read(locatorResult.value)

      if (!readResult.ok) {
        set({
          loadState: {
            status: 'error',
            message: readResult.error.message
          }
        })
        return
      }

      applyDocumentRecord(set, readResult.value)
    },

    async saveCurrentDocument() {
      const state = get()

      if (!state.document) {
        return
      }

      set({
        saveState: { status: 'saving' }
      })

      const locatorResult =
        state.document.locator.kind === 'file'
          ? {
              ok: true as const,
              value: state.document.locator
            }
          : await documentPicker.pickSaveLocator(state.document.name)

      if (!locatorResult.ok) {
        if (locatorResult.error.code === 'cancelled') {
          set({
            saveState: { status: 'idle' }
          })
          return
        }

        set({
          saveState: {
            status: 'error',
            message: locatorResult.error.message
          }
        })
        return
      }

      const saveResult = await documentRepository.save({
        locator: locatorResult.value,
        source: state.document.source,
        isTemplate: false
      })

      if (!saveResult.ok) {
        set({
          saveState: {
            status: 'error',
            message: saveResult.error.message
          }
        })
        return
      }

      const savedPath =
        saveResult.value.locator.kind === 'file'
          ? saveResult.value.locator.path
          : 'untitled.canvas.md'

      applyDocumentRecord(set, saveResult.value, {
        saveState: {
          status: 'saved',
          path: savedPath
        }
      })
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

async function loadTemplate({
  set,
  documentRepository,
  templateSource
}: {
  set: StoreApi<ViewerStoreState>['setState']
  documentRepository: CanvasDocumentRepositoryGateway
  templateSource: string
}) {
  set({
    loadState: { status: 'loading' }
  })

  const result = await documentRepository.readSource({
    locator: {
      kind: 'memory',
      key: 'startup-template',
      name: 'bundled-template.canvas.md'
    },
    source: templateSource,
    isTemplate: true
  })

  if (!result.ok) {
    set({
      loadState: {
        status: 'error',
        message: result.error.message
      }
    })
    return
  }

  applyDocumentRecord(set, result.value)
}

function applyDocumentRecord(
  set: StoreApi<ViewerStoreState>['setState'],
  record: CanvasDocumentRecord,
  options?: {
    saveState?: CanvasSaveState
  }
) {
  set({
    document: record,
    nodes: record.ast.nodes,
    edges: record.ast.edges,
    viewport: record.ast.frontmatter.viewport ?? DEFAULT_CANVAS_VIEWPORT,
    selectedNodeId: null,
    parseIssues: record.issues,
    loadState: { status: 'ready' },
    saveState: options?.saveState ?? { status: 'idle' }
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

export function applyZoomStep(viewport: CanvasViewport, direction: 'in' | 'out') {
  const delta = direction === 'in' ? ZOOM_STEP : -ZOOM_STEP

  return clampViewport({
    ...viewport,
    zoom: viewport.zoom + delta
  })
}
