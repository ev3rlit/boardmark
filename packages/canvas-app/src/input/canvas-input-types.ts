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
import type {
  CanvasEditingState,
  CanvasPointerInteractionState,
  CanvasTemporaryPanState,
  ToolMode
} from '@canvas-app/store/canvas-store-types'

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
  | { kind: 'system-blur' }
  | { kind: 'system-editing'; state: 'end' | 'start' }
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
        preserveAutoHeight?: boolean
      }
    }
  | {
      kind: 'pointer-edge-reconnect-commit'
      edgeId: string
      from: string
      to: string
    }
  | {
      kind: 'pointer-pane-click'
    }
  | {
      kind: 'pointer-node-click'
      additive: boolean
      nodeId: string
    }
  | {
      kind: 'pointer-edge-click'
      additive: boolean
      edgeId: string
    }
  | {
      kind: 'pointer-pane-context-menu'
      x: number
      y: number
    }
  | {
      kind: 'pointer-node-context-menu'
      additive: boolean
      nodeId: string
      x: number
      y: number
    }
  | {
      kind: 'pointer-edge-context-menu'
      additive: boolean
      edgeId: string
      x: number
      y: number
    }
  | {
      kind: 'pointer-node-selection-change'
      changes: Array<{
        id: string
        selected: boolean
      }>
    }
  | {
      kind: 'pointer-edge-selection-change'
      changes: Array<{
        id: string
        selected: boolean
      }>
    }
  | { kind: 'pointer-selection-box-start' }
  | { kind: 'pointer-selection-box-drag-start' }
  | { kind: 'pointer-selection-box-end' }
  | { kind: 'pointer-node-drag-start' }
  | { kind: 'pointer-node-drag-end' }
  | { kind: 'pointer-edge-reconnect-start' }
  | { kind: 'pointer-edge-reconnect-end' }
  | { kind: 'pointer-pane-pan-start' }
  | { kind: 'pointer-pane-pan-end' }

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
  temporaryPanState: CanvasTemporaryPanState
  pointerInteractionState: CanvasPointerInteractionState
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
      kind: 'update-interaction-machine-state'
      pointerInteractionState: CanvasPointerInteractionState
      temporaryPanState: CanvasTemporaryPanState
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
        preserveAutoHeight?: boolean
      }
    }
  | {
      kind: 'commit-edge-reconnect'
      edgeId: string
      from: string
      to: string
    }
  | {
      kind: 'clear-selection'
    }
  | {
      kind: 'select-node'
      additive: boolean
      nodeId: string
    }
  | {
      kind: 'select-edge'
      additive: boolean
      edgeId: string
    }
  | {
      kind: 'open-pane-context-menu'
      x: number
      y: number
    }
  | {
      kind: 'open-node-context-menu'
      additive: boolean
      nodeId: string
      x: number
      y: number
    }
  | {
      kind: 'open-edge-context-menu'
      additive: boolean
      edgeId: string
      x: number
      y: number
    }
  | {
      kind: 'apply-node-selection-change'
      changes: Array<{
        id: string
        selected: boolean
      }>
    }
  | {
      kind: 'apply-edge-selection-change'
      changes: Array<{
        id: string
        selected: boolean
      }>
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
  clearSelection: () => void
  commitNodeMove: (nodeId: string, x: number, y: number) => Promise<void>
  commitNodeResize: (
    nodeId: string,
    geometry: {
      x: number
      y: number
      width: number
      height: number
      preserveAutoHeight?: boolean
    }
  ) => Promise<void>
  nudgeSelection: (dx: number, dy: number) => Promise<void>
  openObjectContextMenu: (input: {
    x: number
    y: number
  }) => void
  openPaneContextMenu: (input: {
    x: number
    y: number
  }) => void
  objectCommandContext: CanvasObjectCommandContext
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
  }) => void
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  selectEdgeFromCanvas: (edgeId: string, additive: boolean) => void
  selectNodeFromCanvas: (nodeId: string, additive: boolean) => void
  setPointerInteractionState: (state: CanvasPointerInteractionState) => void
  setTemporaryPanState: (state: CanvasTemporaryPanState) => void
  viewportBounds?: {
    left: number
    top: number
  }
}
