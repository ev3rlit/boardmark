import { create } from 'zustand'
import { ZOOM_STEP, type CanvasViewport } from '@boardmark/canvas-domain'
import { createCanvasConflictService } from '@canvas-app/services/canvas-conflict-service'
import { createCanvasDocumentService } from '@canvas-app/services/canvas-document-service'
import { createCanvasEditingService } from '@canvas-app/services/canvas-editing-service'
import { createCanvasHistoryService } from '@canvas-app/services/canvas-history-service'
import {
  createCanvasCommandSlice,
  createCanvasDocumentSlice,
  createCanvasInteractionSlice,
  createCanvasUiSlice,
  reconcileCanvasExternalSource
} from '@canvas-app/store/canvas-store-slices'
import type {
  CanvasConflictState,
  CanvasEditingState,
  CanvasHistoryEntry,
  CanvasHistoryState,
  CanvasStoreOptions,
  CanvasStoreState,
  ToolMode
} from '@canvas-app/store/canvas-store-types'

export type CanvasStore = ReturnType<typeof createCanvasStore>

export function readActiveToolMode(
  state: Pick<CanvasStoreState, 'toolMode' | 'temporaryPanState'>
): ToolMode {
  return state.temporaryPanState === 'active' ? 'pan' : state.toolMode
}

export function createCanvasStore({
  documentPicker,
  documentRepository,
  documentPersistenceBridge,
  imageAssetBridge,
  templateSource
}: CanvasStoreOptions) {
  let disposeExternalChanges: (() => void) | null = null

  const documentService = createCanvasDocumentService({
    documentPicker,
    documentRepository,
    documentPersistenceBridge,
    templateSource
  })
  const editingService = createCanvasEditingService({
    documentRepository
  })
  const historyService = createCanvasHistoryService({
    documentRepository
  })
  const conflictService = createCanvasConflictService({
    documentRepository
  })

  const store = create<CanvasStoreState>((set, get) => ({
    ...createCanvasDocumentSlice(),
    ...createCanvasInteractionSlice(),
    ...createCanvasUiSlice(),
    ...createCanvasCommandSlice(
      set,
      get,
      {
        conflictService,
        documentService,
        editingService,
        historyService,
        imageAssetBridge,
        onExternalSource(source) {
          void reconcileCanvasExternalSource(get, set, conflictService, source)
        }
      },
      {
        clearExternalSubscription,
        resubscribeExternalChanges: subscribeExternalChanges
      }
    )
  }))

  async function subscribeExternalChanges() {
    clearExternalSubscription()

    disposeExternalChanges = await documentService.subscribeExternalChanges({
      document: store.getState().document,
      documentState: store.getState().documentState,
      onExternalChange(source) {
        void reconcileCanvasExternalSource(store.getState, store.setState, conflictService, source)
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

export function applyZoomStep(viewport: CanvasViewport, direction: 'in' | 'out') {
  const delta = direction === 'in' ? ZOOM_STEP : -ZOOM_STEP

  return {
    ...viewport,
    zoom: viewport.zoom + delta
  }
}

export type {
  CanvasConflictState,
  CanvasEditingState,
  CanvasHistoryEntry,
  CanvasHistoryState,
  CanvasStoreState
}
