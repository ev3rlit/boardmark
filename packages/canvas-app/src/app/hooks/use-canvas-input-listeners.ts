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
import type { ToolMode } from '@canvas-app/store/canvas-store-types'

type UseCanvasInputListenersOptions = {
  appCommandContext: CanvasAppCommandContext
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
  objectCommandContext: CanvasObjectCommandContext
  panShortcutActive: boolean
  reconnectEdge: (edgeId: string, from: string, to: string) => Promise<void>
  supportsMultiSelect: boolean
  toolMode: ToolMode
}

export function useCanvasInputListeners({
  appCommandContext,
  commitNodeMove,
  commitNodeResize,
  nudgeSelection,
  objectCommandContext,
  panShortcutActive,
  reconnectEdge,
  supportsMultiSelect,
  toolMode
}: UseCanvasInputListenersOptions) {
  const latestRef = useRef({
    appCommandContext,
    commitNodeMove,
    commitNodeResize,
    nudgeSelection,
    objectCommandContext,
    panShortcutActive,
    reconnectEdge,
    supportsMultiSelect,
    toolMode
  })

  latestRef.current = {
    appCommandContext,
    commitNodeMove,
    commitNodeResize,
    nudgeSelection,
    objectCommandContext,
    panShortcutActive,
    reconnectEdge,
    supportsMultiSelect,
    toolMode
  }

  const pointerCapabilities = useMemo(() => {
    const context = createCanvasInputContext({
      appCommandContext,
      eventTarget: null,
      objectCommandContext,
      panShortcutActive,
      supportsMultiSelect,
      toolMode
    })

    return readCanvasPointerCapabilities(context)
  }, [
    appCommandContext,
    objectCommandContext,
    panShortcutActive,
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
        panShortcutActive: current.panShortcutActive,
        supportsMultiSelect: current.supportsMultiSelect,
        toolMode: current.toolMode
      })
      const resolved = resolveCanvasInput(input, context)

      if (!resolved) {
        return null
      }

      return dispatchCanvasResolvedInput(resolved, {
        appCommandContext: current.appCommandContext,
        commitNodeMove: current.commitNodeMove,
        commitNodeResize: current.commitNodeResize,
        nudgeSelection: current.nudgeSelection,
        objectCommandContext: current.objectCommandContext,
        reconnectEdge: current.reconnectEdge,
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
          kind: 'temporary-pan',
          state: 'end',
          target: null
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

  return {
    dispatchCanvasInput,
    dispatchCanvasInputAsync,
    pointerCapabilities
  }
}
