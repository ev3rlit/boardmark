import type { Edge, EdgeChange, Node, NodeChange } from '@xyflow/react'
import type { CanvasGroup } from '@boardmark/canvas-domain'
import type { CanvasFlowEdgeData, CanvasFlowNodeData } from '@boardmark/canvas-renderer'

export function filterSelectionChanges<T extends { type: string }>(
  changes: T[],
  allowSelectionChanges: boolean
) {
  if (allowSelectionChanges) {
    return changes
  }

  return changes.filter((change) => change.type !== 'select')
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
