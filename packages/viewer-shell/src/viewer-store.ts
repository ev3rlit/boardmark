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
import {
  createDocumentSession,
  type ViewerDocumentPersistenceBridge,
  type ViewerDocumentSession
} from './document-session'
import { createCanvasDocumentSaveService } from './save-service'

export type ToolMode = 'select' | 'pan'

type ViewerStoreOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: ViewerDocumentPersistenceBridge
  templateSource: string
}

export type ViewerStoreState = {
  document: CanvasDocumentRecord | null
  documentSession: ViewerDocumentSession | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedNodeId: string | null
  toolMode: ToolMode
  loadState: CanvasLoadState
  saveState: CanvasSaveState
  entryState: CanvasEntryState
  parseIssues: CanvasParseIssue[]
  currentSource: string | null
  persistedSnapshotSource: string | null
  isDirty: boolean
  lastSavedAt: number | null
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
  documentPersistenceBridge,
  templateSource
}: ViewerStoreOptions) {
  const saveService = createCanvasDocumentSaveService({
    documentPicker,
    documentRepository,
    documentPersistenceBridge
  })

  return create<ViewerStoreState>((set, get) => ({
    document: null,
    documentSession: null,
    nodes: [],
    edges: [],
    viewport: DEFAULT_CANVAS_VIEWPORT,
    selectedNodeId: null,
    toolMode: 'select',
    loadState: { status: 'idle' },
    saveState: { status: 'idle' },
    entryState: { showActions: true },
    parseIssues: [],
    currentSource: null,
    persistedSnapshotSource: null,
    isDirty: false,
    lastSavedAt: null,

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
      await loadTemplate({
        set,
        documentRepository,
        templateSource
      })

      await get().saveCurrentDocument()
    },

    async openDocument() {
      set({
        loadState: { status: 'loading' }
      })

      if (documentPersistenceBridge) {
        const openResult = await documentPersistenceBridge.openDocument()

        if (!openResult.ok) {
          if (openResult.error.code === 'cancelled') {
            set({
              loadState: { status: 'ready' }
            })
            return
          }

          set({
            loadState: {
              status: 'error',
              message: openResult.error.message
            }
          })
          return
        }

        const readResult = await documentRepository.readSource({
          locator: openResult.value.locator,
          source: openResult.value.source,
          isTemplate: false
        })

        if (!readResult.ok) {
          set({
            loadState: {
              status: 'error',
              message: readResult.error.message
            }
          })
          return
        }

        applyDocumentRecord(set, readResult.value, {
          documentSession: createDocumentSession({
            record: readResult.value,
            fileHandle: openResult.value.fileHandle,
            isPersisted: true,
            persistedSnapshotSource: openResult.value.source
          })
        })
        return
      }

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

      if (!state.document || !state.documentSession) {
        return
      }

      set({
        saveState: { status: 'saving' }
      })

      const saveResult = await saveService.save(
        state.document,
        state.documentSession,
        'explicit'
      )

      if (saveResult.status === 'cancelled') {
        set({
          saveState: { status: 'idle' }
        })
        return
      }

      if (saveResult.status === 'error') {
        set({
          saveState: {
            status: 'error',
            message: saveResult.message
          }
        })
        return
      }

      applyDocumentRecord(set, saveResult.document, {
        documentSession: saveResult.documentSession,
        saveState: {
          status: 'saved',
          path: saveResult.path
        },
        lastSavedAt: saveResult.savedAt
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

  applyDocumentRecord(set, result.value, {
    documentSession: createDocumentSession({
      record: result.value,
      isPersisted: false,
      persistedSnapshotSource: null
    })
  })
}

function applyDocumentRecord(
  set: StoreApi<ViewerStoreState>['setState'],
  record: CanvasDocumentRecord,
  options?: {
    documentSession?: ViewerDocumentSession
    saveState?: CanvasSaveState
    lastSavedAt?: number | null
  }
) {
  const documentSession =
    options?.documentSession ??
    createDocumentSession({
      record,
      isPersisted: record.locator.kind === 'file',
      persistedSnapshotSource: record.locator.kind === 'file' ? record.source : null
    })

  set({
    document: record,
    documentSession,
    nodes: record.ast.nodes,
    edges: record.ast.edges,
    viewport: record.ast.frontmatter.viewport ?? DEFAULT_CANVAS_VIEWPORT,
    selectedNodeId: null,
    parseIssues: record.issues,
    loadState: { status: 'ready' },
    saveState: options?.saveState ?? { status: 'idle' },
    currentSource: documentSession.currentSource,
    persistedSnapshotSource: documentSession.persistedSnapshotSource,
    isDirty: documentSession.isDirty,
    lastSavedAt: options?.lastSavedAt ?? null
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
