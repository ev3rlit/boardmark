import type { CanvasStoreState } from '@canvas-app/store/canvas-store-types'

export function selectCanvasDocument(state: CanvasStoreState) {
  return state.document
}

export function selectCanvasEditingState(state: CanvasStoreState) {
  return state.editingState
}

export function selectCanvasIsDropActive(state: CanvasStoreState) {
  return state.dropState.status === 'active'
}

export function selectCanvasFileMenuState(state: CanvasStoreState) {
  return {
    createNewDocument: state.createNewDocument,
    document: state.document,
    isDirty: state.isDirty,
    openDocument: state.openDocument,
    resetToTemplate: state.resetToTemplate,
    saveCurrentDocument: state.saveCurrentDocument,
    saveState: state.saveState
  }
}

export function selectCanvasStatusPanelState(state: CanvasStoreState) {
  return {
    conflictState: state.conflictState,
    dropState: state.dropState,
    invalidState: state.invalidState,
    keepLocalDraft: state.keepLocalDraft,
    loadState: state.loadState,
    operationError: state.operationError,
    parseIssues: state.parseIssues,
    reloadFromDisk: state.reloadFromDisk,
    saveState: state.saveState
  }
}

export function selectCanvasToolMenuState(state: CanvasStoreState) {
  return {
    createFrameAtViewport: state.createFrameAtViewport,
    createNoteAtViewport: state.createNoteAtViewport,
    createShapeAtViewport: state.createShapeAtViewport,
    editingState: state.editingState,
    setToolMode: state.setToolMode
  }
}

export function selectCanvasZoomState(state: CanvasStoreState) {
  return {
    setViewport: state.setViewport,
    viewport: state.viewport
  }
}
