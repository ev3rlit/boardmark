import { load } from 'js-yaml'
import { err, ok, type Result } from 'neverthrow'
import { parseObjectHeader } from './object-header'
import {
  DEFAULT_CANVAS_VIEWPORT,
  normalizeCanvasColorHex,
  type CanvasAssetPolicy,
  type CanvasAST,
  type CanvasDirectiveSourceMap,
  type CanvasEdge,
  type CanvasFrontmatter,
  type CanvasGroup,
  type CanvasNode,
  type CanvasObjectAt,
  type CanvasObjectStyle,
  type CanvasParseError,
  type CanvasParseIssue,
  type CanvasSourceRange,
  type CanvasViewport
} from '../../canvas-domain/src/index'

type ParseSuccess = {
  ast: CanvasAST
  issues: CanvasParseIssue[]
}

type SplitFrontmatterResult = {
  content: string
  contentStartLine: number
  contentStartOffset: number
  frontmatterSource: string
}

type SourceLocator = {
  source: string
  lineStarts: number[]
}

type BlockHeader = {
  line: number
  lineEndOffset: number
  lineStartOffset: number
  name: string
  rawMetadata: string
}

type ObjectBlock = {
  closingLine: number
  closingLineEndOffset: number
  closingLineStartOffset: number
  header: BlockHeader
  rawBody: string
  sourceMap: CanvasDirectiveSourceMap
}

export function parseCanvasDocument(
  source: string
): Result<ParseSuccess, CanvasParseError> {
  const frontmatterResult = parseFrontmatter(source)

  if (frontmatterResult.isErr()) {
    return err(frontmatterResult.error)
  }

  const sourceLocator = createSourceLocator(source)
  const blocksResult = splitObjectBlocks({
    body: frontmatterResult.value.content,
    contentStartLine: frontmatterResult.value.contentStartLine,
    contentStartOffset: frontmatterResult.value.contentStartOffset,
    source,
    sourceLocator
  })

  if (blocksResult.isErr()) {
    return err(blocksResult.error)
  }

  const issues: CanvasParseIssue[] = []
  const groups: CanvasGroup[] = []
  const nodes: CanvasNode[] = []
  const pendingEdges: CanvasEdge[] = []

  for (const block of blocksResult.value) {
    if (block.header.name === 'edge') {
      const edgeResult = parseEdgeBlock(block)

      if (edgeResult.isErr()) {
        issues.push(edgeResult.error)
        continue
      }

      pendingEdges.push(edgeResult.value)
      continue
    }

    if (block.header.name === 'group') {
      const groupResult = parseGroupBlock(block)

      if (groupResult.isErr()) {
        issues.push(groupResult.error)
        continue
      }

      groups.push(groupResult.value)
      continue
    }

    const nodeResult = parseNodeBlock(block)

    if (nodeResult.isErr()) {
      issues.push(nodeResult.error)
      continue
    }

    nodes.push(nodeResult.value)
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = pendingEdges.filter((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      return true
    }

    issues.push({
      level: 'warning',
      kind: 'invalid-edge',
      message: `Edge "${edge.id}" references missing nodes "${edge.from}" -> "${edge.to}".`,
      line: edge.position.start.line,
      objectId: edge.id
    })

    return false
  })

  return ok({
    ast: {
      frontmatter: frontmatterResult.value.frontmatter,
      groups,
      nodes,
      edges
    },
    issues
  })
}

export { parseJsonObjectHeader, parseObjectHeader, stringifyObjectHeader } from './object-header'

function parseFrontmatter(
  source: string
): Result<
  {
    content: string
    contentStartLine: number
    contentStartOffset: number
    frontmatter: CanvasFrontmatter
  },
  CanvasParseError
> {
  const splitResult = splitFrontmatter(source)

  if (splitResult.isErr()) {
    return err(splitResult.error)
  }

  const parsedResult = parseYamlMapping(
    splitResult.value.frontmatterSource,
    'Frontmatter must be a mapping object.'
  )

  if (parsedResult.isErr()) {
    return err(parsedResult.error)
  }

  const frontmatter = parsedResult.value

  if (frontmatter.type !== 'canvas') {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter "type" must be "canvas".'
    })
  }

  if (typeof frontmatter.version !== 'number') {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter "version" must be a number.'
    })
  }

  const styleResult = parseOptionalStringArray('style', frontmatter.style)

  if (styleResult.isErr()) {
    return err(styleResult.error)
  }

  const componentsResult = parseOptionalStringArray('components', frontmatter.components)

  if (componentsResult.isErr()) {
    return err(componentsResult.error)
  }

  const viewportResult = parseViewport(frontmatter.viewport)

  if (viewportResult.isErr()) {
    return err(viewportResult.error)
  }

  const assetPolicyResult = parseAssetPolicy(frontmatter.assetPolicy)

  if (assetPolicyResult.isErr()) {
    return err(assetPolicyResult.error)
  }

  return ok({
    content: splitResult.value.content,
    contentStartLine: splitResult.value.contentStartLine,
    contentStartOffset: splitResult.value.contentStartOffset,
    frontmatter: {
      type: 'canvas',
      version: frontmatter.version,
      style: styleResult.value,
      components: componentsResult.value,
      preset: readOptionalString(frontmatter.preset),
      defaultStyle: readOptionalString(frontmatter.defaultStyle),
      assetPolicy: assetPolicyResult.value,
      viewport: viewportResult.value
    }
  })
}

function splitFrontmatter(
  source: string
): Result<SplitFrontmatterResult, CanvasParseError> {
  if (!source.startsWith('---\n')) {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Document must start with YAML frontmatter.'
    })
  }

  const closingIndex = source.indexOf('\n---\n', 4)

  if (closingIndex === -1) {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter must end with a closing "---" line.'
    })
  }

  const contentStartOffset = closingIndex + 5

  return ok({
    frontmatterSource: source.slice(4, closingIndex),
    content: source.slice(contentStartOffset),
    contentStartLine: source.slice(0, contentStartOffset).split('\n').length,
    contentStartOffset
  })
}

function splitObjectBlocks({
  body,
  contentStartLine,
  contentStartOffset,
  source,
  sourceLocator
}: {
  body: string
  contentStartLine: number
  contentStartOffset: number
  source: string
  sourceLocator: SourceLocator
}): Result<ObjectBlock[], CanvasParseError> {
  const lines = body.split('\n')
  const blocks: ObjectBlock[] = []
  let currentOffset = contentStartOffset
  let fenceMarker: '```' | '~~~' | null = null
  let openBlock: BlockHeader | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const lineNumber = contentStartLine + index
    const lineStartOffset = currentOffset
    const lineEndOffset = lineStartOffset + line.length
    const lineRange = readLineRange(sourceLocator, lineNumber)
    const fenceToken = readFenceToken(line)

    if (openBlock) {
      if (fenceMarker === null && line === ':::') {
        const bodyStartOffset = readLineBreakOffset(source, openBlock.lineEndOffset)
        const rawBody = source.slice(bodyStartOffset, lineStartOffset)

        blocks.push({
          closingLine: lineNumber,
          closingLineEndOffset: lineEndOffset,
          closingLineStartOffset: lineStartOffset,
          header: openBlock,
          rawBody,
          sourceMap: buildSourceMap({
            bodyStartOffset,
            closingLineRange: lineRange,
            header: openBlock,
            rawBody,
            sourceLocator
          })
        })
        openBlock = null
      } else if (fenceToken) {
        fenceMarker = fenceMarker === fenceToken ? null : fenceToken
      }
    } else if (fenceToken) {
      fenceMarker = fenceMarker === fenceToken ? null : fenceToken
    } else if (fenceMarker === null) {
      const openingMatch = /^(:::\s+)([A-Za-z][\w.-]*)(?:\s+(.*))?$/.exec(line)

      if (openingMatch) {
        openBlock = {
          line: lineNumber,
          lineEndOffset,
          lineStartOffset,
          name: openingMatch[2],
          rawMetadata: openingMatch[3] ?? ''
        }
      }
    }

    currentOffset = lineEndOffset + 1
  }

  if (openBlock) {
    return err({
      kind: 'invalid-document',
      message: `Directive "${openBlock.name}" starting on line ${openBlock.line} is missing a closing ":::" line.`
    })
  }

  return ok(blocks)
}

function parseNodeBlock(block: ObjectBlock): Result<CanvasNode, CanvasParseIssue> {
  if (block.header.name === 'image') {
    return parseImageNodeBlock(block)
  }

  const metadataResult = parseInlineMetadata(block.header.rawMetadata)

  if (metadataResult.isErr()) {
    return err(invalidNode(block, metadataResult.error))
  }

  const metadata = metadataResult.value
  const extraKeys = Object.keys(metadata).filter((key) => !['id', 'at', 'locked', 'style', 'z'].includes(key))

  if (extraKeys.length > 0) {
    return err(
      invalidNode(
        block,
        `Node "${block.header.name}" contains unsupported top-level keys: ${extraKeys.join(', ')}.`
      )
    )
  }

  if (typeof metadata.id !== 'string' || metadata.id.length === 0) {
    return err(invalidNode(block, 'Node is missing a valid id.'))
  }

  const atResult = parseObjectAt(metadata.id, metadata.at)

  if (atResult.isErr()) {
    return err(invalidNode(block, atResult.error, metadata.id))
  }

  const styleResult = parseOptionalObjectStyle(metadata.id, metadata.style)

  if (styleResult.isErr()) {
    return err(invalidNode(block, styleResult.error, metadata.id))
  }

  const zResult = parseOptionalObjectZ(metadata.id, metadata.z)

  if (zResult.isErr()) {
    return err(invalidNode(block, zResult.error, metadata.id))
  }

  const lockedResult = parseOptionalObjectLocked(metadata.id, metadata.locked)

  if (lockedResult.isErr()) {
    return err(invalidNode(block, lockedResult.error, metadata.id))
  }

  return ok({
    id: metadata.id,
    component: block.header.name,
    at: atResult.value,
    z: zResult.value,
    locked: lockedResult.value,
    style: styleResult.value,
    body: readBlockBody(block.rawBody),
    position: block.sourceMap.objectRange,
    sourceMap: block.sourceMap
  })
}

function parseImageNodeBlock(block: ObjectBlock): Result<CanvasNode, CanvasParseIssue> {
  const metadataResult = parseInlineMetadata(block.header.rawMetadata)

  if (metadataResult.isErr()) {
    return err(invalidNode(block, metadataResult.error))
  }

  const metadata = metadataResult.value
  const extraKeys = Object.keys(metadata).filter((key) => {
    return !['id', 'src', 'alt', 'title', 'lockAspectRatio', 'at', 'locked', 'style', 'z'].includes(key)
  })

  if (extraKeys.length > 0) {
    return err(
      invalidNode(
        block,
        `Node "image" contains unsupported top-level keys: ${extraKeys.join(', ')}.`
      )
    )
  }

  if (typeof metadata.id !== 'string' || metadata.id.length === 0) {
    return err(invalidNode(block, 'Image node is missing a valid id.'))
  }

  const atResult = parseObjectAt(metadata.id, metadata.at)

  if (atResult.isErr()) {
    return err(invalidNode(block, atResult.error, metadata.id))
  }

  const styleResult = parseOptionalObjectStyle(metadata.id, metadata.style)

  if (styleResult.isErr()) {
    return err(invalidNode(block, styleResult.error, metadata.id))
  }

  const zResult = parseOptionalObjectZ(metadata.id, metadata.z)

  if (zResult.isErr()) {
    return err(invalidNode(block, zResult.error, metadata.id))
  }

  const lockedResult = parseOptionalObjectLocked(metadata.id, metadata.locked)

  if (lockedResult.isErr()) {
    return err(invalidNode(block, lockedResult.error, metadata.id))
  }

  if (typeof metadata.src !== 'string' || metadata.src.trim().length === 0) {
    return err(invalidNode(block, `Image "${metadata.id}" must define a non-empty "src" string.`, metadata.id))
  }

  if (typeof metadata.alt !== 'string') {
    return err(invalidNode(block, `Image "${metadata.id}" must define an "alt" string.`, metadata.id))
  }

  if (metadata.title !== undefined && typeof metadata.title !== 'string') {
    return err(invalidNode(block, `Image "${metadata.id}" must define "title" as a string when present.`, metadata.id))
  }

  if (
    metadata.lockAspectRatio !== undefined &&
    typeof metadata.lockAspectRatio !== 'boolean'
  ) {
    return err(
      invalidNode(
        block,
        `Image "${metadata.id}" must define "lockAspectRatio" as a boolean when present.`,
        metadata.id
      )
    )
  }

  if ((readBlockBody(block.rawBody) ?? '').trim().length > 0) {
    return err(invalidNode(block, `Image "${metadata.id}" must not define a body.`, metadata.id))
  }

  return ok({
    id: metadata.id,
    component: 'image',
    at: atResult.value,
    z: zResult.value,
    locked: lockedResult.value,
    style: styleResult.value,
    src: metadata.src,
    alt: metadata.alt,
    title: typeof metadata.title === 'string' ? metadata.title : undefined,
    lockAspectRatio: metadata.lockAspectRatio ?? true,
    position: block.sourceMap.objectRange,
    sourceMap: block.sourceMap
  })
}

function parseGroupBlock(block: ObjectBlock): Result<CanvasGroup, CanvasParseIssue> {
  const metadataResult = parseInlineMetadata(block.header.rawMetadata)

  if (metadataResult.isErr()) {
    return err(invalidNode(block, metadataResult.error))
  }

  const metadata = metadataResult.value
  const extraKeys = Object.keys(metadata).filter((key) => !['id', 'locked', 'z'].includes(key))

  if (extraKeys.length > 0) {
    return err(
      invalidNode(
        block,
        `Group contains unsupported top-level keys: ${extraKeys.join(', ')}.`,
        readOptionalId(metadata.id)
      )
    )
  }

  if (typeof metadata.id !== 'string' || metadata.id.length === 0) {
    return err(invalidNode(block, 'Group is missing a valid id.'))
  }

  const zResult = parseOptionalObjectZ(metadata.id, metadata.z)

  if (zResult.isErr()) {
    return err(invalidNode(block, zResult.error, metadata.id))
  }

  const lockedResult = parseOptionalObjectLocked(metadata.id, metadata.locked)

  if (lockedResult.isErr()) {
    return err(invalidNode(block, lockedResult.error, metadata.id))
  }

  const membersResult = parseGroupMembers(metadata.id, block.rawBody)

  if (membersResult.isErr()) {
    return err(invalidNode(block, membersResult.error, metadata.id))
  }

  return ok({
    id: metadata.id,
    z: zResult.value,
    locked: lockedResult.value,
    body: readBlockBody(block.rawBody),
    members: {
      nodeIds: membersResult.value
    },
    position: block.sourceMap.objectRange,
    sourceMap: block.sourceMap
  })
}

function parseEdgeBlock(block: ObjectBlock): Result<CanvasEdge, CanvasParseIssue> {
  const metadataResult = parseInlineMetadata(block.header.rawMetadata)

  if (metadataResult.isErr()) {
    return err(invalidEdge(block, metadataResult.error))
  }

  const metadata = metadataResult.value
  const extraKeys = Object.keys(metadata).filter(
    (key) => !['id', 'from', 'to', 'locked', 'style', 'z'].includes(key)
  )

  if (extraKeys.length > 0) {
    return err(
      invalidEdge(
        block,
        `Edge contains unsupported top-level keys: ${extraKeys.join(', ')}.`,
        readOptionalId(metadata.id)
      )
    )
  }

  if (typeof metadata.id !== 'string' || metadata.id.length === 0) {
    return err(invalidEdge(block, 'Edge is missing a valid id.'))
  }

  if (
    typeof metadata.from !== 'string' ||
    metadata.from.length === 0 ||
    typeof metadata.to !== 'string' ||
    metadata.to.length === 0
  ) {
    return err(
      invalidEdge(
        block,
        `Edge "${metadata.id}" is missing a valid from/to reference.`,
        metadata.id
      )
    )
  }

  const styleResult = parseOptionalObjectStyle(metadata.id, metadata.style)

  if (styleResult.isErr()) {
    return err(invalidEdge(block, styleResult.error, metadata.id))
  }

  const zResult = parseOptionalObjectZ(metadata.id, metadata.z)

  if (zResult.isErr()) {
    return err(invalidEdge(block, zResult.error, metadata.id))
  }

  const lockedResult = parseOptionalObjectLocked(metadata.id, metadata.locked)

  if (lockedResult.isErr()) {
    return err(invalidEdge(block, lockedResult.error, metadata.id))
  }

  return ok({
    id: metadata.id,
    from: metadata.from,
    to: metadata.to,
    z: zResult.value,
    locked: lockedResult.value,
    style: styleResult.value,
    body: readBlockBody(block.rawBody),
    position: block.sourceMap.objectRange,
    sourceMap: block.sourceMap
  })
}

function parseInlineMetadata(
  source: string
): Result<Record<string, unknown>, string> {
  if (source.trim().length === 0) {
    return ok({})
  }

  const parsedResult = parseObjectHeader(source)

  if (parsedResult.isErr()) {
    return err(parsedResult.error)
  }

  return ok(parsedResult.value.value)
}

function parseYamlMapping(
  source: string,
  invalidShapeMessage: string
): Result<Record<string, unknown>, CanvasParseError> {
  let value: unknown

  try {
    value = load(source)
  } catch (error) {
    return err({
      kind: 'invalid-document',
      message: toErrorMessage(error, 'YAML content could not be parsed.')
    })
  }

  if (!isRecord(value)) {
    return err({
      kind: 'invalid-document',
      message: invalidShapeMessage
    })
  }

  return ok(value)
}

function parseOptionalStringArray(
  key: 'style' | 'components',
  value: unknown
): Result<string[] | undefined, CanvasParseError> {
  if (value === undefined) {
    return ok(undefined)
  }

  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return err({
      kind: 'invalid-frontmatter',
      message: `Frontmatter "${key}" must be an array of strings.`
    })
  }

  return ok(value)
}

function parseAssetPolicy(
  value: unknown
): Result<CanvasAssetPolicy | undefined, CanvasParseError> {
  if (value === undefined) {
    return ok(undefined)
  }

  if (value !== 'document-adjacent') {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter "assetPolicy" must be "document-adjacent" when present.'
    })
  }

  return ok(value)
}

function parseViewport(value: unknown): Result<CanvasViewport, CanvasParseError> {
  if (value === undefined) {
    return ok(DEFAULT_CANVAS_VIEWPORT)
  }

  if (!isRecord(value)) {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter "viewport" must be an object.'
    })
  }

  if (
    typeof value.x !== 'number' ||
    typeof value.y !== 'number' ||
    typeof value.zoom !== 'number'
  ) {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter "viewport" must contain numeric x, y, and zoom values.'
    })
  }

  return ok({
    x: value.x,
    y: value.y,
    zoom: value.zoom
  })
}

function parseObjectAt(id: string, value: unknown): Result<CanvasObjectAt, string> {
  if (!isRecord(value)) {
    return err(`Node "${id}" is missing a valid "at" object.`)
  }

  if ('anchor' in value) {
    return err(`Node "${id}" uses unsupported "at.anchor" metadata.`)
  }

  if (typeof value.x !== 'number' || typeof value.y !== 'number') {
    return err(`Node "${id}" must define numeric "at.x" and "at.y" values.`)
  }

  if ('w' in value && value.w !== undefined && typeof value.w !== 'number') {
    return err(`Node "${id}" must define numeric "at.w" when present.`)
  }

  if ('h' in value && value.h !== undefined && typeof value.h !== 'number') {
    return err(`Node "${id}" must define numeric "at.h" when present.`)
  }

  return ok({
    x: value.x,
    y: value.y,
    w: typeof value.w === 'number' ? value.w : undefined,
    h: typeof value.h === 'number' ? value.h : undefined
  })
}

function parseOptionalObjectStyle(
  id: string,
  value: unknown
): Result<CanvasObjectStyle | undefined, string> {
  if (value === undefined) {
    return ok(undefined)
  }

  if (!isRecord(value)) {
    return err(`Object "${id}" has an invalid "style" object.`)
  }

  const extraKeys = Object.keys(value).filter((key) => !['bg', 'stroke'].includes(key))

  if (extraKeys.length > 0) {
    return err(`Object "${id}" contains unsupported style keys: ${extraKeys.join(', ')}.`)
  }

  const bgResult = parseOptionalStyleColorSlot(id, 'bg', value.bg)

  if (bgResult.isErr()) {
    return err(bgResult.error)
  }

  const strokeResult = parseOptionalStyleColorSlot(id, 'stroke', value.stroke)

  if (strokeResult.isErr()) {
    return err(strokeResult.error)
  }

  if (!bgResult.value && !strokeResult.value) {
    return ok(undefined)
  }

  return ok({
    bg: bgResult.value,
    stroke: strokeResult.value
  })
}

function parseOptionalStyleColorSlot(
  id: string,
  key: 'bg' | 'stroke',
  value: unknown
): Result<{ color?: string } | undefined, string> {
  if (value === undefined) {
    return ok(undefined)
  }

  if (!isRecord(value)) {
    return err(`Object "${id}" must define "style.${key}" as an object.`)
  }

  const extraKeys = Object.keys(value).filter((entry) => entry !== 'color')

  if (extraKeys.length > 0) {
    return err(`Object "${id}" contains unsupported "style.${key}" keys: ${extraKeys.join(', ')}.`)
  }

  if (value.color === undefined) {
    return ok(undefined)
  }

  if (typeof value.color !== 'string') {
    return err(`Object "${id}" must define "style.${key}.color" as a string.`)
  }

  const color = normalizeCanvasColorHex(value.color)

  if (!color) {
    return err(
      `Object "${id}" must define "style.${key}.color" as "#RRGGBB" or "#RRGGBBAA".`
    )
  }

  return ok({
    color
  })
}

function parseOptionalObjectZ(id: string, value: unknown): Result<number | undefined, string> {
  if (value === undefined) {
    return ok(undefined)
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return err(`Object "${id}" must define "z" as a finite number.`)
  }

  return ok(value)
}

function parseOptionalObjectLocked(id: string, value: unknown): Result<boolean | undefined, string> {
  if (value === undefined) {
    return ok(undefined)
  }

  if (typeof value !== 'boolean') {
    return err(`Object "${id}" must define "locked" as a boolean when present.`)
  }

  return ok(value)
}

function buildSourceMap({
  bodyStartOffset,
  closingLineRange,
  header,
  rawBody,
  sourceLocator
}: {
  bodyStartOffset: number
  closingLineRange: CanvasSourceRange
  header: BlockHeader
  rawBody: string
  sourceLocator: SourceLocator
}): CanvasDirectiveSourceMap {
  const headerLineRange = readLineRange(sourceLocator, header.line)
  const metadataRange =
    header.rawMetadata.length > 0
      ? readOffsetRange(
          sourceLocator,
          header.lineStartOffset + (header.lineEndOffset - header.lineStartOffset - header.rawMetadata.length),
          header.lineEndOffset
        )
      : undefined
  const bodyRange = readOffsetRange(
    sourceLocator,
    bodyStartOffset,
    bodyStartOffset + rawBody.length
  )

  return {
    objectRange: readOffsetRange(
      sourceLocator,
      headerLineRange.start.offset,
      closingLineRange.end.offset
    ),
    headerLineRange,
    metadataRange,
    bodyRange,
    closingLineRange
  }
}

function invalidNode(block: ObjectBlock, message: string, objectId?: string): CanvasParseIssue {
  return {
    level: 'warning',
    kind: 'invalid-node',
    message,
    line: block.header.line,
    objectId
  }
}

function invalidEdge(block: ObjectBlock, message: string, objectId?: string): CanvasParseIssue {
  return {
    level: 'warning',
    kind: 'invalid-edge',
    message,
    line: block.header.line,
    objectId
  }
}

function readBlockBody(rawBody: string): string | undefined {
  return rawBody.length > 0 ? rawBody : undefined
}

function parseGroupMembers(groupId: string, rawBody: string): Result<string[], string> {
  const match = /(?:^|\n)(```|~~~)yaml members\n([\s\S]*?)\n\1(?:\n|$)/.exec(rawBody)

  if (!match) {
    return ok([])
  }

  const parsedResult = parseYamlMapping(
    match[2],
    `Group "${groupId}" members block must be a mapping object.`
  )

  if (parsedResult.isErr()) {
    return err(parsedResult.error.message)
  }

  const nodes = parsedResult.value.nodes

  if (nodes === undefined) {
    return ok([])
  }

  if (!Array.isArray(nodes) || !nodes.every((entry) => typeof entry === 'string')) {
    return err(`Group "${groupId}" must define "nodes" as an array of strings in the members block.`)
  }

  return ok(nodes)
}

function readFenceToken(line: string): '```' | '~~~' | null {
  if (line.startsWith('```')) {
    return '```'
  }

  if (line.startsWith('~~~')) {
    return '~~~'
  }

  return null
}

function createSourceLocator(source: string): SourceLocator {
  const lineStarts = [0]

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      lineStarts.push(index + 1)
    }
  }

  return {
    source,
    lineStarts
  }
}

function readLineRange(sourceLocator: SourceLocator, line: number): CanvasSourceRange {
  const startOffset = readLineStartOffset(sourceLocator, line)
  const endOffset = readLineEndOffset(sourceLocator, line)

  return {
    start: {
      offset: startOffset,
      line
    },
    end: {
      offset: endOffset,
      line
    }
  }
}

function readOffsetRange(
  sourceLocator: SourceLocator,
  startOffset: number,
  endOffset: number
): CanvasSourceRange {
  const normalizedStartOffset = Math.max(0, Math.min(startOffset, sourceLocator.source.length))
  const normalizedEndOffset = Math.max(
    normalizedStartOffset,
    Math.min(endOffset, sourceLocator.source.length)
  )

  return {
    start: readPointAtOffset(sourceLocator, normalizedStartOffset),
    end: readPointAtOffset(sourceLocator, normalizedEndOffset)
  }
}

function readLineBreakOffset(source: string, lineEndOffset: number): number {
  return source[lineEndOffset] === '\n' ? lineEndOffset + 1 : lineEndOffset
}

function readPointAtOffset(sourceLocator: SourceLocator, offset: number) {
  let lineIndex = 0

  while (
    lineIndex + 1 < sourceLocator.lineStarts.length &&
    sourceLocator.lineStarts[lineIndex + 1] <= offset
  ) {
    lineIndex += 1
  }

  return {
    offset,
    line: lineIndex + 1
  }
}

function readLineStartOffset(sourceLocator: SourceLocator, line: number): number {
  return sourceLocator.lineStarts[line - 1] ?? sourceLocator.source.length
}

function readLineEndOffset(sourceLocator: SourceLocator, line: number): number {
  const startOffset = readLineStartOffset(sourceLocator, line)
  const nextLineStart = sourceLocator.lineStarts[line] ?? sourceLocator.source.length

  if (nextLineStart > startOffset && sourceLocator.source[nextLineStart - 1] === '\n') {
    return nextLineStart - 1
  }

  return nextLineStart
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readOptionalId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
