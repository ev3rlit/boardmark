import { applyZoomStep } from '@canvas-app/store/canvas-store'
import type { CanvasEditingState } from '@canvas-app/store/canvas-store'
import type { CanvasViewport } from '@boardmark/canvas-domain'

export type CanvasAppCommandId =
  | 'activate-pan-shortcut'
  | 'deactivate-pan-shortcut'
  | 'delete-selection'
  | 'dismiss-object-context-menu'
  | 'redo'
  | 'undo'
  | 'zoom-in'
  | 'zoom-out'

export type CanvasAppCommandContext = {
  deleteSelection: () => Promise<void>
  editingState: CanvasEditingState
  objectContextMenuOpen: boolean
  redo: () => Promise<void>
  setObjectContextMenu: (value: null) => void
  setPanShortcutActive: (active: boolean) => void
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
      return context.editingState.status === 'idle'
    },
    execute(context) {
      context.setPanShortcutActive(true)
    }
  },
  'deactivate-pan-shortcut': {
    canExecute() {
      return true
    },
    execute(context) {
      context.setPanShortcutActive(false)
    }
  },
  'delete-selection': {
    canExecute(context) {
      return context.editingState.status === 'idle'
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
      return context.editingState.status === 'idle'
    },
    execute(context) {
      void context.redo()
    }
  },
  undo: {
    canExecute(context) {
      return context.editingState.status === 'idle'
    },
    execute(context) {
      void context.undo()
    }
  },
  'zoom-in': {
    canExecute(context) {
      return context.editingState.status === 'idle'
    },
    execute(context) {
      context.setViewport(applyZoomStep(context.viewport, 'in'))
    }
  },
  'zoom-out': {
    canExecute(context) {
      return context.editingState.status === 'idle'
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
