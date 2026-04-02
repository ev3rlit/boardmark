export * from './built-in-components'

export type CanvasViewport = {
  x: number
  y: number
  zoom: number
}

export type CanvasAssetPolicy = 'document-adjacent'

export type CanvasFrontmatter = {
  type: 'canvas'
  version: number
  style?: string[]
  components?: string[]
  preset?: string
  defaultStyle?: string
  assetPolicy?: CanvasAssetPolicy
  viewport?: CanvasViewport
}

export type CanvasSourcePoint = {
  offset: number
  line: number
}

export type CanvasSourceRange = {
  start: CanvasSourcePoint
  end: CanvasSourcePoint
}

export type CanvasObjectAt = {
  x: number
  y: number
  w?: number
  h?: number
}

export type CanvasObjectStyle = {
  themeRef?: string
  overrides?: Record<string, string>
}

export type CanvasDirectiveSourceMap = {
  objectRange: CanvasSourceRange
  headerLineRange: CanvasSourceRange
  metadataRange?: CanvasSourceRange
  bodyRange: CanvasSourceRange
  closingLineRange: CanvasSourceRange
}

export type CanvasNode = {
  id: string
  component: string
  at: CanvasObjectAt
  style?: CanvasObjectStyle
  body?: string
  src?: string
  alt?: string
  title?: string
  lockAspectRatio?: boolean
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

export type CanvasEdge = {
  id: string
  from: string
  to: string
  style?: CanvasObjectStyle
  body?: string
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
