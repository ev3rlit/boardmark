import type { CanvasObjectCommandId } from '@canvas-app/app/commands/canvas-object-commands'
import {
  matchesCopySelectionKey,
  matchesCutSelectionKey,
  matchesDuplicateSelectionKey,
  matchesNudgeDownKey,
  matchesNudgeLeftKey,
  matchesNudgeRightKey,
  matchesNudgeUpKey,
  matchesPasteInPlaceKey,
  matchesPasteSelectionKey,
  matchesSelectAllKey
} from '@canvas-app/keyboard/key-event-matchers'

export type CanvasObjectKeyboardEventType = 'keydown'

type CanvasObjectKeyBinding = {
  allowEditableTarget: boolean
  commandId: CanvasObjectCommandId
  eventType: CanvasObjectKeyboardEventType
  matches: (event: KeyboardEvent) => boolean
  preventDefault: boolean
}

const CANVAS_OBJECT_KEYMAP: CanvasObjectKeyBinding[] = [
  {
    allowEditableTarget: false,
    commandId: 'select-all',
    eventType: 'keydown',
    matches: matchesSelectAllKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'copy-selection',
    eventType: 'keydown',
    matches: matchesCopySelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'cut-selection',
    eventType: 'keydown',
    matches: matchesCutSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'paste-selection',
    eventType: 'keydown',
    matches: matchesPasteSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'paste-in-place',
    eventType: 'keydown',
    matches: matchesPasteInPlaceKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'duplicate-selection',
    eventType: 'keydown',
    matches: matchesDuplicateSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-left-large',
    eventType: 'keydown',
    matches: (event) => event.shiftKey && matchesNudgeLeftKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-right-large',
    eventType: 'keydown',
    matches: (event) => event.shiftKey && matchesNudgeRightKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-up-large',
    eventType: 'keydown',
    matches: (event) => event.shiftKey && matchesNudgeUpKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-down-large',
    eventType: 'keydown',
    matches: (event) => event.shiftKey && matchesNudgeDownKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-left',
    eventType: 'keydown',
    matches: (event) => !event.shiftKey && matchesNudgeLeftKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-right',
    eventType: 'keydown',
    matches: (event) => !event.shiftKey && matchesNudgeRightKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-up',
    eventType: 'keydown',
    matches: (event) => !event.shiftKey && matchesNudgeUpKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    commandId: 'nudge-down',
    eventType: 'keydown',
    matches: (event) => !event.shiftKey && matchesNudgeDownKey(event),
    preventDefault: true
  }
]

export function readCanvasObjectKeyBinding(
  eventType: CanvasObjectKeyboardEventType,
  event: KeyboardEvent
) {
  return CANVAS_OBJECT_KEYMAP.find((binding) => {
    return binding.eventType === eventType && binding.matches(event)
  }) ?? null
}
