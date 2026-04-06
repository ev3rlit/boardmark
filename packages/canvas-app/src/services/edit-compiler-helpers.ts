import { load } from 'js-yaml'
import { err, ok, type Result } from 'neverthrow'
import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import type {
  CanvasDirectiveSourceMap,
  CanvasEdge,
  CanvasGroup,
  CanvasNode,
  CanvasSourceRange
} from '@boardmark/canvas-domain'
import type {
  CanvasClipboardEdge,
  CanvasClipboardGroup,
  CanvasClipboardNode
} from '@canvas-app/store/canvas-store-types'
import type { CanvasObjectArrangeMode } from '@canvas-app/canvas-object-types'
import type {
  CanvasDocumentEditError,
  CanvasDocumentEditIntent
} from '@canvas-app/services/edit-intents'
import {
  readCanvasDocumentEditLabel
} from '@canvas-app/services/edit-intents'
import type {
  CanvasEditAnchor,
  CanvasEditObjectKind,
  CanvasEditStructuralImpact,
  CanvasEditTransaction,
  CanvasEditUnit
} from '@canvas-app/services/edit-transaction'

type ParsedDirectiveHeader = {
  metadata: Record<string, unknown>
  name: string
}

export type CanvasDocumentEditCompilerContext = {
  record: CanvasDocumentRecord
  source: string
}

export type IntentCompiler<K extends CanvasDocumentEditIntent['kind']> = (
  context: CanvasDocumentEditCompilerContext,
  intent: Extract<CanvasDocumentEditIntent, { kind: K }>
) => Result<CanvasEditTransaction, CanvasDocumentEditError>

export function compileSingleEditTransaction(
  intent: CanvasDocumentEditIntent,
  edit: Result<CanvasEditUnit, CanvasDocumentEditError>
): Result<CanvasEditTransaction, CanvasDocumentEditError> {
  if (edit.isErr()) {
    return err(edit.error)
  }

  return ok(createTransaction(intent, [edit.value]))
}

export function createTransaction(intent: CanvasDocumentEditIntent, edits: CanvasEditUnit[]): CanvasEditTransaction {
  return {
    edits,
    intentKind: intent.kind,
    label: readCanvasDocumentEditLabel(intent)
  }
}

export function patchNodeMetadata(
  context: CanvasDocumentEditCompilerContext,
  nodeId: string,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<CanvasEditUnit, CanvasDocumentEditError> {
  const node = context.record.ast.nodes.find((entry) => entry.id === nodeId)

  if (!node) {
    return err({
      kind: 'object-not-found',
      message: `Node "${nodeId}" was not found in the current document.`
    })
  }

  return replaceDirectiveHeader(context.source, node.sourceMap, node.component, {
    kind: 'header-line',
    objectId: node.id,
    objectKind: 'node'
  }, patch)
}

export function patchEdgeMetadata(
  context: CanvasDocumentEditCompilerContext,
  edgeId: string,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<CanvasEditUnit, CanvasDocumentEditError> {
  const edge = context.record.ast.edges.find((entry) => entry.id === edgeId)

  if (!edge) {
    return err({
      kind: 'object-not-found',
      message: `Edge "${edgeId}" was not found in the current document.`
    })
  }

  return replaceDirectiveHeader(context.source, edge.sourceMap, 'edge', {
    kind: 'header-line',
    objectId: edge.id,
    objectKind: 'edge'
  }, patch)
}

export function replaceDirectiveHeader(
  source: string,
  sourceMap: CanvasDirectiveSourceMap,
  expectedName: string,
  anchor: Extract<CanvasEditAnchor, { kind: 'header-line' }>,
  patch: (metadata: Record<string, unknown>) => Record<string, unknown>
): Result<CanvasEditUnit, CanvasDocumentEditError> {
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

  return ok(createReplaceEdit({
    anchor,
    expectedSource: openingLine,
    range: sourceMap.headerLineRange,
    replacement: stringifyDirectiveHeader(
      parseResult.value.name,
      patch(parseResult.value.metadata)
    ),
    structuralImpact: 'none'
  }))
}

export function replaceBodyRange(
  context: CanvasDocumentEditCompilerContext,
  object: CanvasNode | CanvasEdge | CanvasGroup | undefined,
  objectKind: CanvasEditObjectKind,
  markdown: string
): Result<CanvasEditUnit, CanvasDocumentEditError> {
  if (!object) {
    return err({
      kind: 'object-not-found',
      message: 'The target object was not found in the current document.'
    })
  }

  const replacement = serializeBodyFragment(markdown)
  return ok(createReplaceEdit({
    anchor: {
      kind: 'body',
      objectId: object.id,
      objectKind
    },
    expectedSource: readRangeText(context.source, object.sourceMap.bodyRange),
    range: object.sourceMap.bodyRange,
    replacement,
    structuralImpact: 'none'
  }))
}

export function parseDirectiveHeader(openingLine: string): Result<ParsedDirectiveHeader, CanvasDocumentEditError> {
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

export function stringifyDirectiveHeader(name: string, metadata: Record<string, unknown>) {
  const orderedMetadata = orderMetadata(name, metadata)
  const keys = Object.keys(orderedMetadata)

  if (keys.length === 0) {
    return `::: ${name}`
  }

  return `::: ${name} ${serializeInlineObject(orderedMetadata)}`
}

export function buildPatchedDirectiveHeaderLine(
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

export function createReplaceEdit(input: {
  anchor: CanvasEditAnchor
  expectedSource: string
  range: CanvasSourceRange
  replacement: string
  structuralImpact: CanvasEditStructuralImpact
}): CanvasEditUnit {
  return {
    anchor: input.anchor,
    expectedSource: input.expectedSource,
    lineDeltaBehavior: readLineDeltaBehavior(input.expectedSource, input.replacement),
    range: input.range,
    replacement: input.replacement,
    structuralImpact: input.structuralImpact
  }
}

export function createObjectDeleteEdit(
  source: string,
  objectKind: CanvasEditObjectKind,
  objectId: string,
  range: CanvasSourceRange
): CanvasEditUnit {
  return {
    anchor: {
      kind: 'object',
      objectId,
      objectKind
    },
    expectedSource: readRangeText(source, range),
    lineDeltaBehavior: 'change',
    range,
    replacement: '',
    structuralImpact: 'structure'
  }
}

export function createDocumentEndInsertEdit(source: string, block: string): CanvasEditUnit {
  return {
    anchor: { kind: 'document-end' },
    expectedSource: '',
    lineDeltaBehavior: 'change',
    range: readDocumentEndRange(source),
    replacement: block,
    structuralImpact: 'structure'
  }
}

export function buildInsertEdit(
  context: CanvasDocumentEditCompilerContext,
  anchorNodeId: string | undefined,
  block: string
): Result<CanvasEditUnit, CanvasDocumentEditError> {
  if (!anchorNodeId) {
    return ok(createDocumentEndInsertEdit(context.source, block))
  }

  const anchorNode = context.record.ast.nodes.find((node) => node.id === anchorNodeId)

  if (!anchorNode) {
    return err({
      kind: 'object-not-found',
      message: `Node "${anchorNodeId}" was not found in the current document.`
    })
  }

  return ok({
    anchor: {
      kind: 'after-object',
      objectId: anchorNode.id,
      objectKind: 'node'
    },
    expectedSource: readRangeText(context.source, anchorNode.sourceMap.objectRange),
    lineDeltaBehavior: 'change',
    range: anchorNode.sourceMap.objectRange,
    replacement: block,
    structuralImpact: 'structure'
  })
}

export function readDocumentEndRange(source: string): CanvasSourceRange {
  const line = source.length === 0 ? 1 : source.split('\n').length

  return {
    start: {
      line,
      offset: source.length
    },
    end: {
      line,
      offset: source.length
    }
  }
}

export function readLineDeltaBehavior(expectedSource: string, replacement: string) {
  return countLineBreaks(expectedSource) === countLineBreaks(replacement)
    ? 'preserve'
    : 'change'
}

export function pushUniqueEdit(
  edits: CanvasEditUnit[],
  seen: Set<string>,
  key: string,
  edit: CanvasEditUnit
) {
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  edits.push(edit)
}

export function readAllIds(record: CanvasDocumentRecord) {
  return new Set([
    ...record.ast.groups.map((group) => group.id),
    ...record.ast.nodes.map((node) => node.id),
    ...record.ast.edges.map((edge) => edge.id)
  ])
}

export function readRangeText(source: string, range: CanvasSourceRange) {
  return source.slice(range.start.offset, range.end.offset)
}

export function readNextId(prefix: 'note' | 'shape' | 'edge' | 'image', existingIds: Set<string>) {
  let index = 1

  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1
  }

  return `${prefix}-${index}`
}

export function readNextObjectId(node: CanvasNode, existingIds: Set<string>) {
  if (node.component === 'note') {
    return readNextId('note', existingIds)
  }

  if (node.component === 'image') {
    return readNextId('image', existingIds)
  }

  return readNextId('shape', existingIds)
}

export function buildObjectBlock(name: string, metadata: Record<string, unknown>, body?: string) {
  const lines = [
    stringifyDirectiveHeader(name, metadata),
    ...serializeBodyFragment(body ?? '').split('\n').filter((line, index, allLines) => {
      return !(index === allLines.length - 1 && line === '')
    }),
    ':::'
  ]

  return lines.join('\n')
}

export function buildGroupBlock(input: {
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

export function buildNodeMetadata(node: CanvasNode) {
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

export function buildClipboardNodeMetadata(
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

export function buildEdgeMetadata(edge: CanvasEdge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    z: edge.z,
    locked: edge.locked,
    style: edge.style
  }
}

export function buildClipboardEdgeMetadata(edge: CanvasClipboardEdge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    locked: edge.locked,
    style: edge.style
  }
}

export function readCurrentMaxZ(record: CanvasDocumentRecord) {
  return Math.max(
    0,
    ...record.ast.groups.map((group) => group.z ?? 0),
    ...record.ast.nodes.map((node) => node.z ?? 0),
    ...record.ast.edges.map((edge) => edge.z ?? 0)
  )
}

export function readPasteDelta(intent: Extract<CanvasDocumentEditIntent, { kind: 'paste-objects' }>) {
  if (intent.inPlace || !intent.payload.origin) {
    return { x: 0, y: 0 }
  }

  return {
    x: roundGeometry(intent.anchorX - intent.payload.origin.x),
    y: roundGeometry(intent.anchorY - intent.payload.origin.y)
  }
}

export function readNextGroupId(existingIds: Set<string>) {
  let index = 1

  while (existingIds.has(`group-${index}`)) {
    index += 1
  }

  return `group-${index}`
}

export function readNextClipboardNodeId(node: CanvasClipboardNode, existingIds: Set<string>) {
  if (node.component === 'note') {
    return readNextId('note', existingIds)
  }

  if (node.component === 'image') {
    return readNextId('image', existingIds)
  }

  return readNextId('shape', existingIds)
}

export function serializeGroupMembership(nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return '~~~yaml members\nnodes: []\n~~~'
  }

  return `~~~yaml members\nnodes:\n${nodeIds.map((nodeId) => `  - ${nodeId}`).join('\n')}\n~~~`
}

export function compareByZ(
  left: Pick<CanvasClipboardGroup | CanvasClipboardNode | CanvasClipboardEdge, 'z'>,
  right: Pick<CanvasClipboardGroup | CanvasClipboardNode | CanvasClipboardEdge, 'z'>
) {
  return (left.z ?? 0) - (right.z ?? 0)
}

export function readGroupIdFromBlock(block: string) {
  const match = /id:\s*([A-Za-z_][A-Za-z0-9_.-]*)/.exec(block)
  return match?.[1] ?? null
}

export function readGroupZFromBlock(block: string) {
  const match = /z:\s*(-?\d+)/.exec(block)

  if (!match) {
    return null
  }

  return Number(match[1])
}

export function patchLockedMetadata(metadata: Record<string, unknown>, locked: boolean) {
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

export function reorderArrangeObjects(
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

export function readArrangeHeaderName(
  kind: 'edge' | 'group' | 'node',
  object: CanvasEdge | CanvasGroup | CanvasNode
) {
  if (kind === 'group') {
    return 'group'
  }

  if (kind === 'edge') {
    return 'edge'
  }

  if (!('component' in object)) {
    throw new Error('Expected a node object while building arrange edits.')
  }

  return object.component
}

export function roundGeometry(value: number) {
  return Math.round(value)
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

function countLineBreaks(value: string) {
  return (value.match(/\n/g) ?? []).length
}

export function readMetadataRecord(value: unknown) {
  return isRecord(value) ? value : {}
}

function serializeBodyFragment(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\n+$/g, '')

  if (normalized.length === 0) {
    return ''
  }

  return `${normalized}\n`
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
