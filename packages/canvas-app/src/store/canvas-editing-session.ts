import type {
  CanvasEditingBlockMode,
  CanvasEditingState,
  CanvasEditingTarget
} from '@canvas-app/store/canvas-store-types'

export function isCanvasEditingActive(editingState: CanvasEditingState) {
  return editingState.status === 'active'
}

export function canCanvasMutateSelection(editingState: CanvasEditingState) {
  return editingState.status === 'idle'
}

export function readEditingDraftMarkdown(editingState: CanvasEditingState) {
  return editingState.status === 'active' ? editingState.draftMarkdown : null
}

export function readEditingTarget(editingState: CanvasEditingState): CanvasEditingTarget | null {
  return editingState.status === 'active' ? editingState.target : null
}

export function isEditingNodeBody(
  editingState: CanvasEditingState,
  nodeId: string
) {
  if (editingState.status !== 'active') {
    return false
  }

  if (editingState.target.kind !== 'object-body') {
    return false
  }

  if (editingState.target.objectId !== nodeId) {
    return false
  }

  return true
}

export function isEditingEdgeLabel(editingState: CanvasEditingState, edgeId: string) {
  return editingState.status === 'active' &&
    editingState.target.kind === 'edge-label' &&
    editingState.target.edgeId === edgeId
}

export function isEditingBlockMode(
  editingState: CanvasEditingState,
  status: CanvasEditingBlockMode['status']
) {
  return editingState.status === 'active' && editingState.blockMode.status === status
}
