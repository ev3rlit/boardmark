import { describe, expect, it } from 'vitest'
import {
  readPointerInteractionTransition,
  readPointerPanIntentReady
} from '@canvas-app/input/pointer-interaction-machine'

describe('pointer-interaction-machine', () => {
  it('activates temporary pan immediately while idle', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'inactive',
      toolMode: 'select'
    }, {
      kind: 'temporary-pan:start'
    })).toEqual({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'active'
    })
  })

  it('defers temporary pan while a node drag is active', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: { status: 'node-drag' },
      temporaryPanState: 'inactive',
      toolMode: 'select'
    }, {
      kind: 'temporary-pan:start'
    })).toEqual({
      pointerInteractionState: { status: 'node-drag' },
      temporaryPanState: 'deferred'
    })
  })

  it('defers temporary pan while a selection box is active', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: {
        status: 'selection-box',
        phase: 'dragging'
      },
      temporaryPanState: 'inactive',
      toolMode: 'select'
    }, {
      kind: 'temporary-pan:start'
    })).toEqual({
      pointerInteractionState: {
        status: 'selection-box',
        phase: 'dragging'
      },
      temporaryPanState: 'deferred'
    })
  })

  it('clears deferred temporary pan on key release before the next drag', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'deferred',
      toolMode: 'select'
    }, {
      kind: 'temporary-pan:end'
    })).toEqual({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'inactive'
    })
  })

  it('keeps pane pan running when temporary pan ends mid-gesture', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: {
        status: 'pane-pan',
        source: 'temporary-pan'
      },
      temporaryPanState: 'active',
      toolMode: 'select'
    }, {
      kind: 'temporary-pan:end'
    })).toEqual({
      pointerInteractionState: {
        status: 'pane-pan',
        source: 'temporary-pan'
      },
      temporaryPanState: 'inactive'
    })
  })

  it('returns to idle while keeping deferred temporary pan pending after a busy interaction ends', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: { status: 'node-drag' },
      temporaryPanState: 'deferred',
      toolMode: 'select'
    }, {
      kind: 'node-drag:end'
    })).toEqual({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'deferred'
    })
  })

  it('consumes deferred temporary pan on the next pane pan start', () => {
    const nextState = readPointerInteractionTransition({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'deferred',
      toolMode: 'select'
    }, {
      kind: 'pane-pan:start'
    })

    expect(nextState).toEqual({
      pointerInteractionState: {
        status: 'pane-pan',
        source: 'temporary-pan'
      },
      temporaryPanState: 'active'
    })
    expect(readPointerPanIntentReady({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'deferred',
      toolMode: 'select'
    })).toBe(true)
  })

  it('clears both temporary pan and pointer interaction state on blur', () => {
    expect(readPointerInteractionTransition({
      pointerInteractionState: {
        status: 'pane-pan',
        source: 'temporary-pan'
      },
      temporaryPanState: 'active',
      toolMode: 'select'
    }, {
      kind: 'blur'
    })).toEqual({
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'inactive'
    })
  })
})
