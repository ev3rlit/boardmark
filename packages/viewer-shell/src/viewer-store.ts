import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import {
  DEFAULT_CANVAS_VIEWPORT,
  DEFAULT_NOTE_WIDTH,
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
  createCanvasDocumentEditService,
  type CanvasDocumentEditIntent
} from './edit-service'
import {
  createDocumentSession,
  type ViewerDocumentPersistenceBridge,
  type ViewerDocumentSession
} from './document-session'
import { createCanvasDocumentSaveService } from './save-service'

export type ToolMode = 'select' | 'pan'

export type ViewerDropState =
  | { status: 'idle' }
  | { status: 'active' }
  | { status: 'opened'; name: string }
  | { status: 'error'; message: string }

export type ViewerEditingState =
  | { status: 'idle' }
  | { status: 'note'; objectId: string; markdown: string }
  | { status: 'edge'; edgeId: string; markdown: string }

export type ViewerConflictState =
  | { status: 'idle' }
  | { status: 'conflict'; diskSource: string }

export type ViewerInvalidState =
  | { status: 'valid' }
  | { status: 'invalid'; message: string }

export type ViewerInteractionOverrides = Record<
  string,
  Partial<{
    x: number
    y: number
    w: number
  }>
>

type ViewerStoreOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: ViewerDocumentPersistenceBridge
  templateSource: string
}

export type ViewerStoreState = {
  document: CanvasDocumentRecord | null
  lastParsedDocument: CanvasDocumentRecord | null
  documentSession: ViewerDocumentSession | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  toolMode: ToolMode
  loadState: CanvasLoadState
  saveState: CanvasSaveState
  entryState: CanvasEntryState
  parseIssues: CanvasParseIssue[]
  draftSource: string | null
  persistedSnapshotSource: string | null
  isDirty: boolean
  lastSavedAt: number | null
  dropState: ViewerDropState
  interactionOverrides: ViewerInteractionOverrides
  editingState: ViewerEditingState
  conflictState: ViewerConflictState
  invalidState: ViewerInvalidState
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
  previewNodeMove: (nodeId: string, x: number, y: number) => void
  commitNodeMove: (nodeId: string, x: number, y: number) => Promise<void>
  previewNodeResize: (nodeId: string, width: number) => void
  commitNodeResize: (nodeId: string, width: number) => Promise<void>
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  createEdgeFromConnection: (from: string, to: string) => Promise<void>
  createNoteAtViewport: () => Promise<void>
  deleteSelection: () => Promise<void>
  startNoteEditing: (nodeId: string) => void
  startEdgeEditing: (edgeId: string) => void
  updateEditingMarkdown: (markdown: string) => void
  commitInlineEditing: () => Promise<void>
  cancelInlineEditing: () => void
  reloadFromDisk: () => Promise<void>
  keepLocalDraft: () => void
}

export type ViewerStore = ReturnType<typeof createViewerStore>

export function createViewerStore({
  documentPicker,
  documentRepository,
  documentPersistenceBridge,
  templateSource
}: ViewerStoreOptions) {
  let droppedDocumentSequence = 0
  let disposeExternalChanges: (() => void) | null = null
  const editService = createCanvasDocumentEditService()
  const saveService = createCanvasDocumentSaveService({
    documentPicker,
    documentRepository,
    documentPersistenceBridge
  })

  const store = create<ViewerStoreState>((set, get) => ({
    document: null,
    lastParsedDocument: null,
    documentSession: null,
    nodes: [],
    edges: [],
    viewport: DEFAULT_CANVAS_VIEWPORT,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    toolMode: 'select',
    loadState: { status: 'idle' },
    saveState: { status: 'idle' },
    entryState: { showActions: true },
    parseIssues: [],
    draftSource: null,
    persistedSnapshotSource: null,
    isDirty: false,
    lastSavedAt: null,
    dropState: { status: 'idle' },
    interactionOverrides: {},
    editingState: { status: 'idle' },
    conflictState: { status: 'idle' },
    invalidState: { status: 'valid' },
    operationError: null,

    async hydrateTemplate() {
      await loadTemplate({
        set,
        documentRepository,
        templateSource,
        onRecord(record) {
          return createDocumentSession({
            record,
            isPersisted: false,
            persistedSnapshotSource: null
          })
        }
      })
      clearExternalSubscription()
    },

    async resetToTemplate() {
      await get().hydrateTemplate()
    },

    async createNewDocument() {
      await get().hydrateTemplate()
      await get().saveCurrentDocument()
    },

    async openDocument() {
      set({
        loadState: { status: 'loading' },
        operationError: null
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
        await subscribeToExternalChanges()
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
      clearExternalSubscription()
    },

    async saveCurrentDocument() {
      const state = get()

      if (!state.document || !state.documentSession || state.invalidState.status === 'invalid') {
        set({
          operationError:
            state.invalidState.status === 'invalid'
              ? state.invalidState.message
              : 'No editable document is loaded.'
        })
        return
      }

      set({
        saveState: { status: 'saving' },
        operationError: null
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
        lastSavedAt: saveResult.savedAt,
        viewport: get().viewport
      })
      await subscribeToExternalChanges()
    },

    async openDroppedDocument({ name, source }) {
      set({
        loadState: { status: 'loading' },
        operationError: null
      })

      const result = await documentRepository.readSource({
        locator: {
          kind: 'memory',
          key: `dropped-document-${droppedDocumentSequence}`,
          name
        },
        source,
        isTemplate: false
      })

      droppedDocumentSequence += 1

      if (!result.ok) {
        set({
          dropState: {
            status: 'error',
            message: result.error.message
          },
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
        }),
        dropState: {
          status: 'opened',
          name
        }
      })
      clearExternalSubscription()
    },

    setPrimarySelectedNode(nodeId) {
      set((state) => {
        const nextSelectedNodeIds = nodeId ? [nodeId] : []

        if (
          areSameIds(state.selectedNodeIds, nextSelectedNodeIds) &&
          state.selectedEdgeIds.length === 0
        ) {
          return state
        }

        return {
          ...state,
          selectedNodeIds: nextSelectedNodeIds,
          selectedEdgeIds: []
        }
      })
    },

    toggleSelectedNode(nodeId) {
      set((state) => {
        const hasNode = state.selectedNodeIds.includes(nodeId)
        return {
          ...state,
          selectedNodeIds: hasNode
            ? state.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
            : [...state.selectedNodeIds, nodeId],
          selectedEdgeIds: []
        }
      })
    },

    replaceSelectedNodes(nodeIds) {
      set((state) => {
        const nextSelectedNodeIds = [...new Set(nodeIds)]
        const nextSelectedEdgeIds = nodeIds.length > 0 ? [] : state.selectedEdgeIds

        if (
          areSameIds(state.selectedNodeIds, nextSelectedNodeIds) &&
          areSameIds(state.selectedEdgeIds, nextSelectedEdgeIds)
        ) {
          return state
        }

        return {
          ...state,
          selectedNodeIds: nextSelectedNodeIds,
          selectedEdgeIds: nextSelectedEdgeIds
        }
      })
    },

    replaceSelectedEdges(edgeIds) {
      set((state) => {
        const nextSelectedEdgeIds = [...new Set(edgeIds)]
        const nextSelectedNodeIds = edgeIds.length > 0 ? [] : state.selectedNodeIds

        if (
          areSameIds(state.selectedEdgeIds, nextSelectedEdgeIds) &&
          areSameIds(state.selectedNodeIds, nextSelectedNodeIds)
        ) {
          return state
        }

        return {
          ...state,
          selectedEdgeIds: nextSelectedEdgeIds,
          selectedNodeIds: nextSelectedNodeIds
        }
      })
    },

    clearSelection() {
      set((state) => {
        if (state.selectedNodeIds.length === 0 && state.selectedEdgeIds.length === 0) {
          return state
        }

        return {
          ...state,
          selectedNodeIds: [],
          selectedEdgeIds: []
        }
      })
    },

    clearSelectedNodes() {
      get().clearSelection()
    },

    setDropActive(active) {
      set((state) => ({
        ...state,
        dropState: active ? { status: 'active' } : { status: 'idle' }
      }))
    },

    setDropError(message) {
      set((state) => ({
        ...state,
        dropState: {
          status: 'error',
          message
        }
      }))
    },

    setViewport(viewport) {
      set((state) => {
        const nextViewport = clampViewport(viewport)
        return isSameViewport(state.viewport, nextViewport)
          ? state
          : {
              ...state,
              viewport: nextViewport
            }
      })
    },

    setToolMode(mode) {
      set({
        toolMode: mode
      })
    },

    previewNodeMove(nodeId, x, y) {
      set((state) => ({
        ...state,
        interactionOverrides: {
          ...state.interactionOverrides,
          [nodeId]: {
            ...state.interactionOverrides[nodeId],
            x: roundGeometry(x),
            y: roundGeometry(y)
          }
        }
      }))
    },

    async commitNodeMove(nodeId, x, y) {
      clearInteractionOverride(set, get, nodeId)
      await commitEditIntent({
        get,
        set,
        documentRepository,
        editService,
        intent: {
          kind: 'move-node',
          nodeId,
          x,
          y
        },
        onSuccess: subscribeToExternalChanges
      })
    },

    previewNodeResize(nodeId, width) {
      set((state) => ({
        ...state,
        interactionOverrides: {
          ...state.interactionOverrides,
          [nodeId]: {
            ...state.interactionOverrides[nodeId],
            w: roundGeometry(width)
          }
        }
      }))
    },

    async commitNodeResize(nodeId, width) {
      clearInteractionOverride(set, get, nodeId)
      await commitEditIntent({
        get,
        set,
        documentRepository,
        editService,
        intent: {
          kind: 'resize-node',
          nodeId,
          width
        },
        onSuccess: subscribeToExternalChanges
      })
    },

    async reconnectEdge(edgeId, from, to) {
      await commitEditIntent({
        get,
        set,
        documentRepository,
        editService,
        intent: {
          kind: 'update-edge-endpoints',
          edgeId,
          from,
          to
        },
        onSuccess: subscribeToExternalChanges
      })
    },

    async createEdgeFromConnection(from, to) {
      await commitEditIntent({
        get,
        set,
        documentRepository,
        editService,
        intent: {
          kind: 'create-edge',
          from,
          to,
          markdown: ''
        },
        onSuccess: subscribeToExternalChanges
      })
    },

    async createNoteAtViewport() {
      const state = get()
      const anchorNode = state.selectedNodeIds[0]
        ? state.nodes.find((node) => node.id === state.selectedNodeIds[0])
        : undefined
      const x = anchorNode ? anchorNode.x + 40 : Math.abs(state.viewport.x) + 120
      const y = anchorNode ? anchorNode.y + 40 : Math.abs(state.viewport.y) + 120

      await commitEditIntent({
        get,
        set,
        documentRepository,
        editService,
        intent: {
          kind: 'create-note',
          anchorNodeId: anchorNode?.id,
          x,
          y,
          width: DEFAULT_NOTE_WIDTH,
          markdown: 'New note'
        },
        onSuccess: subscribeToExternalChanges
      })
    },

    async deleteSelection() {
      const state = get()

      if (state.selectedNodeIds.length > 0) {
        for (const nodeId of [...state.selectedNodeIds]) {
          await commitEditIntent({
            get,
            set,
            documentRepository,
            editService,
            intent: {
              kind: 'delete-node',
              nodeId
            },
            onSuccess: subscribeToExternalChanges
          })
        }
        return
      }

      if (state.selectedEdgeIds.length > 0) {
        for (const edgeId of [...state.selectedEdgeIds]) {
          await commitEditIntent({
            get,
            set,
            documentRepository,
            editService,
            intent: {
              kind: 'delete-edge',
              edgeId
            },
            onSuccess: subscribeToExternalChanges
          })
        }
      }
    },

    startNoteEditing(nodeId) {
      const node = get().nodes.find((entry) => entry.id === nodeId)

      if (!node) {
        return
      }

      set({
        editingState: {
          status: 'note',
          objectId: nodeId,
          markdown: node.content
        },
        operationError: null
      })
    },

    startEdgeEditing(edgeId) {
      const edge = get().edges.find((entry) => entry.id === edgeId)

      if (!edge) {
        return
      }

      set({
        editingState: {
          status: 'edge',
          edgeId,
          markdown: edge.content ?? ''
        },
        operationError: null
      })
    },

    updateEditingMarkdown(markdown) {
      set((state) => {
        if (state.editingState.status === 'idle') {
          return state
        }

        return {
          ...state,
          editingState: {
            ...state.editingState,
            markdown
          }
        }
      })
    },

    async commitInlineEditing() {
      const state = get()

      if (state.editingState.status === 'idle') {
        return
      }

      const intent: CanvasDocumentEditIntent =
        state.editingState.status === 'note'
          ? {
              kind: 'replace-object-body',
              objectId: state.editingState.objectId,
              markdown: state.editingState.markdown
            }
          : {
              kind: 'replace-edge-body',
              edgeId: state.editingState.edgeId,
              markdown: state.editingState.markdown
            }

      await commitEditIntent({
        get,
        set,
        documentRepository,
        editService,
        intent,
        onSuccess: async () => {
          set({
            editingState: { status: 'idle' }
          })
          await subscribeToExternalChanges()
        }
      })
    },

    cancelInlineEditing() {
      set({
        editingState: { status: 'idle' }
      })
    },

    async reloadFromDisk() {
      const state = get()

      if (state.conflictState.status !== 'conflict' || !state.documentSession || !state.document) {
        return
      }

      const readResult = await documentRepository.readSource({
        locator: state.document.locator,
        source: state.conflictState.diskSource,
        isTemplate: state.document.isTemplate
      })

      if (!readResult.ok) {
        set({
          operationError: readResult.error.message
        })
        return
      }

      applyDocumentRecord(set, readResult.value, {
        documentSession: createDocumentSession({
          record: readResult.value,
          fileHandle: state.documentSession.fileHandle,
          isPersisted: state.documentSession.isPersisted,
          persistedSnapshotSource: state.conflictState.diskSource
        }),
        viewport: get().viewport
      })
      await subscribeToExternalChanges()
    },

    keepLocalDraft() {
      set({
        conflictState: { status: 'idle' },
        operationError: null
      })
    }
  }))

  async function subscribeToExternalChanges() {
    clearExternalSubscription()

    if (!documentPersistenceBridge?.subscribeExternalChanges) {
      return
    }

    const state = store.getState()

    if (!state.documentSession || !state.documentSession.isPersisted || !state.document) {
      return
    }

    disposeExternalChanges = await documentPersistenceBridge.subscribeExternalChanges({
      locator: state.document.locator,
      fileHandle: state.documentSession.fileHandle,
      onExternalChange(source) {
        void reconcileExternalSource(store, documentRepository, source)
      }
    })
  }

  function clearExternalSubscription() {
    if (!disposeExternalChanges) {
      return
    }

    disposeExternalChanges()
    disposeExternalChanges = null
  }

  return store
}

async function loadTemplate({
  set,
  documentRepository,
  templateSource,
  onRecord
}: {
  set: StoreApi<ViewerStoreState>['setState']
  documentRepository: CanvasDocumentRepositoryGateway
  templateSource: string
  onRecord: (record: CanvasDocumentRecord) => ViewerDocumentSession
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
    documentSession: onRecord(result.value)
  })
}

async function commitEditIntent({
  get,
  set,
  documentRepository,
  editService,
  intent,
  onSuccess
}: {
  get: StoreApi<ViewerStoreState>['getState']
  set: StoreApi<ViewerStoreState>['setState']
  documentRepository: CanvasDocumentRepositoryGateway
  editService: ReturnType<typeof createCanvasDocumentEditService>
  intent: CanvasDocumentEditIntent
  onSuccess: () => Promise<void>
}) {
  const state = get()

  if (!state.document || !state.documentSession || !state.draftSource) {
    set({
      operationError: 'No editable document is loaded.'
    })
    return
  }

  if (state.invalidState.status === 'invalid') {
    set({
      operationError: state.invalidState.message
    })
    return
  }

  if (state.conflictState.status === 'conflict') {
    set({
      operationError: 'Resolve the external-change conflict before editing again.'
    })
    return
  }

  const editResult = editService.apply(state.draftSource, state.document, intent)

  if (editResult.isErr()) {
    set({
      operationError: editResult.error.message
    })
    return
  }

  const nextSession = createDocumentSession({
    record: state.document,
    fileHandle: state.documentSession.fileHandle,
    isPersisted: state.documentSession.isPersisted,
    persistedSnapshotSource: state.documentSession.persistedSnapshotSource,
    currentSource: editResult.value.source
  })

  const readResult = await documentRepository.readSource({
    locator: state.document.locator,
    source: editResult.value.source,
    isTemplate: state.document.isTemplate
  })

  if (!readResult.ok) {
    applyInvalidSource(set, get, nextSession, readResult.error.message)
    return
  }

  applyDocumentRecord(set, readResult.value, {
    documentSession: createDocumentSession({
      record: readResult.value,
      fileHandle: state.documentSession.fileHandle,
      isPersisted: state.documentSession.isPersisted,
      persistedSnapshotSource: state.documentSession.persistedSnapshotSource,
      currentSource: editResult.value.source
    }),
    viewport: state.viewport,
    selectedNodeIds: state.selectedNodeIds,
    selectedEdgeIds: state.selectedEdgeIds
  })
  await onSuccess()
}

async function reconcileExternalSource(
  store: ViewerStore,
  documentRepository: CanvasDocumentRepositoryGateway,
  source: string
) {
  const state = store.getState()

  if (!state.document || !state.documentSession || source === state.persistedSnapshotSource) {
    return
  }

  if (state.isDirty) {
    store.setState({
      conflictState: {
        status: 'conflict',
        diskSource: source
      }
    })
    return
  }

  const readResult = await documentRepository.readSource({
    locator: state.document.locator,
    source,
    isTemplate: state.document.isTemplate
  })

  if (!readResult.ok) {
    store.setState({
      operationError: readResult.error.message
    })
    return
  }

  applyDocumentRecord(store.setState, readResult.value, {
    documentSession: createDocumentSession({
      record: readResult.value,
      fileHandle: state.documentSession.fileHandle,
      isPersisted: state.documentSession.isPersisted,
      persistedSnapshotSource: source,
      currentSource: source
    }),
    viewport: state.viewport
  })
}

function applyInvalidSource(
  set: StoreApi<ViewerStoreState>['setState'],
  get: StoreApi<ViewerStoreState>['getState'],
  documentSession: ViewerDocumentSession,
  message: string
) {
  const currentState = get()

  set({
    documentSession,
    draftSource: documentSession.currentSource,
    persistedSnapshotSource: documentSession.persistedSnapshotSource,
    isDirty: documentSession.isDirty,
    invalidState: {
      status: 'invalid',
      message
    },
    parseIssues: [
      {
        level: 'error',
        kind: 'invalid-node',
        message
      }
    ],
    operationError: message,
    document: currentState.lastParsedDocument,
    lastParsedDocument: currentState.lastParsedDocument,
    nodes: currentState.lastParsedDocument?.ast.nodes ?? currentState.nodes,
    edges: currentState.lastParsedDocument?.ast.edges ?? currentState.edges
  })
}

function applyDocumentRecord(
  set: StoreApi<ViewerStoreState>['setState'],
  record: CanvasDocumentRecord,
  options?: {
    documentSession?: ViewerDocumentSession
    saveState?: CanvasSaveState
    lastSavedAt?: number | null
    dropState?: ViewerDropState
    viewport?: CanvasViewport
    selectedNodeIds?: string[]
    selectedEdgeIds?: string[]
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
    lastParsedDocument: record,
    documentSession,
    nodes: record.ast.nodes,
    edges: record.ast.edges,
    viewport: options?.viewport ?? record.ast.frontmatter.viewport ?? DEFAULT_CANVAS_VIEWPORT,
    selectedNodeIds: options?.selectedNodeIds ?? [],
    selectedEdgeIds: options?.selectedEdgeIds ?? [],
    parseIssues: record.issues,
    loadState: { status: 'ready' },
    saveState: options?.saveState ?? { status: 'idle' },
    draftSource: documentSession.currentSource,
    persistedSnapshotSource: documentSession.persistedSnapshotSource,
    isDirty: documentSession.isDirty,
    lastSavedAt: options?.lastSavedAt ?? null,
    dropState: options?.dropState ?? { status: 'idle' },
    interactionOverrides: {},
    editingState: { status: 'idle' },
    conflictState: { status: 'idle' },
    invalidState: { status: 'valid' },
    operationError: null
  })
}

function clearInteractionOverride(
  set: StoreApi<ViewerStoreState>['setState'],
  get: StoreApi<ViewerStoreState>['getState'],
  nodeId: string
) {
  const overrides = { ...get().interactionOverrides }
  delete overrides[nodeId]
  set({
    interactionOverrides: overrides
  })
}

function areSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function roundGeometry(value: number) {
  return Math.round(value)
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
