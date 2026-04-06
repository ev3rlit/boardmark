import type {
  CanvasClipboardState,
  CanvasEditingState
} from '@canvas-app/store/canvas-store-types'
import type { CanvasObjectArrangeMode } from '@canvas-app/canvas-object-types'
import { canCanvasMutateSelection } from '@canvas-app/store/canvas-editing-session'
import {
  hasAnySelection,
  hasArrangeableSelection,
  hasDuplicableSelection,
  hasGroupableSelection,
  hasLockableSelection,
  hasNudgeableSelection,
  hasUngroupableSelection,
  hasUnlockableSelection,
  type CanvasSelectionSnapshot
} from '@canvas-app/store/canvas-object-selection'

export type CanvasObjectCommandId =
  | 'bring-forward'
  | 'bring-to-front'
  | 'copy-selection'
  | 'cut-selection'
  | 'duplicate-selection'
  | 'group-selection'
  | 'lock-selection'
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
  | 'send-backward'
  | 'send-to-back'
  | 'select-all'
  | 'unlock-selection'
  | 'ungroup-selection'

export type CanvasObjectCommandContext = CanvasSelectionSnapshot & {
  clipboardState: CanvasClipboardState
  copySelection: () => Promise<void>
  cutSelection: () => Promise<void>
  duplicateSelection: () => Promise<void>
  editingState: CanvasEditingState
  groupSelection: () => Promise<void>
  nudgeSelection: (dx: number, dy: number) => Promise<void>
  pasteClipboard: () => Promise<void>
  pasteClipboardInPlace: () => Promise<void>
  arrangeSelection: (mode: CanvasObjectArrangeMode) => Promise<void>
  selectAllObjects: () => void
  setSelectionLocked: (locked: boolean) => Promise<void>
  ungroupSelection: () => Promise<void>
}

type CanvasObjectCommand = {
  canExecute: (context: CanvasObjectCommandContext) => boolean
  execute: (context: CanvasObjectCommandContext) => void
}

const CANVAS_OBJECT_COMMANDS: Record<CanvasObjectCommandId, CanvasObjectCommand> = {
  'bring-forward': {
    canExecute(context) {
      return canMutateSelection(context) && hasArrangeableSelection(context)
    },
    execute(context) {
      void context.arrangeSelection('bring-forward')
    }
  },
  'bring-to-front': {
    canExecute(context) {
      return canMutateSelection(context) && hasArrangeableSelection(context)
    },
    execute(context) {
      void context.arrangeSelection('bring-to-front')
    }
  },
  'select-all': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState)
    },
    execute(context) {
      context.selectAllObjects()
    }
  },
  'copy-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasAnySelection(context)
    },
    execute(context) {
      void context.copySelection()
    }
  },
  'cut-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasDuplicableSelection(context)
    },
    execute(context) {
      void context.cutSelection()
    }
  },
  'paste-selection': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState) && context.clipboardState.status === 'ready'
    },
    execute(context) {
      void context.pasteClipboard()
    }
  },
  'paste-in-place': {
    canExecute(context) {
      return canCanvasMutateSelection(context.editingState) && context.clipboardState.status === 'ready'
    },
    execute(context) {
      void context.pasteClipboardInPlace()
    }
  },
  'duplicate-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasDuplicableSelection(context)
    },
    execute(context) {
      void context.duplicateSelection()
    }
  },
  'group-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasGroupableSelection(context)
    },
    execute(context) {
      void context.groupSelection()
    }
  },
  'ungroup-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasUngroupableSelection(context)
    },
    execute(context) {
      void context.ungroupSelection()
    }
  },
  'lock-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasLockableSelection(context)
    },
    execute(context) {
      void context.setSelectionLocked(true)
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
  },
  'send-backward': {
    canExecute(context) {
      return canMutateSelection(context) && hasArrangeableSelection(context)
    },
    execute(context) {
      void context.arrangeSelection('send-backward')
    }
  },
  'send-to-back': {
    canExecute(context) {
      return canMutateSelection(context) && hasArrangeableSelection(context)
    },
    execute(context) {
      void context.arrangeSelection('send-to-back')
    }
  },
  'unlock-selection': {
    canExecute(context) {
      return canMutateSelection(context) && hasUnlockableSelection(context)
    },
    execute(context) {
      void context.setSelectionLocked(false)
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
  return canMutateSelection(context) && hasNudgeableSelection(context)
}

function canMutateSelection(context: CanvasObjectCommandContext) {
  return canCanvasMutateSelection(context.editingState)
}
