import {
  DEFAULT_CANVAS_VIEWPORT,
  DEFAULT_NOTE_WIDTH,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import { createCanvasDocumentRecordPatch, createCanvasInvalidDocumentPatch } from '@canvas-app/store/canvas-store-projection'
import type {
  CanvasConflictService,
  CanvasConflictOutcome
} from '@canvas-app/services/canvas-conflict-service'
import type { CanvasDocumentCommandResult, CanvasDocumentService } from '@canvas-app/services/canvas-document-service'
import type { CanvasEditingOutcome, CanvasEditingService } from '@canvas-app/services/canvas-editing-service'
import type {
  CanvasStoreGetState,
  CanvasStoreSetState,
  CanvasStoreState
} from '@canvas-app/store/canvas-store-types'
import type { CanvasDocumentEditIntent } from '@canvas-app/services/edit-service'

type CanvasStoreSliceServices = {
  conflictService: CanvasConflictService
  documentService: CanvasDocumentService
  editingService: CanvasEditingService
  onExternalSource: (source: string) => void
}

type CanvasStoreSubscriptionControls = {
  clearExternalSubscription: () => void
  resubscribeExternalChanges: () => Promise<void>
}

function applyDocumentCommandResult({
  controls,
  get,
  result,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  get: CanvasStoreGetState
  result: CanvasDocumentCommandResult
  set: CanvasStoreSetState
}) {
  if (result.status === 'cancelled') {
    set(
      result.phase === 'save'
        ? {
            saveState: { status: 'idle' }
          }
        : {
            loadState: { status: 'ready' }
          }
    )
    return
  }

  if (result.status === 'error') {
    set(
      result.phase === 'save'
        ? {
            saveState: {
              status: 'error',
              message: result.message
            }
          }
        : {
            loadState: {
              status: 'error',
              message: result.message
            }
          }
    )
    return
  }

  if (result.status === 'saved') {
    set(
      createCanvasDocumentRecordPatch(result.record, {
        documentState: result.documentState,
        lastSavedAt: result.savedAt,
        saveState: {
          status: 'saved',
          path: result.path
        },
        viewport: get().viewport
      })
    )
    return
  }

  set(
    createCanvasDocumentRecordPatch(result.record, {
      documentState: result.documentState
    })
  )
  controls.clearExternalSubscription()
}

function applyEditingOutcome({
  controls,
  documentService,
  get,
  outcome,
  onSuccess,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  documentService: CanvasDocumentService
  get: CanvasStoreGetState
  outcome: CanvasEditingOutcome
  onSuccess?: () => void
  set: CanvasStoreSetState
}) {
  if (outcome.status === 'blocked') {
    set({
      operationError: outcome.message
    })
    return
  }

  if (outcome.status === 'invalid') {
    set(createCanvasInvalidDocumentPatch(get(), outcome.documentState, outcome.message))
    return
  }

  set(
    createCanvasDocumentRecordPatch(outcome.record, {
      documentState: outcome.documentState,
      viewport: get().viewport,
      selectedNodeIds: get().selectedNodeIds,
      selectedEdgeIds: get().selectedEdgeIds
    })
  )

  if (onSuccess) {
    onSuccess()
  }

  void controls.resubscribeExternalChanges()
  void schedulePersistedAutosave({
    controls,
    documentService,
    get,
    set
  })
}

function applyConflictOutcome({
  get,
  outcome,
  set
}: {
  get: CanvasStoreGetState
  outcome: CanvasConflictOutcome
  set: CanvasStoreSetState
}) {
  if (outcome.status === 'noop') {
    return
  }

  if (outcome.status === 'conflict') {
    set({
      conflictState: {
        status: 'conflict',
        diskSource: outcome.diskSource
      }
    })
    return
  }

  if (outcome.status === 'error') {
    set({
      operationError: outcome.message
    })
    return
  }

  set(
    createCanvasDocumentRecordPatch(outcome.record, {
      documentState: outcome.documentState,
      viewport: get().viewport
    })
  )
}

async function commitCanvasIntent({
  controls,
  documentService,
  editingService,
  get,
  intent,
  onSuccess,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  documentService: CanvasDocumentService
  editingService: CanvasEditingService
  get: CanvasStoreGetState
  intent: CanvasDocumentEditIntent
  onSuccess?: () => void
  set: CanvasStoreSetState
}) {
  const state = get()
  const outcome = await editingService.applyIntent(
    {
      conflictState: state.conflictState,
      document: state.document,
      documentState: state.documentState,
      draftSource: state.draftSource,
      invalidState: state.invalidState
    },
    intent
  )

  applyEditingOutcome({
    controls,
    documentService,
    get,
    outcome,
    onSuccess,
    set
  })
}

let autosaveSequence = 0

async function schedulePersistedAutosave({
  controls,
  documentService,
  get,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  documentService: CanvasDocumentService
  get: CanvasStoreGetState
  set: CanvasStoreSetState
}) {
  const state = get()

  if (!state.document || !state.documentState?.isPersisted || state.conflictState.status === 'conflict') {
    return
  }

  const currentSequence = autosaveSequence + 1
  autosaveSequence = currentSequence

  set({
    saveState: { status: 'saving' },
    operationError: null
  })

  const result = await documentService.saveCurrentDocument({
    document: state.document,
    documentState: state.documentState,
    invalidMessage: state.invalidState.status === 'invalid' ? state.invalidState.message : null,
    mode: 'debounced'
  })

  if (autosaveSequence !== currentSequence) {
    return
  }

  applyDocumentCommandResult({
    controls,
    get,
    result,
    set
  })

  if (result.status === 'saved') {
    await controls.resubscribeExternalChanges()
  }
}

export function createCanvasDocumentSlice() {
  return {
    document: null,
    lastParsedDocument: null,
    documentState: null,
    nodes: [],
    edges: [],
    loadState: { status: 'idle' } as const,
    saveState: { status: 'idle' } as const,
    parseIssues: [],
    draftSource: null,
    persistedSnapshotSource: null,
    isDirty: false,
    lastSavedAt: null,
    conflictState: { status: 'idle' } as const,
    invalidState: { status: 'valid' } as const
  }
}

export function createCanvasInteractionSlice() {
  return {
    viewport: DEFAULT_CANVAS_VIEWPORT,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    toolMode: 'select' as const,
    panShortcutActive: false,
    interactionOverrides: {}
  }
}

export function createCanvasUiSlice() {
  return {
    dropState: { status: 'idle' } as const,
    editingState: { status: 'idle' } as const,
    operationError: null as string | null
  }
}

export function createCanvasCommandSlice(
  set: CanvasStoreSetState,
  get: CanvasStoreGetState,
  services: CanvasStoreSliceServices,
  controls: CanvasStoreSubscriptionControls
): Pick<
  CanvasStoreState,
  | 'hydrateTemplate'
  | 'resetToTemplate'
  | 'createNewDocument'
  | 'openDocument'
  | 'openDroppedDocument'
  | 'saveCurrentDocument'
  | 'setPrimarySelectedNode'
  | 'toggleSelectedNode'
  | 'replaceSelectedNodes'
  | 'replaceSelectedEdges'
  | 'clearSelection'
  | 'clearSelectedNodes'
  | 'setDropActive'
  | 'setDropError'
  | 'setViewport'
  | 'setToolMode'
  | 'setPanShortcutActive'
  | 'previewNodeMove'
  | 'commitNodeMove'
  | 'previewNodeResize'
  | 'commitNodeResize'
  | 'reconnectEdge'
  | 'createEdgeFromConnection'
  | 'createNoteAtViewport'
  | 'deleteSelection'
  | 'startNoteEditing'
  | 'startEdgeEditing'
  | 'updateEditingMarkdown'
  | 'commitInlineEditing'
  | 'cancelInlineEditing'
  | 'reloadFromDisk'
  | 'keepLocalDraft'
> {
  let droppedDocumentSequence = 0

  return {
    async hydrateTemplate() {
      set({
        loadState: { status: 'loading' }
      })

      const result = await services.documentService.hydrateTemplate()
      applyDocumentCommandResult({
        controls,
        get,
        result,
        set
      })
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

      const result = await services.documentService.openDocument()
      applyDocumentCommandResult({
        controls,
        get,
        result,
        set
      })

      if (result.status === 'loaded' || result.status === 'saved') {
        await controls.resubscribeExternalChanges()
      }
    },

    async openDroppedDocument({ name, source }) {
      set({
        loadState: { status: 'loading' },
        operationError: null
      })

      const result = await services.documentService.openDroppedDocument({
        name,
        sequence: droppedDocumentSequence,
        source
      })

      droppedDocumentSequence += 1

      if (result.status === 'loaded') {
        set(
          createCanvasDocumentRecordPatch(result.record, {
            documentState: result.documentState,
            dropState: {
              status: 'opened',
              name
            }
          })
        )
        controls.clearExternalSubscription()
        return
      }

      applyDocumentCommandResult({
        controls,
        get,
        result,
        set
      })
    },

    async saveCurrentDocument() {
      const state = get()

      set({
        saveState: { status: 'saving' },
        operationError: null
      })

      const result = await services.documentService.saveCurrentDocument({
        document: state.document,
        documentState: state.documentState,
        invalidMessage:
          state.invalidState.status === 'invalid' ? state.invalidState.message : null
      })

      applyDocumentCommandResult({
        controls,
        get,
        result,
        set
      })

      if (result.status === 'saved') {
        await controls.resubscribeExternalChanges()
      }
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

    setPanShortcutActive(active) {
      set((state) =>
        state.panShortcutActive === active
          ? state
          : {
              ...state,
              panShortcutActive: active
            }
      )
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
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        intent: {
          kind: 'move-node',
          nodeId,
          x,
          y
        },
        set
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
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        intent: {
          kind: 'resize-node',
          nodeId,
          width
        },
        set
      })
    },

    async reconnectEdge(edgeId, from, to) {
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        intent: {
          kind: 'update-edge-endpoints',
          edgeId,
          from,
          to
        },
        set
      })
    },

    async createEdgeFromConnection(from, to) {
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        intent: {
          kind: 'create-edge',
          from,
          to,
          markdown: ''
        },
        set
      })
    },

    async createNoteAtViewport() {
      const state = get()
      const anchorNode = state.selectedNodeIds[0]
        ? state.nodes.find((node) => node.id === state.selectedNodeIds[0])
        : undefined
      const x = anchorNode ? anchorNode.x + 40 : Math.abs(state.viewport.x) + 120
      const y = anchorNode ? anchorNode.y + 40 : Math.abs(state.viewport.y) + 120

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        intent: {
          kind: 'create-note',
          anchorNodeId: anchorNode?.id,
          x,
          y,
          width: DEFAULT_NOTE_WIDTH,
          markdown: 'New note'
        },
        set
      })
    },

    async deleteSelection() {
      const state = get()

      if (state.selectedNodeIds.length > 0) {
        for (const nodeId of [...state.selectedNodeIds]) {
          await commitCanvasIntent({
            controls,
            documentService: services.documentService,
            editingService: services.editingService,
            get,
            intent: {
              kind: 'delete-node',
              nodeId
            },
            set
          })
        }
        return
      }

      if (state.selectedEdgeIds.length > 0) {
        for (const edgeId of [...state.selectedEdgeIds]) {
          await commitCanvasIntent({
            controls,
            documentService: services.documentService,
            editingService: services.editingService,
            get,
            intent: {
              kind: 'delete-edge',
              edgeId
            },
            set
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

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        intent,
        onSuccess() {
          set({
            editingState: { status: 'idle' }
          })
        },
        set
      })
    },

    cancelInlineEditing() {
      set({
        editingState: { status: 'idle' }
      })
    },

    async reloadFromDisk() {
      const outcome = await services.conflictService.reloadFromConflict({
        conflictState: get().conflictState,
        document: get().document,
        documentState: get().documentState
      })

      applyConflictOutcome({
        get,
        outcome,
        set
      })

      if (outcome.status === 'updated') {
        await controls.resubscribeExternalChanges()
      }
    },

    keepLocalDraft() {
      set({
        conflictState: { status: 'idle' },
        operationError: null
      })
    }
  }
}

export async function reconcileCanvasExternalSource(
  get: CanvasStoreGetState,
  set: CanvasStoreSetState,
  conflictService: CanvasConflictService,
  source: string
) {
  const outcome = await conflictService.reconcileExternalSource(
    {
      document: get().document,
      documentState: get().documentState,
      isDirty: get().isDirty,
      persistedSnapshotSource: get().persistedSnapshotSource
    },
    source
  )

  applyConflictOutcome({
    get,
    outcome,
    set
  })
}

function clearInteractionOverride(
  set: CanvasStoreSetState,
  get: CanvasStoreGetState,
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

function clampViewport(viewport: CanvasViewport) {
  return {
    x: Number(viewport.x.toFixed(2)),
    y: Number(viewport.y.toFixed(2)),
    zoom: clampZoom(viewport.zoom)
  }
}

function isSameViewport(left: CanvasViewport, right: CanvasViewport) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom
}
