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
import type { CanvasObjectArrangeMode } from '@canvas-app/canvas-object-types'
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
  CanvasEditingSurface,
  CanvasEditingTarget,
  CanvasStoreGetState,
  CanvasStoreSetState,
  CanvasStoreState
} from '@canvas-app/store/canvas-store-types'
import {
  readCanvasDocumentEditLabel,
  type CanvasDocumentEditIntent
} from '@canvas-app/services/edit-intents'
import {
  isEdgeLocked,
  isNodeLocked,
  isTopLevelNode,
  normalizeCommittedNodeMoves,
  readArrangeableSelection,
  readContainingGroup,
  readLockSelectionTargetIds,
  readSelectedGroups,
  readUnlockedDocumentSelection,
  readUnlockedNodeSelection
} from '@canvas-app/store/canvas-object-selection'

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
        editingState: get().editingState,
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
    selectedGroupIds: string[]
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
    return false
  }

  if (outcome.status === 'invalid') {
    logCanvasDiagnostic('error', 'Canvas editing produced an invalid document state.', {
      message: outcome.message
    })
    set(createCanvasInvalidDocumentPatch(get(), outcome.documentState, outcome.message))
    return false
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
      clipboardState: get().clipboardState,
      documentState: outcome.documentState,
      groupSelectionState: get().groupSelectionState,
      history: nextHistory,
      viewport: get().viewport,
      selectedGroupIds: get().selectedGroupIds,
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

  return true
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
  const historyEntry = historyService.captureEntry(state, readCanvasDocumentEditLabel(intent))
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

  return applyEditingOutcome({
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
    groups: [],
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
    selectedGroupIds: [],
    selectedNodeIds: [],
    selectedEdgeIds: [],
    groupSelectionState: { status: 'idle' } as const,
    toolMode: 'select' as const,
    panShortcutActive: false,
    lastCanvasPointer: null,
    viewportSize: {
      width: 0,
      height: 0
    },
    interactionOverrides: {}
  }
}

export function createCanvasUiSlice() {
  return {
    dropState: { status: 'idle' } as const,
    editingState: { status: 'idle' } as const,
    clipboardState: { status: 'empty' } as const,
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
  | 'setViewportSize'
  | 'setToolMode'
  | 'setPanShortcutActive'
  | 'setLastCanvasPointer'
  | 'previewNodeMove'
  | 'commitNodeMove'
  | 'commitNodeMoves'
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
  | 'selectAllObjects'
  | 'replaceSelection'
  | 'selectNodeFromCanvas'
  | 'selectEdgeFromCanvas'
  | 'copySelection'
  | 'cutSelection'
  | 'pasteClipboard'
  | 'pasteClipboardInPlace'
  | 'duplicateSelection'
  | 'nudgeSelection'
  | 'arrangeSelection'
  | 'setSelectionLocked'
  | 'groupSelection'
  | 'ungroupSelection'
  | 'startObjectEditing'
  | 'startNoteEditing'
  | 'startShapeEditing'
  | 'startEdgeEditing'
  | 'updateEditingMarkdown'
  | 'setEditingBlockMode'
  | 'setEditingInteraction'
  | 'flushEditingSession'
  | 'commitInlineEditing'
  | 'cancelInlineEditing'
  | 'reloadFromDisk'
  | 'keepLocalDraft'
  | 'undo'
  | 'redo'
> {
  let droppedDocumentSequence = 0
  let editingFlushTimer: ReturnType<typeof setTimeout> | null = null
  let inflightEditingFlush: Promise<boolean> | null = null

  const clearEditingFlushTimer = () => {
    if (!editingFlushTimer) {
      return
    }

    clearTimeout(editingFlushTimer)
    editingFlushTimer = null
  }

  const startEditingSession = (input: {
    markdown: string
    surface: CanvasEditingSurface
    target: CanvasEditingTarget
  }) => {
    clearEditingFlushTimer()
    set({
      editingState: {
        status: 'active',
        target: input.target,
        surface: input.surface,
        baselineMarkdown: input.markdown,
        draftMarkdown: input.markdown,
        dirty: false,
        flushStatus: { status: 'idle' },
        blockMode: { status: 'none' },
        interaction: 'inactive',
        error: null
      },
      operationError: null
    })
  }

  const startObjectBodyEditing = (nodeId: string) => {
    const node = get().nodes.find((entry) => entry.id === nodeId)

    if (!node || node.component === 'image' || isNodeLocked(get(), node.id)) {
      return
    }

    startEditingSession({
      markdown: node.body ?? '',
      surface: 'wysiwyg',
      target: {
        kind: 'object-body',
        component: node.component,
        objectId: nodeId
      }
    })
  }

  const scheduleEditingFlush = () => {
    clearEditingFlushTimer()

    const editingState = get().editingState

    if (editingState.status !== 'active' || !editingState.dirty) {
      return
    }

    set({
      editingState: {
        ...editingState,
        flushStatus: { status: 'debouncing' }
      }
    })

    editingFlushTimer = setTimeout(() => {
      editingFlushTimer = null
      void get().flushEditingSession({
        reason: 'auto'
      })
    }, 400)
  }

  const readEditingIntent = (
    editingState: Exclude<CanvasStoreState['editingState'], { status: 'idle' }>,
    markdown: string
  ): CanvasDocumentEditIntent => {
    if (editingState.target.kind === 'edge-label') {
      return {
        kind: 'replace-edge-body',
        edgeId: editingState.target.edgeId,
        markdown
      }
    }

    return {
      kind: 'replace-object-body',
      objectId: editingState.target.objectId,
      markdown
    }
  }

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
      const flushSucceeded = await get().flushEditingSession({
        reason: 'file-action'
      })

      if (!flushSucceeded) {
        set({
          saveState: { status: 'idle' }
        })
        return
      }

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
      get().replaceSelection({
        groupIds: [],
        nodeIds: nodeId ? [nodeId] : [],
        edgeIds: []
      })
    },

    toggleSelectedNode(nodeId) {
      set((state) => {
        const hasNode = state.selectedNodeIds.includes(nodeId)

        return buildSelectionPatch(state, {
          groupIds: [],
          nodeIds: hasNode
            ? state.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
            : [...state.selectedNodeIds, nodeId],
          edgeIds: []
        })
      })
    },

    replaceSelectedNodes(nodeIds) {
      get().replaceSelection({
        groupIds: [],
        nodeIds,
        edgeIds: nodeIds.length > 0 ? [] : get().selectedEdgeIds
      })
    },

    replaceSelectedEdges(edgeIds) {
      get().replaceSelection({
        groupIds: [],
        nodeIds: edgeIds.length > 0 ? [] : get().selectedNodeIds,
        edgeIds
      })
    },

    replaceSelection(input) {
      set((state) => {
        return buildSelectionPatch(state, input)
      })
    },

    selectNodeFromCanvas(nodeId, additive) {
      set((state) => {
        return buildNodeSelectionPatch(state, nodeId, additive)
      })
    },

    selectEdgeFromCanvas(edgeId, additive) {
      set((state) => {
        return buildEdgeSelectionPatch(state, edgeId, additive)
      })
    },

    clearSelection() {
      get().replaceSelection({
        groupIds: [],
        nodeIds: [],
        edgeIds: []
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

    setViewportSize(size) {
      set((state) => {
        const nextSize = clampViewportSize(size)
        return isSameViewportSize(state.viewportSize, nextSize)
          ? state
          : {
              ...state,
              viewportSize: nextSize
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
      if (isNodeLocked(get(), nodeId)) {
        return
      }

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
      if (isNodeLocked(get(), nodeId)) {
        return
      }

      clearInteractionOverrides(set, get, [nodeId])
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

    async commitNodeMoves(moves) {
      const normalizedMoves = normalizeCommittedNodeMoves(moves, get())

      if (normalizedMoves.length === 0) {
        return
      }

      clearInteractionOverrides(set, get, normalizedMoves.map((move) => move.nodeId))
      logCanvasDiagnostic('debug', 'Committing node moves intent from the canvas store.', {
        count: normalizedMoves.length,
        nodeIds: normalizedMoves.map((move) => move.nodeId)
      })
      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'move-nodes',
          moves: normalizedMoves
        },
        set
      })
    },

    previewNodeResize(nodeId, geometry) {
      if (isNodeLocked(get(), nodeId)) {
        return
      }

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
      if (isNodeLocked(get(), nodeId)) {
        return
      }

      const nextGeometry = readResizedGeometryForNode(get(), nodeId, geometry)
      clearInteractionOverrides(set, get, [nodeId])
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
      if (isEdgeLocked(get(), edgeId)) {
        return
      }

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
      if (isNodeLocked(get(), from) || isNodeLocked(get(), to)) {
        return
      }

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
      const position = anchorNode
        ? {
            x: anchorNode.at.x + 40,
            y: anchorNode.at.y + 40
          }
        : readCenteredInsertPosition(state, {
            width: DEFAULT_NOTE_WIDTH,
            height: DEFAULT_NOTE_HEIGHT
          })

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'create-note',
          anchorNodeId: anchorNode?.id,
          x: position.x,
          y: position.y,
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
      const position = anchorNode
        ? {
            x: anchorNode.at.x + 48,
            y: anchorNode.at.y + 48
          }
        : readCenteredInsertPosition(state, { width, height })

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'create-shape',
          anchorNodeId: anchorNode?.id,
          x: position.x,
          y: position.y,
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

      if (!selectedImage || isNodeLocked(state, selectedImage.id)) {
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

      if (!selectedImage || isNodeLocked(state, selectedImage.id)) {
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

      if (!selectedImage || isNodeLocked(state, selectedImage.id)) {
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
      const selection = readUnlockedDocumentSelection(state)

      if (
        selection.groupIds.length === 0 &&
        selection.nodeIds.length === 0 &&
        selection.edgeIds.length === 0
      ) {
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
          groupIds: selection.groupIds,
          nodeIds: selection.nodeIds,
          edgeIds: selection.edgeIds
        },
        set
      })
    },

    selectAllObjects() {
      set((state) => {
        const selection = readTopLevelSelection(state)

        if (
          areSameIds(state.selectedGroupIds, selection.groupIds) &&
          areSameIds(state.selectedNodeIds, selection.nodeIds) &&
          areSameIds(state.selectedEdgeIds, selection.edgeIds)
        ) {
          return state
        }

        return {
          ...state,
          selectedGroupIds: selection.groupIds,
          groupSelectionState:
            selection.groupIds.length === 1
              ? {
                  status: 'group-selected',
                  groupId: selection.groupIds[0]
                }
              : { status: 'idle' },
          selectedNodeIds: selection.nodeIds,
          selectedEdgeIds: selection.edgeIds,
          operationError: null
        }
      })
    },

    async copySelection() {
      const payload = readClipboardPayload(get(), {
        includeLocked: true
      })

      if (!payload) {
        return
      }

      set((state) => ({
        ...state,
        clipboardState: {
          status: 'ready',
          payload
        },
        operationError: null
      }))
    },

    async cutSelection() {
      const payload = readClipboardPayload(get(), {
        includeLocked: false
      })

      if (!payload) {
        return
      }

      set((state) => ({
        ...state,
        clipboardState: {
          status: 'ready',
          payload
        },
        operationError: null
      }))

      await get().deleteSelection()
    },

    async pasteClipboard() {
      const state = get()
      const previousMaxZ = readCurrentMaxZFromState(state)
      const payload = state.clipboardState.status === 'ready' ? state.clipboardState.payload : null

      if (!payload) {
        return
      }

      const anchor = readClipboardPasteAnchor(state)

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'paste-objects',
          payload,
          anchorX: anchor.x,
          anchorY: anchor.y,
          inPlace: false
        },
        set
      })

      selectRecentlyInsertedObjects(get, set, previousMaxZ)
    },

    async pasteClipboardInPlace() {
      const state = get()
      const previousMaxZ = readCurrentMaxZFromState(state)
      const payload = state.clipboardState.status === 'ready' ? state.clipboardState.payload : null

      if (!payload) {
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'paste-objects',
          payload,
          anchorX: payload.origin?.x ?? 0,
          anchorY: payload.origin?.y ?? 0,
          inPlace: true
        },
        set
      })

      selectRecentlyInsertedObjects(get, set, previousMaxZ)
    },

    async duplicateSelection() {
      const state = get()
      const payload = readClipboardPayload(state, {
        includeLocked: false
      })

      if (!payload) {
        return
      }
      const previousMaxZ = readCurrentMaxZFromState(state)
      const anchor = payload.origin
        ? {
            x: payload.origin.x + 16,
            y: payload.origin.y + 16
          }
        : readClipboardPasteAnchor(state)

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'paste-objects',
          payload,
          anchorX: anchor.x,
          anchorY: anchor.y,
          inPlace: false
        },
        set
      })
      selectRecentlyInsertedObjects(get, set, previousMaxZ)
    },

    async nudgeSelection(dx, dy) {
      const state = get()
      const nodeIds = readUnlockedNodeSelection(state)

      if (nodeIds.length === 0 || (dx === 0 && dy === 0)) {
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'nudge-objects',
          nodeIds,
          dx,
          dy
        },
        set
      })
    },

    async arrangeSelection(mode: CanvasObjectArrangeMode) {
      const state = get()
      const selection = readArrangeableSelection(state)

      if (
        selection.groupIds.length === 0 &&
        selection.nodeIds.length === 0 &&
        selection.edgeIds.length === 0
      ) {
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'arrange-objects',
          groupIds: selection.groupIds,
          nodeIds: selection.nodeIds,
          edgeIds: selection.edgeIds,
          mode
        },
        set
      })
    },

    async setSelectionLocked(locked) {
      const state = get()
      const selection = readLockSelectionTargetIds(state)

      if (
        selection.groupIds.length === 0 &&
        selection.nodeIds.length === 0 &&
        selection.edgeIds.length === 0
      ) {
        return
      }

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'set-objects-locked',
          groupIds: selection.groupIds,
          nodeIds: selection.nodeIds,
          edgeIds: selection.edgeIds,
          locked
        },
        set
      })
    },

    async groupSelection() {
      const state = get()
      const topLevelNodeIds = state.selectedNodeIds.filter((nodeId) => isTopLevelNode(state, nodeId))
        .filter((nodeId) => !isNodeLocked(state, nodeId))

      if (
        state.selectedGroupIds.length > 0 ||
        state.selectedEdgeIds.length > 0 ||
        topLevelNodeIds.length < 2
      ) {
        return
      }

      const groupId = readNextGeneratedGroupId('group', state.nodes, state.edges, state.groups)
      const nextZ = readCurrentMaxZFromState(state) + 1

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'upsert-group',
          groupId,
          nodeIds: topLevelNodeIds,
          z: nextZ
        },
        onSuccess() {
          set((currentState) => ({
            ...currentState,
            selectedGroupIds: [groupId],
            selectedNodeIds: [],
            selectedEdgeIds: [],
            groupSelectionState: {
              status: 'group-selected',
              groupId
            },
            operationError: null
          }))
        },
        set
      })
    },

    async ungroupSelection() {
      const state = get()
      const groups = readSelectedGroups(state)

      if (groups.length === 0 || state.groupSelectionState.status === 'drilldown') {
        return
      }

      const memberNodeIds = groups.flatMap((group) => group.members.nodeIds)

      await commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: {
          kind: 'delete-groups',
          groupIds: groups.map((group) => group.id)
        },
        onSuccess() {
          set((currentState) => buildSelectionPatch(currentState, {
            groupIds: [],
            nodeIds: memberNodeIds,
            edgeIds: []
          }))
        },
        set
      })
    },

    startNoteEditing(nodeId) {
      const node = get().nodes.find((entry) => entry.id === nodeId)

      if (!node || node.component !== 'note' || isNodeLocked(get(), node.id)) {
        return
      }

      startObjectBodyEditing(nodeId)
    },

    startObjectEditing(nodeId) {
      startObjectBodyEditing(nodeId)
    },

    startShapeEditing(nodeId) {
      const node = get().nodes.find((entry) => entry.id === nodeId)

      if (!node || node.component === 'note' || isNodeLocked(get(), node.id)) {
        return
      }

      startObjectBodyEditing(nodeId)
    },

    startEdgeEditing(edgeId) {
      const edge = get().edges.find((entry) => entry.id === edgeId)

      if (!edge || isEdgeLocked(get(), edge.id)) {
        return
      }

      startEditingSession({
        markdown: edge.body ?? '',
        surface: 'wysiwyg',
        target: {
          kind: 'edge-label',
          edgeId
        }
      })
    },

    updateEditingMarkdown(markdown) {
      set((state) => {
        if (state.editingState.status !== 'active') {
          return state
        }

        return {
          ...state,
          editingState: {
            ...state.editingState,
            draftMarkdown: markdown,
            dirty: markdown !== state.editingState.baselineMarkdown,
            error: null
          }
        }
      })

      scheduleEditingFlush()
    },

    setEditingBlockMode(blockMode) {
      set((state) => {
        if (state.editingState.status !== 'active') {
          return state
        }

        return {
          ...state,
          editingState: {
            ...state.editingState,
            blockMode
          }
        }
      })
    },

    setEditingInteraction(interaction) {
      set((state) => {
        if (state.editingState.status !== 'active') {
          return state
        }

        return {
          ...state,
          editingState: {
            ...state.editingState,
            interaction
          }
        }
      })
    },

    async flushEditingSession(options) {
      clearEditingFlushTimer()

      if (inflightEditingFlush) {
        const result = await inflightEditingFlush

        if (result && options?.close) {
          return get().flushEditingSession(options)
        }

        return result
      }

      const state = get()

      if (state.editingState.status !== 'active') {
        return true
      }

      const close = options?.close ?? false
      const reason = options?.reason ?? (close ? 'close' : 'explicit')

      if (!state.editingState.dirty) {
        set({
          editingState: close
            ? { status: 'idle' }
            : {
                ...state.editingState,
                error: null,
                flushStatus: { status: 'idle' }
              }
        })
        return true
      }

      const session = state.editingState
      const flushedMarkdown = session.draftMarkdown

      set({
        editingState: {
          ...session,
          error: null,
          flushStatus: {
            status: 'flushing',
            reason
          }
        },
        operationError: null
      })

      const nextFlush = commitCanvasIntent({
        controls,
        documentService: services.documentService,
        editingService: services.editingService,
        get,
        historyService: services.historyService,
        intent: readEditingIntent(session, flushedMarkdown),
        onSuccess() {
          set((currentState) => {
            if (close) {
              return {
                editingState: { status: 'idle' },
                operationError: null
              }
            }

            const currentEditingState = currentState.editingState

            if (currentEditingState.status !== 'active') {
              return {
                editingState: {
                  ...session,
                  baselineMarkdown: flushedMarkdown,
                  blockMode: { status: 'none' },
                  dirty: false,
                  draftMarkdown: flushedMarkdown,
                  error: null,
                  flushStatus: { status: 'idle' }
                },
                operationError: null
              }
            }

            const hasUnflushedDraft = currentEditingState.draftMarkdown !== flushedMarkdown

            return {
              editingState: {
                ...currentEditingState,
                baselineMarkdown: flushedMarkdown,
                dirty: hasUnflushedDraft,
                error: null,
                flushStatus: hasUnflushedDraft ? { status: 'debouncing' } : { status: 'idle' }
              },
              operationError: null
            }
          })
        },
        set
      }).then((result) => {
        if (!result) {
          set((currentState) => {
            if (currentState.editingState.status !== 'active') {
              return currentState
            }

            return {
              ...currentState,
              editingState: {
                ...currentState.editingState,
                error: currentState.operationError ?? 'Failed to flush editor changes.',
                flushStatus: { status: 'idle' }
              }
            }
          })
          return false
        }

        return true
      }).finally(() => {
        inflightEditingFlush = null
      })

      inflightEditingFlush = nextFlush
      const flushResult = await nextFlush

      if (flushResult) {
        const currentEditingState = get().editingState

        if (
          currentEditingState.status === 'active' &&
          currentEditingState.dirty &&
          currentEditingState.flushStatus.status === 'debouncing'
        ) {
          scheduleEditingFlush()
        }
      }

      return flushResult
    },

    async commitInlineEditing() {
      const state = get()

      if (state.editingState.status === 'active') {
        logCanvasDiagnostic('debug', 'Committing active body editor session from the canvas store.', {
          surface: state.editingState.surface,
          targetKind: state.editingState.target.kind,
          markdownLength: state.editingState.draftMarkdown.length
        })
      }

      return get().flushEditingSession({
        close: true,
        reason: 'close'
      })
    },

    cancelInlineEditing() {
      clearEditingFlushTimer()
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
          clipboardState: get().clipboardState,
          documentState: result.documentState,
          groupSelectionState: { status: 'idle' },
          history: transition.history,
          viewport: get().viewport,
          selectedGroupIds: result.entry.selectedGroupIds,
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
          clipboardState: get().clipboardState,
          documentState: result.documentState,
          groupSelectionState: { status: 'idle' },
          history: transition.history,
          viewport: get().viewport,
          selectedGroupIds: result.entry.selectedGroupIds,
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

function clearInteractionOverrides(
  set: CanvasStoreSetState,
  get: CanvasStoreGetState,
  nodeIds: string[]
) {
  const overrides = { ...get().interactionOverrides }
  let changed = false

  for (const nodeId of nodeIds) {
    if (!(nodeId in overrides)) {
      continue
    }

    delete overrides[nodeId]
    changed = true
  }

  if (!changed) {
    return
  }

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

function clampViewportSize(size: CanvasStoreState['viewportSize']) {
  return {
    width: Math.max(0, Math.round(size.width)),
    height: Math.max(0, Math.round(size.height))
  }
}

function isSameViewportSize(
  left: CanvasStoreState['viewportSize'],
  right: CanvasStoreState['viewportSize']
) {
  return left.width === right.width && left.height === right.height
}

function readAnchorNodeId(state: CanvasStoreState) {
  return state.selectedNodeIds[0]
}

function readViewportCenter(state: CanvasStoreState) {
  if (state.viewportSize.width <= 0 || state.viewportSize.height <= 0) {
    return null
  }

  return {
    x: (state.viewportSize.width / 2 - state.viewport.x) / state.viewport.zoom,
    y: (state.viewportSize.height / 2 - state.viewport.y) / state.viewport.zoom
  }
}

function readCenteredInsertPosition(
  state: CanvasStoreState,
  geometry: {
    width: number
    height: number
  }
) {
  const center = readViewportCenter(state)

  if (center) {
    return {
      x: roundGeometry(center.x - geometry.width / 2),
      y: roundGeometry(center.y - geometry.height / 2)
    }
  }

  return {
    x: Math.abs(state.viewport.x) + 120,
    y: Math.abs(state.viewport.y) + 120
  }
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

  return readCenteredInsertPosition(state, geometry)
}

function readImageGeometry(width: number, height: number) {
  const fitted = fitCanvasImageSize(width, height)

  return {
    width: Math.max(96, fitted.width),
    height: Math.max(96, fitted.height)
  }
}

function readNextGeneratedId(
  prefix: 'group' | 'image',
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  groups: CanvasStoreState['groups'] = []
) {
  const existingIds = new Set([
    ...groups.map((group) => group.id),
    ...nodes.map((node) => node.id),
    ...edges.map((edge) => edge.id)
  ])
  let index = 1

  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1
  }

  return `${prefix}-${index}`
}

function readNextGeneratedGroupId(
  prefix: 'group',
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  groups: CanvasStoreState['groups']
) {
  return readNextGeneratedId(prefix, nodes, edges, groups)
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

function readTopLevelSelection(state: CanvasStoreState) {
  const groupedNodeIds = new Set(state.groups.flatMap((group) => group.members.nodeIds))

  return {
    groupIds: state.groups.map((group) => group.id),
    nodeIds: state.nodes
      .filter((node) => !groupedNodeIds.has(node.id))
      .map((node) => node.id),
    edgeIds: state.edges.map((edge) => edge.id)
  }
}

function readCurrentMaxZFromState(state: CanvasStoreState) {
  return Math.max(
    0,
    ...state.groups.map((group) => group.z ?? 0),
    ...state.nodes.map((node) => node.z ?? 0),
    ...state.edges.map((edge) => edge.z ?? 0)
  )
}

function buildSelectionPatch(
  state: CanvasStoreState,
  input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
    groupSelectionState?: CanvasStoreState['groupSelectionState']
  }
) {
  const nextGroupIds = [...new Set(input.groupIds)]
  const nextNodeIds = [...new Set(input.nodeIds)]
  const nextEdgeIds = [...new Set(input.edgeIds)]
  const nextGroupSelectionState =
    input.groupSelectionState ?? deriveGroupSelectionState(nextGroupIds, nextNodeIds, nextEdgeIds)

  if (
    areSameIds(state.selectedGroupIds, nextGroupIds) &&
    areSameIds(state.selectedNodeIds, nextNodeIds) &&
    areSameIds(state.selectedEdgeIds, nextEdgeIds) &&
    isSameGroupSelectionState(state.groupSelectionState, nextGroupSelectionState)
  ) {
    return state
  }

  return {
    ...state,
    selectedGroupIds: nextGroupIds,
    selectedNodeIds: nextNodeIds,
    selectedEdgeIds: nextEdgeIds,
    groupSelectionState: nextGroupSelectionState,
    operationError: null
  }
}

function buildNodeSelectionPatch(state: CanvasStoreState, nodeId: string, additive: boolean) {
  const containingGroup = readContainingGroup(state, nodeId)

  if (containingGroup && !additive) {
    if (
      state.groupSelectionState.status === 'group-selected' &&
      state.groupSelectionState.groupId === containingGroup.id &&
      state.selectedGroupIds.length === 1 &&
      state.selectedNodeIds.length === 0 &&
      state.selectedEdgeIds.length === 0
    ) {
      return buildSelectionPatch(state, {
        groupIds: [],
        nodeIds: [nodeId],
        edgeIds: [],
        groupSelectionState: {
          status: 'drilldown',
          groupId: containingGroup.id,
          nodeId
        }
      })
    }

    if (state.groupSelectionState.status === 'drilldown' && state.groupSelectionState.groupId === containingGroup.id) {
      return buildSelectionPatch(state, {
        groupIds: [],
        nodeIds: [nodeId],
        edgeIds: [],
        groupSelectionState: {
          status: 'drilldown',
          groupId: containingGroup.id,
          nodeId
        }
      })
    }

    return buildSelectionPatch(state, {
      groupIds: [containingGroup.id],
      nodeIds: [],
      edgeIds: [],
      groupSelectionState: {
        status: 'group-selected',
        groupId: containingGroup.id
      }
    })
  }

  if (containingGroup && additive) {
    return buildSelectionPatch(state, {
      groupIds: [...state.selectedGroupIds, containingGroup.id],
      nodeIds: state.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId),
      edgeIds: state.selectedEdgeIds
    })
  }

  if (additive) {
    const hasNode = state.selectedNodeIds.includes(nodeId)

    return buildSelectionPatch(state, {
      groupIds: state.selectedGroupIds,
      nodeIds: hasNode
        ? state.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
        : [...state.selectedNodeIds, nodeId],
      edgeIds: state.selectedEdgeIds
    })
  }

  return buildSelectionPatch(state, {
    groupIds: [],
    nodeIds: [nodeId],
    edgeIds: []
  })
}

function buildEdgeSelectionPatch(state: CanvasStoreState, edgeId: string, additive: boolean) {
  if (additive) {
    const hasEdge = state.selectedEdgeIds.includes(edgeId)

    return buildSelectionPatch(state, {
      groupIds: state.selectedGroupIds,
      nodeIds: state.selectedNodeIds,
      edgeIds: hasEdge
        ? state.selectedEdgeIds.filter((selectedEdgeId) => selectedEdgeId !== edgeId)
        : [...state.selectedEdgeIds, edgeId]
    })
  }

  return buildSelectionPatch(state, {
    groupIds: [],
    nodeIds: [],
    edgeIds: [edgeId]
  })
}

function deriveGroupSelectionState(
  groupIds: string[],
  nodeIds: string[],
  edgeIds: string[]
): CanvasStoreState['groupSelectionState'] {
  if (groupIds.length === 1 && nodeIds.length === 0 && edgeIds.length === 0) {
    return {
      status: 'group-selected',
      groupId: groupIds[0]
    }
  }

  return { status: 'idle' }
}

function isSameGroupSelectionState(
  left: CanvasStoreState['groupSelectionState'],
  right: CanvasStoreState['groupSelectionState']
) {
  if (left.status !== right.status) {
    return false
  }

  if (left.status === 'idle' && right.status === 'idle') {
    return true
  }

  if (left.status === 'group-selected' && right.status === 'group-selected') {
    return left.groupId === right.groupId
  }

  if (left.status === 'drilldown' && right.status === 'drilldown') {
    return left.groupId === right.groupId && left.nodeId === right.nodeId
  }

  return false
}

function readClipboardPayload(
  state: CanvasStoreState,
  options: {
    includeLocked: boolean
  }
) {
  const selectedGroups = readSelectedGroups(state)
    .filter((group) => options.includeLocked || !group.locked)
  const groupNodeIds = selectedGroups.flatMap((group) => group.members.nodeIds)
  const selectedNodes = state.nodes.filter((node) => {
    if (options.includeLocked ? false : isNodeLocked(state, node.id)) {
      return false
    }

    return state.selectedNodeIds.includes(node.id) || groupNodeIds.includes(node.id)
  })
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id))
  const selectedEdges = state.edges.filter((edge) => {
    if (!options.includeLocked && isEdgeLocked(state, edge.id)) {
      return false
    }

    if (state.selectedEdgeIds.includes(edge.id)) {
      return true
    }

    return selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to)
  })

  if (selectedGroups.length === 0 && selectedNodes.length === 0 && selectedEdges.length === 0) {
    return null
  }

  return {
    groups: selectedGroups.map((group) => ({
      id: group.id,
      z: group.z,
      locked: group.locked,
      body: group.body,
      members: {
        nodeIds: [...group.members.nodeIds]
      }
    })),
    nodes: selectedNodes.map((node) => ({
      id: node.id,
      component: node.component,
      at: {
        ...node.at
      },
      z: node.z,
      locked: node.locked,
      style: node.style,
      body: node.body,
      src: node.src,
      alt: node.alt,
      title: node.title,
      lockAspectRatio: node.lockAspectRatio
    })),
    edges: selectedEdges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      z: edge.z,
      locked: edge.locked,
      style: edge.style,
      body: edge.body
    })),
    origin: readClipboardPayloadOrigin(selectedNodes)
  }
}

function readClipboardPayloadOrigin(nodes: CanvasStoreState['nodes']) {
  if (nodes.length === 0) {
    return null
  }

  return {
    x: Math.min(...nodes.map((node) => node.at.x)),
    y: Math.min(...nodes.map((node) => node.at.y))
  }
}

function readClipboardPasteAnchor(state: CanvasStoreState) {
  if (state.lastCanvasPointer) {
    return state.lastCanvasPointer
  }

  return readViewportCenter(state) ?? { x: 0, y: 0 }
}

function selectRecentlyInsertedObjects(
  get: CanvasStoreGetState,
  set: CanvasStoreSetState,
  previousMaxZ: number
) {
  const nextState = get()
  const groupIds = nextState.groups
    .filter((group) => (group.z ?? 0) > previousMaxZ)
    .map((group) => group.id)
  const nodeIds = nextState.nodes
    .filter((node) => (node.z ?? 0) > previousMaxZ)
    .map((node) => node.id)
  const edgeIds = nextState.edges
    .filter((edge) => (edge.z ?? 0) > previousMaxZ)
    .map((edge) => edge.id)

  if (groupIds.length === 0 && nodeIds.length === 0 && edgeIds.length === 0) {
    return
  }

  set((state) => buildSelectionPatch(state, {
    groupIds,
    nodeIds,
    edgeIds
  }))
}
