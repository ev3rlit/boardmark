import { describe, expect, it } from 'vitest'
import { readCanvasGestureInput } from '@canvas-app/input/canvas-gesture-input'
import { readCanvasWheelInput } from '@canvas-app/input/canvas-wheel-input'

describe('canvas device input', () => {
  it('matches ctrl+wheel as a viewport zoom intent', () => {
    expect(readCanvasWheelInput({
      altKey: false,
      clientX: 320,
      clientY: 240,
      ctrlKey: true,
      deltaY: -120,
      metaKey: false,
      target: null
    } as WheelEvent)).toEqual({
      allowEditableTarget: true,
      intent: {
        kind: 'viewport-zoom',
        source: 'wheel',
        mode: 'step',
        direction: 'in',
        anchorClientX: 320,
        anchorClientY: 240,
        target: null
      },
      preventDefault: true
    })
  })

  it('ignores wheel input when zoom modifiers are absent', () => {
    expect(readCanvasWheelInput({
      altKey: false,
      clientX: 320,
      clientY: 240,
      ctrlKey: false,
      deltaY: -120,
      metaKey: false,
      target: null
    } as WheelEvent)).toBeNull()
  })

  it('matches gesture pinch as a viewport zoom intent', () => {
    expect(readCanvasGestureInput({
      event: {
        clientX: 240,
        clientY: 180,
        scale: 1.08,
        target: null
      } as Event & {
        clientX: number
        clientY: number
        scale: number
        target: EventTarget | null
      },
      previousScale: 1
    })).toEqual({
      allowEditableTarget: true,
      intent: {
        kind: 'viewport-zoom',
        source: 'gesture',
        mode: 'step',
        direction: 'in',
        anchorClientX: 240,
        anchorClientY: 180,
        target: null
      },
      preventDefault: true
    })
  })
})
