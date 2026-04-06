import type {
  CanvasClipboardPayload
} from '@canvas-app/store/canvas-store-types'
import type { CanvasObjectArrangeMode } from '@canvas-app/canvas-object-types'

export type CanvasDocumentEditIntent =
  | { kind: 'replace-object-body'; objectId: string; markdown: string }
  | { kind: 'move-node'; nodeId: string; x: number; y: number }
  | { kind: 'move-nodes'; moves: Array<{ nodeId: string; x: number; y: number }> }
  | { kind: 'resize-node'; nodeId: string; x: number; y: number; width: number; height: number }
  | { kind: 'duplicate-objects'; nodeIds: string[]; edgeIds: string[]; offsetX: number; offsetY: number }
  | { kind: 'paste-objects'; payload: CanvasClipboardPayload; anchorX: number; anchorY: number; inPlace: boolean }
  | { kind: 'nudge-objects'; nodeIds: string[]; dx: number; dy: number }
  | { kind: 'arrange-objects'; groupIds?: string[]; nodeIds: string[]; edgeIds: string[]; mode: CanvasObjectArrangeMode }
  | { kind: 'set-objects-locked'; groupIds?: string[]; nodeIds: string[]; edgeIds: string[]; locked: boolean }
  | {
      kind: 'create-note'
      anchorNodeId?: string
      x: number
      y: number
      width: number
      height: number
      markdown: string
    }
  | {
      kind: 'create-shape'
      anchorNodeId?: string
      body: string
      component: string
      x: number
      y: number
      width: number
      height: number
    }
  | {
      kind: 'create-image'
      anchorNodeId?: string
      id: string
      src: string
      alt: string
      title?: string
      lockAspectRatio: boolean
      x: number
      y: number
      width: number
      height: number
    }
  | {
      kind: 'replace-image-source'
      nodeId: string
      src: string
      alt: string
      title?: string
    }
  | {
      kind: 'update-image-metadata'
      nodeId: string
      alt?: string
      title?: string
      lockAspectRatio?: boolean
    }
  | {
      kind: 'delete-objects'
      groupIds?: string[]
      nodeIds: string[]
      edgeIds: string[]
    }
  | { kind: 'upsert-group'; groupId: string; nodeIds: string[]; z: number; locked?: boolean }
  | { kind: 'delete-groups'; groupIds: string[] }
  | { kind: 'delete-node'; nodeId: string }
  | { kind: 'update-edge-endpoints'; edgeId: string; from: string; to: string }
  | { kind: 'replace-edge-body'; edgeId: string; markdown: string }
  | { kind: 'create-edge'; from: string; to: string; markdown: string }
  | { kind: 'delete-edge'; edgeId: string }

export type CanvasDocumentEditError = {
  kind:
    | 'object-not-found'
    | 'invalid-object'
    | 'invalid-patch'
    | 'invalid-intent'
  message: string
}

export function readCanvasDocumentEditLabel(intent: CanvasDocumentEditIntent) {
  switch (intent.kind) {
    case 'move-node':
    case 'move-nodes':
    case 'nudge-objects':
      return 'Move node'
    case 'arrange-objects':
      return 'Arrange selection'
    case 'resize-node':
      return 'Resize node'
    case 'replace-object-body':
      return 'Edit object'
    case 'replace-edge-body':
      return 'Edit connector'
    case 'create-note':
      return 'Create note'
    case 'create-shape':
      return 'Create shape'
    case 'create-image':
      return 'Insert image'
    case 'duplicate-objects':
      return 'Duplicate selection'
    case 'paste-objects':
      return 'Paste selection'
    case 'replace-image-source':
      return 'Replace image'
    case 'update-image-metadata':
      return 'Update image'
    case 'set-objects-locked':
      return intent.locked ? 'Lock selection' : 'Unlock selection'
    case 'delete-node':
    case 'delete-edge':
    case 'delete-objects':
    case 'delete-groups':
      return 'Delete selection'
    case 'upsert-group':
      return 'Group selection'
    case 'update-edge-endpoints':
      return 'Reconnect edge'
    case 'create-edge':
      return 'Create edge'
    default:
      return 'Edit canvas'
  }
}
