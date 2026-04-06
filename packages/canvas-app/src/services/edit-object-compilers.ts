import { err, ok, type Result } from 'neverthrow'
import type {
  CanvasDocumentEditError,
  CanvasDocumentEditIntent
} from '@canvas-app/services/edit-intents'
import type { CanvasEditTransaction, CanvasEditUnit } from '@canvas-app/services/edit-transaction'
import {
  createTransaction,
  compileSingleEditTransaction,
  patchEdgeMetadata,
  patchNodeMetadata,
  readMetadataRecord,
  replaceBodyRange,
  roundGeometry,
  type IntentCompiler
} from '@canvas-app/services/edit-compiler-helpers'

const compileMoveNode: IntentCompiler<'move-node'> = (context, intent) => {
  return compileSingleEditTransaction(intent, patchNodeMetadata(context, intent.nodeId, (metadata) => ({
    ...metadata,
    at: {
      ...readMetadataRecord(metadata.at),
      x: roundGeometry(intent.x),
      y: roundGeometry(intent.y)
    }
  })))
}

const compileMoveNodes: IntentCompiler<'move-nodes'> = (context, intent) => {
  const requestedMoves = [...new Map(intent.moves.map((move) => [move.nodeId, move])).values()]

  if (requestedMoves.length === 0) {
    return ok(createTransaction(intent, []))
  }

  const edits: CanvasEditUnit[] = []

  for (const move of requestedMoves) {
    const edit = patchNodeMetadata(context, move.nodeId, (metadata) => ({
      ...metadata,
      at: {
        ...readMetadataRecord(metadata.at),
        x: roundGeometry(move.x),
        y: roundGeometry(move.y)
      }
    }))

    if (edit.isErr()) {
      return err(edit.error)
    }

    edits.push(edit.value)
  }

  return ok(createTransaction(intent, edits))
}

const compileResizeNode: IntentCompiler<'resize-node'> = (context, intent) => {
  return compileSingleEditTransaction(intent, patchNodeMetadata(context, intent.nodeId, (metadata) => ({
    ...metadata,
    at: {
      ...readMetadataRecord(metadata.at),
      x: roundGeometry(intent.x),
      y: roundGeometry(intent.y),
      w: Math.max(120, roundGeometry(intent.width)),
      h: Math.max(120, roundGeometry(intent.height))
    }
  })))
}

const compileReplaceObjectBody: IntentCompiler<'replace-object-body'> = (context, intent) => {
  return compileSingleEditTransaction(
    intent,
    replaceBodyRange(
      context,
      context.record.ast.nodes.find((node) => node.id === intent.objectId),
      'node',
      intent.markdown
    )
  )
}

const compileReplaceEdgeBody: IntentCompiler<'replace-edge-body'> = (context, intent) => {
  return compileSingleEditTransaction(
    intent,
    replaceBodyRange(
      context,
      context.record.ast.edges.find((edge) => edge.id === intent.edgeId),
      'edge',
      intent.markdown
    )
  )
}

const compileReplaceImageSource: IntentCompiler<'replace-image-source'> = (context, intent) => {
  return compileSingleEditTransaction(intent, patchNodeMetadata(context, intent.nodeId, (metadata) => ({
    ...metadata,
    src: intent.src,
    alt: intent.alt,
    title: intent.title
  })))
}

const compileUpdateImageMetadata: IntentCompiler<'update-image-metadata'> = (context, intent) => {
  return compileSingleEditTransaction(intent, patchNodeMetadata(context, intent.nodeId, (metadata) => ({
    ...metadata,
    alt: intent.alt ?? metadata.alt ?? '',
    title: intent.title === undefined ? metadata.title : intent.title,
    lockAspectRatio: intent.lockAspectRatio ?? metadata.lockAspectRatio ?? true
  })))
}

const compileUpdateEdgeEndpoints: IntentCompiler<'update-edge-endpoints'> = (context, intent) => {
  return compileSingleEditTransaction(intent, patchEdgeMetadata(context, intent.edgeId, (metadata) => ({
    ...metadata,
    from: intent.from,
    to: intent.to
  })))
}

export const objectIntentCompilers = {
  'move-node': compileMoveNode,
  'move-nodes': compileMoveNodes,
  'replace-edge-body': compileReplaceEdgeBody,
  'replace-image-source': compileReplaceImageSource,
  'replace-object-body': compileReplaceObjectBody,
  'resize-node': compileResizeNode,
  'update-edge-endpoints': compileUpdateEdgeEndpoints,
  'update-image-metadata': compileUpdateImageMetadata
} satisfies {
  [K in
    | 'move-node'
    | 'move-nodes'
    | 'replace-edge-body'
    | 'replace-image-source'
    | 'replace-object-body'
    | 'resize-node'
    | 'update-edge-endpoints'
    | 'update-image-metadata'
  ]: IntentCompiler<K>
}
