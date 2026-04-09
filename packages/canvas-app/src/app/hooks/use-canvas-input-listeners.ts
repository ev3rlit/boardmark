import { useCallback, useEffect, useMemo, useRef } from 'react'
import type {
  CanvasAppCommandContext
} from '@canvas-app/app/commands/canvas-app-commands'
import type {
  CanvasObjectCommandContext
} from '@canvas-app/app/commands/canvas-object-commands'
import { readCanvasAppKeyboardInput } from '@canvas-app/app/keyboard/canvas-app-keymap'
import { readCanvasObjectKeyboardInput } from '@canvas-app/app/keyboard/canvas-object-keymap'
import { createCanvasInputContext } from '@canvas-app/input/canvas-input-context'
import { dispatchCanvasResolvedInput } from '@canvas-app/input/canvas-input-dispatcher'
import { readCanvasPointerCapabilities, resolveCanvasInput } from '@canvas-app/input/canvas-input-resolver'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'
import type {
  CanvasPointerInteractionState,
  CanvasTemporaryPanState,
  ToolMode
} from '@canvas-app/store/canvas-store-types'

type UseCanvasInputListenersOptions = {
  appCommandContext: CanvasAppCommandContext
  clearSelection: () => void
  commitNodeMove: (nodeId: string, x: number, y: number) => Promise<void>
  commitNodeResize: (
    nodeId: string,
    geometry: {
      x: number
      y: number
      width: number
      height: number
    }
  ) => Promise<void>
  nudgeSelection: (dx: number, dy: number) => Promise<void>
  openObjectContextMenu: (input: { x: number; y: number }) => void
  openPaneContextMenu: (input: { x: number; y: number }) => void
  objectCommandContext: CanvasObjectCommandContext
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
  }) => void
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  selectEdgeFromCanvas: (edgeId: string, additive: boolean) => void
  selectNodeFromCanvas: (nodeId: string, additive: boolean) => void
  setPointerInteractionState: (state: CanvasPointerInteractionState) => void
  setTemporaryPanState: (state: CanvasTemporaryPanState) => void
  supportsMultiSelect: boolean
  temporaryPanState: CanvasTemporaryPanState
  toolMode: ToolMode
}

export function useCanvasInputListeners({
  appCommandContext,
  clearSelection,
  commitNodeMove,
  commitNodeResize,
  nudgeSelection,
  openObjectContextMenu,
  openPaneContextMenu,
  objectCommandContext,
  replaceSelection,
  reconnectEdge,
  selectEdgeFromCanvas,
  selectNodeFromCanvas,
  setPointerInteractionState,
  setTemporaryPanState,
  supportsMultiSelect,
  temporaryPanState,
  toolMode
}: UseCanvasInputListenersOptions) {
  const latestRef = useRef({
    appCommandContext,
    clearSelection,
    commitNodeMove,
    commitNodeResize,
    nudgeSelection,
    openObjectContextMenu,
    openPaneContextMenu,
    objectCommandContext,
    replaceSelection,
    reconnectEdge,
    selectEdgeFromCanvas,
    selectNodeFromCanvas,
    setPointerInteractionState,
    setTemporaryPanState,
    supportsMultiSelect,
    temporaryPanState,
    toolMode
  })

  latestRef.current = {
    appCommandContext,
    clearSelection,
    commitNodeMove,
    commitNodeResize,
    nudgeSelection,
    openObjectContextMenu,
    openPaneContextMenu,
    objectCommandContext,
    replaceSelection,
    reconnectEdge,
    selectEdgeFromCanvas,
    selectNodeFromCanvas,
    setPointerInteractionState,
    setTemporaryPanState,
    supportsMultiSelect,
    temporaryPanState,
    toolMode
  }

  const pointerCapabilities = useMemo(() => {
    const context = createCanvasInputContext({
      appCommandContext,
      eventTarget: null,
      objectCommandContext,
      temporaryPanState,
      supportsMultiSelect,
      toolMode
    })

    return readCanvasPointerCapabilities(context)
  }, [
    appCommandContext,
    objectCommandContext,
    temporaryPanState,
    supportsMultiSelect,
    toolMode
  ])

  const resolveAndDispatchCanvasInput = useCallback(
    (input: CanvasMatchedInput, options?: { viewportBounds?: { left: number; top: number } }) => {
      const current = latestRef.current
      const context = createCanvasInputContext({
        appCommandContext: current.appCommandContext,
        eventTarget: 'target' in input.intent ? input.intent.target : null,
        objectCommandContext: current.objectCommandContext,
        supportsMultiSelect: current.supportsMultiSelect,
        temporaryPanState: current.temporaryPanState,
        toolMode: current.toolMode
      })
      const resolved = resolveCanvasInput(input, context)

      if (!resolved) {
        return null
      }

      return dispatchCanvasResolvedInput(resolved, {
        appCommandContext: current.appCommandContext,
        clearSelection: current.clearSelection,
        commitNodeMove: current.commitNodeMove,
        commitNodeResize: current.commitNodeResize,
        nudgeSelection: current.nudgeSelection,
        openObjectContextMenu: current.openObjectContextMenu,
        openPaneContextMenu: current.openPaneContextMenu,
        objectCommandContext: current.objectCommandContext,
        replaceSelection: current.replaceSelection,
        reconnectEdge: current.reconnectEdge,
        selectEdgeFromCanvas: current.selectEdgeFromCanvas,
        selectNodeFromCanvas: current.selectNodeFromCanvas,
        setPointerInteractionState: current.setPointerInteractionState,
        setTemporaryPanState: current.setTemporaryPanState,
        viewportBounds: options?.viewportBounds
      })
    },
    []
  )

  const dispatchCanvasInput = useCallback(
    (input: CanvasMatchedInput, options?: { viewportBounds?: { left: number; top: number } }) => {
      return resolveAndDispatchCanvasInput(input, options) !== null
    },
    [resolveAndDispatchCanvasInput]
  )

  const dispatchCanvasInputAsync = useCallback(
    async (input: CanvasMatchedInput, options?: { viewportBounds?: { left: number; top: number } }) => {
      const result = resolveAndDispatchCanvasInput(input, options)

      if (result === null) {
        return false
      }

      await Promise.resolve(result)
      return true
    },
    [resolveAndDispatchCanvasInput]
  )

  useEffect(() => {
    const dispatchKeyboardInput = (input: CanvasMatchedInput, event: KeyboardEvent) => {
      const handled = dispatchCanvasInput(input)

      if (handled && input.preventDefault) {
        event.preventDefault()
      }

      return handled
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const appInput = readCanvasAppKeyboardInput('keydown', event)

      if (appInput && dispatchKeyboardInput(appInput, event)) {
        return
      }

      const objectInput = readCanvasObjectKeyboardInput('keydown', event)

      if (objectInput) {
        dispatchKeyboardInput(objectInput, event)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const appInput = readCanvasAppKeyboardInput('keyup', event)

      if (appInput) {
        dispatchKeyboardInput(appInput, event)
      }
    }

    const handleWindowBlur = () => {
      void dispatchCanvasInputAsync({
        allowEditableTarget: true,
        intent: {
          kind: 'system-blur'
        },
        preventDefault: false
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [dispatchCanvasInput, dispatchCanvasInputAsync])

  const previousEditingStatusRef = useRef(appCommandContext.editingState.status)

  useEffect(() => {
    const previousStatus = previousEditingStatusRef.current
    const nextStatus = appCommandContext.editingState.status

    previousEditingStatusRef.current = nextStatus

    if (previousStatus === nextStatus) {
      return
    }

    void dispatchCanvasInputAsync({
      allowEditableTarget: true,
      intent: {
        kind: 'system-editing',
        state: nextStatus === 'active' ? 'start' : 'end'
      },
      preventDefault: false
    })
  }, [appCommandContext.editingState.status, dispatchCanvasInputAsync])

  return {
    dispatchCanvasInput,
    dispatchCanvasInputAsync,
    pointerCapabilities
  }
}
