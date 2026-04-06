import { err, ok, type Result } from 'neverthrow'
import type {
  CanvasDocumentEditError
} from '@canvas-app/services/edit-intents'
import type {
  CanvasEditTransaction,
  CanvasEditUnit
} from '@canvas-app/services/edit-transaction'
import {
  buildGroupBlock,
  buildInsertEdit,
  buildObjectBlock,
  buildNodeMetadata,
  buildEdgeMetadata,
  compileSingleEditTransaction,
  createDocumentEndInsertEdit,
  createObjectDeleteEdit,
  createReplaceEdit,
  createTransaction,
  readAllIds,
  readCurrentMaxZ,
  readNextId,
  readNextObjectId,
  readRangeText,
  roundGeometry,
  stringifyDirectiveHeader,
  serializeGroupMembership,
  pushUniqueEdit,
  type IntentCompiler
} from '@canvas-app/services/edit-compiler-helpers'

const compileCreateNote: IntentCompiler<'create-note'> = (context, intent) => {
  const nextId = readNextId('note', readAllIds(context.record))
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

  const insertEdit = buildInsertEdit(context, intent.anchorNodeId, block)

  if (insertEdit.isErr()) {
    return err(insertEdit.error)
  }

  return ok(createTransaction(intent, [insertEdit.value]))
}

const compileCreateShape: IntentCompiler<'create-shape'> = (context, intent) => {
  const nextId = readNextId('shape', readAllIds(context.record))
  const block = [
    stringifyDirectiveHeader(intent.component, {
      id: nextId,
      at: {
        x: roundGeometry(intent.x),
        y: roundGeometry(intent.y),
        w: roundGeometry(intent.width),
        h: roundGeometry(intent.height)
      }
    }),
    ...serializeBodyFragment(intent.body).split('\n').filter((line, index, lines) => {
      return !(index === lines.length - 1 && line === '')
    }),
    ':::'
  ].join('\n')

  const insertEdit = buildInsertEdit(context, intent.anchorNodeId, block)

  if (insertEdit.isErr()) {
    return err(insertEdit.error)
  }

  return ok(createTransaction(intent, [insertEdit.value]))
}

const compileCreateImage: IntentCompiler<'create-image'> = (context, intent) => {
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

  const insertEdit = buildInsertEdit(context, intent.anchorNodeId, block)

  if (insertEdit.isErr()) {
    return err(insertEdit.error)
  }

  return ok(createTransaction(intent, [insertEdit.value]))
}

const compileDeleteObjects: IntentCompiler<'delete-objects'> = (context, intent) => {
  const requestedGroupIds = [...new Set(intent.groupIds ?? [])]
  const requestedNodeIds = [...new Set(intent.nodeIds)]
  const requestedEdgeIds = [...new Set(intent.edgeIds)]
  const deletedNodeIds = new Set<string>()
  const deletedObjectKeys = new Set<string>()
  const edits: CanvasEditUnit[] = []

  for (const groupId of requestedGroupIds) {
    const group = context.record.ast.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }

    pushUniqueEdit(
      edits,
      deletedObjectKeys,
      `group:${group.id}`,
      createObjectDeleteEdit(context.source, 'group', group.id, group.sourceMap.objectRange)
    )

    for (const nodeId of group.members.nodeIds) {
      if (!requestedNodeIds.includes(nodeId)) {
        requestedNodeIds.push(nodeId)
      }
    }
  }

  for (const nodeId of requestedNodeIds) {
    const node = context.record.ast.nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return err({
        kind: 'object-not-found',
        message: `Node "${nodeId}" was not found in the current document.`
      })
    }

    deletedNodeIds.add(nodeId)
    pushUniqueEdit(
      edits,
      deletedObjectKeys,
      `node:${node.id}`,
      createObjectDeleteEdit(context.source, 'node', node.id, node.sourceMap.objectRange)
    )
  }

  const implicitEdgeIds = new Set(
    context.record.ast.edges
      .filter((edge) => deletedNodeIds.has(edge.from) || deletedNodeIds.has(edge.to))
      .map((edge) => edge.id)
  )

  for (const edgeId of [...requestedEdgeIds, ...implicitEdgeIds]) {
    const edge = context.record.ast.edges.find((entry) => entry.id === edgeId)

    if (!edge) {
      return err({
        kind: 'object-not-found',
        message: `Edge "${edgeId}" was not found in the current document.`
      })
    }

    pushUniqueEdit(
      edits,
      deletedObjectKeys,
      `edge:${edge.id}`,
      createObjectDeleteEdit(context.source, 'edge', edge.id, edge.sourceMap.objectRange)
    )
  }

  return ok(createTransaction(intent, edits))
}

const compileUpsertGroup: IntentCompiler<'upsert-group'> = (context, intent) => {
  const existingGroup = context.record.ast.groups.find((entry) => entry.id === intent.groupId)
  const groupBlock = buildGroupBlock({
    id: intent.groupId,
    z: intent.z,
    locked: intent.locked,
    nodeIds: intent.nodeIds
  })

  if (!existingGroup) {
    return ok(createTransaction(intent, [
      createDocumentEndInsertEdit(context.source, groupBlock)
    ]))
  }

  return ok(createTransaction(intent, [
    createReplaceEdit({
      anchor: {
        kind: 'object',
        objectId: existingGroup.id,
        objectKind: 'group'
      },
      expectedSource: readRangeText(context.source, existingGroup.sourceMap.objectRange),
      range: existingGroup.sourceMap.objectRange,
      replacement: groupBlock,
      structuralImpact: 'structure'
    })
  ]))
}

const compileDeleteGroups: IntentCompiler<'delete-groups'> = (context, intent) => {
  const edits: CanvasEditUnit[] = []

  for (const groupId of [...new Set(intent.groupIds)]) {
    const group = context.record.ast.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return err({
        kind: 'object-not-found',
        message: `Group "${groupId}" was not found in the current document.`
      })
    }

    edits.push(createObjectDeleteEdit(context.source, 'group', group.id, group.sourceMap.objectRange))
  }

  return ok(createTransaction(intent, edits))
}

const compileDeleteNode: IntentCompiler<'delete-node'> = (context, intent) => {
  const node = context.record.ast.nodes.find((entry) => entry.id === intent.nodeId)

  if (!node) {
    return err({
      kind: 'object-not-found',
      message: `Node "${intent.nodeId}" was not found in the current document.`
    })
  }

  const edits: CanvasEditUnit[] = [
    createObjectDeleteEdit(context.source, 'node', node.id, node.sourceMap.objectRange)
  ]

  for (const edge of context.record.ast.edges.filter((entry) => entry.from === intent.nodeId || entry.to === intent.nodeId)) {
    edits.push(createObjectDeleteEdit(context.source, 'edge', edge.id, edge.sourceMap.objectRange))
  }

  return ok(createTransaction(intent, edits))
}

const compileCreateEdge: IntentCompiler<'create-edge'> = (context, intent) => {
  if (intent.from === intent.to) {
    return err({
      kind: 'invalid-intent',
      message: 'Edge endpoints must reference two different nodes.'
    })
  }

  const block = [
    stringifyDirectiveHeader('edge', {
      id: readNextId('edge', readAllIds(context.record)),
      from: intent.from,
      to: intent.to
    }),
    ...serializeBodyFragment(intent.markdown).split('\n').filter((line, index, lines) => {
      return !(index === lines.length - 1 && line === '')
    }),
    ':::'
  ].join('\n')

  return ok(createTransaction(intent, [
    createDocumentEndInsertEdit(context.source, block)
  ]))
}

const compileDeleteEdge: IntentCompiler<'delete-edge'> = (context, intent) => {
  const edge = context.record.ast.edges.find((entry) => entry.id === intent.edgeId)

  if (!edge) {
    return err({
      kind: 'object-not-found',
      message: `Edge "${intent.edgeId}" was not found in the current document.`
    })
  }

  return ok(createTransaction(intent, [
    createObjectDeleteEdit(context.source, 'edge', edge.id, edge.sourceMap.objectRange)
  ]))
}

export const structureIntentCompilers = {
  'create-edge': compileCreateEdge,
  'create-image': compileCreateImage,
  'create-note': compileCreateNote,
  'create-shape': compileCreateShape,
  'delete-edge': compileDeleteEdge,
  'delete-groups': compileDeleteGroups,
  'delete-node': compileDeleteNode,
  'delete-objects': compileDeleteObjects,
  'upsert-group': compileUpsertGroup
} satisfies {
  [K in
    | 'create-edge'
    | 'create-image'
    | 'create-note'
    | 'create-shape'
    | 'delete-edge'
    | 'delete-groups'
    | 'delete-node'
    | 'delete-objects'
    | 'upsert-group'
  ]: IntentCompiler<K>
}

function serializeBodyFragment(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\n+$/g, '')

  if (normalized.length === 0) {
    return ''
  }

  return `${normalized}\n`
}
