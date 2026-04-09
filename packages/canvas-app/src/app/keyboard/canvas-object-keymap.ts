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
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'

export type CanvasObjectKeyboardEventType = 'keydown'

type CanvasObjectKeyBinding = {
  allowEditableTarget: boolean
  eventType: CanvasObjectKeyboardEventType
  intent: (event: KeyboardEvent) => CanvasMatchedInput['intent']
  matches: (event: KeyboardEvent) => boolean
  preventDefault: boolean
}

const CANVAS_OBJECT_KEYMAP: CanvasObjectKeyBinding[] = [
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'select-all',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesSelectAllKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'copy-selection',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesCopySelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'cut-selection',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesCutSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'paste-selection',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesPasteSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'paste-in-place',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesPasteInPlaceKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'duplicate-selection',
      eventType: 'keydown',
      target: event.target
    }),
    matches: matchesDuplicateSelectionKey,
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-left-large',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => event.shiftKey && matchesNudgeLeftKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-right-large',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => event.shiftKey && matchesNudgeRightKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-up-large',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => event.shiftKey && matchesNudgeUpKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-down-large',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => event.shiftKey && matchesNudgeDownKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-left',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => !event.shiftKey && matchesNudgeLeftKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-right',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => !event.shiftKey && matchesNudgeRightKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-up',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => !event.shiftKey && matchesNudgeUpKey(event),
    preventDefault: true
  },
  {
    allowEditableTarget: false,
    eventType: 'keydown',
    intent: (event) => ({
      kind: 'object-command',
      commandId: 'nudge-down',
      eventType: 'keydown',
      target: event.target
    }),
    matches: (event) => !event.shiftKey && matchesNudgeDownKey(event),
    preventDefault: true
  }
]

export function readCanvasObjectKeyboardInput(
  eventType: CanvasObjectKeyboardEventType,
  event: KeyboardEvent
) {
  const binding = CANVAS_OBJECT_KEYMAP.find((candidate) => {
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
