import { load } from 'js-yaml'
import { err, ok, type Result } from 'neverthrow'
import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import type {
  CanvasDirectiveSourceMap,
  CanvasEdge,
  CanvasNode,
  CanvasSourceRange
} from '@boardmark/canvas-domain'

export type CanvasDocumentEditIntent =
  | { kind: 'replace-object-body'; objectId: string; markdown: string }
  | { kind: 'move-node'; nodeId: string; x: number; y: number }
  | { kind: 'resize-node'; nodeId: string; x: number; y: number; width: number; height: number }
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

function orderMetadata(name: string, metadata: Record<string, unknown>) {
  const ordered: Record<string, unknown> = {}
  const preferredKeys =
    name === 'edge'
      ? ['id', 'from', 'to', 'style']
      : ['id', 'at', 'style']

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

function readRangeText(source: string, range: CanvasSourceRange) {
  return source.slice(range.start.offset, range.end.offset)
}

function readNextId(prefix: 'note' | 'shape' | 'edge', existingIds: Set<string>) {
  let index = 1

  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1
  }

  return `${prefix}-${index}`
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
