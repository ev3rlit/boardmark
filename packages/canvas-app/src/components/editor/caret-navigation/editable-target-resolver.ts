import { TextSelection, type EditorState } from '@tiptap/pm/state'
import {
  isBlockCaretCapability,
  type BlockCaretCapability,
  type CaretCapabilityProvider
} from '@canvas-app/components/editor/caret-navigation/caret-capabilities'

export type EditableBlockTarget = {
  capability: BlockCaretCapability
  kind: 'block'
  nodeSize: number
  position: number
}

export type EditableTextTarget = {
  kind: 'text'
  position: number
  textEnd: number
  textStart: number
}

export type EditableTarget = EditableBlockTarget | EditableTextTarget

export function readEditableTargets(
  state: EditorState,
  provider: CaretCapabilityProvider
) {
  const targets: EditableTarget[] = []

  state.doc.descendants((node, position) => {
    const capability = provider.getForNodeName(node.type.name)

    if (isBlockCaretCapability(capability)) {
      targets.push({
        capability,
        kind: 'block',
        nodeSize: node.nodeSize,
        position
      })
      return false
    }

    if (!node.isTextblock) {
      return true
    }

    targets.push({
      kind: 'text',
      position,
      textEnd: position + node.nodeSize - 1,
      textStart: position + 1
    })
    return false
  })

  return targets
}

export function findAdjacentEditableTarget(
  state: EditorState,
  input:
    | {
        direction: 'down' | 'up'
        position: number
      }
    | {
        direction: 'down' | 'up'
        selection: TextSelection
      },
  provider: CaretCapabilityProvider
) {
  const targets = readEditableTargets(state, provider)
  const currentIndex = 'position' in input
    ? targets.findIndex((target) => target.kind === 'block' && target.position === input.position)
    : targets.findIndex((target) =>
        target.kind === 'text'
          && input.selection.from >= target.textStart
          && input.selection.from <= target.textEnd
      )

  if (currentIndex === -1) {
    return null
  }

  const offset = input.direction === 'down' ? 1 : -1
  return targets[currentIndex + offset] ?? null
}
