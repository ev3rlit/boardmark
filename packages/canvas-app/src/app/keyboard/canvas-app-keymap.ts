import type { CanvasAppCommandId } from '@canvas-app/app/commands/canvas-app-commands'
import {
  matchesDeleteSelectionKey,
  matchesEscapeKey,
  matchesRedoKey,
  matchesSpaceKey,
  matchesUndoKey,
  matchesZoomInKey,
  matchesZoomOutKey
} from '@canvas-app/keyboard/key-event-matchers'

export type CanvasAppKeyboardEventType = 'keydown' | 'keyup'

type CanvasAppKeyBinding = {
  allowEditableTarget: boolean
  commandId: CanvasAppCommandId
  eventType: CanvasAppKeyboardEventType
  matches: (event: KeyboardEvent) => boolean
  preventDefault: boolean
}

const CANVAS_APP_KEYMAP: CanvasAppKeyBinding[] = [
  {
    allowEditableTarget: false,
    commandId: 'activate-pan-shortcut',
    eventType: 'keydown',
    matches: matchesSpaceKey,
    preventDefault: true
  },
  {
    allowEditableTarget: true,
    commandId: 'deactivate-pan-shortcut',
    eventType: 'keyup',
    matches: matchesSpaceKey,
    preventDefault: false
  },
  {
    allowEditableTarget: false,
    commandId: 'undo',
    eventType: 'keydown',
    matches: matchesUndoKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'redo',
    eventType: 'keydown',
    matches: matchesRedoKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'delete-selection',
    eventType: 'keydown',
    matches: matchesDeleteSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'zoom-in',
    eventType: 'keydown',
    matches: matchesZoomInKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'zoom-out',
    eventType: 'keydown',
    matches: matchesZoomOutKey,
    preventDefault: true
  },
  {
    allowEditableTarget: true,
    commandId: 'dismiss-object-context-menu',
    eventType: 'keydown',
    matches: matchesEscapeKey,
    preventDefault: false
  }
]

const CANVAS_APP_SHORTCUT_LABELS: Partial<Record<CanvasAppCommandId, string>> = {
  'activate-pan-shortcut': 'Space',
  'delete-selection': 'Delete/Backspace',
  redo: 'Shift+Cmd/Ctrl+Z',
  undo: 'Cmd/Ctrl+Z',
  'zoom-in': 'Cmd/Ctrl+=',
  'zoom-out': 'Cmd/Ctrl+-'
}

export function readCanvasAppKeyBinding(
  eventType: CanvasAppKeyboardEventType,
  event: KeyboardEvent
) {
  return CANVAS_APP_KEYMAP.find((binding) => {
    return binding.eventType === eventType && binding.matches(event)
  }) ?? null
}

export function readCanvasAppShortcutLabel(commandId: CanvasAppCommandId) {
  return CANVAS_APP_SHORTCUT_LABELS[commandId] ?? null
}
