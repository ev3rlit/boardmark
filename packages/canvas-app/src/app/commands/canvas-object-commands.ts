import type {
  CanvasClipboardState,
  CanvasEditingState
} from '@canvas-app/store/canvas-store-types'

export type CanvasObjectCommandId =
  | 'copy-selection'
  | 'cut-selection'
  | 'duplicate-selection'
  | 'group-selection'
  | 'nudge-down'
  | 'nudge-down-large'
  | 'nudge-left'
  | 'nudge-left-large'
  | 'nudge-right'
  | 'nudge-right-large'
  | 'nudge-up'
  | 'nudge-up-large'
  | 'paste-in-place'
  | 'paste-selection'
  | 'select-all'
  | 'ungroup-selection'

export type CanvasObjectCommandContext = {
  clipboardState: CanvasClipboardState
  copySelection: () => Promise<void>
  cutSelection: () => Promise<void>
  duplicateSelection: () => Promise<void>
  editingState: CanvasEditingState
  groupSelection: () => Promise<void>
  groupSelectionState: { status: 'idle' | 'group-selected' | 'drilldown'; groupId?: string; nodeId?: string }
  nudgeSelection: (dx: number, dy: number) => Promise<void>
  pasteClipboard: () => Promise<void>
  pasteClipboardInPlace: () => Promise<void>
  selectAllObjects: () => void
  selectedEdgeIds: string[]
  selectedGroupIds: string[]
  selectedNodeIds: string[]
  ungroupSelection: () => Promise<void>
}

type CanvasObjectCommand = {
  canExecute: (context: CanvasObjectCommandContext) => boolean
  execute: (context: CanvasObjectCommandContext) => void
}

const CANVAS_OBJECT_COMMANDS: Record<CanvasObjectCommandId, CanvasObjectCommand> = {
  'select-all': {
    canExecute(context) {
      return context.editingState.status === 'idle'
    },
    execute(context) {
      context.selectAllObjects()
    }
  },
  'copy-selection': {
    canExecute(context) {
      return context.editingState.status === 'idle' && hasAnySelection(context)
    },
    execute(context) {
      void context.copySelection()
    }
  },
  'cut-selection': {
    canExecute(context) {
      return context.editingState.status === 'idle' && hasAnySelection(context)
    },
    execute(context) {
      void context.cutSelection()
    }
  },
  'paste-selection': {
    canExecute(context) {
      return context.editingState.status === 'idle' && context.clipboardState.status === 'ready'
    },
    execute(context) {
      void context.pasteClipboard()
    }
  },
  'paste-in-place': {
    canExecute(context) {
      return context.editingState.status === 'idle' && context.clipboardState.status === 'ready'
    },
    execute(context) {
      void context.pasteClipboardInPlace()
    }
  },
  'duplicate-selection': {
    canExecute(context) {
      return context.editingState.status === 'idle' && hasAnySelection(context)
    },
    execute(context) {
      void context.duplicateSelection()
    }
  },
  'group-selection': {
    canExecute(context) {
      return (
        context.editingState.status === 'idle' &&
        context.selectedGroupIds.length === 0 &&
        context.selectedEdgeIds.length === 0 &&
        context.selectedNodeIds.length >= 2
      )
    },
    execute(context) {
      void context.groupSelection()
    }
  },
  'ungroup-selection': {
    canExecute(context) {
      return (
        context.editingState.status === 'idle' &&
        context.selectedGroupIds.length > 0 &&
        context.groupSelectionState.status !== 'drilldown'
      )
    },
    execute(context) {
      void context.ungroupSelection()
    }
  },
  'nudge-left': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(-1, 0)
    }
  },
  'nudge-right': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(1, 0)
    }
  },
  'nudge-up': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(0, -1)
    }
  },
  'nudge-down': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(0, 1)
    }
  },
  'nudge-left-large': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(-10, 0)
    }
  },
  'nudge-right-large': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(10, 0)
    }
  },
  'nudge-up-large': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(0, -10)
    }
  },
  'nudge-down-large': {
    canExecute: canNudgeSelection,
    execute(context) {
      void context.nudgeSelection(0, 10)
    }
  }
}

export function canExecuteCanvasObjectCommand(
  commandId: CanvasObjectCommandId,
  context: CanvasObjectCommandContext
) {
  return CANVAS_OBJECT_COMMANDS[commandId].canExecute(context)
}

export function executeCanvasObjectCommand(
  commandId: CanvasObjectCommandId,
  context: CanvasObjectCommandContext
) {
  if (!canExecuteCanvasObjectCommand(commandId, context)) {
    return false
  }

  CANVAS_OBJECT_COMMANDS[commandId].execute(context)
  return true
}

function canNudgeSelection(context: CanvasObjectCommandContext) {
  return context.editingState.status === 'idle' && context.selectedNodeIds.length > 0
}

function hasAnySelection(context: CanvasObjectCommandContext) {
  return context.selectedGroupIds.length + context.selectedNodeIds.length + context.selectedEdgeIds.length > 0
}
