import { err, ok, type Result } from 'neverthrow'
import { normalizeCanvasColorHex } from '@boardmark/canvas-domain'
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

const compileSetNodeStyleColor: IntentCompiler<'set-node-style-color'> = (context, intent) => {
  const requestedNodeIds = [...new Set(intent.nodeIds)]
  const color = normalizeCanvasColorHex(intent.color)

  if (!color) {
    return err({
      kind: 'invalid-intent',
      message: `Color "${intent.color}" must use "#RRGGBB" or "#RRGGBBAA" format.`
    })
  }

  if (requestedNodeIds.length === 0) {
    return ok(createTransaction(intent, []))
  }

  const edits: CanvasEditUnit[] = []

  for (const nodeId of requestedNodeIds) {
    const edit = patchNodeMetadata(context, nodeId, (metadata) => {
      const nextMetadata = {
        ...metadata,
        style: patchStyleColorMetadata(metadata.style, intent.target, color)
      }

      if (nextMetadata.style === undefined) {
        delete nextMetadata.style
      }

      return nextMetadata
    })

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

const compileResetNodeHeight: IntentCompiler<'reset-node-height'> = (context, intent) => {
  return compileSingleEditTransaction(intent, patchNodeMetadata(context, intent.nodeId, (metadata) => {
    const atRecord = readMetadataRecord(metadata.at) as Record<string, unknown>
    const { h: _h, ...atWithoutH } = atRecord
    return { ...metadata, at: atWithoutH }
  }))
}

export const objectIntentCompilers = {
  'move-node': compileMoveNode,
  'move-nodes': compileMoveNodes,
  'set-node-style-color': compileSetNodeStyleColor,
  'replace-edge-body': compileReplaceEdgeBody,
  'replace-image-source': compileReplaceImageSource,
  'replace-object-body': compileReplaceObjectBody,
  'reset-node-height': compileResetNodeHeight,
  'resize-node': compileResizeNode,
  'update-edge-endpoints': compileUpdateEdgeEndpoints,
  'update-image-metadata': compileUpdateImageMetadata
} satisfies {
  [K in
    | 'move-node'
    | 'move-nodes'
    | 'set-node-style-color'
    | 'replace-edge-body'
    | 'replace-image-source'
    | 'replace-object-body'
    | 'reset-node-height'
    | 'resize-node'
    | 'update-edge-endpoints'
    | 'update-image-metadata'
  ]: IntentCompiler<K>
}

function patchStyleColorMetadata(
  value: unknown,
  target: 'bg' | 'stroke',
  color: string
) {
  const styleRecord = readMetadataRecord(value)
  const currentBg = readStyleColorMetadata(styleRecord.bg)
  const currentStroke = readStyleColorMetadata(styleRecord.stroke)
  const nextStyle: Record<string, unknown> = {}

  const nextBg = target === 'bg' ? { color } : currentBg
  const nextStroke = target === 'stroke' ? { color } : currentStroke

  if (nextBg.color !== undefined) {
    nextStyle.bg = {
      color: nextBg.color
    }
  }

  if (nextStroke.color !== undefined) {
    nextStyle.stroke = {
      color: nextStroke.color
    }
  }

  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined
}

function readStyleColorMetadata(value: unknown) {
  const record = readMetadataRecord(value)
  const color = typeof record.color === 'string'
    ? normalizeCanvasColorHex(record.color)
    : null

  return color
    ? {
        color
      }
    : {}
}
