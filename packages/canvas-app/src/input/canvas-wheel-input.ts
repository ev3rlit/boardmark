import { readZoomDirectionFromWheelEvent } from '@canvas-app/keyboard/key-event-matchers'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'

export function readCanvasWheelInput(event: WheelEvent): CanvasMatchedInput | null {
  const direction = readZoomDirectionFromWheelEvent(event)

  if (direction === null) {
    return null
  }

  return {
    allowEditableTarget: true,
    intent: {
      kind: 'viewport-zoom',
      source: 'wheel',
      mode: 'step',
      direction,
      anchorClientX: event.clientX,
      anchorClientY: event.clientY,
      target: event.target
    },
    preventDefault: true
  }
}
