import {
  canExecuteCanvasAppCommand
} from '@canvas-app/app/commands/canvas-app-commands'
import {
  canExecuteCanvasObjectCommand
} from '@canvas-app/app/commands/canvas-object-commands'
import {
  canCanvasMutateSelection
} from '@canvas-app/store/canvas-editing-session'
import {
  readUnlockedNodeSelection
} from '@canvas-app/store/canvas-object-selection'
import type {
  CanvasInputContext,
  CanvasMatchedInput,
  CanvasPointerCapabilities,
  CanvasResolvedInput
} from '@canvas-app/input/canvas-input-types'

export function resolveCanvasInput(
  input: CanvasMatchedInput,
  context: CanvasInputContext
): CanvasResolvedInput | null {
  switch (input.intent.kind) {
    case 'app-command':
      if (!input.allowEditableTarget && context.isEditableTarget) {
        return null
      }

      if (!canExecuteCanvasAppCommand(input.intent.commandId, context.appCommandContext)) {
        return null
      }

      return {
        kind: 'execute-app-command',
        commandId: input.intent.commandId,
        preventDefault: input.preventDefault
      }

    case 'object-command':
      if (!input.allowEditableTarget && context.isEditableTarget) {
        return null
      }

      if (!canExecuteCanvasObjectCommand(input.intent.commandId, context.objectCommandContext)) {
        return null
      }

      return {
        kind: 'execute-object-command',
        commandId: input.intent.commandId,
        preventDefault: input.preventDefault
      }

    case 'temporary-pan':
      if (!input.allowEditableTarget && context.isEditableTarget) {
        return null
      }

      if (input.intent.state === 'start' && !canCanvasMutateSelection(context.editingState)) {
        return null
      }

      return {
        kind: 'set-pan-shortcut-active',
        active: input.intent.state === 'start',
        preventDefault: input.preventDefault
      }

    case 'viewport-zoom':
      if (
        input.intent.direction === undefined &&
        (input.intent.deltaScale === undefined || !Number.isFinite(input.intent.deltaScale))
      ) {
        return null
      }

      return {
        kind: 'apply-viewport-zoom',
        mode: input.intent.mode,
        direction: input.intent.direction,
        deltaScale: input.intent.deltaScale,
        anchorClientX: input.intent.anchorClientX,
        anchorClientY: input.intent.anchorClientY
      }

    case 'pointer-node-move-commit':
      if (!canCanvasMutateSelection(context.editingState)) {
        return null
      }

      return readPointerNodeMoveResolution({
        draggedNodeId: input.intent.nodeId,
        draggedPosition: input.intent.position,
        nodes: context.selectionSnapshot.nodes,
        unlockedSelectionNodeIds: readUnlockedNodeSelection(context.selectionSnapshot)
      })

    case 'pointer-node-resize-commit':
      if (!canCanvasMutateSelection(context.editingState)) {
        return null
      }

      return {
        kind: 'commit-node-resize',
        nodeId: input.intent.nodeId,
        geometry: input.intent.geometry
      }

    case 'pointer-edge-reconnect-commit':
      if (!canCanvasMutateSelection(context.editingState)) {
        return null
      }

      return {
        kind: 'commit-edge-reconnect',
        edgeId: input.intent.edgeId,
        from: input.intent.from,
        to: input.intent.to
      }
  }
}

export function readCanvasPointerCapabilities(
  context: CanvasInputContext
): CanvasPointerCapabilities {
  const canManipulateCanvas = canCanvasMutateSelection(context.editingState)
  const isSelectMode = context.activeToolMode === 'select'

  return {
    edgesReconnectable: isSelectMode && canManipulateCanvas,
    elementsSelectable: isSelectMode,
    nodesConnectable: isSelectMode && canManipulateCanvas,
    nodesDraggable: isSelectMode && canManipulateCanvas,
    panOnDrag: context.activeToolMode === 'pan',
    selectionOnDrag: context.supportsMultiSelect && isSelectMode
  }
}

export function readPointerNodeMoveResolution(input: {
  draggedNodeId: string
  draggedPosition: {
    x: number
    y: number
  }
  nodes: CanvasInputContext['selectionSnapshot']['nodes']
  unlockedSelectionNodeIds: string[]
}): CanvasResolvedInput | null {
  const draggedNode = input.nodes.find((node) => node.id === input.draggedNodeId)

  if (!draggedNode) {
    return null
  }

  const x = Math.round(input.draggedPosition.x)
  const y = Math.round(input.draggedPosition.y)
  const dx = x - draggedNode.at.x
  const dy = y - draggedNode.at.y

  if (dx === 0 && dy === 0) {
    return null
  }

  if (
    input.unlockedSelectionNodeIds.length > 1 &&
    input.unlockedSelectionNodeIds.includes(input.draggedNodeId)
  ) {
    return {
      kind: 'commit-selection-nudge',
      dx,
      dy
    }
  }

  return {
    kind: 'commit-node-move',
    nodeId: input.draggedNodeId,
    x,
    y
  }
}
