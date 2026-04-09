import type {
  CanvasPointerInteractionState,
  CanvasTemporaryPanState,
  ToolMode
} from '@canvas-app/store/canvas-store-types'

export type PointerInteractionMachineEvent =
  | { kind: 'temporary-pan:start' }
  | { kind: 'temporary-pan:end' }
  | { kind: 'selection-box:start' }
  | { kind: 'selection-box:drag-start' }
  | { kind: 'selection-box:end' }
  | { kind: 'node-drag:start' }
  | { kind: 'node-drag:end' }
  | { kind: 'edge-reconnect:start' }
  | { kind: 'edge-reconnect:end' }
  | { kind: 'pane-pan:start' }
  | { kind: 'pane-pan:end' }
  | { kind: 'blur' }
  | { kind: 'editing:start' }
  | { kind: 'editing:end' }

export type PointerInteractionMachineState = {
  pointerInteractionState: CanvasPointerInteractionState
  temporaryPanState: CanvasTemporaryPanState
  toolMode: ToolMode
}

type PointerInteractionMachineSnapshot = Pick<
  PointerInteractionMachineState,
  'pointerInteractionState' | 'temporaryPanState'
>

export function readPointerInteractionTransition(
  state: PointerInteractionMachineState,
  event: PointerInteractionMachineEvent
): PointerInteractionMachineSnapshot {
  switch (event.kind) {
    case 'temporary-pan:start':
      if (
        state.toolMode === 'pan' ||
        state.temporaryPanState === 'active' ||
        state.temporaryPanState === 'deferred'
      ) {
        return readNextState(state)
      }

      if (state.pointerInteractionState.status === 'idle') {
        return readNextState(state, {
          temporaryPanState: 'active'
        })
      }

      return readNextState(state, {
        temporaryPanState: 'deferred'
      })

    case 'temporary-pan:end':
      return readNextState(state, {
        temporaryPanState: 'inactive'
      })

    case 'selection-box:start':
      if (state.pointerInteractionState.status !== 'idle') {
        return readNextState(state)
      }

      return readNextState(state, {
        pointerInteractionState: {
          status: 'selection-box',
          phase: 'pending'
        }
      })

    case 'selection-box:drag-start':
      if (
        state.pointerInteractionState.status === 'selection-box' &&
        state.pointerInteractionState.phase === 'dragging'
      ) {
        return readNextState(state)
      }

      return readNextState(state, {
        pointerInteractionState: {
          status: 'selection-box',
          phase: 'dragging'
        }
      })

    case 'selection-box:end':
      return state.pointerInteractionState.status === 'selection-box'
        ? readNextState(state, {
            pointerInteractionState: { status: 'idle' }
          })
        : readNextState(state)

    case 'node-drag:start':
      return readNextState(state, {
        pointerInteractionState: { status: 'node-drag' }
      })

    case 'node-drag:end':
      return state.pointerInteractionState.status === 'node-drag'
        ? readNextState(state, {
            pointerInteractionState: { status: 'idle' }
          })
        : readNextState(state)

    case 'edge-reconnect:start':
      return readNextState(state, {
        pointerInteractionState: { status: 'edge-reconnect' }
      })

    case 'edge-reconnect:end':
      return state.pointerInteractionState.status === 'edge-reconnect'
        ? readNextState(state, {
            pointerInteractionState: { status: 'idle' }
          })
        : readNextState(state)

    case 'pane-pan:start':
      return readNextState(state, {
        pointerInteractionState: {
          status: 'pane-pan',
          source: readPanePanSource(state)
        },
        temporaryPanState:
          state.temporaryPanState === 'deferred'
            ? 'active'
            : state.temporaryPanState
      })

    case 'pane-pan:end':
      return state.pointerInteractionState.status === 'pane-pan'
        ? readNextState(state, {
            pointerInteractionState: { status: 'idle' }
          })
        : readNextState(state)

    case 'blur':
    case 'editing:start':
      return {
        pointerInteractionState: { status: 'idle' },
        temporaryPanState: 'inactive'
      }

    case 'editing:end':
      return readNextState(state)
  }
}

export function readPointerPanIntentReady(state: {
  pointerInteractionState: CanvasPointerInteractionState
  temporaryPanState: CanvasTemporaryPanState
  toolMode: ToolMode
}) {
  if (state.pointerInteractionState.status === 'pane-pan') {
    return true
  }

  if (state.toolMode === 'pan') {
    return true
  }

  if (state.pointerInteractionState.status !== 'idle') {
    return false
  }

  return state.temporaryPanState === 'active' || state.temporaryPanState === 'deferred'
}

function readNextState(
  current: PointerInteractionMachineState,
  next?: Partial<{
    pointerInteractionState: CanvasPointerInteractionState
    temporaryPanState: CanvasTemporaryPanState
  }>
): PointerInteractionMachineSnapshot {
  return {
    pointerInteractionState: next?.pointerInteractionState ?? current.pointerInteractionState,
    temporaryPanState: next?.temporaryPanState ?? current.temporaryPanState
  }
}

function readPanePanSource(state: {
  temporaryPanState: CanvasTemporaryPanState
  toolMode: ToolMode
}) {
  if (state.toolMode === 'pan') {
    return 'tool' as const
  }

  return state.temporaryPanState === 'active' || state.temporaryPanState === 'deferred'
    ? 'temporary-pan'
    : 'tool'
}
