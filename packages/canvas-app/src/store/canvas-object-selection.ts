import type { CanvasGroup } from '@boardmark/canvas-domain'
import type { CanvasNodeMove, CanvasStoreState } from '@canvas-app/store/canvas-store-types'

export type CanvasSelectionSnapshot = Pick<
  CanvasStoreState,
  | 'edges'
  | 'groupSelectionState'
  | 'groups'
  | 'nodes'
  | 'selectedEdgeIds'
  | 'selectedGroupIds'
  | 'selectedNodeIds'
>

export type CanvasDocumentSelection = {
  groupIds: string[]
  nodeIds: string[]
  edgeIds: string[]
}

export function hasAnySelection(state: CanvasSelectionSnapshot) {
  return state.selectedGroupIds.length + state.selectedNodeIds.length + state.selectedEdgeIds.length > 0
}

export function hasDeletableSelection(state: CanvasSelectionSnapshot) {
  return hasAnyIds(readUnlockedDocumentSelection(state))
}

export function hasDuplicableSelection(state: CanvasSelectionSnapshot) {
  return hasAnyIds(readClipboardSelection(state, false))
}

export function hasNudgeableSelection(state: CanvasSelectionSnapshot) {
  return readUnlockedNodeSelection(state).length > 0
}

export function hasArrangeableSelection(state: CanvasSelectionSnapshot) {
  return hasAnyIds(readArrangeableSelection(state))
}

export function hasLockableSelection(state: CanvasSelectionSnapshot) {
  const selection = readLockSelectionTargets(state)

  return (
    selection.groups.some((group) => !group.locked) ||
    selection.nodes.some((node) => !node.locked) ||
    selection.edges.some((edge) => !edge.locked)
  )
}

export function hasUnlockableSelection(state: CanvasSelectionSnapshot) {
  const selection = readLockSelectionTargets(state)

  return (
    selection.groups.some((group) => group.locked) ||
    selection.nodes.some((node) => node.locked) ||
    selection.edges.some((edge) => edge.locked)
  )
}

export function hasGroupableSelection(state: CanvasSelectionSnapshot) {
  return (
    state.selectedGroupIds.length === 0 &&
    state.selectedEdgeIds.length === 0 &&
    readGroupableNodeIds(state).length >= 2
  )
}

export function hasUngroupableSelection(state: CanvasSelectionSnapshot) {
  return state.groupSelectionState.status !== 'drilldown' && readSelectedGroups(state)
    .some((group) => !group.locked)
}

export function readArrangeableSelection(state: CanvasSelectionSnapshot): CanvasDocumentSelection {
  const groupIds = readSelectedGroups(state)
    .filter((group) => !group.locked)
    .map((group) => group.id)
  const nodeIds = [...new Set(state.selectedNodeIds)]
    .filter((nodeId) => isTopLevelNode(state, nodeId))
    .filter((nodeId) => !isNodeLocked(state, nodeId))
  const edgeIds = [...new Set(state.selectedEdgeIds)].filter((edgeId) => !isEdgeLocked(state, edgeId))

  return {
    groupIds,
    nodeIds,
    edgeIds
  }
}

export function readLockSelectionTargetIds(state: CanvasSelectionSnapshot): CanvasDocumentSelection {
  return {
    groupIds: readSelectedGroups(state).map((group) => group.id),
    nodeIds: [...new Set(state.selectedNodeIds)],
    edgeIds: [...new Set(state.selectedEdgeIds)]
  }
}

export function readUnlockedDocumentSelection(state: CanvasSelectionSnapshot): CanvasDocumentSelection {
  return readDocumentSelection(state, { includeLocked: false })
}

export function readDocumentSelection(
  state: CanvasSelectionSnapshot,
  options: {
    includeLocked: boolean
  }
): CanvasDocumentSelection {
  const selectedGroups = readSelectedGroups(state)
    .filter((group) => options.includeLocked || !group.locked)
  const nodeIds = readDocumentSelectionNodeIds(state, selectedGroups, options.includeLocked)
  const selectedNodeIds = new Set(nodeIds)
  const explicitSelectedEdgeIds = [...new Set(state.selectedEdgeIds)]
    .filter((edgeId) => options.includeLocked || !isEdgeLocked(state, edgeId))
  const relatedEdgeIds = state.edges
    .filter((edge) =>
      selectedNodeIds.has(edge.from) &&
      selectedNodeIds.has(edge.to) &&
      (options.includeLocked || !isEdgeLocked(state, edge.id))
    )
    .map((edge) => edge.id)

  return {
    groupIds: selectedGroups.map((group) => group.id),
    nodeIds,
    edgeIds: [...new Set([...explicitSelectedEdgeIds, ...relatedEdgeIds])]
  }
}

export function readUnlockedNodeSelection(state: CanvasSelectionSnapshot) {
  const nodeIds = [
    ...state.selectedNodeIds,
    ...readSelectedGroups(state).flatMap((group) => group.members.nodeIds)
  ]

  return [...new Set(nodeIds)].filter((nodeId) => !isNodeLocked(state, nodeId))
}

export function readSelectedGroups(state: Pick<CanvasSelectionSnapshot, 'groups' | 'selectedGroupIds'>) {
  return state.groups.filter((group) => state.selectedGroupIds.includes(group.id))
}

export function readContainingGroup(state: Pick<CanvasSelectionSnapshot, 'groups'>, nodeId: string) {
  return state.groups.find((group) => group.members.nodeIds.includes(nodeId)) ?? null
}

export function isTopLevelNode(state: Pick<CanvasSelectionSnapshot, 'groups'>, nodeId: string) {
  return readContainingGroup(state, nodeId) === null
}

export function isNodeLocked(
  state: Pick<CanvasSelectionSnapshot, 'groups' | 'nodes'>,
  nodeId: string
) {
  const node = state.nodes.find((entry) => entry.id === nodeId)

  if (!node) {
    return false
  }

  if (node.locked) {
    return true
  }

  return state.groups.some((group) => {
    return group.locked && group.members.nodeIds.includes(nodeId)
  })
}

export function isEdgeLocked(
  state: Pick<CanvasSelectionSnapshot, 'edges' | 'groups' | 'nodes'>,
  edgeId: string
) {
  const edge = state.edges.find((entry) => entry.id === edgeId)

  if (!edge) {
    return false
  }

  if (edge.locked) {
    return true
  }

  return isNodeLocked(state, edge.from) || isNodeLocked(state, edge.to)
}

export function normalizeCommittedNodeMoves(
  moves: CanvasNodeMove[],
  state: Pick<CanvasSelectionSnapshot, 'groupSelectionState' | 'groups' | 'nodes'>
) {
  const normalizedMovesById = new Map<string, CanvasNodeMove>()

  for (const move of moves) {
    if (isNodeLocked(state, move.nodeId)) {
      continue
    }

    const containingGroup = readContainingGroup(state, move.nodeId)

    if (containingGroup) {
      const isAllowedDrilldownMove =
        state.groupSelectionState.status === 'drilldown' &&
        state.groupSelectionState.groupId === containingGroup.id

      if (!isAllowedDrilldownMove) {
        continue
      }
    }

    normalizedMovesById.set(move.nodeId, {
      nodeId: move.nodeId,
      x: Math.round(move.x),
      y: Math.round(move.y)
    })
  }

  return [...normalizedMovesById.values()]
}

function readClipboardSelection(state: CanvasSelectionSnapshot, includeLocked: boolean): CanvasDocumentSelection {
  const selectedGroups = readSelectedGroups(state)
    .filter((group) => includeLocked || !group.locked)
  const groupNodeIds = selectedGroups.flatMap((group) => group.members.nodeIds)
  const selectedNodes = state.nodes.filter((node) => {
    if (!includeLocked && isNodeLocked(state, node.id)) {
      return false
    }

    return state.selectedNodeIds.includes(node.id) || groupNodeIds.includes(node.id)
  })
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id))
  const selectedEdges = state.edges.filter((edge) => {
    if (!includeLocked && isEdgeLocked(state, edge.id)) {
      return false
    }

    if (state.selectedEdgeIds.includes(edge.id)) {
      return true
    }

    return selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to)
  })

  return {
    groupIds: selectedGroups.map((group) => group.id),
    nodeIds: selectedNodes.map((node) => node.id),
    edgeIds: selectedEdges.map((edge) => edge.id)
  }
}

function readDocumentSelectionNodeIds(
  state: CanvasSelectionSnapshot,
  selectedGroups: CanvasGroup[],
  includeLocked: boolean
) {
  const nodeIds = [
    ...state.selectedNodeIds,
    ...selectedGroups.flatMap((group) => group.members.nodeIds)
  ]

  return [...new Set(nodeIds)].filter((nodeId) => includeLocked || !isNodeLocked(state, nodeId))
}

function readLockSelectionTargets(state: CanvasSelectionSnapshot) {
  return {
    groups: readSelectedGroups(state),
    nodes: [...new Set(state.selectedNodeIds)]
      .map((nodeId) => state.nodes.find((node) => node.id === nodeId))
      .filter((node): node is CanvasStoreState['nodes'][number] => node !== undefined),
    edges: [...new Set(state.selectedEdgeIds)]
      .map((edgeId) => state.edges.find((edge) => edge.id === edgeId))
      .filter((edge): edge is CanvasStoreState['edges'][number] => edge !== undefined)
  }
}

function readGroupableNodeIds(state: CanvasSelectionSnapshot) {
  return state.selectedNodeIds
    .filter((nodeId) => isTopLevelNode(state, nodeId))
    .filter((nodeId) => !isNodeLocked(state, nodeId))
}

function hasAnyIds(selection: CanvasDocumentSelection) {
  return selection.groupIds.length + selection.nodeIds.length + selection.edgeIds.length > 0
}
