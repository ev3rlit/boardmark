export * from './built-in-components'
import type {
  BuiltInPalette,
  BuiltInRendererKey,
  BuiltInTone
} from './built-in-components'

export type CanvasViewport = {
  x: number
  y: number
  zoom: number
}

export type CanvasFrontmatter = {
  type: 'canvas'
  version: number
  style?: string
  components?: string
  preset?: string
  viewport?: CanvasViewport
}

export type CanvasNodeColor =
  | 'yellow'
  | 'blue'
  | 'pink'
  | 'green'
  | 'purple'
  | 'default'

export type CanvasSourcePoint = {
  offset: number
  line: number
}

export type CanvasSourceRange = {
  start: CanvasSourcePoint
  end: CanvasSourcePoint
}

export type CanvasDirectiveSourceMap = {
  objectRange: CanvasSourceRange
  openingLineRange: CanvasSourceRange
  bodyRange: CanvasSourceRange
  closingLineRange: CanvasSourceRange
  attributeRanges?: Partial<Record<string, CanvasSourceRange>>
}

export type CanvasNoteNode = {
  id: string
  type: 'note'
  x: number
  y: number
  w?: number
  color?: CanvasNodeColor
  content: string
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

export type CanvasShapeNode = {
  id: string
  type: 'shape'
  x: number
  y: number
  w: number
  h: number
  rendererKey: Extract<BuiltInRendererKey, `boardmark.shape.${string}`>
  label?: string
  palette?: BuiltInPalette
  tone?: BuiltInTone
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

export type CanvasNode = CanvasNoteNode | CanvasShapeNode

export type CanvasEdgeKind = 'curve' | 'straight'

export type CanvasEdge = {
  id: string
  from: string
  to: string
  kind?: CanvasEdgeKind
  content?: string
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

export type CanvasAST = {
  frontmatter: CanvasFrontmatter
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export type CanvasParseIssueKind =
  | 'invalid-node'
  | 'invalid-edge'
  | 'unsupported-node-type'
  | 'invalid-frontmatter'

export type CanvasParseIssue = {
  level: 'warning' | 'error'
  kind: CanvasParseIssueKind
  message: string
  line?: number
  objectId?: string
}

export type CanvasParseError = {
  kind: 'invalid-frontmatter' | 'invalid-document'
  message: string
}

export type CanvasLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

export type CanvasSaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; path: string }
  | { status: 'error'; message: string }

export type CanvasEntryState = {
  showActions: boolean
}

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  zoom: 1
}

export const DEFAULT_NOTE_WIDTH = 320
export const DEFAULT_NOTE_HEIGHT = 220
export const MIN_CANVAS_ZOOM = 0.5
export const MAX_CANVAS_ZOOM = 1.8
export const ZOOM_STEP = 0.1

export const CANVAS_NODE_COLORS: CanvasNodeColor[] = [
  'yellow',
  'blue',
  'pink',
  'green',
  'purple',
  'default'
]

export const CANVAS_EDGE_KINDS: CanvasEdgeKind[] = ['curve', 'straight']
