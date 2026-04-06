import { err, ok } from 'neverthrow'
import {
  buildClipboardEdgeMetadata,
  buildClipboardNodeMetadata,
  buildGroupBlock,
  buildObjectBlock,
  buildPatchedDirectiveHeaderLine,
  buildEdgeMetadata,
  buildNodeMetadata,
  compareByZ,
  createDocumentEndInsertEdit,
  createReplaceEdit,
  createTransaction,
  patchLockedMetadata,
  readArrangeHeaderName,
  readCurrentMaxZ,
  readGroupIdFromBlock,
  readGroupZFromBlock,
  readMetadataRecord,
  readNextClipboardNodeId,
  readNextGroupId,
  readNextId,
  readNextObjectId,
  readRangeText,
  reorderArrangeObjects,
  roundGeometry,
  type IntentCompiler
} from '@canvas-app/services/edit-compiler-helpers'
import type { CanvasEditUnit } from '@canvas-app/services/edit-transaction'

const compileDuplicateObjects: IntentCompiler<'duplicate-objects'> = (context, intent) => {
  const requestedNodeIds = [...new Set(intent.nodeIds)]
  const requestedEdgeIds = [...new Set(intent.edgeIds)]
  const existingIds = new Set([
    ...context.record.ast.groups.map((group) => group.id),
    ...context.record.ast.nodes.map((node) => node.id),
    ...context.record.ast.edges.map((edge) => edge.id)
  ])
  const nodeIdMap = new Map<string, string>()
  const blocks: string[] = []
  let nextZ = readCurrentMaxZ(context.record) + 1

  for (const nodeId of requestedNodeIds) {
    const node = context.record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    const nextId = readNextObjectId(node, existingIds)
    existingIds.add(nextId)
    nodeIdMap.set(node.id, nextId)
    blocks.push(
      buildObjectBlock(node.component, {
        ...buildNodeMetadata(node),
        id: nextId,
        z: nextZ,
        at: {
          ...node.at,
          x: roundGeometry(node.at.x + intent.offsetX),
          y: roundGeometry(node.at.y + intent.offsetY),
          w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
          h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
        }
      }, node.body)
    )
    nextZ += 1
  }

  for (const edgeId of requestedEdgeIds) {
    const edge = context.record.ast.edges.find((entry) => entry.id === edgeId)

    if (!edge) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }

    const nextId = readNextId('edge', existingIds)
    existingIds.add(nextId)
    blocks.push(
      buildObjectBlock('edge', {
        ...buildEdgeMetadata(edge),
        id: nextId,
        from: nodeIdMap.get(edge.from) ?? edge.from,
        to: nodeIdMap.get(edge.to) ?? edge.to,
        z: nextZ
      }, edge.body)
    )
    nextZ += 1
  }

  if (blocks.length === 0) {
    return ok(createTransaction(intent, []))
  }

  return ok(createTransaction(intent, [
    createDocumentEndInsertEdit(context.source, blocks.join('\n\n'))
  ]))
}

const compilePasteObjects: IntentCompiler<'paste-objects'> = (context, intent) => {
  const existingIds = new Set([
    ...context.record.ast.groups.map((group) => group.id),
    ...context.record.ast.nodes.map((node) => node.id),
    ...context.record.ast.edges.map((edge) => edge.id)
  ])
  const nodeIdMap = new Map<string, string>()
  const groupIdMap = new Map<string, string>()
  const blocks: Array<{ block: string; z: number }> = []
  const nextBaseZ = readCurrentMaxZ(context.record) + 1
  const delta = readClipboardSelectionDelta(intent)
  let nextZ = nextBaseZ

  for (const group of [...intent.payload.groups].sort(compareByZ)) {
    const nextGroupId = readNextGroupId(existingIds)
    existingIds.add(nextGroupId)
    groupIdMap.set(group.id, nextGroupId)
    blocks.push({
      z: group.z ?? 0,
      block: buildGroupBlock({
        id: nextGroupId,
        z: nextZ,
        locked: group.locked,
        nodeIds: group.members.nodeIds
      })
    })
    nextZ += 1
  }

  for (const node of [...intent.payload.nodes].sort(compareByZ)) {
    const nextId = readNextClipboardNodeId(node, existingIds)
    existingIds.add(nextId)
    nodeIdMap.set(node.id, nextId)
    blocks.push({
      z: node.z ?? 0,
      block: buildObjectBlock(node.component, {
        ...buildClipboardNodeMetadata(node, delta),
        id: nextId,
        z: nextZ
      }, node.body)
    })
    nextZ += 1
  }

  for (const edge of [...intent.payload.edges].sort(compareByZ)) {
    const nextId = readNextId('edge', existingIds)
    existingIds.add(nextId)
    blocks.push({
      z: edge.z ?? 0,
      block: buildObjectBlock('edge', {
        ...buildClipboardEdgeMetadata(edge),
        id: nextId,
        from: nodeIdMap.get(edge.from) ?? edge.from,
        to: nodeIdMap.get(edge.to) ?? edge.to,
        z: nextZ
      }, edge.body)
    })
    nextZ += 1
  }

  for (const block of blocks) {
    if (!block.block.includes('yaml members')) {
      continue
    }

    const groupId = readGroupIdFromBlock(block.block)

    if (!groupId) {
      continue
    }

    const originalGroupId = [...groupIdMap.entries()].find(([, mappedGroupId]) => mappedGroupId === groupId)?.[0]

    if (!originalGroupId) {
      continue
    }

    const originalGroup = intent.payload.groups.find((entry) => entry.id === originalGroupId)

    if (!originalGroup) {
      continue
    }

    block.block = buildGroupBlock({
      id: groupId,
      z: readGroupZFromBlock(block.block) ?? block.z,
      locked: originalGroup.locked,
      nodeIds: originalGroup.members.nodeIds.map((nodeId) => nodeIdMap.get(nodeId) ?? nodeId)
    })
  }

  if (blocks.length === 0) {
    return ok(createTransaction(intent, []))
  }

  return ok(createTransaction(intent, [
    createDocumentEndInsertEdit(
      context.source,
      blocks
        .sort((left, right) => left.z - right.z)
        .map((entry) => entry.block)
        .join('\n\n')
    )
  ]))
}

const compileNudgeObjects: IntentCompiler<'nudge-objects'> = (context, intent) => {
  const requestedNodeIds = [...new Set(intent.nodeIds)]

  if (requestedNodeIds.length === 0) {
    return ok(createTransaction(intent, []))
  }

  const edits: CanvasEditUnit[] = []

  for (const nodeId of requestedNodeIds) {
    const node = context.record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(
      context.source,
      node.sourceMap.headerLineRange,
      node.component,
      (metadata) => ({
        ...metadata,
        at: {
          ...readMetadataRecord(metadata.at),
          x: roundGeometry(node.at.x + intent.dx),
          y: roundGeometry(node.at.y + intent.dy),
          w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
          h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
        }
      })
    )

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    edits.push(createReplaceEdit({
      anchor: {
        kind: 'header-line',
        objectId: node.id,
        objectKind: 'node'
      },
      expectedSource: readRangeText(context.source, node.sourceMap.headerLineRange),
      range: node.sourceMap.headerLineRange,
      replacement: replacement.value,
      structuralImpact: 'none'
    }))
  }

  return ok(createTransaction(intent, edits))
}

const compileArrangeObjects: IntentCompiler<'arrange-objects'> = (context, intent) => {
  const selectedIds = new Set([
    ...(intent.groupIds ?? []).map((groupId) => `group:${groupId}`),
    ...intent.nodeIds.map((nodeId) => `node:${nodeId}`),
    ...intent.edgeIds.map((edgeId) => `edge:${edgeId}`)
  ])
  const objects = [
    ...context.record.ast.groups.map((group, index) => ({
      id: group.id,
      index,
      kind: 'group' as const,
      object: group,
      offset: group.sourceMap.objectRange.start.offset,
      z: group.z ?? 0
    })),
    ...context.record.ast.nodes.map((node, index) => ({
      id: node.id,
      index,
      kind: 'node' as const,
      object: node,
      offset: node.sourceMap.objectRange.start.offset,
      z: node.z ?? 0
    })),
    ...context.record.ast.edges.map((edge, index) => ({
      id: edge.id,
      index,
      kind: 'edge' as const,
      object: edge,
      offset: edge.sourceMap.objectRange.start.offset,
      z: edge.z ?? 0
    }))
  ].sort((left, right) => {
    if (left.z !== right.z) {
      return left.z - right.z
    }

    if (left.offset !== right.offset) {
      return left.offset - right.offset
    }

    return left.index - right.index
  })

  for (const groupId of [...new Set(intent.groupIds ?? [])]) {
    if (!context.record.ast.groups.some((group) => group.id === groupId)) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }
  }

  for (const nodeId of [...new Set(intent.nodeIds)]) {
    if (!context.record.ast.nodes.some((node) => node.id === nodeId)) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }
  }

  for (const edgeId of [...new Set(intent.edgeIds)]) {
    if (!context.record.ast.edges.some((edge) => edge.id === edgeId)) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }
  }

  const arranged = reorderArrangeObjects(objects, selectedIds, intent.mode)

  if (!arranged.changed) {
    return ok(createTransaction(intent, []))
  }

  const edits: CanvasEditUnit[] = []
  const maxZ = Math.max(...objects.map((entry) => entry.z))
  const minZ = Math.min(...objects.map((entry) => entry.z))
  const nextZById = new Map<string, number>()

  if (intent.mode === 'bring-to-front') {
    let nextZ = maxZ + 1

    for (const entry of arranged.objects) {
      if (!selectedIds.has(`${entry.kind}:${entry.id}`)) {
        continue
      }

      nextZById.set(`${entry.kind}:${entry.id}`, nextZ)
      nextZ += 1
    }
  } else if (intent.mode === 'send-to-back') {
    let nextZ = minZ - selectedIds.size

    for (const entry of arranged.objects) {
      if (!selectedIds.has(`${entry.kind}:${entry.id}`)) {
        continue
      }

      nextZById.set(`${entry.kind}:${entry.id}`, nextZ)
      nextZ += 1
    }
  } else {
    for (const [index, entry] of arranged.objects.entries()) {
      nextZById.set(`${entry.kind}:${entry.id}`, index + 1)
    }
  }

  for (const entry of arranged.objects) {
    const nextZ = nextZById.get(`${entry.kind}:${entry.id}`)

    if (nextZ === undefined || nextZ === entry.z) {
      continue
    }

    const replacement = buildPatchedDirectiveHeaderLine(
      context.source,
      entry.object.sourceMap.headerLineRange,
      readArrangeHeaderName(entry.kind, entry.object),
      (metadata) => ({
        ...metadata,
        z: nextZ
      })
    )

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    edits.push(createReplaceEdit({
      anchor: {
        kind: 'header-line',
        objectId: entry.id,
        objectKind: entry.kind
      },
      expectedSource: readRangeText(context.source, entry.object.sourceMap.headerLineRange),
      range: entry.object.sourceMap.headerLineRange,
      replacement: replacement.value,
      structuralImpact: 'none'
    }))
  }

  return ok(createTransaction(intent, edits))
}

const compileSetObjectsLocked: IntentCompiler<'set-objects-locked'> = (context, intent) => {
  const edits: CanvasEditUnit[] = []

  for (const groupId of [...new Set(intent.groupIds ?? [])]) {
    const group = context.record.ast.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(context.source, group.sourceMap.headerLineRange, 'group', (metadata) => {
      return patchLockedMetadata(metadata, intent.locked)
    })

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    edits.push(createReplaceEdit({
      anchor: {
        kind: 'header-line',
        objectId: group.id,
        objectKind: 'group'
      },
      expectedSource: readRangeText(context.source, group.sourceMap.headerLineRange),
      range: group.sourceMap.headerLineRange,
      replacement: replacement.value,
      structuralImpact: 'none'
    }))
  }

  for (const nodeId of [...new Set(intent.nodeIds)]) {
    const node = context.record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(context.source, node.sourceMap.headerLineRange, node.component, (metadata) => {
      return patchLockedMetadata(metadata, intent.locked)
    })

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    edits.push(createReplaceEdit({
      anchor: {
        kind: 'header-line',
        objectId: node.id,
        objectKind: 'node'
      },
      expectedSource: readRangeText(context.source, node.sourceMap.headerLineRange),
      range: node.sourceMap.headerLineRange,
      replacement: replacement.value,
      structuralImpact: 'none'
    }))
  }

  for (const edgeId of [...new Set(intent.edgeIds)]) {
    const edge = context.record.ast.edges.find((entry) => entry.id === edgeId)

    if (!edge) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(context.source, edge.sourceMap.headerLineRange, 'edge', (metadata) => {
      return patchLockedMetadata(metadata, intent.locked)
    })

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    edits.push(createReplaceEdit({
      anchor: {
        kind: 'header-line',
        objectId: edge.id,
        objectKind: 'edge'
      },
      expectedSource: readRangeText(context.source, edge.sourceMap.headerLineRange),
      range: edge.sourceMap.headerLineRange,
      replacement: replacement.value,
      structuralImpact: 'none'
    }))
  }

  return ok(createTransaction(intent, edits))
}

export const selectionIntentCompilers = {
  'arrange-objects': compileArrangeObjects,
  'duplicate-objects': compileDuplicateObjects,
  'nudge-objects': compileNudgeObjects,
  'paste-objects': compilePasteObjects,
  'set-objects-locked': compileSetObjectsLocked
} satisfies {
  [K in
    | 'arrange-objects'
    | 'duplicate-objects'
    | 'nudge-objects'
    | 'paste-objects'
    | 'set-objects-locked'
  ]: IntentCompiler<K>
}

function readClipboardSelectionDelta(
  intent: Extract<import('@canvas-app/services/edit-intents').CanvasDocumentEditIntent, { kind: 'paste-objects' }>
) {
  if (intent.inPlace || !intent.payload.origin) {
    return { x: 0, y: 0 }
  }

  return {
    x: roundGeometry(intent.anchorX - intent.payload.origin.x),
    y: roundGeometry(intent.anchorY - intent.payload.origin.y)
  }
}
