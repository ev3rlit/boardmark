import {
  canExecuteCanvasAppCommand
} from '@canvas-app/app/commands/canvas-app-commands'
import {
  canExecuteCanvasObjectCommand
} from '@canvas-app/app/commands/canvas-object-commands'
import {
  readPointerInteractionTransition,
  readPointerPanIntentReady
} from '@canvas-app/input/pointer-interaction-machine'
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

      return readInteractionMachineResolution(
        context,
        input.intent.state === 'start'
          ? { kind: 'temporary-pan:start' }
          : { kind: 'temporary-pan:end' }
      )

    case 'system-blur':
      return readInteractionMachineResolution(context, { kind: 'blur' })

    case 'system-editing':
      return readInteractionMachineResolution(
        context,
        input.intent.state === 'start'
          ? { kind: 'editing:start' }
          : { kind: 'editing:end' }
      )

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

    case 'pointer-pane-click':
      return {
        kind: 'clear-selection'
      }

    case 'pointer-node-click':
      if (!readCanvasPointerCapabilities(context).elementsSelectable) {
        return null
      }

      return {
        kind: 'select-node',
        additive: input.intent.additive,
        nodeId: input.intent.nodeId
      }

    case 'pointer-edge-click':
      if (!readCanvasPointerCapabilities(context).elementsSelectable) {
        return null
      }

      return {
        kind: 'select-edge',
        additive: input.intent.additive,
        edgeId: input.intent.edgeId
      }

    case 'pointer-pane-context-menu':
      return {
        kind: 'open-pane-context-menu',
        x: input.intent.x,
        y: input.intent.y
      }

    case 'pointer-node-context-menu':
      return {
        kind: 'open-node-context-menu',
        additive: input.intent.additive,
        nodeId: input.intent.nodeId,
        x: input.intent.x,
        y: input.intent.y
      }

    case 'pointer-edge-context-menu':
      return {
        kind: 'open-edge-context-menu',
        additive: input.intent.additive,
        edgeId: input.intent.edgeId,
        x: input.intent.x,
        y: input.intent.y
      }

    case 'pointer-node-selection-change':
      if (!readCanvasPointerCapabilities(context).elementsSelectable) {
        return null
      }

      return {
        kind: 'apply-node-selection-change',
        changes: input.intent.changes
      }

    case 'pointer-edge-selection-change':
      if (!readCanvasPointerCapabilities(context).elementsSelectable) {
        return null
      }

      return {
        kind: 'apply-edge-selection-change',
        changes: input.intent.changes
      }

    case 'pointer-selection-box-start':
      if (!readCanvasPointerCapabilities(context).selectionOnDrag) {
        return null
      }

      return readInteractionMachineResolution(context, { kind: 'selection-box:start' })

    case 'pointer-selection-box-drag-start':
      if (!readCanvasPointerCapabilities(context).selectionOnDrag) {
        return null
      }

      return readInteractionMachineResolution(context, { kind: 'selection-box:drag-start' })

    case 'pointer-selection-box-end':
      return readInteractionMachineResolution(context, { kind: 'selection-box:end' })

    case 'pointer-node-drag-start':
      if (!readCanvasPointerCapabilities(context).nodesDraggable) {
        return null
      }

      return readInteractionMachineResolution(context, { kind: 'node-drag:start' })

    case 'pointer-node-drag-end':
      return readInteractionMachineResolution(context, { kind: 'node-drag:end' })

    case 'pointer-edge-reconnect-start':
      if (!readCanvasPointerCapabilities(context).edgesReconnectable) {
        return null
      }

      return readInteractionMachineResolution(context, { kind: 'edge-reconnect:start' })

    case 'pointer-edge-reconnect-end':
      return readInteractionMachineResolution(context, { kind: 'edge-reconnect:end' })

    case 'pointer-pane-pan-start':
      if (!readPointerPanIntentReady(context)) {
        return null
      }

      return readInteractionMachineResolution(context, { kind: 'pane-pan:start' })

    case 'pointer-pane-pan-end':
      return readInteractionMachineResolution(context, { kind: 'pane-pan:end' })
  }
}

export function readCanvasPointerCapabilities(
  context: CanvasInputContext
): CanvasPointerCapabilities {
  const canManipulateCanvas = canCanvasMutateSelection(context.editingState)
  const isSelectMode = context.toolMode === 'select'
  const isNodeDragActive = context.pointerInteractionState.status === 'node-drag'
  const isSelectionBoxActive = context.pointerInteractionState.status === 'selection-box'
  const isEdgeReconnectActive = context.pointerInteractionState.status === 'edge-reconnect'
  const shouldPanOnDrag = canManipulateCanvas && readPointerPanIntentReady(context)

  return {
    edgesReconnectable: isEdgeReconnectActive || (isSelectMode && canManipulateCanvas && !shouldPanOnDrag),
    elementsSelectable: isSelectMode,
    nodesConnectable: isSelectMode && canManipulateCanvas && !shouldPanOnDrag,
    nodesDraggable: isNodeDragActive || (isSelectMode && canManipulateCanvas && !shouldPanOnDrag),
    panOnDrag: shouldPanOnDrag,
    selectionOnDrag: isSelectionBoxActive || (
      context.supportsMultiSelect &&
      isSelectMode &&
      canManipulateCanvas &&
      !shouldPanOnDrag &&
      context.pointerInteractionState.status === 'idle'
    )
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

function readInteractionMachineResolution(
  context: CanvasInputContext,
  event: Parameters<typeof readPointerInteractionTransition>[1]
): CanvasResolvedInput {
  const nextState = readPointerInteractionTransition({
    pointerInteractionState: context.pointerInteractionState,
    temporaryPanState: context.temporaryPanState,
    toolMode: context.toolMode
  }, event)

  return {
    kind: 'update-interaction-machine-state',
    pointerInteractionState: nextState.pointerInteractionState,
    temporaryPanState: nextState.temporaryPanState
  }
}
