import type { CanvasAppCommandId } from '@canvas-app/app/commands/canvas-app-commands'
import { substituteShortcutModifier } from '@canvas-app/keyboard/shortcut-labels'
import {
  matchesDeleteSelectionKey,
  matchesEscapeKey,
  matchesRedoKey,
  matchesSpaceKey,
  matchesUndoKey,
  matchesZoomInKey,
  matchesZoomOutKey
} from '@canvas-app/keyboard/key-event-matchers'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'

export type CanvasAppKeyboardEventType = 'keydown' | 'keyup'

type CanvasAppKeyboardInput = {
  allowEditableTarget: boolean
  eventType: CanvasAppKeyboardEventType
  intent: (event: KeyboardEvent) => CanvasMatchedInput['intent']
  matches: (event: KeyboardEvent) => boolean
  preventDefault: boolean
}

const CANVAS_APP_KEYMAP: CanvasAppKeyboardInput[] = [
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'temporary-pan',
      state: 'start',
      target: event.target
    }),
    matches: matchesSpaceKey,
    preventDefault: true
  },
  {
    allowEditableTarget: true,
    eventType: 'keyup',
    intent: (event) => ({
      kind: 'temporary-pan',
      state: 'end',
      target: event.target
    }),
    matches: matchesSpaceKey,
    preventDefault: false
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'app-command',
      commandId: 'undo',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesUndoKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'app-command',
      commandId: 'redo',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesRedoKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'app-command',
      commandId: 'delete-selection',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesDeleteSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: true,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'viewport-zoom',
      source: 'keyboard',
      mode: 'step',
      direction: 'in',
      target: event.target
    }),
    matches: matchesZoomInKey,
    preventDefault: true
  },
  {
    allowEditableTarget: true,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'viewport-zoom',
      source: 'keyboard',
      mode: 'step',
      direction: 'out',
      target: event.target
    }),
    matches: matchesZoomOutKey,
    preventDefault: true
  },
  {
    allowEditableTarget: true,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'app-command',
      commandId: 'dismiss-object-context-menu',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesEscapeKey,
    preventDefault: false
  }
]

const CANVAS_APP_SHORTCUT_LABELS: Partial<Record<CanvasAppCommandId, string>> = {
  'activate-pan-shortcut': 'Space',
  'delete-selection': 'Delete/Backspace',
  redo: 'Shift+$mod+Z',
  undo: '$mod+Z',
  'zoom-in': '$mod+=',
  'zoom-out': '$mod+-'
}

export function readCanvasAppKeyboardInput(
  eventType: CanvasAppKeyboardEventType,
  event: KeyboardEvent
) {
  const binding = CANVAS_APP_KEYMAP.find((candidate) => {
    return candidate.eventType === eventType && candidate.matches(event)
  })

  if (!binding) {
    return null
  }

  return {
    allowEditableTarget: binding.allowEditableTarget,
    intent: binding.intent(event),
    preventDefault: binding.preventDefault
  }
}

export function readCanvasAppShortcutLabel(commandId: CanvasAppCommandId, platform?: string) {
  const template = CANVAS_APP_SHORTCUT_LABELS[commandId]

  if (!template) {
    return null
  }

  return substituteShortcutModifier(template, platform)
}
