import {
  DEFAULT_CANVAS_VIEWPORT,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  type BuiltInImageResolution,
  type CanvasEdge,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  type CanvasNode,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import { logCanvasDiagnostic } from '@canvas-app/diagnostics/canvas-diagnostics'
import type { CanvasImageAssetBridge } from '@canvas-app/document/canvas-image-asset-bridge'
import {
  fitCanvasImageSize,
  normalizeAssetFileName,
  prepareCanvasImageAsset
} from '@canvas-app/services/canvas-image-service'
import {
  createEmptyCanvasHistoryState,
  type CanvasHistoryService
} from '@canvas-app/services/canvas-history-service'
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
  historyService: CanvasHistoryService
  imageAssetBridge?: CanvasImageAssetBridge
  onExternalSource: (source: string) => void
}

type CanvasStoreSubscriptionControls = {
  clearExternalSubscription: () => void
  resubscribeExternalChanges: () => Promise<void>
}

const FRAME_PRESET = {
  body: createShapeBody('Frame', {
    palette: 'neutral',
    tone: 'soft'
  }),
  component: 'boardmark.shape.roundRect' as const,
  height: 280,
  width: 420
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
    logCanvasDiagnostic('warn', 'Canvas document command was cancelled.', {
      phase: result.phase
    })
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
    logCanvasDiagnostic('error', 'Canvas document command failed.', {
      phase: result.phase,
      message: result.message
    })
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
    logCanvasDiagnostic('debug', 'Canvas document state updated after save.', {
      path: result.path
    })
    set(
      createCanvasDocumentRecordPatch(result.record, {
        documentState: result.documentState,
        history: get().history,
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
  historyEntry,
  historyService,
  outcome,
  onSuccess,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  documentService: CanvasDocumentService
  get: CanvasStoreGetState
  historyEntry: {
    label: string
    selectedEdgeIds: string[]
    selectedNodeIds: string[]
    source: string
  } | null
  historyService: CanvasHistoryService
  outcome: CanvasEditingOutcome
  onSuccess?: () => void
  set: CanvasStoreSetState
}) {
  if (outcome.status === 'blocked') {
    logCanvasDiagnostic('warn', 'Canvas editing outcome was blocked.', {
      message: outcome.message
    })
    set({
      operationError: outcome.message
    })
    return
  }

  if (outcome.status === 'invalid') {
    logCanvasDiagnostic('error', 'Canvas editing produced an invalid document state.', {
      message: outcome.message
    })
    set(createCanvasInvalidDocumentPatch(get(), outcome.documentState, outcome.message))
    return
  }

  logCanvasDiagnostic('debug', 'Canvas editing outcome applied to store.', {
    locator: outcome.record.locator.kind === 'file'
      ? outcome.record.locator.path
      : outcome.record.locator.key
  })

  const nextHistory =
    historyEntry && historyEntry.source !== outcome.documentState.currentSource
      ? historyService.pushEntry(get().history, historyEntry)
      : get().history

  set(
    createCanvasDocumentRecordPatch(outcome.record, {
      documentState: outcome.documentState,
      history: nextHistory,
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
  historyService,
  intent,
  onSuccess,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  documentService: CanvasDocumentService
  editingService: CanvasEditingService
  get: CanvasStoreGetState
  historyService: CanvasHistoryService
  intent: CanvasDocumentEditIntent
  onSuccess?: () => void
  set: CanvasStoreSetState
}) {
  const state = get()
  const historyEntry = historyService.captureEntry(state, readHistoryLabel(intent))
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
    historyEntry,
    historyService,
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
    logCanvasDiagnostic('debug', 'Skipped persisted autosave because the current state is not autosave-eligible.', {
      hasDocument: Boolean(state.document),
      isPersisted: state.documentState?.isPersisted ?? false,
      conflictState: state.conflictState.status
    })
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
    logCanvasDiagnostic('debug', 'Discarded an outdated autosave result.', {
      expectedSequence: autosaveSequence,
      completedSequence: currentSequence
    })
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
    invalidState: { status: 'valid' } as const,
    history: createEmptyCanvasHistoryState()
  }
}

export function createCanvasInteractionSlice() {
  return {
    viewport: DEFAULT_CANVAS_VIEWPORT,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    toolMode: 'select' as const,
    panShortcutActive: false,
    lastCanvasPointer: null,
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
  | 'setLastCanvasPointer'
  | 'previewNodeMove'
  | 'commitNodeMove'
  | 'previewNodeResize'
  | 'commitNodeResize'
  | 'reconnectEdge'
  | 'createEdgeFromConnection'
  | 'createNoteAtViewport'
  | 'createShapeAtViewport'
  | 'insertImageFromLink'
  | 'insertImageFromFile'
  | 'insertImageFromClipboard'
  | 'insertImageFromDrop'
  | 'createMarkdownImageAsset'
  | 'replaceSelectedImageFromFile'
  | 'openSelectedImageSource'
  | 'revealSelectedImageSource'
  | 'toggleSelectedImageLockAspectRatio'
  | 'updateSelectedImageAltText'
  | 'resolveImageSource'
  | 'createFrameAtViewport'
  | 'deleteSelection'
  | 'startNoteEditing'
  | 'startShapeEditing'
  | 'startEdgeEditing'
  | 'updateEditingMarkdown'
  | 'commitInlineEditing'
  | 'cancelInlineEditing'
  | 'reloadFromDisk'
  | 'keepLocalDraft'
  | 'undo'
  | 'redo'
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

    setLastCanvasPointer(pointer) {
      set((state) => ({
        ...state,
        lastCanvasPointer: pointer
      }))
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
      logCanvasDiagnostic('debug', 'Committing node move intent from the canvas store.', {
        nodeId,
        x,
        y
      })
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'move-node',
          nodeId,
          x,
          y
        },
        set
      })
    },

    previewNodeResize(nodeId, geometry) {
      const nextGeometry = readResizedGeometryForNode(get(), nodeId, geometry)
      set((state) => ({
        ...state,
        interactionOverrides: {
          ...state.interactionOverrides,
          [nodeId]: {
            ...state.interactionOverrides[nodeId],
            x: roundGeometry(nextGeometry.x),
            y: roundGeometry(nextGeometry.y),
            w: roundGeometry(nextGeometry.width),
            h: roundGeometry(nextGeometry.height)
          }
        }
      }))
    },

    async commitNodeResize(nodeId, geometry) {
      const nextGeometry = readResizedGeometryForNode(get(), nodeId, geometry)
      clearInteractionOverride(set, get, nodeId)
      logCanvasDiagnostic('debug', 'Committing node resize intent from the canvas store.', {
        nodeId,
        x: nextGeometry.x,
        y: nextGeometry.y,
        width: nextGeometry.width,
        height: nextGeometry.height
      })
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'resize-node',
          nodeId,
          x: nextGeometry.x,
          y: nextGeometry.y,
          width: nextGeometry.width,
          height: nextGeometry.height
        },
        set
      })
    },

    async reconnectEdge(edgeId, from, to) {
      logCanvasDiagnostic('debug', 'Committing edge reconnect intent from the canvas store.', {
        edgeId,
        from,
        to
      })
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
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
      logCanvasDiagnostic('debug', 'Committing edge creation intent from the canvas store.', {
        from,
        to
      })
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
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
      const x = anchorNode ? anchorNode.at.x + 40 : Math.abs(state.viewport.x) + 120
      const y = anchorNode ? anchorNode.at.y + 40 : Math.abs(state.viewport.y) + 120

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'create-note',
          anchorNodeId: anchorNode?.id,
          x,
          y,
          width: DEFAULT_NOTE_WIDTH,
          height: DEFAULT_NOTE_HEIGHT,
          markdown: 'New note'
        },
        set
      })
    },

    async createShapeAtViewport({
      body,
      component,
      height,
      width
    }: {
      body: string
      component: string
      height: number
      width: number
    }) {
      const state = get()
      const anchorNode = state.selectedNodeIds[0]
        ? state.nodes.find((node) => node.id === state.selectedNodeIds[0])
        : undefined
      const x = anchorNode ? anchorNode.at.x + 48 : Math.abs(state.viewport.x) + 120
      const y = anchorNode ? anchorNode.at.y + 48 : Math.abs(state.viewport.y) + 120

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'create-shape',
          anchorNodeId: anchorNode?.id,
          x,
          y,
          width,
          height,
          component,
          body
        },
        set
      })
    },

    async insertImageFromLink({
      alt,
      lockAspectRatio = true,
      src,
      title
    }) {
      const state = get()
      const geometry = readImageGeometry(DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT)
      const id = readNextGeneratedId('image', state.nodes, state.edges)
      const position = readPreferredInsertPosition(state, geometry)

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'create-image',
          anchorNodeId: readAnchorNodeId(state),
          id,
          src,
          alt,
          title,
          lockAspectRatio,
          x: position.x,
          y: position.y,
          width: geometry.width,
          height: geometry.height
        },
        onSuccess() {
          set({
            selectedEdgeIds: [],
            selectedNodeIds: [id]
          })
        },
        set
      })
    },

    async insertImageFromFile(file) {
      await insertImageAsset({
        controls,
        file,
        get,
        kind: 'file',
        services,
        set
      })
    },

    async insertImageFromClipboard(file) {
      await insertImageAsset({
        controls,
        file,
        get,
        kind: 'clipboard',
        services,
        set
      })
    },

    async insertImageFromDrop(file) {
      await insertImageAsset({
        controls,
        file,
        get,
        kind: 'drop',
        services,
        set
      })
    },

    async createMarkdownImageAsset(file) {
      const prepared = await importPreparedImageAsset({
        file,
        get,
        silentUnsupported: true,
        services,
        set
      })

      if (!prepared) {
        return null
      }

      return `![${prepared.alt}](${prepared.src})`
    },

    async replaceSelectedImageFromFile(file) {
      const state = get()
      const selectedImage = readPrimarySelectedImage(state)

      if (!selectedImage) {
        set({
          operationError: 'Select one image before replacing its source.'
        })
        return
      }

      const prepared = await importPreparedImageAsset({
        file,
        get,
        services,
        set
      })

      if (!prepared) {
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'replace-image-source',
          nodeId: selectedImage.id,
          src: prepared.src,
          alt: selectedImage.alt ?? prepared.alt,
          title: selectedImage.title
        },
        set
      })
    },

    async openSelectedImageSource() {
      const state = get()
      const selectedImage = readPrimarySelectedImage(state)

      if (!selectedImage) {
        set({
          operationError: 'Select one image before opening its source.'
        })
        return
      }

      const result = await services.imageAssetBridge?.openSource({
        document: state.document,
        documentState: state.documentState,
        src: selectedImage.src ?? ''
      })

      if (!result?.ok) {
        set({
          operationError: result?.error.message ?? 'Image source could not be opened.'
        })
      }
    },

    async revealSelectedImageSource() {
      const state = get()
      const selectedImage = readPrimarySelectedImage(state)

      if (!selectedImage) {
        set({
          operationError: 'Select one image before revealing its file.'
        })
        return
      }

      const result = await services.imageAssetBridge?.revealSource?.({
        document: state.document,
        documentState: state.documentState,
        src: selectedImage.src ?? ''
      })

      if (!result?.ok) {
        set({
          operationError: result?.error.message ?? 'Image source could not be revealed.'
        })
      }
    },

    async toggleSelectedImageLockAspectRatio() {
      const state = get()
      const selectedImage = readPrimarySelectedImage(state)

      if (!selectedImage) {
        set({
          operationError: 'Select one image before changing its aspect-ratio lock.'
        })
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'update-image-metadata',
          nodeId: selectedImage.id,
          lockAspectRatio: !selectedImage.lockAspectRatio
        },
        set
      })
    },

    async updateSelectedImageAltText(alt) {
      const state = get()
      const selectedImage = readPrimarySelectedImage(state)

      if (!selectedImage) {
        set({
          operationError: 'Select one image before updating its alt text.'
        })
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'update-image-metadata',
          nodeId: selectedImage.id,
          alt
        },
        set
      })
    },

    async resolveImageSource(src) {
      if (/^(https?:|data:|blob:|file:)/.test(src)) {
        return {
          status: 'resolved',
          src
        } satisfies BuiltInImageResolution
      }

      if (!services.imageAssetBridge) {
        return {
          status: 'error',
          message: 'Image source could not be resolved in this environment.'
        } satisfies BuiltInImageResolution
      }

      const result = await services.imageAssetBridge.resolveImageSource({
        document: get().document,
        documentState: get().documentState,
        src
      })

      if (!result.ok) {
        return {
          status: 'error',
          message: result.error.message
        } satisfies BuiltInImageResolution
      }

      return {
        status: 'resolved',
        src: result.value.src
      } satisfies BuiltInImageResolution
    },

    async createFrameAtViewport() {
      await get().createShapeAtViewport(FRAME_PRESET)
    },

    async deleteSelection() {
      const state = get()

      if (state.selectedNodeIds.length === 0 && state.selectedEdgeIds.length === 0) {
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'delete-objects',
          nodeIds: state.selectedNodeIds,
          edgeIds: state.selectedEdgeIds
        },
        set
      })
    },

    startNoteEditing(nodeId) {
      const node = get().nodes.find((entry) => entry.id === nodeId)

      if (!node || node.component !== 'note') {
        return
      }

      set({
        editingState: {
          status: 'note',
          objectId: nodeId,
          markdown: node.body ?? ''
        },
        operationError: null
      })
    },

    startShapeEditing(nodeId) {
      const node = get().nodes.find((entry) => entry.id === nodeId)

      if (!node || node.component === 'note') {
        return
      }

      set({
        editingState: {
          status: 'shape',
          objectId: nodeId,
          markdown: node.body ?? ''
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
          markdown: edge.body ?? ''
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
        state.editingState.status === 'note' || state.editingState.status === 'shape'
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

      logCanvasDiagnostic('debug', 'Committing inline editing intent from the canvas store.', {
        editingStatus: state.editingState.status,
        targetId:
          state.editingState.status === 'edge'
            ? state.editingState.edgeId
            : state.editingState.objectId,
        markdownLength: state.editingState.markdown.length
      })

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
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
    },

    async undo() {
      const state = get()

      if (state.editingState.status !== 'idle') {
        set({
          operationError: 'Finish inline editing before undoing document changes.'
        })
        return
      }

      if (state.conflictState.status === 'conflict') {
        set({
          operationError: 'Resolve the external-change conflict before undoing document changes.'
        })
        return
      }

      if (state.invalidState.status === 'invalid') {
        set({
          operationError: state.invalidState.message
        })
        return
      }

      const target = state.history.past.at(-1)

      if (!target) {
        return
      }

      const currentEntry = services.historyService.captureEntry(state, target.label)

      if (!currentEntry) {
        set({
          operationError: 'No editable document is loaded.'
        })
        return
      }

      const transition = services.historyService.undo(state.history, currentEntry)

      if (!transition) {
        return
      }

      const result = await services.historyService.restoreEntry({
        document: state.document,
        documentState: state.documentState,
        entry: transition.target
      })

      if (result.status === 'blocked' || result.status === 'error') {
        set({
          operationError: result.message
        })
        return
      }

      set(
        createCanvasDocumentRecordPatch(result.record, {
          documentState: result.documentState,
          history: transition.history,
          viewport: get().viewport,
          selectedNodeIds: result.entry.selectedNodeIds,
          selectedEdgeIds: result.entry.selectedEdgeIds
        })
      )

      void controls.resubscribeExternalChanges()
    },

    async redo() {
      const state = get()

      if (state.editingState.status !== 'idle') {
        set({
          operationError: 'Finish inline editing before redoing document changes.'
        })
        return
      }

      if (state.conflictState.status === 'conflict') {
        set({
          operationError: 'Resolve the external-change conflict before redoing document changes.'
        })
        return
      }

      if (state.invalidState.status === 'invalid') {
        set({
          operationError: state.invalidState.message
        })
        return
      }

      const target = state.history.future[0]

      if (!target) {
        return
      }

      const currentEntry = services.historyService.captureEntry(state, target.label)

      if (!currentEntry) {
        set({
          operationError: 'No editable document is loaded.'
        })
        return
      }

      const transition = services.historyService.redo(state.history, currentEntry)

      if (!transition) {
        return
      }

      const result = await services.historyService.restoreEntry({
        document: state.document,
        documentState: state.documentState,
        entry: transition.target
      })

      if (result.status === 'blocked' || result.status === 'error') {
        set({
          operationError: result.message
        })
        return
      }

      set(
        createCanvasDocumentRecordPatch(result.record, {
          documentState: result.documentState,
          history: transition.history,
          viewport: get().viewport,
          selectedNodeIds: result.entry.selectedNodeIds,
          selectedEdgeIds: result.entry.selectedEdgeIds
        })
      )

      void controls.resubscribeExternalChanges()
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

function readHistoryLabel(intent: CanvasDocumentEditIntent) {
  switch (intent.kind) {
    case 'move-node':
      return 'Move node'
    case 'resize-node':
      return 'Resize node'
    case 'replace-object-body':
      return 'Edit object'
    case 'replace-edge-body':
      return 'Edit connector'
    case 'create-note':
      return 'Create note'
    case 'create-shape':
      return 'Create shape'
    case 'create-image':
      return 'Insert image'
    case 'replace-image-source':
      return 'Replace image'
    case 'update-image-metadata':
      return 'Update image'
    case 'delete-node':
    case 'delete-edge':
    case 'delete-objects':
      return 'Delete selection'
    case 'update-edge-endpoints':
      return 'Reconnect edge'
    case 'create-edge':
      return 'Create edge'
    default:
      return 'Edit canvas'
  }
}

function createShapeBody(label: string, props?: Record<string, unknown>) {
  const normalizedLabel = label.trim()

  if (!props || Object.keys(props).length === 0) {
    return normalizedLabel
  }

  return `${normalizedLabel}\n\n\`\`\`yaml props\n${Object.entries(props)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n')}\n\`\`\``
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

function readAnchorNodeId(state: CanvasStoreState) {
  return state.selectedNodeIds[0]
}

function readPreferredInsertPosition(
  state: CanvasStoreState,
  geometry: {
    width: number
    height: number
  }
) {
  if (state.lastCanvasPointer) {
    return {
      x: roundGeometry(state.lastCanvasPointer.x - geometry.width / 2),
      y: roundGeometry(state.lastCanvasPointer.y - geometry.height / 2)
    }
  }

  const anchorNode = state.selectedNodeIds[0]
    ? state.nodes.find((node) => node.id === state.selectedNodeIds[0])
    : undefined

  if (anchorNode) {
    return {
      x: anchorNode.at.x + 48,
      y: anchorNode.at.y + 48
    }
  }

  return {
    x: Math.abs(state.viewport.x) + 120,
    y: Math.abs(state.viewport.y) + 120
  }
}

function readImageGeometry(width: number, height: number) {
  const fitted = fitCanvasImageSize(width, height)

  return {
    width: Math.max(96, fitted.width),
    height: Math.max(96, fitted.height)
  }
}

function readNextGeneratedId(prefix: 'image', nodes: CanvasNode[], edges: CanvasEdge[]) {
  const existingIds = new Set([
    ...nodes.map((node) => node.id),
    ...edges.map((edge) => edge.id)
  ])
  let index = 1

  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1
  }

  return `${prefix}-${index}`
}

function readPrimarySelectedImage(state: CanvasStoreState) {
  if (state.selectedNodeIds.length !== 1) {
    return null
  }

  const node = state.nodes.find((entry) => entry.id === state.selectedNodeIds[0])

  return node?.component === 'image' ? node : null
}

async function ensurePersistedDocumentForImageInsertion({
  get,
  set
}: {
  get: CanvasStoreGetState
  set: CanvasStoreSetState
}) {
  const state = get()

  if (state.document && state.documentState?.isPersisted) {
    return state
  }

  await get().saveCurrentDocument()

  const nextState = get()

  if (!nextState.document || !nextState.documentState?.isPersisted) {
    set({
      operationError: nextState.saveState.status === 'error'
        ? nextState.saveState.message
        : 'Save the document before inserting local image assets.'
    })
    return null
  }

  return nextState
}

async function importPreparedImageAsset({
  file,
  get,
  silentUnsupported = false,
  services,
  set
}: {
  file: File
  get: CanvasStoreGetState
  silentUnsupported?: boolean
  services: CanvasStoreSliceServices
  set: CanvasStoreSetState
}) {
  if (!services.imageAssetBridge) {
    set({
      operationError: 'Image assets are not supported in this environment.'
    })
    return null
  }

  const persistedState = await ensurePersistedDocumentForImageInsertion({
    get,
    set
  })

  if (!persistedState?.document || !persistedState.documentState) {
    return null
  }

  const prepared = await prepareCanvasImageAsset({
    blob: file,
    fileName: normalizeAssetFileName(file.name, file.type)
  }).catch(() => null)

  if (!prepared) {
    if (!silentUnsupported) {
      set({
        operationError:
          'This image format is not supported for local asset import in the current runtime.'
      })
    }
    return null
  }

  const accessResult = await services.imageAssetBridge.ensureDocumentAssetAccess?.({
    document: persistedState.document,
    documentState: persistedState.documentState
  })

  if (accessResult && !accessResult.ok) {
    set({
      operationError: accessResult.error.message
    })
    return null
  }

  if (accessResult?.ok && persistedState.documentState) {
    set((state) => ({
      ...state,
      documentState: state.documentState
        ? {
            ...state.documentState,
            assetDirectoryHandle: accessResult.value ?? state.documentState.assetDirectoryHandle
          }
        : state.documentState
    }))
  }

  const importResult = await services.imageAssetBridge.importImageAsset({
    document: persistedState.document,
    documentState: get().documentState ?? persistedState.documentState,
    bytes: prepared.bytes,
    fileName: prepared.fileName
  })

  if (!importResult.ok) {
    set({
      operationError: importResult.error.message
    })
    return null
  }

  return {
    alt: prepared.alt,
    height: prepared.height,
    src: importResult.value.src,
    width: prepared.width
  }
}

async function insertImageAsset({
  controls,
  file,
  get,
  kind,
  services,
  set
}: {
  controls: CanvasStoreSubscriptionControls
  file: File
  get: CanvasStoreGetState
  kind: 'clipboard' | 'drop' | 'file'
  services: CanvasStoreSliceServices
  set: CanvasStoreSetState
}) {
  const prepared = await importPreparedImageAsset({
    file,
    get,
    silentUnsupported: kind === 'clipboard',
    services,
    set
  })

  if (!prepared) {
    if (kind === 'clipboard') {
      return
    }

    return
  }

  const state = get()
  const geometry = readImageGeometry(prepared.width, prepared.height)
  const position = readPreferredInsertPosition(state, geometry)
  const id = readNextGeneratedId('image', state.nodes, state.edges)

  await commitCanvasIntent({
    controls,
    documentService: services.documentService,
    editingService: services.editingService,
    get,
    historyService: services.historyService,
    intent: {
      kind: 'create-image',
      anchorNodeId: readAnchorNodeId(state),
      id,
      src: prepared.src,
      alt: prepared.alt,
      lockAspectRatio: true,
      x: position.x,
      y: position.y,
      width: geometry.width,
      height: geometry.height
    },
    onSuccess() {
      set({
        selectedEdgeIds: [],
        selectedNodeIds: [id]
      })
    },
    set
  })
}

function readResizedGeometryForNode(
  state: CanvasStoreState,
  nodeId: string,
  geometry: {
    x: number
    y: number
    width: number
    height: number
  }
) {
  const node = state.nodes.find((entry) => entry.id === nodeId)

  if (!node || node.component !== 'image' || !node.lockAspectRatio) {
    return geometry
  }

  const currentWidth = node.at.w ?? geometry.width
  const currentHeight = node.at.h ?? geometry.height

  if (currentWidth <= 0 || currentHeight <= 0) {
    return geometry
  }

  const widthChange = Math.abs(geometry.width - currentWidth) / currentWidth
  const heightChange = Math.abs(geometry.height - currentHeight) / currentHeight
  const ratio = currentWidth / currentHeight

  if (widthChange >= heightChange) {
    return {
      ...geometry,
      height: Math.round(geometry.width / ratio)
    }
  }

  return {
    ...geometry,
    width: Math.round(geometry.height * ratio)
  }
}

function isSameViewport(left: CanvasViewport, right: CanvasViewport) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom
}
