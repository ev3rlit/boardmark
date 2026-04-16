import type { Edge, Node } from '@xyflow/react'
import {
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdgeData,
  type CanvasFlowNodeData
} from '@boardmark/canvas-renderer'
import type { CanvasEdge, CanvasNode, CanvasObjectStyle } from '@boardmark/canvas-domain'
import type { CanvasStoreState } from '@canvas-app/store/canvas-store'

export type CanvasNodeGeometryDraft = {
  x: number
  y: number
  width: number
  height: number
  preserveAutoHeight?: boolean
}

export function readFlowNodes(
  nodes: CanvasNode[],
  interactionOverrides: CanvasStoreState['interactionOverrides'] = {},
  selectedNodeIds: string[] = [],
  options?: {
    defaultStyle?: string
    imageResolver?: CanvasFlowNodeData['imageResolver']
  }
) {
  return [...nodes]
    .sort((left, right) => (left.z ?? 0) - (right.z ?? 0))
    .map((node) => {
      const override = interactionOverrides[node.id]
      const patchedNode = {
        ...node,
        at: {
          ...node.at,
          x: override?.x ?? node.at.x,
          y: override?.y ?? node.at.y,
          w: override?.w ?? node.at.w,
          h: override?.h ?? node.at.h
        }
      }

      return {
        ...toFlowNode(patchedNode, options),
        selected: selectedNodeIds.includes(node.id)
      }
    })
}

export function readFlowEdges(edges: CanvasEdge[], selectedEdgeIds: string[] = []) {
  return [...edges]
    .sort((left, right) => (left.z ?? 0) - (right.z ?? 0))
    .map((edge) => ({
      ...toFlowEdge(edge),
      selected: selectedEdgeIds.includes(edge.id)
    }))
}

export function mergeFlowNodes(
  nextFlowNodes: Node<CanvasFlowNodeData>[],
  currentFlowNodes: Node<CanvasFlowNodeData>[]
) {
  const currentFlowNodesById = new Map(currentFlowNodes.map((node) => [node.id, node]))

  return nextFlowNodes.map((nextFlowNode) => {
    const currentFlowNode = currentFlowNodesById.get(nextFlowNode.id)

    if (!currentFlowNode) {
      return nextFlowNode
    }

    const preserveMeasuredSize = hasSameFlowNodeGeometry(nextFlowNode, currentFlowNode)
    const data = mergeFlowNodeData(nextFlowNode.data, currentFlowNode.data)

    return {
      ...nextFlowNode,
      data,
      dragging: currentFlowNode.dragging,
      height: preserveMeasuredSize ? currentFlowNode.height : nextFlowNode.height,
      measured: currentFlowNode.measured,
      resizing: currentFlowNode.resizing,
      width: preserveMeasuredSize ? currentFlowNode.width : nextFlowNode.width
    }
  })
}

export function applyFlowNodeGeometryDrafts(
  flowNodes: Node<CanvasFlowNodeData>[],
  drafts: Record<string, CanvasNodeGeometryDraft>
) {
  if (Object.keys(drafts).length === 0) {
    return flowNodes
  }

  return flowNodes.map((flowNode) => {
    const draft = drafts[flowNode.id]

    if (!draft) {
      return flowNode
    }

    return {
      ...flowNode,
      position: {
        x: draft.x,
        y: draft.y
      },
      data: {
        ...flowNode.data,
        autoHeight: draft.preserveAutoHeight ? flowNode.data.autoHeight : false,
        width: draft.width,
        height: draft.preserveAutoHeight ? undefined : draft.height
      },
      style: {
        ...flowNode.style,
        width: draft.width,
        height: draft.preserveAutoHeight ? undefined : draft.height
      },
      width: draft.width,
      height: draft.preserveAutoHeight ? undefined : draft.height
    }
  })
}

function hasSameFlowNodeGeometry(
  left: Node<CanvasFlowNodeData>,
  right: Node<CanvasFlowNodeData>
) {
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.style?.width === right.style?.width &&
    left.style?.height === right.style?.height
  )
}

function mergeFlowNodeData(
  nextData: CanvasFlowNodeData,
  currentData: CanvasFlowNodeData
) {
  if (hasSameFlowNodeBusinessData(nextData, currentData)) {
    return currentData
  }

  if (hasSameCanvasObjectStyle(nextData.style, currentData.style)) {
    return {
      ...nextData,
      style: currentData.style
    }
  }

  return nextData
}

function hasSameFlowNodeBusinessData(
  left: CanvasFlowNodeData,
  right: CanvasFlowNodeData
) {
  return (
    left.body === right.body &&
    left.src === right.src &&
    left.alt === right.alt &&
    left.title === right.title &&
    left.locked === right.locked &&
    left.lockAspectRatio === right.lockAspectRatio &&
    left.resolvedThemeRef === right.resolvedThemeRef &&
    left.autoHeight === right.autoHeight &&
    left.height === right.height &&
    left.width === right.width &&
    left.imageResolver === right.imageResolver &&
    hasSameCanvasObjectStyle(left.style, right.style)
  )
}

function hasSameCanvasObjectStyle(
  left: CanvasObjectStyle | undefined,
  right: CanvasObjectStyle | undefined
) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return hasSameStyleColorSlot(left.bg, right.bg) &&
    hasSameStyleColorSlot(left.stroke, right.stroke)
}

function hasSameStyleColorSlot(
  left: CanvasObjectStyle['bg'] | CanvasObjectStyle['stroke'],
  right: CanvasObjectStyle['bg'] | CanvasObjectStyle['stroke']
) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.color === right.color
}
