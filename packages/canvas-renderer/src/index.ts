export * from './builtins'

import {
  DEFAULT_NOTE_WIDTH,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeColor,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import { MarkerType, type Edge, type Node, type Viewport } from '@xyflow/react'

export type CanvasFlowNodeData = {
  id: string
  content: string
  color?: CanvasNodeColor
}

export type CanvasFlowEdgeData = {
  id: string
  content?: string
}

export function toFlowNode(node: CanvasNode): Node<CanvasFlowNodeData> {
  return {
    id: node.id,
    type: 'canvas-note',
    position: {
      x: node.x,
      y: node.y
    },
    draggable: false,
    deletable: false,
    selectable: true,
    connectable: false,
    data: {
      id: node.id,
      content: node.content,
      color: node.color
    },
    style: {
      width: node.w ?? DEFAULT_NOTE_WIDTH
    }
  }
}

export function toFlowEdge(edge: CanvasEdge): Edge<CanvasFlowEdgeData> {
  return {
    id: edge.id,
    type: 'canvas-edge',
    source: edge.from,
    target: edge.to,
    animated: false,
    selectable: true,
    deletable: true,
    reconnectable: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(96, 66, 214, 0.72)'
    },
    data: {
      id: edge.id,
      content: edge.content
    }
  }
}

export function toFlowViewport(viewport: CanvasViewport): Viewport {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom
  }
}
