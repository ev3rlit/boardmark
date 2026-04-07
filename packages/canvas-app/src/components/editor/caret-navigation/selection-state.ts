import { NodeSelection, type Selection } from '@tiptap/pm/state'
import type { CanvasEditingBlockMode } from '@canvas-app/store/canvas-store-types'

export const RAW_BLOCK_SOURCE_ATTRIBUTE = 'data-canvas-block-source-kind'
export const SPECIAL_BLOCK_KIND_ATTRIBUTE = 'data-canvas-special-block-kind'

type RawBlockSourceKind = 'code' | 'html' | 'special'

export function isNavigableBlockNodeName(name: string) {
  return name === 'wysiwygCodeBlock'
    || name === 'wysiwygSpecialFencedBlock'
    || name === 'wysiwygHtmlFallbackBlock'
}

export function isNavigableBlockSelection(selection: Selection) {
  return selection instanceof NodeSelection && isNavigableBlockNodeName(selection.node.type.name)
}

export function isSelectionInsideTable(selection: Selection) {
  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const tableRole = selection.$from.node(depth).type.spec.tableRole

    if (tableRole === 'table' || tableRole === 'row' || tableRole === 'cell' || tableRole === 'header_cell') {
      return true
    }
  }

  return false
}

export function readEditorDerivedBlockMode(
  editorRoot: HTMLElement,
  activeElement: Element | null
): CanvasEditingBlockMode {
  if (!(activeElement instanceof HTMLElement) || !editorRoot.contains(activeElement)) {
    return { status: 'none' }
  }

  const sourceElement = activeElement.closest(`[${RAW_BLOCK_SOURCE_ATTRIBUTE}]`)

  if (!(sourceElement instanceof HTMLElement)) {
    return { status: 'none' }
  }

  const sourceKind = sourceElement.getAttribute(RAW_BLOCK_SOURCE_ATTRIBUTE) as RawBlockSourceKind | null

  if (sourceKind === 'code') {
    return { status: 'code-fenced-source' }
  }

  if (sourceKind === 'html') {
    return { status: 'html-fallback' }
  }

  if (sourceKind === 'special') {
    const blockKind = sourceElement.getAttribute(SPECIAL_BLOCK_KIND_ATTRIBUTE)

    return {
      status: 'special-fenced-source',
      blockKind: blockKind === 'sandpack' ? 'sandpack' : 'mermaid'
    }
  }

  return { status: 'none' }
}
