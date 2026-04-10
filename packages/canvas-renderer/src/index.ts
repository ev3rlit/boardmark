export * from './builtins'
import { getBuiltInRendererContract } from './builtins'

import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  type BuiltInComponentKey,
  type BuiltInImageResolver,
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
  src?: string
  alt?: string
  title?: string
  locked?: boolean
  lockAspectRatio?: boolean
  style?: CanvasObjectStyle
  resolvedThemeRef?: string
  height?: number
  width?: number
  imageResolver?: BuiltInImageResolver
  autoHeight?: boolean
}

export type CanvasFlowEdgeData = {
  id: string
  body?: string
  locked?: boolean
  style?: CanvasObjectStyle
}

export function toFlowNode(
  node: CanvasNode,
  options?: {
    defaultStyle?: string
    imageResolver?: BuiltInImageResolver
  }
): Node<CanvasFlowNodeData> {
  const contract = readBuiltInContract(node.component)
  const width = node.at.w ?? contract?.defaultSize.width ?? DEFAULT_NOTE_WIDTH
  const hasExplicitHeight = node.at.h !== undefined
  const isNote = node.component === 'note'
  const autoHeight = !hasExplicitHeight && isNote
  const fallbackHeight = contract?.defaultSize.height ?? DEFAULT_NOTE_HEIGHT
  const height = hasExplicitHeight ? node.at.h! : fallbackHeight

  return {
    id: node.id,
    type: node.component === 'note' ? 'canvas-note' : 'canvas-component',
    position: {
      x: node.at.x,
      y: node.at.y
    },
    deletable: false,
    data: {
      id: node.id,
      component: node.component,
      body: node.body,
      src: node.src,
      alt: node.alt,
      title: node.title,
      locked: node.locked,
      lockAspectRatio: node.lockAspectRatio,
      style: node.style,
      resolvedThemeRef: node.style?.themeRef ?? options?.defaultStyle,
      autoHeight,
      height: autoHeight ? undefined : height,
      width,
      imageResolver: options?.imageResolver
    },
    draggable: node.locked ? false : undefined,
    width,
    height: autoHeight ? undefined : height,
    initialWidth: width,
    initialHeight: autoHeight ? undefined : height,
    zIndex: node.z,
    style: {
      width,
      height: autoHeight ? undefined : height
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
    deletable: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(96, 66, 214, 0.72)'
    },
    data: {
      id: edge.id,
      body: edge.body,
      locked: edge.locked,
      style: edge.style
    },
    zIndex: edge.z
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
    image: true,
    'boardmark.shape.rect': true,
    'boardmark.shape.roundRect': true,
    'boardmark.shape.ellipse': true,
    'boardmark.shape.circle': true,
    'boardmark.shape.triangle': true
  }
}
