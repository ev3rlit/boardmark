import type { CanvasObjectAt, CanvasObjectStyle, CanvasGroupMembership } from '@boardmark/canvas-domain'
export type CanvasObjectArrangeMode =
  | 'bring-forward'
  | 'send-backward'
  | 'bring-to-front'
  | 'send-to-back'

export type CanvasClipboardPayload = {
  edges: CanvasClipboardEdge[]
  groups: CanvasClipboardGroup[]
  nodes: CanvasClipboardNode[]
  origin: { x: number; y: number } | null
}

export type CanvasClipboardNode = {
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
}

export type CanvasClipboardEdge = {
  id: string
  from: string
  to: string
  z?: number
  locked?: boolean
  style?: CanvasObjectStyle
  body?: string
}

export type CanvasClipboardGroup = {
  id: string
  z?: number
  locked?: boolean
  body?: string
  members: CanvasGroupMembership
}
