import { Extension } from '@tiptap/core'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Selection as ProseMirrorSelection,
  type Transaction
} from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { matchesNudgeDownKey, matchesNudgeUpKey } from '@canvas-app/keyboard/key-event-matchers'
import {
  isNavigableBlockNodeName,
  isNavigableBlockSelection,
  isSelectionInsideTable
} from '@canvas-app/components/editor/caret-navigation/selection-state'

type WysiwygNavigationMeta =
  | { type: 'clear-source-entry' }
  | {
      caretPlacement: 'end' | 'start'
      position: number
      type: 'request-source-entry'
    }

type WysiwygNavigationState = {
  pendingSourceEntry: null | {
    caretPlacement: 'end' | 'start'
    position: number
  }
}

type WysiwygEditorNavigationCallbacks = {
  onExitToHost?: () => void
}

const initialNavigationState: WysiwygNavigationState = {
  pendingSourceEntry: null
}

export const wysiwygEditorNavigationPluginKey = new PluginKey<WysiwygNavigationState>('wysiwygEditorNavigation')

export const WysiwygEditorNavigation = Extension.create<{
  callbacks: WysiwygEditorNavigationCallbacks
}>({
  name: 'wysiwygEditorNavigation',

  addOptions() {
    return {
      callbacks: {}
    }
  },

  addProseMirrorPlugins() {
    return [createWysiwygEditorNavigationPlugin(this.options.callbacks)]
  }
})

export function clearPendingSourceEntry(view: EditorView) {
  if (readPendingSourceEntry(view.state) === null) {
    return
  }

  const transaction = view.state.tr
  setNavigationMeta(transaction, {
    type: 'clear-source-entry'
  })
  view.dispatch(transaction)
}

export function moveSelectionFromBlock(
  view: EditorView,
  position: number,
  direction: 'down' | 'up'
) {
  const handled = moveFromSelectedBlock(view, {
    direction,
    position
  })

  if (!handled) {
    return false
  }

  view.focus()
  return true
}

export function moveVerticalSelection(
  view: EditorView,
  direction: 'down' | 'up'
) {
  return handleVerticalNavigation(view, direction)
}

export function readPendingSourceEntryPosition(state: EditorState) {
  return readPendingSourceEntry(state)?.position ?? null
}

export function readPendingSourceEntry(state: EditorState) {
  return wysiwygEditorNavigationPluginKey.getState(state)?.pendingSourceEntry ?? null
}

export function requestPendingSourceEntry(
  transaction: Transaction,
  position: number,
  caretPlacement: 'end' | 'start' = 'start'
) {
  setNavigationMeta(transaction, {
    caretPlacement,
    position,
    type: 'request-source-entry'
  })
  return transaction
}

export function requestSourceEntryForNode(view: EditorView, position: number) {
  const transaction = view.state.tr
  transaction.setSelection(NodeSelection.create(transaction.doc, position))
  requestPendingSourceEntry(transaction, position, 'start')
  view.dispatch(transaction)
}

function createWysiwygEditorNavigationPlugin(
  callbacks: WysiwygEditorNavigationCallbacks
) {
  return new Plugin<WysiwygNavigationState>({
    key: wysiwygEditorNavigationPluginKey,
    state: {
      init() {
        return initialNavigationState
      },
      apply(transaction, pluginState) {
        const meta = readNavigationMeta(transaction)
        let pendingSourceEntry = pluginState.pendingSourceEntry

        if (meta?.type === 'request-source-entry') {
          pendingSourceEntry = {
            caretPlacement: meta.caretPlacement,
            position: meta.position
          }
        }

        if (meta?.type === 'clear-source-entry') {
          pendingSourceEntry = null
        }

        if (
          pendingSourceEntry !== null
          && !isNodeSelectionAtPosition(transaction.selection, pendingSourceEntry.position)
        ) {
          pendingSourceEntry = null
        }

        if (pendingSourceEntry === pluginState.pendingSourceEntry) {
          return pluginState
        }

        return {
          pendingSourceEntry
        }
      }
    },
    props: {
      handleKeyDown(view, event) {
        if (matchesNudgeUpKey(event)) {
          return moveVerticalSelection(view, 'up')
        }

        if (matchesNudgeDownKey(event)) {
          return moveVerticalSelection(view, 'down')
        }

        if (event.key === 'Enter' && isNavigableBlockSelection(view.state.selection)) {
          event.preventDefault()
          requestSourceEntryForNode(view, view.state.selection.from)
          return true
        }

        if (event.key === 'Escape' && isNavigableBlockSelection(view.state.selection)) {
          event.preventDefault()
          callbacks.onExitToHost?.()
          return true
        }

        return false
      }
    }
  })
}

function handleVerticalNavigation(view: EditorView, direction: 'down' | 'up') {
  const { selection } = view.state

  if (isSelectionInsideTable(selection)) {
    return false
  }

  if (selection instanceof NodeSelection && isNavigableBlockNodeName(selection.node.type.name)) {
    return moveFromSelectedBlock(view, {
      direction,
      position: selection.from
    })
  }

  if (
    !(selection instanceof TextSelection)
    || !selection.empty
    || !isTextSelectionAtVerticalBoundary(view, selection, direction)
  ) {
    return false
  }

  const adjacentBlock = findAdjacentEditableTarget(view.state, {
    direction,
    selection
  })

  if (!adjacentBlock || adjacentBlock.kind !== 'block') {
    return false
  }

  const transaction = view.state.tr
  transaction.setSelection(NodeSelection.create(transaction.doc, adjacentBlock.position))
  requestPendingSourceEntry(
    transaction,
    adjacentBlock.position,
    direction === 'up' ? 'end' : 'start'
  )
  view.dispatch(transaction)
  return true
}

function isNodeSelectionAtPosition(selection: ProseMirrorSelection, position: number) {
  return selection instanceof NodeSelection && selection.from === position
}

function isTextSelectionAtVerticalBoundary(
  view: EditorView,
  selection: TextSelection,
  direction: 'down' | 'up'
) {
  const logicalBoundary = direction === 'up'
    ? selection.$head.parentOffset === 0
    : selection.$head.parentOffset === selection.$head.parent.content.size

  try {
    return view.endOfTextblock(direction) || logicalBoundary
  } catch {
    // jsdom does not implement enough layout APIs for ProseMirror geometry checks.
  }

  return logicalBoundary
}

function moveFromSelectedBlock(
  view: EditorView,
  input: {
    direction: 'down' | 'up'
    position: number
  }
) {
  const adjacentBlock = findAdjacentEditableTarget(view.state, {
    direction: input.direction,
    position: input.position
  })

  if (!adjacentBlock) {
    return false
  }

  const transaction = view.state.tr

  if (adjacentBlock.kind === 'block') {
    transaction.setSelection(NodeSelection.create(transaction.doc, adjacentBlock.position))
    view.dispatch(transaction)
    return true
  }

  if (adjacentBlock.kind === 'text') {
    const textPosition = input.direction === 'down'
      ? adjacentBlock.textStart
      : adjacentBlock.textEnd

    transaction.setSelection(TextSelection.create(transaction.doc, textPosition))
    view.dispatch(transaction)
    return true
  }
}

function readNavigationMeta(transaction: Transaction) {
  return transaction.getMeta(wysiwygEditorNavigationPluginKey) as WysiwygNavigationMeta | undefined
}

function findAdjacentEditableTarget(
  state: EditorState,
  input:
    | {
        direction: 'down' | 'up'
        position: number
      }
    | {
        direction: 'down' | 'up'
        selection: TextSelection
      }
) {
  const targets = readEditableTargets(state)
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

function readEditableTargets(state: EditorState) {
  const targets: Array<
    | {
        kind: 'block'
        nodeSize: number
        position: number
      }
    | {
        kind: 'text'
        position: number
        textEnd: number
        textStart: number
      }
  > = []

  state.doc.descendants((node, position) => {
    if (isNavigableBlockNodeName(node.type.name)) {
      targets.push({
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

function setNavigationMeta(
  transaction: Transaction,
  meta: WysiwygNavigationMeta
) {
  transaction.setMeta(wysiwygEditorNavigationPluginKey, meta)
}
