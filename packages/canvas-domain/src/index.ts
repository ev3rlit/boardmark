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

export type CanvasObjectBgStyle = {
  color?: string
}

export type CanvasObjectStrokeStyle = {
  color?: string
}

export type CanvasObjectStyle = {
  bg?: CanvasObjectBgStyle
  stroke?: CanvasObjectStrokeStyle
}

export type CanvasObjectColorDefaults = {
  bg: string
  stroke?: string
}

export type CanvasDirectiveSourceMap = {
  objectRange: CanvasSourceRange
  headerLineRange: CanvasSourceRange
  metadataRange?: CanvasSourceRange
  bodyRange: CanvasSourceRange
  closingLineRange: CanvasSourceRange
}

export type CanvasGroupMembership = {
  nodeIds: string[]
}

export type CanvasNode = {
  id: string
  component: string
  at: CanvasObjectAt
  z?: number
  locked?: boolean
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
  z?: number
  locked?: boolean
  style?: CanvasObjectStyle
  body?: string
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

export type CanvasGroup = {
  id: string
  z?: number
  locked?: boolean
  body?: string
  members: CanvasGroupMembership
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

export type CanvasAST = {
  frontmatter: CanvasFrontmatter
  groups: CanvasGroup[]
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
export const MIN_CANVAS_ZOOM = 0.01
export const MAX_CANVAS_ZOOM = 1.8
export const ZOOM_STEP = 0.1

export const CANVAS_NO_FILL_COLOR = '#00000000'
export const DEFAULT_NOTE_BG_COLOR = '#FFF5BF'
export const DEFAULT_OBJECT_BG_COLOR = '#FFFFFF'
export const DEFAULT_OBJECT_STROKE_COLOR = '#6042D6'

export function normalizeCanvasColorHex(value: string) {
  const normalized = value.trim().toUpperCase()

  if (!/^#(?:[0-9A-F]{6}|[0-9A-F]{8})$/.test(normalized)) {
    return null
  }

  return normalized
}

export function isCanvasNodeColorableComponent(component: string) {
  return component !== 'image'
}

export function readCanvasObjectColorDefaults(component: string): CanvasObjectColorDefaults | null {
  if (!isCanvasNodeColorableComponent(component)) {
    return null
  }

  if (component === 'note') {
    return {
      bg: DEFAULT_NOTE_BG_COLOR
    }
  }

  return {
    bg: DEFAULT_OBJECT_BG_COLOR,
    stroke: DEFAULT_OBJECT_STROKE_COLOR
  }
}

export function resolveCanvasObjectBackgroundColor(
  component: string,
  style: CanvasObjectStyle | undefined
) {
  return style?.bg?.color ?? readCanvasObjectColorDefaults(component)?.bg
}

export function resolveCanvasObjectStrokeColor(
  component: string,
  style: CanvasObjectStyle | undefined
) {
  if (style?.stroke?.color) {
    return style.stroke.color
  }

  return readCanvasObjectColorDefaults(component)?.stroke
}
