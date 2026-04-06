import type { Edge, Node } from '@xyflow/react'
import {
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdgeData,
  type CanvasFlowNodeData
} from '@boardmark/canvas-renderer'
import type { CanvasEdge, CanvasNode } from '@boardmark/canvas-domain'
import type { CanvasStoreState } from '@canvas-app/store/canvas-store'

export type CanvasNodeGeometryDraft = {
  x: number
  y: number
  width: number
  height: number
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

    return {
      ...nextFlowNode,
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
        width: draft.width,
        height: draft.height
      },
      style: {
        ...flowNode.style,
        width: draft.width,
        height: draft.height
      },
      width: draft.width,
      height: draft.height
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
