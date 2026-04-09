import {
  executeCanvasAppCommand
} from '@canvas-app/app/commands/canvas-app-commands'
import {
  executeCanvasObjectCommand
} from '@canvas-app/app/commands/canvas-object-commands'
import {
  applyEdgeSelectionChangeResult,
  applyNodeSelectionChangeResult
} from '@canvas-app/components/scene/flow/flow-selection-changes'
import { applyZoomStep } from '@canvas-app/store/canvas-store'
import type {
  CanvasInputDispatchContext,
  CanvasResolvedInput
} from '@canvas-app/input/canvas-input-types'

type CanvasViewportValue = {
  x: number
  y: number
  zoom: number
}

export function dispatchCanvasResolvedInput(
  input: CanvasResolvedInput,
  context: CanvasInputDispatchContext
) {
  switch (input.kind) {
    case 'execute-app-command':
      return executeCanvasAppCommand(input.commandId, context.appCommandContext)

    case 'execute-object-command':
      return executeCanvasObjectCommand(input.commandId, context.objectCommandContext)

    case 'update-interaction-machine-state':
      context.appCommandContext.setTemporaryPanState(input.temporaryPanState)
      context.setPointerInteractionState(input.pointerInteractionState)
      return true

    case 'apply-viewport-zoom': {
      const nextViewport = readViewportAfterCanvasZoom({
        anchorClientX: input.anchorClientX,
        anchorClientY: input.anchorClientY,
        deltaScale: input.deltaScale,
        direction: input.direction,
        mode: input.mode,
        viewport: context.appCommandContext.viewport,
        viewportBounds: context.viewportBounds
      })

      if (isSameViewportValue(context.appCommandContext.viewport, nextViewport)) {
        return false
      }

      context.appCommandContext.setViewport(nextViewport)
      return true
    }

    case 'commit-selection-nudge':
      return context.nudgeSelection(input.dx, input.dy)

    case 'commit-node-move':
      return context.commitNodeMove(input.nodeId, input.x, input.y)

    case 'commit-node-resize':
      return context.commitNodeResize(input.nodeId, input.geometry)

    case 'commit-edge-reconnect':
      return context.reconnectEdge(input.edgeId, input.from, input.to)

    case 'clear-selection':
      context.clearSelection()
      return true

    case 'select-node':
      context.selectNodeFromCanvas(input.nodeId, input.additive)
      return true

    case 'select-edge':
      context.selectEdgeFromCanvas(input.edgeId, input.additive)
      return true

    case 'open-pane-context-menu':
      context.openPaneContextMenu({
        x: input.x,
        y: input.y
      })
      return true

    case 'open-node-context-menu':
      if (!isNodeIncludedInCurrentSelection(
        context.appCommandContext.groups,
        context.appCommandContext.selectedGroupIds,
        context.appCommandContext.selectedNodeIds,
        input.nodeId
      )) {
        context.selectNodeFromCanvas(input.nodeId, input.additive)
      }

      context.openObjectContextMenu({
        x: input.x,
        y: input.y
      })
      return true

    case 'open-edge-context-menu':
      if (!context.appCommandContext.selectedEdgeIds.includes(input.edgeId)) {
        context.selectEdgeFromCanvas(input.edgeId, input.additive)
      }

      context.openObjectContextMenu({
        x: input.x,
        y: input.y
      })
      return true

    case 'apply-node-selection-change':
      applyNodeSelectionChangeResult({
        changes: input.changes,
        groups: context.appCommandContext.groups,
        replaceSelection: context.replaceSelection,
        selectedEdgeIds: context.appCommandContext.selectedEdgeIds,
        selectedNodeIds: context.appCommandContext.selectedNodeIds
      })
      return true

    case 'apply-edge-selection-change':
      applyEdgeSelectionChangeResult({
        changes: input.changes,
        replaceSelection: context.replaceSelection,
        selectedGroupIds: context.appCommandContext.selectedGroupIds,
        selectedNodeIds: context.appCommandContext.selectedNodeIds,
        selectedEdgeIds: context.appCommandContext.selectedEdgeIds
      })
      return true

  }
}

export function readViewportAfterCanvasZoom(input: {
  anchorClientX?: number
  anchorClientY?: number
  deltaScale?: number
  direction?: 'in' | 'out'
  mode: 'continuous' | 'step'
  viewport: CanvasViewportValue
  viewportBounds?: {
    left: number
    top: number
  }
}): CanvasViewportValue {
  const nextZoom = readNextZoom(input)

  if (nextZoom === input.viewport.zoom) {
    return input.viewport
  }

  if (
    input.anchorClientX === undefined ||
    input.anchorClientY === undefined ||
    input.viewportBounds === undefined
  ) {
    return {
      ...input.viewport,
      zoom: nextZoom
    }
  }

  const localX = input.anchorClientX - input.viewportBounds.left
  const localY = input.anchorClientY - input.viewportBounds.top
  const flowX = (localX - input.viewport.x) / input.viewport.zoom
  const flowY = (localY - input.viewport.y) / input.viewport.zoom

  return {
    x: Number((localX - flowX * nextZoom).toFixed(2)),
    y: Number((localY - flowY * nextZoom).toFixed(2)),
    zoom: nextZoom
  }
}

function isSameViewportValue(left: CanvasViewportValue, right: CanvasViewportValue) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom
}

function readNextZoom(input: {
  deltaScale?: number
  direction?: 'in' | 'out'
  mode: 'continuous' | 'step'
  viewport: CanvasViewportValue
}) {
  if (input.mode === 'continuous') {
    if (input.deltaScale === undefined || !Number.isFinite(input.deltaScale) || input.deltaScale <= 0) {
      return input.viewport.zoom
    }

    return Number((input.viewport.zoom * input.deltaScale).toFixed(4))
  }

  if (input.direction === undefined) {
    return input.viewport.zoom
  }

  return applyZoomStep(input.viewport, input.direction).zoom
}

function isNodeIncludedInCurrentSelection(
  groups: CanvasInputDispatchContext['appCommandContext']['groups'],
  selectedGroupIds: string[],
  selectedNodeIds: string[],
  nodeId: string
) {
  if (selectedNodeIds.includes(nodeId)) {
    return true
  }

  const containingGroup = groups.find((group) => group.members.nodeIds.includes(nodeId))

  return containingGroup ? selectedGroupIds.includes(containingGroup.id) : false
}
