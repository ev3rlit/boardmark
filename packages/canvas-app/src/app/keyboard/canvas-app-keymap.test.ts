import { describe, expect, it } from 'vitest'
import {
  readCanvasAppKeyboardInput,
  readCanvasAppShortcutLabel
} from '@canvas-app/app/keyboard/canvas-app-keymap'

describe('canvas-app-keymap', () => {
  it('emits a viewport zoom intent for the keyboard zoom shortcut', () => {
    const input = readCanvasAppKeyboardInput('keydown', {
      altKey: false,
      code: 'Equal',
      ctrlKey: false,
      key: '=',
      metaKey: true,
      shiftKey: false,
      target: null
    } as KeyboardEvent)

    expect(input).toEqual({
      allowEditableTarget: true,
      intent: {
        kind: 'viewport-zoom',
        source: 'keyboard',
        mode: 'step',
        direction: 'in',
        target: null
      },
      preventDefault: true
    })
  })

  it('renders platform-specific shortcut labels without Cmd/Ctrl dual labels', () => {
    expect(readCanvasAppShortcutLabel('undo', 'MacIntel')).toBe('Cmd+Z')
    expect(readCanvasAppShortcutLabel('undo', 'Win32')).toBe('Ctrl+Z')
    expect(readCanvasAppShortcutLabel('redo', 'Linux x86_64')).toBe('Shift+Ctrl+Z')
  })
})
