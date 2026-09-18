// Generated from schemas/boardmark.schema.json. Run pnpm generate:board-types; do not edit.

export type Item = MarkdownItem | ImageItem | ShapeItem
export type Id = string

export interface BoardFile {
  format: 'boardmark'
  version: 1
  items: Item[]
  connections: Connection[]
  groups?: Group[]
}
export interface MarkdownItem {
  id: Id
  kind: 'markdown'
  frame: Frame
  /**
   * Markdown owned by this board.
   */
  content: string
  z?: number
  locked?: boolean
  style?: Style
  autoHeight?: boolean
}
export interface Frame {
  x: number
  y: number
  width: number
  height: number
}
export interface Style {
  bg?: Color
  stroke?: Color
}
export interface Color {
  color: string
}
export interface ImageItem {
  id: Id
  kind: 'image'
  frame: Frame
  reference: {
    kind: 'file'
    /**
     * Relative to the board directory. Both slash styles are accepted; writers use /. No image bytes.
     */
    path: string
  }
  z?: number
  locked?: boolean
  style?: Style
  alt?: string
  title?: string
  lockAspectRatio?: boolean
}
export interface ShapeItem {
  id: Id
  kind: 'shape'
  frame: Frame
  component:
    | 'boardmark.shape.rect'
    | 'boardmark.shape.roundRect'
    | 'boardmark.shape.ellipse'
    | 'boardmark.shape.circle'
    | 'boardmark.shape.triangle'
  content: string
  z?: number
  locked?: boolean
  style?: Style
}
export interface Connection {
  id: Id
  source: Id
  target: Id
  content?: string
  z?: number
  locked?: boolean
  style?: Style
}
export interface Group {
  id: Id
  items: Id[]
  z?: number
  locked?: boolean
}
