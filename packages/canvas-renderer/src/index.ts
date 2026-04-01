export * from './builtins'
import { getBuiltInRendererContract } from './builtins'

import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  type BuiltInComponentKey,
  type CanvasEdge,
  type CanvasNode,
  type CanvasObjectStyle,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import { MarkerType, type Edge, type Node, type Viewport } from '@xyflow/react'

export type CanvasFlowNodeData = {
  id: string
  component: string
  body?: string
  style?: CanvasObjectStyle
  resolvedThemeRef?: string
  height?: number
  width?: number
}

export type CanvasFlowEdgeData = {
  id: string
  body?: string
  style?: CanvasObjectStyle
}

export function toFlowNode(node: CanvasNode, defaultStyle?: string): Node<CanvasFlowNodeData> {
  const contract = readBuiltInContract(node.component)
  const width = node.at.w ?? contract?.defaultSize.width ?? DEFAULT_NOTE_WIDTH
  const height = node.at.h ?? contract?.defaultSize.height ?? DEFAULT_NOTE_HEIGHT

  return {
    id: node.id,
    type: node.component === 'note' ? 'canvas-note' : 'canvas-component',
    position: {
      x: node.at.x,
      y: node.at.y
    },
    draggable: true,
    deletable: false,
    selectable: true,
    connectable: true,
    data: {
      id: node.id,
      component: node.component,
      body: node.body,
      style: node.style,
      resolvedThemeRef: node.style?.themeRef ?? defaultStyle,
      height,
      width
    },
    width,
    height,
    initialWidth: width,
    initialHeight: height,
    style: {
      width,
      height
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
      body: edge.body,
      style: edge.style
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

function readBuiltInContract(component: string) {
  if (!isBuiltInComponentKey(component)) {
    return undefined
  }

  return getBuiltInRendererContract(component)
}

function isBuiltInComponentKey(component: string): component is BuiltInComponentKey {
  return component in {
    note: true,
    'boardmark.shape.rect': true,
    'boardmark.shape.roundRect': true,
    'boardmark.shape.ellipse': true,
    'boardmark.shape.circle': true,
    'boardmark.shape.triangle': true
  }
}
