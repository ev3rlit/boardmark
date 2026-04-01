export * from './builtins'
import { getBuiltInRendererContract } from './builtins'

import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  type BuiltInPalette,
  type BuiltInRendererKey,
  type BuiltInTone,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeColor,
  type CanvasShapeNode,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import { MarkerType, type Edge, type Node, type Viewport } from '@xyflow/react'

export type CanvasFlowNodeData = {
  id: string
  type: CanvasNode['type']
  content?: string
  color?: CanvasNodeColor
  height?: number
  label?: string
  palette?: BuiltInPalette
  rendererKey?: BuiltInRendererKey
  tone?: BuiltInTone
  width?: number
}

export type CanvasFlowEdgeData = {
  id: string
  content?: string
}

export function toFlowNode(node: CanvasNode): Node<CanvasFlowNodeData> {
  if (node.type === 'shape') {
    return toFlowShapeNode(node)
  }

  return {
    id: node.id,
    type: 'canvas-note',
    position: {
      x: node.x,
      y: node.y
    },
    draggable: true,
    deletable: false,
    selectable: true,
    connectable: true,
    data: {
      id: node.id,
      type: 'note',
      content: node.content,
      color: node.color,
      height: node.h,
      width: node.w
    },
    width: node.w ?? DEFAULT_NOTE_WIDTH,
    height: node.h ?? DEFAULT_NOTE_HEIGHT,
    initialWidth: node.w ?? DEFAULT_NOTE_WIDTH,
    initialHeight: node.h ?? DEFAULT_NOTE_HEIGHT,
    style: {
      width: node.w ?? DEFAULT_NOTE_WIDTH,
      height: node.h ?? DEFAULT_NOTE_HEIGHT
    }
  }
}

function toFlowShapeNode(node: CanvasShapeNode): Node<CanvasFlowNodeData> {
  const contract = getBuiltInRendererContract(node.rendererKey)

  return {
    id: node.id,
    type: 'canvas-shape',
    position: {
      x: node.x,
      y: node.y
    },
    draggable: true,
    deletable: false,
    selectable: true,
    connectable: false,
    data: {
      id: node.id,
      type: 'shape',
      height: node.h,
      label: node.label,
      palette: node.palette,
      rendererKey: node.rendererKey,
      tone: node.tone,
      width: node.w
    },
    style: {
      width: node.w ?? contract.defaultSize.width,
      height: node.h ?? contract.defaultSize.height
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
