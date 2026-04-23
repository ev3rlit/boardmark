import type { CanvasDirectiveSourceMap, CanvasEdge, CanvasGroup, CanvasNode } from '@boardmark/canvas-domain'
import { readRangeText } from '@canvas-app/services/edit-compiler-helpers'
import {
  readDocumentSelection,
  type CanvasSelectionSnapshot
} from '@canvas-app/store/canvas-object-selection'
import type { CanvasStoreState } from '@canvas-app/store/canvas-store-types'

const BODY_BLOCK_DELIMITER = '\n\n---\n\n'
const RAW_BLOCK_DELIMITER = '\n\n'

type SelectionPlainTextState = Pick<
  CanvasSelectionSnapshot,
  'edges' | 'groupSelectionState' | 'groups' | 'nodes' | 'selectedEdgeIds' | 'selectedGroupIds' | 'selectedNodeIds'
> & Pick<CanvasStoreState, 'draftSource'>

type SelectedCanvasObject =
  | {
      body?: string
      sourceMap: CanvasDirectiveSourceMap
    }
  | {
      body?: string
      sourceMap: CanvasDirectiveSourceMap
    }
  | {
      body?: string
      sourceMap: CanvasDirectiveSourceMap
    }

export function readSelectionRawText(state: SelectionPlainTextState) {
  if (!state.draftSource) {
    return null
  }

  const objects = readSelectedObjectsInSourceOrder(state)

  if (objects.length === 0) {
    return null
  }

  return objects
    .map((object) => readRangeText(state.draftSource ?? '', object.sourceMap.objectRange))
    .join(RAW_BLOCK_DELIMITER)
}

export function readSelectionMarkdownContentBody(state: SelectionPlainTextState) {
  const objects = readSelectedObjectsInSourceOrder(state)
  const bodies = objects
    .map((object) => readObjectBodyText(state.draftSource, object).replace(/\n+$/g, ''))
    .filter((body) => body.trim().length > 0)

  if (bodies.length === 0) {
    return null
  }

  return bodies.join(BODY_BLOCK_DELIMITER)
}

function readSelectedObjectsInSourceOrder(state: SelectionPlainTextState) {
  const selection = readDocumentSelection(state, {
    includeLocked: true
  })
  const selectedGroupIds = new Set(selection.groupIds)
  const selectedNodeIds = new Set(selection.nodeIds)
  const selectedEdgeIds = new Set(selection.edgeIds)
  const objects: SelectedCanvasObject[] = [
    ...state.groups
      .filter((group) => selectedGroupIds.has(group.id))
      .map((group) => toSelectedCanvasObject(group)),
    ...state.nodes
      .filter((node) => selectedNodeIds.has(node.id))
      .map((node) => toSelectedCanvasObject(node)),
    ...state.edges
      .filter((edge) => selectedEdgeIds.has(edge.id))
      .map((edge) => toSelectedCanvasObject(edge))
  ]

  return objects.sort((left, right) => left.sourceMap.objectRange.start.offset - right.sourceMap.objectRange.start.offset)
}

function readObjectBodyText(
  draftSource: string | null,
  object: SelectedCanvasObject
) {
  if (!draftSource) {
    return object.body ?? ''
  }

  return readRangeText(draftSource, object.sourceMap.bodyRange)
}

function toSelectedCanvasObject(object: CanvasEdge | CanvasGroup | CanvasNode): SelectedCanvasObject {
  return {
    body: object.body,
    sourceMap: object.sourceMap
  }
}
