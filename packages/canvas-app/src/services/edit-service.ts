import { load } from 'js-yaml'
import { err, ok, type Result } from 'neverthrow'
import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import type {
  CanvasDirectiveSourceMap,
  CanvasEdge,
  CanvasGroup,
  CanvasGroupMembership,
  CanvasNode,
  CanvasSourceRange
} from '@boardmark/canvas-domain'
import type {
  CanvasClipboardEdge,
  CanvasClipboardGroup,
  CanvasClipboardNode,
  CanvasClipboardPayload
} from '@canvas-app/store/canvas-store-types'
import type { CanvasObjectArrangeMode } from '@canvas-app/canvas-object-types'

export type CanvasDocumentEditIntent =
  | { kind: 'replace-object-body'; objectId: string; markdown: string }
  | { kind: 'move-node'; nodeId: string; x: number; y: number }
  | { kind: 'resize-node'; nodeId: string; x: number; y: number; width: number; height: number }
  | { kind: 'duplicate-objects'; nodeIds: string[]; edgeIds: string[]; offsetX: number; offsetY: number }
  | { kind: 'paste-objects'; payload: CanvasClipboardPayload; anchorX: number; anchorY: number; inPlace: boolean }
  | { kind: 'nudge-objects'; nodeIds: string[]; dx: number; dy: number }
  | { kind: 'arrange-objects'; groupIds?: string[]; nodeIds: string[]; edgeIds: string[]; mode: CanvasObjectArrangeMode }
  | { kind: 'set-objects-locked'; groupIds?: string[]; nodeIds: string[]; edgeIds: string[]; locked: boolean }
  | {
      kind: 'create-note'
      anchorNodeId?: string
      x: number
      y: number
      width: number
      height: number
      markdown: string
    }
  | {
      kind: 'create-shape'
      anchorNodeId?: string
      body: string
      component: string
      x: number
      y: number
      width: number
      height: number
    }
  | {
      kind: 'create-image'
      anchorNodeId?: string
      id: string
      src: string
      alt: string
      title?: string
      lockAspectRatio: boolean
      x: number
      y: number
      width: number
      height: number
    }
  | {
      kind: 'replace-image-source'
      nodeId: string
      src: string
      alt: string
      title?: string
    }
  | {
      kind: 'update-image-metadata'
      nodeId: string
      alt?: string
      title?: string
      lockAspectRatio?: boolean
    }
  | {
      kind: 'delete-objects'
      groupIds?: string[]
      nodeIds: string[]
      edgeIds: string[]
    }
  | { kind: 'upsert-group'; groupId: string; nodeIds: string[]; z: number; locked?: boolean }
  | { kind: 'delete-groups'; groupIds: string[] }
  | { kind: 'delete-node'; nodeId: string }
  | { kind: 'update-edge-endpoints'; edgeId: string; from: string; to: string }
  | { kind: 'replace-edge-body'; edgeId: string; markdown: string }
  | { kind: 'create-edge'; from: string; to: string; markdown: string }
  | { kind: 'delete-edge'; edgeId: string }

export type CanvasDocumentEditResult = {
  source: string
  dirty: boolean
}

export type CanvasDocumentEditError = {
  kind:
    | 'object-not-found'
    | 'invalid-object'
    | 'invalid-patch'
    | 'invalid-intent'
  message: string
}

export type CanvasDocumentEditService = {
  apply: (
    source: string,
    record: CanvasDocumentRecord,
    intent: CanvasDocumentEditIntent
  ) => Result<CanvasDocumentEditResult, CanvasDocumentEditError>
}

type ParsedDirectiveHeader = {
  metadata: Record<string, unknown>
  name: string
}

export function createCanvasDocumentEditService(): CanvasDocumentEditService {
  return {
    apply(source, record, intent) {
      switch (intent.kind) {
        case 'move-node':
          return patchNodeMetadata(source, record, intent.nodeId, (metadata) => ({
            ...metadata,
            at: {
              ...readMetadataRecord(metadata.at),
              x: roundGeometry(intent.x),
              y: roundGeometry(intent.y)
            }
          }))
        case 'resize-node':
          return patchNodeMetadata(source, record, intent.nodeId, (metadata) => ({
            ...metadata,
            at: {
              ...readMetadataRecord(metadata.at),
              x: roundGeometry(intent.x),
              y: roundGeometry(intent.y),
              w: Math.max(120, roundGeometry(intent.width)),
              h: Math.max(120, roundGeometry(intent.height))
            }
          }))
        case 'duplicate-objects':
          return duplicateObjects(source, record, intent)
        case 'paste-objects':
          return pasteObjects(source, record, intent)
        case 'nudge-objects':
          return nudgeObjects(source, record, intent)
        case 'arrange-objects':
          return arrangeObjects(source, record, intent)
        case 'set-objects-locked':
          return setObjectsLocked(source, record, intent)
        case 'update-edge-endpoints':
          return patchEdgeMetadata(source, record, intent.edgeId, (metadata) => ({
            ...metadata,
            from: intent.from,
            to: intent.to
          }))
        case 'replace-object-body':
          return replaceBodyRange(
            source,
            record.ast.nodes.find((node) => node.id === intent.objectId),
            intent.markdown
          )
        case 'replace-edge-body':
          return replaceBodyRange(
            source,
            record.ast.edges.find((edge) => edge.id === intent.edgeId),
            intent.markdown
          )
        case 'create-note':
          return createNote(source, record, intent)
        case 'create-shape':
          return createShape(source, record, intent)
        case 'create-image':
          return createImage(source, record, intent)
        case 'replace-image-source':
          return patchNodeMetadata(source, record, intent.nodeId, (metadata) => ({
            ...metadata,
            src: intent.src,
            alt: intent.alt,
            title: intent.title
          }))
        case 'update-image-metadata':
          return patchNodeMetadata(source, record, intent.nodeId, (metadata) => ({
            ...metadata,
            alt: intent.alt ?? metadata.alt ?? '',
            title: intent.title === undefined ? metadata.title : intent.title,
            lockAspectRatio: intent.lockAspectRatio ?? metadata.lockAspectRatio ?? true
          }))
        case 'delete-objects':
          return deleteObjects(source, record, intent)
        case 'upsert-group':
          return upsertGroup(source, record, intent)
        case 'delete-groups':
          return deleteGroups(source, record, intent)
        case 'delete-node':
          return deleteNode(source, record, intent.nodeId)
        case 'create-edge':
          return createEdge(source, record, intent)
        case 'delete-edge':
          return deleteEdge(source, record, intent.edgeId)
        default:
          return err({
            kind: 'invalid-intent',
            message: `Unsupported edit intent "${exhaustiveGuard(intent)}".`
          })
      }
    }
  }
}

function patchNodeMetadata(
  source: string,
  record: CanvasDocumentRecord,
  nodeId: string,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const node = record.ast.nodes.find((entry) => entry.id === nodeId)

  if (!node) {
    return err({
      kind: 'object-not-found',
      message: `Node "${nodeId}" was not found in the current document.`
    })
  }

  return replaceDirectiveHeader(source, node.sourceMap, node.component, patch)
}

function patchEdgeMetadata(
  source: string,
  record: CanvasDocumentRecord,
  edgeId: string,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const edge = record.ast.edges.find((entry) => entry.id === edgeId)

  if (!edge) {
    return err({
      kind: 'object-not-found',
      message: `Edge "${edgeId}" was not found in the current document.`
    })
  }

  return replaceDirectiveHeader(source, edge.sourceMap, 'edge', patch)
}

function replaceDirectiveHeader(
  source: string,
  sourceMap: CanvasDirectiveSourceMap,
  expectedName: string,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const openingLine = readRangeText(source, sourceMap.headerLineRange)
  const parseResult = parseDirectiveHeader(openingLine)

  if (parseResult.isErr()) {
    return err(parseResult.error)
  }

  if (parseResult.value.name !== expectedName) {
    return err({
      kind: 'invalid-object',
      message: `Cannot patch "${expectedName}" metadata on a "${parseResult.value.name}" directive.`
    })
  }

  const nextOpeningLine = stringifyDirectiveHeader(
    parseResult.value.name,
    patch(parseResult.value.metadata)
  )

  return ok({
    source: replaceRange(source, sourceMap.headerLineRange, nextOpeningLine),
    dirty: true
  })
}

function replaceBodyRange(
  source: string,
  object: CanvasNode | CanvasEdge | undefined,
  markdown: string
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  if (!object) {
    return err({
      kind: 'object-not-found',
      message: 'The target object was not found in the current document.'
    })
  }

  return ok({
    source: replaceRange(source, object.sourceMap.bodyRange, serializeBodyFragment(markdown)),
    dirty: true
  })
}

function createNote(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'create-note' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const nextId = readNextId(
    'note',
    new Set([
      ...record.ast.groups.map((group) => group.id),
      ...record.ast.nodes.map((node) => node.id),
      ...record.ast.edges.map((edge) => edge.id)
    ])
  )
  const block = [
    stringifyDirectiveHeader('note', {
      id: nextId,
      at: {
        x: roundGeometry(intent.x),
        y: roundGeometry(intent.y),
        w: roundGeometry(intent.width),
        h: roundGeometry(intent.height)
      }
    }),
    ...serializeBodyFragment(intent.markdown).split('\n').filter((line, index, lines) => {
      return !(index === lines.length - 1 && line === '')
    }),
    ':::'
  ].join('\n')

  return ok({
    source: insertObjectBlock(
      source,
      block,
      record.ast.nodes.find((node) => node.id === intent.anchorNodeId)?.sourceMap.objectRange.end.offset
    ),
    dirty: true
  })
}

function createShape(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'create-shape' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const nextId = readNextId(
    'shape',
    new Set([
      ...record.ast.groups.map((group) => group.id),
      ...record.ast.nodes.map((node) => node.id),
      ...record.ast.edges.map((edge) => edge.id)
    ])
  )
  const metadata: Record<string, unknown> = {
    id: nextId,
    at: {
      x: roundGeometry(intent.x),
      y: roundGeometry(intent.y),
      w: roundGeometry(intent.width),
      h: roundGeometry(intent.height)
    }
  }

  const block = [
    stringifyDirectiveHeader(intent.component, metadata),
    ...serializeBodyFragment(intent.body).split('\n').filter((line, index, lines) => {
      return !(index === lines.length - 1 && line === '')
    }),
    ':::'
  ].join('\n')

  return ok({
    source: insertObjectBlock(
      source,
      block,
      record.ast.nodes.find((node) => node.id === intent.anchorNodeId)?.sourceMap.objectRange.end.offset
    ),
    dirty: true
  })
}

function createImage(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'create-image' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const block = [
    stringifyDirectiveHeader('image', {
      id: intent.id,
      src: intent.src,
      alt: intent.alt,
      title: intent.title,
      lockAspectRatio: intent.lockAspectRatio,
      at: {
        x: roundGeometry(intent.x),
        y: roundGeometry(intent.y),
        w: roundGeometry(intent.width),
        h: roundGeometry(intent.height)
      }
    }),
    ':::'
  ].join('\n')

  return ok({
    source: insertObjectBlock(
      source,
      block,
      record.ast.nodes.find((node) => node.id === intent.anchorNodeId)?.sourceMap.objectRange.end.offset
    ),
    dirty: true
  })
}

function duplicateObjects(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'duplicate-objects' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const requestedNodeIds = [...new Set(intent.nodeIds)]
  const requestedEdgeIds = [...new Set(intent.edgeIds)]
  const existingIds = new Set([
    ...record.ast.groups.map((group) => group.id),
    ...record.ast.nodes.map((node) => node.id),
    ...record.ast.edges.map((edge) => edge.id)
  ])
  const nodeIdMap = new Map<string, string>()
  const blocks: string[] = []
  let nextZ = readCurrentMaxZ(record) + 1

  for (const nodeId of requestedNodeIds) {
    const node = record.ast.nodes.find((entry) => entry.id === nodeId)

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
    const edge = record.ast.edges.find((entry) => entry.id === edgeId)

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
    return ok({
      source,
      dirty: false
    })
  }

  return ok({
    source: insertObjectBlock(source, blocks.join('\n\n')),
    dirty: true
  })
}

function pasteObjects(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'paste-objects' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const existingIds = new Set([
    ...record.ast.groups.map((group) => group.id),
    ...record.ast.nodes.map((node) => node.id),
    ...record.ast.edges.map((edge) => edge.id)
  ])
  const nodeIdMap = new Map<string, string>()
  const groupIdMap = new Map<string, string>()
  const blocks: Array<{ block: string; z: number }> = []
  const nextBaseZ = readCurrentMaxZ(record) + 1
  const delta = readPasteDelta(intent)
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
    return ok({
      source,
      dirty: false
    })
  }

  return ok({
    source: insertObjectBlock(
      source,
      blocks
        .sort((left, right) => left.z - right.z)
        .map((entry) => entry.block)
        .join('\n\n')
    ),
    dirty: true
  })
}

function deleteNode(
  source: string,
  record: CanvasDocumentRecord,
  nodeId: string
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const node = record.ast.nodes.find((entry) => entry.id === nodeId)

  if (!node) {
    return err({
      kind: 'object-not-found',
      message: `Node "${nodeId}" was not found in the current document.`
    })
  }

  const connectedEdges = record.ast.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId)

  return ok({
    source: removeObjectRanges(
      source,
      [node.sourceMap.objectRange, ...connectedEdges.map((edge) => edge.sourceMap.objectRange)]
    ),
    dirty: true
  })
}

function deleteObjects(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'delete-objects' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const requestedGroupIds = [...new Set(intent.groupIds ?? [])]
  const requestedNodeIds = [...new Set(intent.nodeIds)]
  const requestedEdgeIds = [...new Set(intent.edgeIds)]
  const deletedNodeIds = new Set<string>()
  const ranges: CanvasSourceRange[] = []

  for (const groupId of requestedGroupIds) {
    const group = record.ast.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }

    ranges.push(group.sourceMap.objectRange)

    for (const nodeId of group.members.nodeIds) {
      if (!requestedNodeIds.includes(nodeId)) {
        requestedNodeIds.push(nodeId)
      }
    }
  }

  for (const nodeId of requestedNodeIds) {
    const node = record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    deletedNodeIds.add(nodeId)
    ranges.push(node.sourceMap.objectRange)
  }

  const implicitEdgeIds = new Set(
    record.ast.edges
      .filter((edge) => deletedNodeIds.has(edge.from) || deletedNodeIds.has(edge.to))
      .map((edge) => edge.id)
  )

  for (const edgeId of [...requestedEdgeIds, ...implicitEdgeIds]) {
    const edge = record.ast.edges.find((entry) => entry.id === edgeId)

    if (!edge) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }

    ranges.push(edge.sourceMap.objectRange)
  }

  return ok({
    source: removeObjectRanges(source, dedupeRanges(ranges)),
    dirty: true
  })
}

function upsertGroup(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'upsert-group' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const existingGroup = record.ast.groups.find((entry) => entry.id === intent.groupId)
  const groupBlock = buildGroupBlock({
    id: intent.groupId,
    z: intent.z,
    locked: intent.locked,
    nodeIds: intent.nodeIds
  })

  if (!existingGroup) {
    return ok({
      source: insertObjectBlock(source, groupBlock),
      dirty: true
    })
  }

  return ok({
    source: replaceRange(source, existingGroup.sourceMap.objectRange, groupBlock),
    dirty: true
  })
}

function deleteGroups(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'delete-groups' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const ranges: CanvasSourceRange[] = []

  for (const groupId of [...new Set(intent.groupIds)]) {
    const group = record.ast.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }

    ranges.push(group.sourceMap.objectRange)
  }

  return ok({
    source: removeObjectRanges(source, ranges),
    dirty: true
  })
}

function createEdge(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'create-edge' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  if (intent.from === intent.to) {
    return err({
      kind: 'invalid-intent',
      message: 'Edge endpoints must reference two different nodes.'
    })
  }

  const nextId = readNextId(
    'edge',
    new Set([
      ...record.ast.groups.map((group) => group.id),
      ...record.ast.nodes.map((node) => node.id),
      ...record.ast.edges.map((edge) => edge.id)
    ])
  )
  const block = [
    stringifyDirectiveHeader('edge', {
      id: nextId,
      from: intent.from,
      to: intent.to
    }),
    ...serializeBodyFragment(intent.markdown).split('\n').filter((line, index, lines) => {
      return !(index === lines.length - 1 && line === '')
    }),
    ':::'
  ].join('\n')

  return ok({
    source: insertObjectBlock(source, block),
    dirty: true
  })
}

function deleteEdge(
  source: string,
  record: CanvasDocumentRecord,
  edgeId: string
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const edge = record.ast.edges.find((entry) => entry.id === edgeId)

  if (!edge) {
    return err({
      kind: 'object-not-found',
      message: `Edge "${edgeId}" was not found in the current document.`
    })
  }

  return ok({
    source: removeObjectRanges(source, [edge.sourceMap.objectRange]),
    dirty: true
  })
}

function nudgeObjects(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'nudge-objects' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const requestedNodeIds = [...new Set(intent.nodeIds)]

  if (requestedNodeIds.length === 0) {
    return ok({
      source,
      dirty: false
    })
  }

  const replacements: Array<{ range: CanvasSourceRange; replacement: string }> = []

  for (const nodeId of requestedNodeIds) {
    const node = record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    const openingLine = readRangeText(source, node.sourceMap.headerLineRange)
    const parseResult = parseDirectiveHeader(openingLine)

    if (parseResult.isErr()) {
      return err(parseResult.error)
    }

    replacements.push({
      range: node.sourceMap.headerLineRange,
      replacement: stringifyDirectiveHeader(parseResult.value.name, {
        ...parseResult.value.metadata,
        at: {
          ...readMetadataRecord(parseResult.value.metadata.at),
          x: roundGeometry(node.at.x + intent.dx),
          y: roundGeometry(node.at.y + intent.dy),
          w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
          h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
        }
      })
    })
  }

  return ok({
    source: replaceRanges(source, replacements),
    dirty: true
  })
}

function arrangeObjects(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'arrange-objects' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const selectedIds = new Set([
    ...(intent.groupIds ?? []).map((groupId) => `group:${groupId}`),
    ...intent.nodeIds.map((nodeId) => `node:${nodeId}`),
    ...intent.edgeIds.map((edgeId) => `edge:${edgeId}`)
  ])
  const objects = [
    ...record.ast.groups.map((group, index) => ({
      headerName: 'group',
      id: group.id,
      index,
      kind: 'group' as const,
      object: group,
      offset: group.sourceMap.objectRange.start.offset,
      z: group.z ?? 0
    })),
    ...record.ast.nodes.map((node, index) => ({
      headerName: node.component,
      id: node.id,
      index,
      kind: 'node' as const,
      object: node,
      offset: node.sourceMap.objectRange.start.offset,
      z: node.z ?? 0
    })),
    ...record.ast.edges.map((edge, index) => ({
      headerName: 'edge',
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
    if (!record.ast.groups.some((group) => group.id === groupId)) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }
  }

  for (const nodeId of [...new Set(intent.nodeIds)]) {
    if (!record.ast.nodes.some((node) => node.id === nodeId)) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }
  }

  for (const edgeId of [...new Set(intent.edgeIds)]) {
    if (!record.ast.edges.some((edge) => edge.id === edgeId)) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }
  }

  const arranged = reorderArrangeObjects(objects, selectedIds, intent.mode)

  if (!arranged.changed) {
    return ok({
      source,
      dirty: false
    })
  }

  const replacements: Array<{ range: CanvasSourceRange; replacement: string }> = []
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
      source,
      entry.object.sourceMap.headerLineRange,
      entry.headerName,
      (metadata) => ({
        ...metadata,
        z: nextZ
      })
    )

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    replacements.push({
      range: entry.object.sourceMap.headerLineRange,
      replacement: replacement.value
    })
  }

  return ok({
    source: replaceRanges(source, replacements),
    dirty: true
  })
}

function setObjectsLocked(
  source: string,
  record: CanvasDocumentRecord,
  intent: Extract<CanvasDocumentEditIntent, { kind: 'set-objects-locked' }>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const replacements: Array<{ range: CanvasSourceRange; replacement: string }> = []

  for (const groupId of [...new Set(intent.groupIds ?? [])]) {
    const group = record.ast.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(source, group.sourceMap.headerLineRange, 'group', (metadata) => {
      return patchLockedMetadata(metadata, intent.locked)
    })

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    replacements.push({
      range: group.sourceMap.headerLineRange,
      replacement: replacement.value
    })
  }

  for (const nodeId of [...new Set(intent.nodeIds)]) {
    const node = record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(source, node.sourceMap.headerLineRange, node.component, (metadata) => {
      return patchLockedMetadata(metadata, intent.locked)
    })

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    replacements.push({
      range: node.sourceMap.headerLineRange,
      replacement: replacement.value
    })
  }

  for (const edgeId of [...new Set(intent.edgeIds)]) {
    const edge = record.ast.edges.find((entry) => entry.id === edgeId)

    if (!edge) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }

    const replacement = buildPatchedDirectiveHeaderLine(source, edge.sourceMap.headerLineRange, 'edge', (metadata) => {
      return patchLockedMetadata(metadata, intent.locked)
    })

    if (replacement.isErr()) {
      return err(replacement.error)
    }

    replacements.push({
      range: edge.sourceMap.headerLineRange,
      replacement: replacement.value
    })
  }

  if (replacements.length === 0) {
    return ok({
      source,
      dirty: false
    })
  }

  return ok({
    source: replaceRanges(source, replacements),
    dirty: true
  })
}

function parseDirectiveHeader(openingLine: string): Result<ParsedDirectiveHeader, CanvasDocumentEditError> {
  const match = /^(:::\s+)([A-Za-z][\w.-]*)(?:\s+(.*))?$/.exec(openingLine)

  if (!match) {
    return err({
      kind: 'invalid-patch',
      message: `Unsupported directive opening line "${openingLine}".`
    })
  }

  if (!match[3]) {
    return ok({
      name: match[2],
      metadata: {}
    })
  }

  try {
    const metadata = load(match[3])

    if (!isRecord(metadata)) {
      return err({
        kind: 'invalid-patch',
        message: `Directive opening line must contain a metadata object: "${openingLine}".`
      })
    }

    return ok({
      name: match[2],
      metadata
    })
  } catch (error) {
    return err({
      kind: 'invalid-patch',
      message: error instanceof Error ? error.message : `Could not parse "${openingLine}".`
    })
  }
}

function stringifyDirectiveHeader(name: string, metadata: Record<string, unknown>) {
  const orderedMetadata = orderMetadata(name, metadata)
  const keys = Object.keys(orderedMetadata)

  if (keys.length === 0) {
    return `::: ${name}`
  }

  return `::: ${name} ${serializeInlineObject(orderedMetadata)}`
}

function buildPatchedDirectiveHeaderLine(
  source: string,
  range: CanvasSourceRange,
  expectedName: string,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<string, CanvasDocumentEditError> {
  const openingLine = readRangeText(source, range)
  const parseResult = parseDirectiveHeader(openingLine)

  if (parseResult.isErr()) {
    return err(parseResult.error)
  }

  if (parseResult.value.name !== expectedName) {
    return err({
      kind: 'invalid-object',
      message: `Cannot patch "${expectedName}" metadata on a "${parseResult.value.name}" directive.`
    })
  }

  return ok(stringifyDirectiveHeader(parseResult.value.name, patch(parseResult.value.metadata)))
}

function orderMetadata(name: string, metadata: Record<string, unknown>) {
  const ordered: Record<string, unknown> = {}
  const preferredKeys =
    name === 'edge'
      ? ['id', 'from', 'to', 'z', 'locked', 'style']
      : name === 'image'
        ? ['id', 'src', 'alt', 'title', 'lockAspectRatio', 'at', 'z', 'locked', 'style']
      : ['id', 'at', 'z', 'locked', 'style']

  for (const key of preferredKeys) {
    if (metadata[key] !== undefined) {
      ordered[key] = metadata[key]
    }
  }

  return ordered
}

function serializeInlineObject(value: Record<string, unknown>): string {
  return `{ ${Object.entries(value)
    .map(([key, entry]) => `${key}: ${serializeInlineValue(entry)}`)
    .join(', ')} }`
}

function serializeInlineValue(value: unknown): string {
  if (typeof value === 'string') {
    return isBareString(value) ? value : JSON.stringify(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeInlineValue(entry)).join(', ')}]`
  }

  if (isRecord(value)) {
    return serializeInlineObject(value)
  }

  return JSON.stringify(value)
}

function isBareString(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)
}

function readMetadataRecord(value: unknown) {
  return isRecord(value) ? value : {}
}

function serializeBodyFragment(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\n+$/g, '')

  if (normalized.length === 0) {
    return ''
  }

  return `${normalized}\n`
}

function insertObjectBlock(source: string, block: string, anchorOffset?: number) {
  if (source.trim().length === 0) {
    return block
  }

  if (anchorOffset !== undefined) {
    const prefix = source.slice(0, anchorOffset).replace(/\n*$/g, '')
    const suffix = source.slice(anchorOffset).replace(/^\n*/g, '')
    return `${prefix}\n\n${block}${suffix.length > 0 ? `\n\n${suffix}` : ''}`
  }

  const trimmedSource = source.replace(/\n*$/g, '')
  return `${trimmedSource}\n\n${block}`
}

function removeObjectRanges(source: string, ranges: CanvasSourceRange[]) {
  return [...ranges]
    .sort((left, right) => right.start.offset - left.start.offset)
    .reduce((nextSource, range) => {
      const expandedRange = expandRemovalRange(nextSource, range)
      return nextSource.slice(0, expandedRange.start) + nextSource.slice(expandedRange.end)
    }, source)
    .replace(/^\n+/, '')
}

function expandRemovalRange(source: string, range: CanvasSourceRange) {
  let start = range.start.offset
  let end = range.end.offset

  if (source[end] === '\n') {
    end += 1

    if (source[end] === '\n' && (start === 0 || source[start - 1] === '\n')) {
      end += 1
    }
  } else if (start > 0 && source[start - 1] === '\n') {
    start -= 1
  }

  return { start, end }
}

function replaceRange(source: string, range: CanvasSourceRange, replacement: string) {
  return `${source.slice(0, range.start.offset)}${replacement}${source.slice(range.end.offset)}`
}

function replaceRanges(
  source: string,
  replacements: Array<{ range: CanvasSourceRange; replacement: string }>
) {
  return [...replacements]
    .sort((left, right) => right.range.start.offset - left.range.start.offset)
    .reduce((nextSource, entry) => {
      return replaceRange(nextSource, entry.range, entry.replacement)
    }, source)
}

function dedupeRanges(ranges: CanvasSourceRange[]) {
  const seen = new Set<string>()
  const unique: CanvasSourceRange[] = []

  for (const range of ranges) {
    const key = `${range.start.offset}:${range.end.offset}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    unique.push(range)
  }

  return unique
}

function readRangeText(source: string, range: CanvasSourceRange) {
  return source.slice(range.start.offset, range.end.offset)
}

function readNextId(prefix: 'note' | 'shape' | 'edge' | 'image', existingIds: Set<string>) {
  let index = 1

  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1
  }

  return `${prefix}-${index}`
}

function readNextObjectId(node: CanvasNode, existingIds: Set<string>) {
  if (node.component === 'note') {
    return readNextId('note', existingIds)
  }

  if (node.component === 'image') {
    return readNextId('image', existingIds)
  }

  return readNextId('shape', existingIds)
}

function buildObjectBlock(name: string, metadata: Record<string, unknown>, body?: string) {
  const lines = [
    stringifyDirectiveHeader(name, metadata),
    ...serializeBodyFragment(body ?? '').split('\n').filter((line, index, allLines) => {
      return !(index === allLines.length - 1 && line === '')
    }),
    ':::'
  ]

  return lines.join('\n')
}

function buildGroupBlock(input: {
  id: string
  z: number
  locked?: boolean
  nodeIds: string[]
}) {
  return buildObjectBlock('group', {
    id: input.id,
    z: input.z,
    locked: input.locked
  }, serializeGroupMembership(input.nodeIds))
}

function buildNodeMetadata(node: CanvasNode) {
  if (node.component === 'image') {
    return {
      id: node.id,
      src: node.src ?? '',
      alt: node.alt ?? '',
      title: node.title,
      lockAspectRatio: node.lockAspectRatio ?? true,
      at: {
        x: roundGeometry(node.at.x),
        y: roundGeometry(node.at.y),
        w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
        h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
      },
      z: node.z,
      locked: node.locked,
      style: node.style
    }
  }

  return {
    id: node.id,
    at: {
      x: roundGeometry(node.at.x),
      y: roundGeometry(node.at.y),
      w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
      h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
    },
    z: node.z,
    locked: node.locked,
    style: node.style
  }
}

function buildClipboardNodeMetadata(
  node: CanvasClipboardNode,
  delta: {
    x: number
    y: number
  }
) {
  if (node.component === 'image') {
    return {
      id: node.id,
      src: node.src ?? '',
      alt: node.alt ?? '',
      title: node.title,
      lockAspectRatio: node.lockAspectRatio ?? true,
      at: {
        x: roundGeometry(node.at.x + delta.x),
        y: roundGeometry(node.at.y + delta.y),
        w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
        h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
      },
      locked: node.locked,
      style: node.style
    }
  }

  return {
    id: node.id,
    at: {
      x: roundGeometry(node.at.x + delta.x),
      y: roundGeometry(node.at.y + delta.y),
      w: node.at.w === undefined ? undefined : roundGeometry(node.at.w),
      h: node.at.h === undefined ? undefined : roundGeometry(node.at.h)
    },
    locked: node.locked,
    style: node.style
  }
}

function buildEdgeMetadata(edge: CanvasEdge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    z: edge.z,
    locked: edge.locked,
    style: edge.style
  }
}

function buildClipboardEdgeMetadata(edge: CanvasClipboardEdge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    locked: edge.locked,
    style: edge.style
  }
}

function readCurrentMaxZ(record: CanvasDocumentRecord) {
  return Math.max(
    0,
    ...record.ast.groups.map((group) => group.z ?? 0),
    ...record.ast.nodes.map((node) => node.z ?? 0),
    ...record.ast.edges.map((edge) => edge.z ?? 0)
  )
}

function readPasteDelta(intent: Extract<CanvasDocumentEditIntent, { kind: 'paste-objects' }>) {
  if (intent.inPlace || !intent.payload.origin) {
    return { x: 0, y: 0 }
  }

  return {
    x: roundGeometry(intent.anchorX - intent.payload.origin.x),
    y: roundGeometry(intent.anchorY - intent.payload.origin.y)
  }
}

function readNextGroupId(existingIds: Set<string>) {
  let index = 1

  while (existingIds.has(`group-${index}`)) {
    index += 1
  }

  return `group-${index}`
}

function readNextClipboardNodeId(node: CanvasClipboardNode, existingIds: Set<string>) {
  if (node.component === 'note') {
    return readNextId('note', existingIds)
  }

  if (node.component === 'image') {
    return readNextId('image', existingIds)
  }

  return readNextId('shape', existingIds)
}

function serializeGroupMembership(nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return '~~~yaml members\nnodes: []\n~~~'
  }

  return `~~~yaml members\nnodes:\n${nodeIds.map((nodeId) => `  - ${nodeId}`).join('\n')}\n~~~`
}

function compareByZ(
  left: Pick<CanvasClipboardGroup | CanvasClipboardNode | CanvasClipboardEdge, 'z'>,
  right: Pick<CanvasClipboardGroup | CanvasClipboardNode | CanvasClipboardEdge, 'z'>
) {
  return (left.z ?? 0) - (right.z ?? 0)
}

function readGroupIdFromBlock(block: string) {
  const match = /id:\s*([A-Za-z_][A-Za-z0-9_.-]*)/.exec(block)
  return match?.[1] ?? null
}

function readGroupZFromBlock(block: string) {
  const match = /z:\s*(-?\d+)/.exec(block)

  if (!match) {
    return null
  }

  return Number(match[1])
}

function patchLockedMetadata(metadata: Record<string, unknown>, locked: boolean) {
  if (locked) {
    return {
      ...metadata,
      locked: true
    }
  }

  const nextMetadata = {
    ...metadata
  }

  delete nextMetadata.locked
  return nextMetadata
}

function reorderArrangeObjects(
  objects: Array<{
    id: string
    kind: 'edge' | 'group' | 'node'
    object: CanvasEdge | CanvasGroup | CanvasNode
    z: number
  }>,
  selectedIds: Set<string>,
  mode: CanvasObjectArrangeMode
) {
  const selectedIndexes = objects
    .map((entry, index) => selectedIds.has(`${entry.kind}:${entry.id}`) ? index : -1)
    .filter((index) => index >= 0)

  if (selectedIndexes.length === 0) {
    return { changed: false, objects }
  }

  switch (mode) {
    case 'bring-to-front': {
      const selected = objects.filter((entry) => selectedIds.has(`${entry.kind}:${entry.id}`))
      const unselected = objects.filter((entry) => !selectedIds.has(`${entry.kind}:${entry.id}`))
      const nextObjects = [...unselected, ...selected]
      return {
        changed: !areOrderedObjectsEqual(objects, nextObjects),
        objects: nextObjects
      }
    }
    case 'send-to-back': {
      const selected = objects.filter((entry) => selectedIds.has(`${entry.kind}:${entry.id}`))
      const unselected = objects.filter((entry) => !selectedIds.has(`${entry.kind}:${entry.id}`))
      const nextObjects = [...selected, ...unselected]
      return {
        changed: !areOrderedObjectsEqual(objects, nextObjects),
        objects: nextObjects
      }
    }
    case 'bring-forward':
      return reorderArrangeObjectsByStep(objects, selectedIds, 'forward')
    case 'send-backward':
      return reorderArrangeObjectsByStep(objects, selectedIds, 'backward')
    default:
      return {
        changed: false,
        objects
      }
  }
}

function reorderArrangeObjectsByStep(
  objects: Array<{
    id: string
    kind: 'edge' | 'group' | 'node'
    object: CanvasEdge | CanvasGroup | CanvasNode
    z: number
  }>,
  selectedIds: Set<string>,
  direction: 'backward' | 'forward'
) {
  const nextObjects = [...objects]

  if (direction === 'forward') {
    for (let index = nextObjects.length - 2; index >= 0; index -= 1) {
      if (!selectedIds.has(`${nextObjects[index].kind}:${nextObjects[index].id}`)) {
        continue
      }

      let end = index

      while (
        end + 1 < nextObjects.length &&
        selectedIds.has(`${nextObjects[end + 1].kind}:${nextObjects[end + 1].id}`)
      ) {
        end += 1
      }

      if (end + 1 >= nextObjects.length) {
        index = index - 1
        continue
      }

      const nextEntry = nextObjects[end + 1]

      if (selectedIds.has(`${nextEntry.kind}:${nextEntry.id}`)) {
        continue
      }

      const block = nextObjects.slice(index, end + 1)
      nextObjects.splice(index, end - index + 2, nextEntry, ...block)
      index -= 1
    }
  } else {
    for (let index = 1; index < nextObjects.length; index += 1) {
      if (!selectedIds.has(`${nextObjects[index].kind}:${nextObjects[index].id}`)) {
        continue
      }

      let start = index

      while (
        start - 1 >= 0 &&
        selectedIds.has(`${nextObjects[start - 1].kind}:${nextObjects[start - 1].id}`)
      ) {
        start -= 1
      }

      if (start === 0) {
        index += 1
        continue
      }

      const previousEntry = nextObjects[start - 1]

      if (selectedIds.has(`${previousEntry.kind}:${previousEntry.id}`)) {
        continue
      }

      const block = nextObjects.slice(start, index + 1)
      nextObjects.splice(start - 1, index - start + 2, ...block, previousEntry)
    }
  }

  return {
    changed: !areOrderedObjectsEqual(objects, nextObjects),
    objects: nextObjects
  }
}

function areOrderedObjectsEqual(
  left: Array<{ id: string; kind: 'edge' | 'group' | 'node' }>,
  right: Array<{ id: string; kind: 'edge' | 'group' | 'node' }>
) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((entry, index) => {
    const other = right[index]
    return other !== undefined && entry.id === other.id && entry.kind === other.kind
  })
}

function roundGeometry(value: number) {
  return Math.round(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exhaustiveGuard(value: never) {
  return JSON.stringify(value)
}
