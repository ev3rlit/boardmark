import type { CanvasViewport } from '@boardmark/canvas-domain'
import type {
  CanvasAppCommandContext,
  CanvasAppCommandId
} from '@canvas-app/app/commands/canvas-app-commands'
import type {
  CanvasObjectCommandContext,
  CanvasObjectCommandId
} from '@canvas-app/app/commands/canvas-object-commands'
import type { CanvasSelectionSnapshot } from '@canvas-app/store/canvas-object-selection'
import type { CanvasEditingState, ToolMode } from '@canvas-app/store/canvas-store-types'

export type CanvasInputIntent =
  | {
      kind: 'app-command'
      commandId: CanvasAppCommandId
      eventType: 'keydown' | 'keyup'
      target: EventTarget | null
    }
  | {
      kind: 'object-command'
      commandId: CanvasObjectCommandId
      eventType: 'keydown'
      target: EventTarget | null
    }
  | {
      kind: 'viewport-zoom'
      source: 'gesture' | 'keyboard' | 'wheel'
      mode: 'continuous' | 'step'
      direction?: 'in' | 'out'
      deltaScale?: number
      anchorClientX?: number
      anchorClientY?: number
      target: EventTarget | null
    }
  | {
      kind: 'temporary-pan'
      state: 'end' | 'start'
      target: EventTarget | null
    }
  | {
      kind: 'pointer-node-move-commit'
      nodeId: string
      position: {
        x: number
        y: number
      }
    }
  | {
      kind: 'pointer-node-resize-commit'
      nodeId: string
      geometry: {
        x: number
        y: number
        width: number
        height: number
      }
    }
  | {
      kind: 'pointer-edge-reconnect-commit'
      edgeId: string
      from: string
      to: string
    }

export type CanvasMatchedInput = {
  allowEditableTarget: boolean
  intent: CanvasInputIntent
  preventDefault: boolean
}

export type CanvasInputContext = {
  activeToolMode: ToolMode
  appCommandContext: CanvasAppCommandContext
  editingState: CanvasEditingState
  isEditableTarget: boolean
  objectCommandContext: CanvasObjectCommandContext
  objectContextMenuOpen: boolean
  panShortcutActive: boolean
  selectionSnapshot: CanvasSelectionSnapshot
  supportsMultiSelect: boolean
  toolMode: ToolMode
  viewport: CanvasViewport
}

export type CanvasResolvedInput =
  | {
      kind: 'execute-app-command'
      commandId: CanvasAppCommandId
      preventDefault: boolean
    }
  | {
      kind: 'execute-object-command'
      commandId: CanvasObjectCommandId
      preventDefault: boolean
    }
  | {
      kind: 'apply-viewport-zoom'
      mode: 'continuous' | 'step'
      direction?: 'in' | 'out'
      deltaScale?: number
      anchorClientX?: number
      anchorClientY?: number
    }
  | {
      kind: 'set-pan-shortcut-active'
      active: boolean
      preventDefault: boolean
    }
  | {
      kind: 'commit-selection-nudge'
      dx: number
      dy: number
    }
  | {
      kind: 'commit-node-move'
      nodeId: string
      x: number
      y: number
    }
  | {
      kind: 'commit-node-resize'
      nodeId: string
      geometry: {
        x: number
        y: number
        width: number
        height: number
      }
    }
  | {
      kind: 'commit-edge-reconnect'
      edgeId: string
      from: string
      to: string
    }

export type CanvasPointerCapabilities = {
  edgesReconnectable: boolean
  elementsSelectable: boolean
  nodesConnectable: boolean
  nodesDraggable: boolean
  panOnDrag: boolean
  selectionOnDrag: boolean
}

export type CanvasInputDispatchContext = {
  appCommandContext: CanvasAppCommandContext
  commitNodeMove: (nodeId: string, x: number, y: number) => Promise<void>
  commitNodeResize: (
    nodeId: string,
    geometry: {
      x: number
      y: number
      width: number
      height: number
    }
  ) => Promise<void>
  nudgeSelection: (dx: number, dy: number) => Promise<void>
  objectCommandContext: CanvasObjectCommandContext
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  viewportBounds?: {
    left: number
    top: number
  }
}
