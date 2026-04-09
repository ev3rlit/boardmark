import { isEditableTarget } from '@canvas-app/app/utils/canvas-app-helpers'
import { readActiveToolMode } from '@canvas-app/store/canvas-store'
import type { ToolMode } from '@canvas-app/store/canvas-store-types'
import type {
  CanvasAppCommandContext
} from '@canvas-app/app/commands/canvas-app-commands'
import type {
  CanvasObjectCommandContext
} from '@canvas-app/app/commands/canvas-object-commands'
import type { CanvasInputContext } from '@canvas-app/input/canvas-input-types'

export function createCanvasInputContext(input: {
  appCommandContext: CanvasAppCommandContext
  eventTarget: EventTarget | null
  objectCommandContext: CanvasObjectCommandContext
  panShortcutActive: boolean
  supportsMultiSelect: boolean
  toolMode: ToolMode
}): CanvasInputContext {
  return {
    activeToolMode: readActiveToolMode({
      panShortcutActive: input.panShortcutActive,
      toolMode: input.toolMode
    }),
    appCommandContext: input.appCommandContext,
    editingState: input.appCommandContext.editingState,
    isEditableTarget: isEditableTarget(input.eventTarget),
    objectCommandContext: input.objectCommandContext,
    objectContextMenuOpen: input.appCommandContext.objectContextMenuOpen,
    panShortcutActive: input.panShortcutActive,
    selectionSnapshot: input.appCommandContext,
    supportsMultiSelect: input.supportsMultiSelect,
    toolMode: input.toolMode,
    viewport: input.appCommandContext.viewport
  }
}
