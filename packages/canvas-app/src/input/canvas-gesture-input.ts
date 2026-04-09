import { readZoomDirectionFromGestureEvent } from '@canvas-app/keyboard/key-event-matchers'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'

type GestureZoomDomEvent = Event & {
  clientX: number
  clientY: number
  scale: number
  target: EventTarget | null
}

export function readCanvasGestureInput(input: {
  event: GestureZoomDomEvent
  previousScale: number
}): CanvasMatchedInput | null {
  const direction = readZoomDirectionFromGestureEvent({
    current: input.event,
    previousScale: input.previousScale
  })

  if (direction === null) {
    return null
  }

  return {
    allowEditableTarget: true,
    intent: {
      kind: 'viewport-zoom',
      source: 'gesture',
      mode: 'step',
      direction,
      anchorClientX: input.event.clientX,
      anchorClientY: input.event.clientY,
      target: input.event.target
    },
    preventDefault: true
  }
}
