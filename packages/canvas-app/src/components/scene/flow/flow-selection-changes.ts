import type { Edge, EdgeChange, Node, NodeChange } from '@xyflow/react'
import type { CanvasGroup, CanvasNode } from '@boardmark/canvas-domain'
import type { CanvasFlowEdgeData, CanvasFlowNodeData } from '@boardmark/canvas-renderer'
import {
  normalizeCommittedNodeMoves
} from '@canvas-app/store/canvas-object-selection'
import type {
  CanvasGroupSelectionState
} from '@canvas-app/store/canvas-store-types'

export function filterSelectionChanges<T extends { type: string }>(
  changes: T[],
  allowSelectionChanges: boolean
) {
  if (allowSelectionChanges) {
    return changes
  }

  return changes.filter((change) => change.type !== 'select')
}

export function readSelectionChangeEntries<T extends { type: string }>(
  changes: T[]
) {
  return changes
    .filter((change): change is T & { id: string; selected?: boolean } => {
      return change.type === 'select' && 'id' in change
    })
    .map((change) => ({
      id: change.id,
      selected: Boolean(change.selected)
    }))
}

export function readNodeSelectionChangeResult(
  changes: NodeChange<Node<CanvasFlowNodeData>>[]
) {
  return readSelectionChangeEntries(changes)
}

export function readEdgeSelectionChangeResult(
  changes: EdgeChange<Edge<CanvasFlowEdgeData>>[]
) {
  return readSelectionChangeEntries(changes)
}

export function applyNodeChangesToStore({
  changes,
  groups,
  replaceSelection,
  selectedEdgeIds,
  selectedNodeIds
}: {
  changes: NodeChange<Node<CanvasFlowNodeData>>[]
  groups: CanvasGroup[]
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
  }) => void
  selectedEdgeIds: string[]
  selectedNodeIds: string[]
}) {
  const nextSelectedNodeIds = new Set(selectedNodeIds)
  let selectionChanged = false

  for (const change of changes) {
    if (change.type === 'select') {
      selectionChanged = true

      if (change.selected) {
        nextSelectedNodeIds.add(change.id)
      } else {
        nextSelectedNodeIds.delete(change.id)
      }
    }
  }

  if (selectionChanged) {
    const normalized = normalizeTopLevelNodeSelection([...nextSelectedNodeIds], groups)

    replaceSelection({
      groupIds: normalized.groupIds,
      nodeIds: normalized.nodeIds,
      edgeIds: selectedEdgeIds
    })
  }
}

export function applyNodeSelectionChanges({
  changes,
  groups,
  replaceSelection,
  selectedEdgeIds,
  selectedNodeIds
}: {
  changes: Array<{
    id: string
    selected: boolean
  }>
  groups: CanvasGroup[]
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
  }) => void
  selectedEdgeIds: string[]
  selectedNodeIds: string[]
}) {
  const nextSelectedNodeIds = new Set(selectedNodeIds)

  for (const change of changes) {
    if (change.selected) {
      nextSelectedNodeIds.add(change.id)
    } else {
      nextSelectedNodeIds.delete(change.id)
    }
  }

  const normalized = normalizeTopLevelNodeSelection([...nextSelectedNodeIds], groups)

  replaceSelection({
    groupIds: normalized.groupIds,
    nodeIds: normalized.nodeIds,
    edgeIds: selectedEdgeIds
  })
}

export const applyNodeSelectionChangeResult = applyNodeSelectionChanges

export function applyEdgeChangesToStore({
  changes,
  replaceSelection,
  selectedGroupIds,
  selectedNodeIds,
  selectedEdgeIds
}: {
  changes: EdgeChange<Edge<CanvasFlowEdgeData>>[]
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
  }) => void
  selectedGroupIds: string[]
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
}) {
  const nextSelectedEdgeIds = new Set(selectedEdgeIds)
  let selectionChanged = false

  for (const change of changes) {
    if (change.type !== 'select') {
      continue
    }

    selectionChanged = true

    if (change.selected) {
      nextSelectedEdgeIds.add(change.id)
    } else {
      nextSelectedEdgeIds.delete(change.id)
    }
  }

  if (selectionChanged) {
    replaceSelection({
      groupIds: selectedGroupIds,
      nodeIds: selectedNodeIds,
      edgeIds: [...nextSelectedEdgeIds]
    })
  }
}

export function applyEdgeSelectionChanges({
  changes,
  replaceSelection,
  selectedGroupIds,
  selectedNodeIds,
  selectedEdgeIds
}: {
  changes: Array<{
    id: string
    selected: boolean
  }>
  replaceSelection: (input: {
    groupIds: string[]
    nodeIds: string[]
    edgeIds: string[]
  }) => void
  selectedGroupIds: string[]
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
}) {
  const nextSelectedEdgeIds = new Set(selectedEdgeIds)

  for (const change of changes) {
    if (change.selected) {
      nextSelectedEdgeIds.add(change.id)
    } else {
      nextSelectedEdgeIds.delete(change.id)
    }
  }

  replaceSelection({
    groupIds: selectedGroupIds,
    nodeIds: selectedNodeIds,
    edgeIds: [...nextSelectedEdgeIds]
  })
}

export const applyEdgeSelectionChangeResult = applyEdgeSelectionChanges

export function normalizeTopLevelNodeSelection(nodeIds: string[], groups: CanvasGroup[]) {
  const normalizedGroupIds = new Set<string>()
  const normalizedNodeIds = new Set<string>()

  for (const nodeId of nodeIds) {
    const containingGroup = groups.find((group) => group.members.nodeIds.includes(nodeId))

    if (containingGroup) {
      normalizedGroupIds.add(containingGroup.id)
      continue
    }

    normalizedNodeIds.add(nodeId)
  }

  return {
    groupIds: [...normalizedGroupIds],
    nodeIds: [...normalizedNodeIds]
  }
}

export function readCommittedNodeMovesFromDraggedNodes(input: {
  draggedNodes: Node<CanvasFlowNodeData>[]
  groupSelectionState: CanvasGroupSelectionState
  groups: CanvasGroup[]
  nodes: CanvasNode[]
}) {
  return normalizeCommittedNodeMoves(
    input.draggedNodes.map((node) => ({
      nodeId: node.id,
      x: node.position.x,
      y: node.position.y
    })),
    {
      groupSelectionState: input.groupSelectionState,
      groups: input.groups,
      nodes: input.nodes
    }
  )
}
