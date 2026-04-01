import { err, ok, type Result } from 'neverthrow'
import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import type { CanvasDirectiveSourceMap, CanvasEdge, CanvasNode, CanvasSourceRange } from '@boardmark/canvas-domain'

export type CanvasDocumentEditIntent =
  | { kind: 'replace-object-body'; objectId: string; markdown: string }
  | { kind: 'move-node'; nodeId: string; x: number; y: number }
  | { kind: 'resize-node'; nodeId: string; width: number }
  | { kind: 'create-note'; anchorNodeId?: string; x: number; y: number; width: number; markdown: string }
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

export function createCanvasDocumentEditService(): CanvasDocumentEditService {
  return {
    apply(source, record, intent) {
      switch (intent.kind) {
        case 'move-node':
          return patchNodeOpeningLine(source, record, intent.nodeId, {
            x: roundGeometry(intent.x).toString(),
            y: roundGeometry(intent.y).toString()
          })
        case 'resize-node':
          return patchNodeOpeningLine(source, record, intent.nodeId, {
            w: Math.max(120, roundGeometry(intent.width)).toString()
          })
        case 'update-edge-endpoints':
          return patchEdgeOpeningLine(source, record, intent.edgeId, {
            from: intent.from,
            to: intent.to
          })
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

function patchNodeOpeningLine(
  source: string,
  record: CanvasDocumentRecord,
  nodeId: string,
  attributes: Partial<Record<'x' | 'y' | 'w', string>>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const node = record.ast.nodes.find((entry) => entry.id === nodeId)

  if (!node) {
    return err({
      kind: 'object-not-found',
      message: `Node "${nodeId}" was not found in the current document.`
    })
  }

  return replaceOpeningLine(source, node.sourceMap, attributes, 'note')
}

function patchEdgeOpeningLine(
  source: string,
  record: CanvasDocumentRecord,
  edgeId: string,
  attributes: Partial<Record<'from' | 'to' | 'kind', string>>
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const edge = record.ast.edges.find((entry) => entry.id === edgeId)

  if (!edge) {
    return err({
      kind: 'object-not-found',
      message: `Edge "${edgeId}" was not found in the current document.`
    })
  }

  return replaceOpeningLine(source, edge.sourceMap, attributes, 'edge')
}

function replaceOpeningLine(
  source: string,
  sourceMap: CanvasDirectiveSourceMap,
  nextAttributes: Partial<Record<string, string>>,
  objectType: 'note' | 'edge'
): Result<CanvasDocumentEditResult, CanvasDocumentEditError> {
  const openingLine = readRangeText(source, sourceMap.openingLineRange)
  const parseResult = parseOpeningDirective(openingLine)

  if (parseResult.isErr()) {
    return err(parseResult.error)
  }

  if (parseResult.value.name !== objectType) {
    return err({
      kind: 'invalid-object',
      message: `Cannot patch ${objectType} attributes on a "${parseResult.value.name}" directive.`
    })
  }

  const merged = new Map(parseResult.value.attributes)

  for (const [key, value] of Object.entries(nextAttributes)) {
    if (value === undefined) {
      merged.delete(key)
      continue
    }

    merged.set(key, value)
  }

  const nextOpeningLine = stringifyOpeningDirective({
    name: parseResult.value.name,
    id: parseResult.value.id,
    attributes: merged,
    unknownTokens: parseResult.value.unknownTokens
  })
  const nextSource = replaceRange(source, sourceMap.openingLineRange, nextOpeningLine)

  return ok({
    source: nextSource,
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

  const nextSource = replaceRange(
    source,
    object.sourceMap.bodyRange,
    serializeBodyFragment(markdown)
  )

  return ok({
    source: nextSource,
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
    `::: note #${nextId} x=${roundGeometry(intent.x)} y=${roundGeometry(intent.y)} w=${roundGeometry(intent.width)}`,
    ...serializeBodyFragment(intent.markdown).split('\n').filter((line, index, lines) => {
      return !(index === lines.length - 1 && line === '')
    }),
    ':::'
  ].join('\n')

  const nextSource = insertObjectBlock(
    source,
    block,
    record.ast.nodes.find((node) => node.id === intent.anchorNodeId)?.sourceMap.objectRange.end.offset
  )

  return ok({
    source: nextSource,
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
  const ranges = [
    node.sourceMap.objectRange,
    ...connectedEdges.map((edge) => edge.sourceMap.objectRange)
  ]
  const nextSource = removeObjectRanges(source, ranges)

  return ok({
    source: nextSource,
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
    `::: edge #${nextId} from=${intent.from} to=${intent.to}`,
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

function parseOpeningDirective(
  openingLine: string
): Result<
  {
    name: 'note' | 'edge'
    id: string
    attributes: Map<string, string>
    unknownTokens: string[]
  },
  CanvasDocumentEditError
> {
  const tokens = openingLine.trim().split(/\s+/)

  if (tokens[0] !== ':::' || (tokens[1] !== 'note' && tokens[1] !== 'edge')) {
    return err({
      kind: 'invalid-patch',
      message: `Unsupported directive opening line "${openingLine}".`
    })
  }

  const idToken = tokens.find((token) => token.startsWith('#'))

  if (!idToken) {
    return err({
      kind: 'invalid-patch',
      message: `Directive opening line is missing an object id: "${openingLine}".`
    })
  }

  const attributes = new Map<string, string>()
  const unknownTokens: string[] = []

  for (const token of tokens.slice(2)) {
    if (token === idToken) {
      continue
    }

    const separatorIndex = token.indexOf('=')

    if (separatorIndex <= 0) {
      unknownTokens.push(token)
      continue
    }

    const key = token.slice(0, separatorIndex)
    const value = token.slice(separatorIndex + 1)
    attributes.set(key, value)
  }

  return ok({
    name: tokens[1],
    id: idToken.slice(1),
    attributes,
    unknownTokens
  })
}

function stringifyOpeningDirective(input: {
  name: 'note' | 'edge'
  id: string
  attributes: Map<string, string>
  unknownTokens: string[]
}) {
  const tokens = [':::', input.name, `#${input.id}`]
  const orderedKeys =
    input.name === 'note'
      ? ['x', 'y', 'w', 'color']
      : ['from', 'to', 'kind']

  for (const key of orderedKeys) {
    const value = input.attributes.get(key)

    if (value !== undefined) {
      tokens.push(`${key}=${value}`)
    }
  }

  for (const [key, value] of input.attributes.entries()) {
    if (orderedKeys.includes(key)) {
      continue
    }

    tokens.push(`${key}=${value}`)
  }

  tokens.push(...input.unknownTokens)

  return tokens.join(' ')
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

function readNextId(prefix: 'note' | 'edge', existingIds: Set<string>) {
  let index = 1

  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1
  }

  return `${prefix}-${index}`
}

function roundGeometry(value: number) {
  return Math.round(value)
}

function exhaustiveGuard(value: never) {
  return JSON.stringify(value)
}
