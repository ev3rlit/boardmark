import { applyZoomStep } from '@canvas-app/store/canvas-store'
import type { CanvasEditingState } from '@canvas-app/store/canvas-store'
import type {
  CanvasPointerInteractionState,
  CanvasTemporaryPanState
} from '@canvas-app/store/canvas-store-types'
import type { CanvasViewport } from '@boardmark/canvas-domain'
import { canCanvasMutateSelection } from '@canvas-app/store/canvas-editing-session'
import {
  hasDeletableSelection,
  type CanvasSelectionSnapshot
} from '@canvas-app/store/canvas-object-selection'

export type CanvasAppCommandId =
  | 'activate-pan-shortcut'
  | 'deactivate-pan-shortcut'
  | 'delete-selection'
  | 'dismiss-object-context-menu'
  | 'redo'
  | 'undo'
  | 'zoom-in'
  | 'zoom-out'

export type CanvasAppCommandContext = CanvasSelectionSnapshot & {
  deleteSelection: () => Promise<void>
  editingState: CanvasEditingState
  objectContextMenuOpen: boolean
  pointerInteractionState: CanvasPointerInteractionState
  temporaryPanState: CanvasTemporaryPanState
  redo: () => Promise<void>
  setObjectContextMenu: (value: null) => void
  setTemporaryPanState: (state: CanvasTemporaryPanState) => void
  setViewport: (viewport: CanvasViewport) => void
  undo: () => Promise<void>
  viewport: CanvasViewport
}

type CanvasAppCommand = {
  canExecute: (context: CanvasAppCommandContext) => boolean
  execute: (context: CanvasAppCommandContext) => void
}

const CANVAS_APP_COMMANDS: Record<CanvasAppCommandId, CanvasAppCommand> = {
  'activate-pan-shortcut': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState)
    },
    execute(context) {
      context.setTemporaryPanState('active')
    }
  },
  'deactivate-pan-shortcut': {
    canExecute() {
      return true
    },
    execute(context) {
      context.setTemporaryPanState('inactive')
    }
  },
  'delete-selection': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState) && hasDeletableSelection(context)
    },
    execute(context) {
      void context.deleteSelection()
    }
  },
  'dismiss-object-context-menu': {
    canExecute(context) {
      return context.objectContextMenuOpen
    },
    execute(context) {
      context.setObjectContextMenu(null)
    }
  },
  redo: {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState)
    },
    execute(context) {
      void context.redo()
    }
  },
  undo: {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState)
    },
    execute(context) {
      void context.undo()
    }
  },
  'zoom-in': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState)
    },
    execute(context) {
      context.setViewport(applyZoomStep(context.viewport, 'in'))
    }
  },
  'zoom-out': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState)
    },
    execute(context) {
      context.setViewport(applyZoomStep(context.viewport, 'out'))
    }
  }
}

export function canExecuteCanvasAppCommand(
  commandId: CanvasAppCommandId,
  context: CanvasAppCommandContext
) {
  return CANVAS_APP_COMMANDS[commandId].canExecute(context)
}

export function executeCanvasAppCommand(
  commandId: CanvasAppCommandId,
  context: CanvasAppCommandContext
) {
  if (!canExecuteCanvasAppCommand(commandId, context)) {
    return false
  }

  CANVAS_APP_COMMANDS[commandId].execute(context)
  return true
}
