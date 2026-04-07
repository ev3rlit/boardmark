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
  | { position: number; type: 'request-source-entry' }

type WysiwygNavigationState = {
  pendingSourceEntry: number | null
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
  if (readPendingSourceEntryPosition(view.state) === null) {
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
  return wysiwygEditorNavigationPluginKey.getState(state)?.pendingSourceEntry ?? null
}

export function requestPendingSourceEntry(transaction: Transaction, position: number) {
  setNavigationMeta(transaction, {
    position,
    type: 'request-source-entry'
  })
  return transaction
}

export function requestSourceEntryForNode(view: EditorView, position: number) {
  const transaction = view.state.tr
  transaction.setSelection(NodeSelection.create(transaction.doc, position))
  requestPendingSourceEntry(transaction, position)
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
          pendingSourceEntry = meta.position
        }

        if (meta?.type === 'clear-source-entry') {
          pendingSourceEntry = null
        }

        if (
          pendingSourceEntry !== null
          && !isNodeSelectionAtPosition(transaction.selection, pendingSourceEntry)
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

  if (!(selection instanceof TextSelection) || !selection.empty || !isTextSelectionAtVerticalBoundary(selection, direction)) {
    return false
  }

  const adjacentBlock = findAdjacentTopLevelBlock(view.state, selection.from, direction)

  if (!adjacentBlock || !isNavigableBlockNodeName(adjacentBlock.node.type.name)) {
    return false
  }

  const transaction = view.state.tr
  transaction.setSelection(NodeSelection.create(transaction.doc, adjacentBlock.position))
  view.dispatch(transaction)
  return true
}

function isNodeSelectionAtPosition(selection: ProseMirrorSelection, position: number) {
  return selection instanceof NodeSelection && selection.from === position
}

function isTextSelectionAtVerticalBoundary(
  selection: TextSelection,
  direction: 'down' | 'up'
) {
  return direction === 'up'
    ? selection.$head.parentOffset === 0
    : selection.$head.parentOffset === selection.$head.parent.content.size
}

function moveFromSelectedBlock(
  view: EditorView,
  input: {
    direction: 'down' | 'up'
    position: number
  }
) {
  const adjacentBlock = findAdjacentTopLevelBlock(view.state, input.position, input.direction)

  if (!adjacentBlock) {
    return false
  }

  const transaction = view.state.tr

  if (isNavigableBlockNodeName(adjacentBlock.node.type.name)) {
    transaction.setSelection(NodeSelection.create(transaction.doc, adjacentBlock.position))
    view.dispatch(transaction)
    return true
  }

  if (adjacentBlock.node.isTextblock) {
    const textPosition = input.direction === 'down'
      ? adjacentBlock.position + 1
      : adjacentBlock.position + adjacentBlock.node.content.size

    transaction.setSelection(TextSelection.create(transaction.doc, textPosition))
    view.dispatch(transaction)
    return true
  }

  const selection = input.direction === 'down'
    ? Selection.findFrom(transaction.doc.resolve(adjacentBlock.position), 1, true)
      ?? Selection.findFrom(transaction.doc.resolve(adjacentBlock.position), 1, false)
    : Selection.findFrom(
        transaction.doc.resolve(adjacentBlock.position + adjacentBlock.node.nodeSize),
        -1,
        true
      )
      ?? Selection.findFrom(
        transaction.doc.resolve(adjacentBlock.position + adjacentBlock.node.nodeSize),
        -1,
        false
      )

  if (!selection) {
    return false
  }

  transaction.setSelection(selection)
  view.dispatch(transaction)
  return true
}

function findAdjacentTopLevelBlock(
  state: EditorState,
  position: number,
  direction: 'down' | 'up'
) {
  const blocks = readTopLevelBlocks(state)
  const currentIndex = blocks.findIndex((block) =>
    position >= block.position && position < block.position + block.node.nodeSize
  )

  if (currentIndex === -1) {
    return null
  }

  const offset = direction === 'down' ? 1 : -1
  return blocks[currentIndex + offset] ?? null
}

function readNavigationMeta(transaction: Transaction) {
  return transaction.getMeta(wysiwygEditorNavigationPluginKey) as WysiwygNavigationMeta | undefined
}

function readTopLevelBlocks(state: EditorState) {
  const blocks: Array<{ node: ProseMirrorNode; position: number }> = []

  state.doc.forEach((node, offset) => {
    blocks.push({
      node,
      position: offset
    })
  })

  return blocks
}

function setNavigationMeta(
  transaction: Transaction,
  meta: WysiwygNavigationMeta
) {
  transaction.setMeta(wysiwygEditorNavigationPluginKey, meta)
}
