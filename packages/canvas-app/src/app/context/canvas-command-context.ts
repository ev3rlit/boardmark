import type {
  CanvasAppCommandContext
} from '@canvas-app/app/commands/canvas-app-commands'
import type {
  CanvasObjectCommandContext
} from '@canvas-app/app/commands/canvas-object-commands'

export function createCanvasAppCommandContext(
  context: CanvasAppCommandContext
): CanvasAppCommandContext {
  return context
}

export function createCanvasObjectCommandContext(
  context: CanvasObjectCommandContext
): CanvasObjectCommandContext {
  return context
}
