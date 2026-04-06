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

const ARRANGE_Z_STEP = 100

type ArrangeObjectEntry = {
  id: string
  index: number
  key: string
  kind: 'edge' | 'group' | 'node'
  object: import('@boardmark/canvas-domain').CanvasEdge | import('@boardmark/canvas-domain').CanvasGroup | import('@boardmark/canvas-domain').CanvasNode
  offset: number
  z: number
}

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
  const objects = readArrangeObjects(context.record)

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
  const originalZById = new Map(objects.map((entry) => [entry.key, entry.z]))
  const nextZById =
    intent.mode === 'bring-to-front' || intent.mode === 'send-to-back'
      ? buildAbsoluteArrangeZAssignments(objects, arranged.objects, selectedIds, intent.mode)
      : buildRelativeArrangeZAssignments(objects, arranged.objects, selectedIds, intent.mode)
  const nextObjects = intent.mode === 'bring-to-front' || intent.mode === 'send-to-back'
    ? arranged.objects
    : applyArrangeAssignments(objects, nextZById, selectedIds, intent.mode)

  for (const entry of nextObjects) {
    const nextZ = nextZById.get(entry.key)

    if (nextZ === undefined || nextZ === originalZById.get(entry.key)) {
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

function readArrangeObjects(record: import('@boardmark/canvas-repository').CanvasDocumentRecord): ArrangeObjectEntry[] {
  return [
    ...record.ast.groups.map((group, index) => ({
      id: group.id,
      index,
      key: `group:${group.id}`,
      kind: 'group' as const,
      object: group,
      offset: group.sourceMap.objectRange.start.offset,
      z: group.z ?? 0
    })),
    ...record.ast.nodes.map((node, index) => ({
      id: node.id,
      index,
      key: `node:${node.id}`,
      kind: 'node' as const,
      object: node,
      offset: node.sourceMap.objectRange.start.offset,
      z: node.z ?? 0
    })),
    ...record.ast.edges.map((edge, index) => ({
      id: edge.id,
      index,
      key: `edge:${edge.id}`,
      kind: 'edge' as const,
      object: edge,
      offset: edge.sourceMap.objectRange.start.offset,
      z: edge.z ?? 0
    }))
  ].sort(compareArrangeObjects)
}

function buildAbsoluteArrangeZAssignments(
  objects: ArrangeObjectEntry[],
  arrangedObjects: ArrangeObjectEntry[],
  selectedIds: Set<string>,
  mode: 'bring-to-front' | 'send-to-back'
) {
  const nextZById = new Map<string, number>()
  const maxZ = Math.max(...objects.map((entry) => entry.z))
  const minZ = Math.min(...objects.map((entry) => entry.z))

  if (mode === 'bring-to-front') {
    let nextZ = maxZ + ARRANGE_Z_STEP

    for (const entry of arrangedObjects) {
      if (!selectedIds.has(entry.key)) {
        continue
      }

      nextZById.set(entry.key, nextZ)
      nextZ += ARRANGE_Z_STEP
    }

    return nextZById
  }

  let nextZ = minZ - (ARRANGE_Z_STEP * selectedIds.size)

  for (const entry of arrangedObjects) {
    if (!selectedIds.has(entry.key)) {
      continue
    }

    nextZById.set(entry.key, nextZ)
    nextZ += ARRANGE_Z_STEP
  }

  return nextZById
}

function buildRelativeArrangeZAssignments(
  objects: ArrangeObjectEntry[],
  arrangedObjects: ArrangeObjectEntry[],
  selectedIds: Set<string>,
  mode: 'bring-forward' | 'send-backward'
) {
  const runtimeObjects = objects.map((entry) => ({
    ...entry,
    currentZ: entry.z
  }))
  const nextZById = new Map<string, number>()

  if (mode === 'bring-forward') {
    for (let index = runtimeObjects.length - 2; index >= 0;) {
      if (!selectedIds.has(runtimeObjects[index]!.key)) {
        index -= 1
        continue
      }

      let start = index
      let end = index

      while (start - 1 >= 0 && selectedIds.has(runtimeObjects[start - 1]!.key)) {
        start -= 1
      }

      while (end + 1 < runtimeObjects.length && selectedIds.has(runtimeObjects[end + 1]!.key)) {
        end += 1
      }

      if (end + 1 < runtimeObjects.length) {
        const assignment = resolveForwardArrangeMove(runtimeObjects, start, end)

        if (assignment === null) {
          return buildGlobalArrangeFallback(arrangedObjects)
        }

        const block = runtimeObjects.slice(start, end + 1)
        const nextEntry = runtimeObjects[end + 1]!

        applyRuntimeArrangeAssignments(runtimeObjects, nextZById, assignment)
        runtimeObjects.splice(start, end - start + 2, nextEntry, ...block)
      }

      index = start - 1
    }
  } else {
    for (let index = 1; index < runtimeObjects.length;) {
      if (!selectedIds.has(runtimeObjects[index]!.key)) {
        index += 1
        continue
      }

      let start = index
      let end = index

      while (end + 1 < runtimeObjects.length && selectedIds.has(runtimeObjects[end + 1]!.key)) {
        end += 1
      }

      while (start - 1 >= 0 && selectedIds.has(runtimeObjects[start - 1]!.key)) {
        start -= 1
      }

      if (start > 0) {
        const assignment = resolveBackwardArrangeMove(runtimeObjects, start, end)

        if (assignment === null) {
          return buildGlobalArrangeFallback(arrangedObjects)
        }

        const previousEntry = runtimeObjects[start - 1]!
        const block = runtimeObjects.slice(start, end + 1)

        applyRuntimeArrangeAssignments(runtimeObjects, nextZById, assignment)
        runtimeObjects.splice(start - 1, end - start + 2, ...block, previousEntry)
      }

      index = end + 1
    }
  }

  return nextZById
}

function applyArrangeAssignments(
  objects: ArrangeObjectEntry[],
  nextZById: Map<string, number>,
  selectedIds: Set<string>,
  mode: 'bring-forward' | 'send-backward'
) {
  const nextObjects = objects.map((entry) => ({
    ...entry,
    z: nextZById.get(entry.key) ?? entry.z
  }))
  return reorderArrangeObjects(nextObjects, selectedIds, mode).objects
}

function resolveForwardArrangeMove(
  objects: Array<ArrangeObjectEntry & { currentZ: number }>,
  start: number,
  end: number
) {
  const selectedBlock = objects.slice(start, end + 1)
  const boundary = objects[end + 1]!
  const upperBound = objects[end + 2]?.currentZ

  if (canAllocateArrangeWindow(boundary.currentZ, upperBound, selectedBlock.length)) {
    return new Map(
      selectedBlock.map((entry, index) => [
        entry.key,
        readArrangeZValues(boundary.currentZ, upperBound, selectedBlock.length)[index]!
      ])
    )
  }

  const window = findArrangeRepairWindow(objects, start, end + 1, 'forward')

  if (!window) {
    return null
  }

  return buildWindowArrangeAssignments(
    objects,
    window.start,
    window.end,
    [...objects.slice(window.start, start), boundary, ...selectedBlock, ...objects.slice(end + 2, window.end + 1)]
  )
}

function resolveBackwardArrangeMove(
  objects: Array<ArrangeObjectEntry & { currentZ: number }>,
  start: number,
  end: number
) {
  const boundary = objects[start - 1]!
  const selectedBlock = objects.slice(start, end + 1)
  const lowerBound = objects[start - 2]?.currentZ

  if (canAllocateArrangeWindow(lowerBound, boundary.currentZ, selectedBlock.length)) {
    return new Map(
      selectedBlock.map((entry, index) => [
        entry.key,
        readArrangeZValues(lowerBound, boundary.currentZ, selectedBlock.length)[index]!
      ])
    )
  }

  const window = findArrangeRepairWindow(objects, start - 1, end, 'backward')

  if (!window) {
    return null
  }

  return buildWindowArrangeAssignments(
    objects,
    window.start,
    window.end,
    [...objects.slice(window.start, start - 1), ...selectedBlock, boundary, ...objects.slice(end + 1, window.end + 1)]
  )
}

function findArrangeRepairWindow(
  objects: Array<ArrangeObjectEntry & { currentZ: number }>,
  start: number,
  end: number,
  direction: 'backward' | 'forward'
) {
  const minimumLength = end - start + 1

  for (let extra = 0; extra <= objects.length - minimumLength; extra += 1) {
    const leftExpansions = direction === 'forward'
      ? Array.from({ length: extra + 1 }, (_, index) => index)
      : Array.from({ length: extra + 1 }, (_, index) => extra - index)

    for (const leftExtra of leftExpansions) {
      const rightExtra = extra - leftExtra
      const windowStart = start - leftExtra
      const windowEnd = end + rightExtra

      if (windowStart < 0 || windowEnd >= objects.length) {
        continue
      }

      if (
        canAllocateArrangeWindow(
          objects[windowStart - 1]?.currentZ,
          objects[windowEnd + 1]?.currentZ,
          windowEnd - windowStart + 1
        )
      ) {
        if (windowStart === 0 && windowEnd === objects.length - 1) {
          return null
        }

        return {
          end: windowEnd,
          start: windowStart
        }
      }
    }
  }

  return null
}

function buildWindowArrangeAssignments(
  objects: Array<ArrangeObjectEntry & { currentZ: number }>,
  start: number,
  end: number,
  orderedWindowObjects: Array<ArrangeObjectEntry & { currentZ: number }>
) {
  const zValues = readArrangeZValues(
    objects[start - 1]?.currentZ,
    objects[end + 1]?.currentZ,
    orderedWindowObjects.length
  )

  return new Map(orderedWindowObjects.map((entry, index) => [entry.key, zValues[index]!]))
}

function buildGlobalArrangeFallback(
  objects: ArrangeObjectEntry[]
) {
  const nextZById = new Map<string, number>()
  let nextZ = ARRANGE_Z_STEP

  for (const entry of objects) {
    nextZById.set(entry.key, nextZ)
    nextZ += ARRANGE_Z_STEP
  }

  return nextZById
}

function applyRuntimeArrangeAssignments(
  objects: Array<ArrangeObjectEntry & { currentZ: number }>,
  nextZById: Map<string, number>,
  assignments: Map<string, number>
) {
  for (const entry of objects) {
    const nextZ = assignments.get(entry.key)

    if (nextZ === undefined) {
      continue
    }

    entry.currentZ = nextZ
    nextZById.set(entry.key, nextZ)
  }
}

function canAllocateArrangeWindow(
  lowerExclusive: number | undefined,
  upperExclusive: number | undefined,
  count: number
) {
  if (count <= 0) {
    return true
  }

  if (lowerExclusive === undefined || upperExclusive === undefined) {
    return true
  }

  return upperExclusive - lowerExclusive - 1 >= count
}

function readArrangeZValues(
  lowerExclusive: number | undefined,
  upperExclusive: number | undefined,
  count: number
) {
  if (count <= 0) {
    return []
  }

  if (lowerExclusive === undefined && upperExclusive === undefined) {
    return Array.from({ length: count }, (_, index) => index + 1)
  }

  if (lowerExclusive === undefined) {
    return Array.from({ length: count }, (_, index) => (upperExclusive as number) - count + index)
  }

  if (upperExclusive === undefined) {
    return Array.from({ length: count }, (_, index) => lowerExclusive + index + 1)
  }

  const step = Math.floor((upperExclusive - lowerExclusive) / (count + 1))
  return Array.from({ length: count }, (_, index) => lowerExclusive + (step * (index + 1)))
}

function compareArrangeObjects(left: ArrangeObjectEntry, right: ArrangeObjectEntry) {
  if (left.z !== right.z) {
    return left.z - right.z
  }

  if (left.offset !== right.offset) {
    return left.offset - right.offset
  }

  return left.index - right.index
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
