import { describe, expect, it } from 'vitest'
import {
  readZoomDirectionFromGestureEvent,
  readZoomDirectionFromWheelEvent
} from '@canvas-app/keyboard/key-event-matchers'

describe('key-event-matchers', () => {
  it('reads ctrl+wheel up as zoom-in', () => {
    expect(readZoomDirectionFromWheelEvent({
      altKey: false,
      ctrlKey: true,
      deltaY: -120,
      metaKey: false
    })).toBe('in')
  })

  it('reads ctrl+wheel down as zoom-out', () => {
    expect(readZoomDirectionFromWheelEvent({
      altKey: false,
      ctrlKey: true,
      deltaY: 120,
      metaKey: false
    })).toBe('out')
  })

  it('ignores cmd+wheel on mac', () => {
    expect(readZoomDirectionFromWheelEvent({
      altKey: false,
      ctrlKey: false,
      deltaY: -120,
      metaKey: true
    })).toBeNull()
  })

  it('ignores wheel without ctrl', () => {
    expect(readZoomDirectionFromWheelEvent({
      altKey: false,
      ctrlKey: false,
      deltaY: -120,
      metaKey: false
    })).toBeNull()
  })

  it('reads gesture scale growth as zoom-in', () => {
    expect(readZoomDirectionFromGestureEvent({
      current: { scale: 1.08 },
      previousScale: 1
    })).toBe('in')
  })

  it('reads gesture scale shrink as zoom-out', () => {
    expect(readZoomDirectionFromGestureEvent({
      current: { scale: 0.92 },
      previousScale: 1
    })).toBe('out')
  })
})
