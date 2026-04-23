import type { Node, NodeChange } from '@xyflow/react'
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import type { CanvasFlowNodeData } from '@boardmark/canvas-renderer'
import type { CanvasNodeGeometryDraft } from '@canvas-app/components/scene/flow/flow-node-adapters'
import type {
  CanvasViewportSize
} from '@canvas-app/store/canvas-store-types'
import type {
  GuideAdjustment,
  GuideAxis,
  GuideAxisAdjustment,
  GuideAxisBehavior,
  GuideFrame,
  GuideSession
} from '@canvas-app/features/smart-guides/contracts'
import {
  applyGuideAdjustments,
  mergeGuideFrames,
  readFrameReference
} from '@canvas-app/features/smart-guides/geometry/guide-geometry'

export type DragGuidePreview = {
  commitPosition: {
    x: number
    y: number
  }
  nodePositions: Map<string, { x: number; y: number }>
  overlay: ReturnType<GuideSession['evaluate']>['overlay']
  snapState: DragGuideSnapState
}

export type ResizeGuidePreview = {
  geometry: CanvasNodeGeometryDraft
  overlay: ReturnType<GuideSession['evaluate']>['overlay']
}

export type DragGuideSnapState = {
  adjustment: GuideAdjustment
  overlay: ReturnType<GuideSession['evaluate']>['overlay']
}

const DRAG_SNAP_RELEASE_DISTANCE = 10

export function readDragGuidePreview(input: {
  draggedNodeId: string
  draggedNodeIds: string[]
  flowNodes: Node<CanvasFlowNodeData>[]
  guideSession: GuideSession
  previousSnapState?: DragGuideSnapState | null
  viewport: CanvasViewport
  viewportSize: CanvasViewportSize
}): DragGuidePreview | null {
  const frameMap = readGuideFrameMap(input.flowNodes)
  const draggedFrames = input.draggedNodeIds
    .map((nodeId) => frameMap.get(nodeId))
    .filter((frame): frame is GuideFrame => frame !== undefined)

  if (draggedFrames.length === 0) {
    return null
  }

  const activeFrame = draggedFrames.length === 1
    ? draggedFrames[0]
    : mergeGuideFrames('selection-bounds', draggedFrames)
  const candidateFrames = [...frameMap.values()].filter((frame) => !input.draggedNodeIds.includes(frame.id))
  const result = input.guideSession.evaluate({
    activeFrame,
    candidateFrames,
    interaction: 'drag',
    viewport: readGuideViewport(input.viewport, input.viewportSize),
    xBehavior: 'translate',
    yBehavior: 'translate'
  })
  const snapState = readDragGuideSnapState({
    activeFrame,
    nextAdjustment: result.adjustment,
    nextOverlay: result.overlay,
    previousSnapState: input.previousSnapState ?? null
  })

  if (!snapState) {
    return null
  }

  const adjustedFrame = applyGuideAdjustments({
    adjustment: snapState.adjustment,
    frame: activeFrame,
    xBehavior: 'translate',
    yBehavior: 'translate'
  }, {
    round: false
  })
  const dx = adjustedFrame.x - activeFrame.x
  const dy = adjustedFrame.y - activeFrame.y
  const nodePositions = new Map<string, { x: number; y: number }>(
    draggedFrames.map((frame) => [
      frame.id,
      {
        x: frame.x + dx,
        y: frame.y + dy
      }
    ])
  )
  const commitPosition = nodePositions.get(input.draggedNodeId)

  if (!commitPosition) {
    return null
  }

  return {
    commitPosition,
    nodePositions,
    overlay: snapState.overlay,
    snapState
  }
}

export function applyDraggedNodePositions(
  flowNodes: Node<CanvasFlowNodeData>[],
  nodePositions: Map<string, { x: number; y: number }>
) {
  if (nodePositions.size === 0) {
    return flowNodes
  }

  return flowNodes.map((flowNode) => {
    const nextPosition = nodePositions.get(flowNode.id)

    if (!nextPosition) {
      return flowNode
    }

    return {
      ...flowNode,
      position: nextPosition
    }
  })
}

export function readResizeGuidePreview(input: {
  baseFlowNodes: Node<CanvasFlowNodeData>[]
  flowNodes: Node<CanvasFlowNodeData>[]
  geometry: CanvasNodeGeometryDraft
  guideSession: GuideSession
  nodeId: string
  viewport: CanvasViewport
  viewportSize: CanvasViewportSize
}): ResizeGuidePreview | null {
  const baseFrame = readGuideFrameMap(input.baseFlowNodes).get(input.nodeId)

  if (!baseFrame) {
    return null
  }

  const activeFrame: GuideFrame = {
    id: input.nodeId,
    x: input.geometry.x,
    y: input.geometry.y,
    width: input.geometry.width,
    height: input.geometry.height
  }
  const candidateFrames = [...readGuideFrameMap(input.flowNodes).values()]
    .filter((frame) => frame.id !== input.nodeId)
  const result = input.guideSession.evaluate({
    activeFrame,
    candidateFrames,
    interaction: 'resize',
    viewport: readGuideViewport(input.viewport, input.viewportSize),
    xBehavior: readResizeAxisBehavior(baseFrame, activeFrame, 'x'),
    yBehavior: readResizeAxisBehavior(baseFrame, activeFrame, 'y')
  })

  return {
    geometry: {
      ...input.geometry,
      x: result.adjustedFrame.x,
      y: result.adjustedFrame.y,
      width: result.adjustedFrame.width,
      height: result.adjustedFrame.height
    },
    overlay: result.overlay
  }
}

export function readDraggedNodeIdsFromChanges(
  changes: NodeChange<Node<CanvasFlowNodeData>>[]
) {
  return changes
    .filter((change): change is typeof change & {
      dragging?: boolean
      id: string
      type: 'position'
    } => {
      return change.type === 'position' && 'id' in change
    })
    .filter((change) => change.dragging)
    .map((change) => change.id)
}

function readGuideFrameMap(flowNodes: Node<CanvasFlowNodeData>[]) {
  return new Map(flowNodes.map((node) => [node.id, readGuideFrameFromFlowNode(node)]))
}

function readGuideFrameFromFlowNode(node: Node<CanvasFlowNodeData>): GuideFrame {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: Math.max(1, node.measured?.width ?? node.width ?? node.data.width ?? DEFAULT_NOTE_WIDTH),
    height: Math.max(1, node.measured?.height ?? node.height ?? node.data.height ?? DEFAULT_NOTE_HEIGHT)
  }
}

function readGuideViewport(
  viewport: CanvasViewport,
  viewportSize: CanvasViewportSize
) {
  return {
    ...viewport,
    height: viewportSize.height,
    width: viewportSize.width
  }
}

function readResizeAxisBehavior(
  baseFrame: GuideFrame,
  activeFrame: GuideFrame,
  axis: GuideAxis
): GuideAxisBehavior {
  const baseMin = axis === 'x' ? baseFrame.x : baseFrame.y
  const baseMax = axis === 'x'
    ? baseFrame.x + baseFrame.width
    : baseFrame.y + baseFrame.height
  const activeMin = axis === 'x' ? activeFrame.x : activeFrame.y
  const activeMax = axis === 'x'
    ? activeFrame.x + activeFrame.width
    : activeFrame.y + activeFrame.height
  const movedMin = activeMin !== baseMin
  const movedMax = activeMax !== baseMax

  if (!movedMin && !movedMax) {
    return 'disabled'
  }

  if (movedMin && !movedMax) {
    return 'resize-from-min'
  }

  if (!movedMin && movedMax) {
    return 'resize-from-max'
  }

  return Math.abs(activeMin - baseMin) >= Math.abs(activeMax - baseMax)
    ? 'resize-from-min'
    : 'resize-from-max'
}

function readDragGuideSnapState(input: {
  activeFrame: GuideFrame
  nextAdjustment: GuideAdjustment | null
  nextOverlay: ReturnType<GuideSession['evaluate']>['overlay']
  previousSnapState: DragGuideSnapState | null
}): DragGuideSnapState | null {
  const adjustment: GuideAdjustment = {
    x: input.nextAdjustment?.x ?? readRetainedDragAxisAdjustment(
      input.activeFrame,
      input.previousSnapState?.adjustment.x
    ),
    y: input.nextAdjustment?.y ?? readRetainedDragAxisAdjustment(
      input.activeFrame,
      input.previousSnapState?.adjustment.y
    )
  }

  if (!adjustment.x && !adjustment.y) {
    return null
  }

  return {
    adjustment,
    overlay: {
      lines: readMergedDragOverlayLines({
        adjustment,
        nextAdjustment: input.nextAdjustment,
        nextOverlay: input.nextOverlay,
        previousOverlay: input.previousSnapState?.overlay
      })
    }
  }
}

function readRetainedDragAxisAdjustment(
  activeFrame: GuideFrame,
  adjustment: GuideAxisAdjustment | undefined
) {
  if (!adjustment) {
    return undefined
  }

  const currentReference = readFrameReference(activeFrame, adjustment.axis, adjustment.reference)

  return Math.abs(adjustment.target - currentReference) <= DRAG_SNAP_RELEASE_DISTANCE
    ? adjustment
    : undefined
}

function readMergedDragOverlayLines(input: {
  adjustment: GuideAdjustment
  nextAdjustment: GuideAdjustment | null
  nextOverlay: ReturnType<GuideSession['evaluate']>['overlay']
  previousOverlay: ReturnType<GuideSession['evaluate']>['overlay'] | undefined
}) {
  const lines = [
    ...readOverlayLinesForAxis(
      input.adjustment.x,
      input.nextAdjustment?.x,
      'x',
      input.nextOverlay.lines,
      input.previousOverlay?.lines ?? []
    ),
    ...readOverlayLinesForAxis(
      input.adjustment.y,
      input.nextAdjustment?.y,
      'y',
      input.nextOverlay.lines,
      input.previousOverlay?.lines ?? []
    ),
    ...input.nextOverlay.lines.filter((line) => line.role === 'spacing')
  ]

  return dedupeOverlayLines(lines)
}

function readOverlayLinesForAxis(
  adjustment: GuideAxisAdjustment | undefined,
  nextAdjustment: GuideAxisAdjustment | undefined,
  axis: GuideAxis,
  nextLines: ReturnType<GuideSession['evaluate']>['overlay']['lines'],
  previousLines: ReturnType<GuideSession['evaluate']>['overlay']['lines']
) {
  if (!adjustment) {
    return []
  }

  const sourceLines = nextAdjustment ? nextLines : previousLines

  return sourceLines.filter((line) => line.axis === axis)
}

function dedupeOverlayLines(lines: ReturnType<GuideSession['evaluate']>['overlay']['lines']) {
  const uniqueLines = new Map<string, typeof lines[number]>()

  for (const line of lines) {
    uniqueLines.set([
      line.axis,
      line.moduleId,
      line.role,
      line.x1,
      line.x2,
      line.y1,
      line.y2
    ].join(':'), line)
  }

  return [...uniqueLines.values()]
}
