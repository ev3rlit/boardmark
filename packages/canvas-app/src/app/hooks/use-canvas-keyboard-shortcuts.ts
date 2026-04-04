import { useEffect } from 'react'
import {
  canExecuteCanvasAppCommand,
  executeCanvasAppCommand,
  type CanvasAppCommandContext
} from '@canvas-app/app/commands/canvas-app-commands'
import {
  canExecuteCanvasObjectCommand,
  executeCanvasObjectCommand,
  type CanvasObjectCommandContext
} from '@canvas-app/app/commands/canvas-object-commands'
import { readCanvasAppKeyBinding } from '@canvas-app/app/keyboard/canvas-app-keymap'
import { readCanvasObjectKeyBinding } from '@canvas-app/app/keyboard/canvas-object-keymap'
import { isEditableTarget } from '@canvas-app/app/utils/canvas-app-helpers'

type UseCanvasKeyboardShortcutsOptions = {
  appCommandContext: CanvasAppCommandContext
  objectCommandContext: CanvasObjectCommandContext
}

export function useCanvasKeyboardShortcuts({
  appCommandContext,
  objectCommandContext
}: UseCanvasKeyboardShortcutsOptions) {
  useEffect(() => {
    const dispatchAppKeyboardCommand = (
      eventType: 'keydown' | 'keyup',
      event: KeyboardEvent
    ) => {
      const binding = readCanvasAppKeyBinding(eventType, event)

      if (!binding) {
        return false
      }

      if (!binding.allowEditableTarget && isEditableTarget(event.target)) {
        return false
      }

      if (!canExecuteCanvasAppCommand(binding.commandId, appCommandContext)) {
        return false
      }

      if (binding.preventDefault) {
        event.preventDefault()
      }

      return executeCanvasAppCommand(binding.commandId, appCommandContext)
    }

    const dispatchObjectKeyboardCommand = (event: KeyboardEvent) => {
      const binding = readCanvasObjectKeyBinding('keydown', event)

      if (!binding) {
        return false
      }

      if (!binding.allowEditableTarget && isEditableTarget(event.target)) {
        return false
      }

      if (!canExecuteCanvasObjectCommand(binding.commandId, objectCommandContext)) {
        return false
      }

      if (binding.preventDefault) {
        event.preventDefault()
      }

      return executeCanvasObjectCommand(binding.commandId, objectCommandContext)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dispatchAppKeyboardCommand('keydown', event)) {
        return
      }

      dispatchObjectKeyboardCommand(event)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      void dispatchAppKeyboardCommand('keyup', event)
    }

    const handleWindowBlur = () => {
      executeCanvasAppCommand('deactivate-pan-shortcut', appCommandContext)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [appCommandContext, objectCommandContext])
}
