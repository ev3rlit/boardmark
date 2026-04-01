import { toMarkdown } from 'mdast-util-to-markdown'
import { err, ok, type Result } from 'neverthrow'
import { unified } from 'unified'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import {
  CANVAS_EDGE_KINDS,
  CANVAS_NODE_COLORS,
  DEFAULT_CANVAS_VIEWPORT,
  type CanvasAST,
  type CanvasEdge,
  type CanvasFrontmatter,
  type CanvasNode,
  type CanvasParseError,
  type CanvasParseIssue,
  type CanvasSourceRange,
  type CanvasViewport
} from '../../canvas-domain/src/index'

type DirectiveNode = {
  type: 'containerDirective'
  name: string
  attributes?: Record<string, string | null | undefined>
  children?: unknown[]
  position?: {
    start: { line: number; offset: number }
    end: { line: number; offset: number }
  }
}

type MarkdownRoot = {
  type: 'root'
  children: unknown[]
}

type ParseSuccess = {
  ast: CanvasAST
  issues: CanvasParseIssue[]
}

export function parseCanvasDocument(
  source: string
): Result<ParseSuccess, CanvasParseError> {
  const frontmatterResult = parseFrontmatter(source)

  if (frontmatterResult.isErr()) {
    return err(frontmatterResult.error)
  }

  const normalizedBody = normalizeDirectiveSyntax(frontmatterResult.value.content)
  const rootResult = parseMarkdownRoot(normalizedBody)

  if (rootResult.isErr()) {
    return err(rootResult.error)
  }

  const issues: CanvasParseIssue[] = []
  const nodes: CanvasNode[] = []
  const pendingEdges: CanvasEdge[] = []

  visit(rootResult.value, 'containerDirective', (node: unknown) => {
    const directive = node as DirectiveNode

    if (directive.name === 'edge') {
      const edgeResult = parseEdgeDirective(directive)

      if (edgeResult.isErr()) {
        issues.push(edgeResult.error)
        return
      }

      pendingEdges.push(edgeResult.value)
      return
    }

    if (directive.name !== 'note') {
      issues.push({
        level: 'warning',
        kind: 'unsupported-node-type',
        message: `Unsupported node type "${directive.name}" was skipped.`,
        line: directive.position?.start.line
      })
      return
    }

    const nodeResult = parseNoteDirective(directive)

    if (nodeResult.isErr()) {
      issues.push(nodeResult.error)
      return
    }

    nodes.push(nodeResult.value)
  })

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
      nodes,
      edges
    },
    issues
  })
}

function parseFrontmatter(
  source: string
): Result<{ frontmatter: CanvasFrontmatter; content: string }, CanvasParseError> {
  const splitResult = splitFrontmatter(source)

  if (splitResult.isErr()) {
    return err(splitResult.error)
  }

  const parsedResult = parseFrontmatterBlock(splitResult.value.frontmatterSource)

  if (parsedResult.isErr()) {
    return err(parsedResult.error)
  }

  const frontmatter = parsedResult.value

  if (!isRecord(frontmatter)) {
    return err({
      kind: 'invalid-frontmatter',
      message: 'Frontmatter must be a mapping object.'
    })
  }

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

  const viewportResult = parseViewport(frontmatter.viewport)

  if (viewportResult.isErr()) {
    return err(viewportResult.error)
  }

  return ok({
    frontmatter: {
      type: 'canvas',
      version: frontmatter.version,
      style: readOptionalString(frontmatter.style),
      components: readOptionalString(frontmatter.components),
      preset: readOptionalString(frontmatter.preset),
      viewport: viewportResult.value
    },
    content: splitResult.value.content
  })
}

function parseViewport(value: unknown): Result<CanvasViewport | undefined, CanvasParseError> {
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

function parseMarkdownRoot(source: string): Result<MarkdownRoot, CanvasParseError> {
  try {
    return ok(unified().use(remarkParse).use(remarkDirective).parse(source) as MarkdownRoot)
  } catch (error) {
    return err({
      kind: 'invalid-document',
      message: toErrorMessage(error, 'Markdown body could not be parsed.')
    })
  }
}

function parseNoteDirective(node: DirectiveNode): Result<CanvasNode, CanvasParseIssue> {
  const attributes = node.attributes ?? {}
  const id = attributes.id
  const x = parseNumericAttribute(attributes.x)
  const y = parseNumericAttribute(attributes.y)
  const w = parseOptionalNumericAttribute(attributes.w)
  const color = attributes.color

  if (typeof id !== 'string' || id.length === 0) {
    return err(invalidNode(node, 'Note is missing a valid id.'))
  }

  if (x === null || y === null) {
    return err(invalidNode(node, `Note "${id}" is missing numeric x or y coordinates.`, id))
  }

  if (w === null) {
    return err(invalidNode(node, `Note "${id}" has an invalid width.`, id))
  }

  if (color && !CANVAS_NODE_COLORS.includes(color as (typeof CANVAS_NODE_COLORS)[number])) {
    return err(invalidNode(node, `Note "${id}" has an unsupported color "${color}".`, id))
  }

  return ok({
    id,
    type: 'note',
    x,
    y,
    w: w ?? undefined,
    color: color ? (color as CanvasNode['color']) : undefined,
    content: stringifyDirectiveContent(node.children),
    position: readPosition(node)
  })
}

function parseEdgeDirective(node: DirectiveNode): Result<CanvasEdge, CanvasParseIssue> {
  const attributes = node.attributes ?? {}
  const id = attributes.id
  const from = attributes.from
  const to = attributes.to
  const kind = attributes.kind

  if (typeof id !== 'string' || id.length === 0) {
    return err(invalidEdge(node, 'Edge is missing a valid id.'))
  }

  if (typeof from !== 'string' || typeof to !== 'string' || from.length === 0 || to.length === 0) {
    return err(invalidEdge(node, `Edge "${id}" is missing a valid from/to reference.`, id))
  }

  if (kind && !CANVAS_EDGE_KINDS.includes(kind as (typeof CANVAS_EDGE_KINDS)[number])) {
    return err(invalidEdge(node, `Edge "${id}" has an unsupported kind "${kind}".`, id))
  }

  const content = stringifyDirectiveContent(node.children).trim()

  return ok({
    id,
    from,
    to,
    kind: kind ? (kind as CanvasEdge['kind']) : undefined,
    content: content.length > 0 ? content : undefined,
    position: readPosition(node)
  })
}

function readPosition(node: DirectiveNode): CanvasSourceRange {
  return {
    start: {
      offset: node.position?.start.offset ?? 0,
      line: node.position?.start.line ?? 1
    },
    end: {
      offset: node.position?.end.offset ?? 0,
      line: node.position?.end.line ?? 1
    }
  }
}

function invalidNode(node: DirectiveNode, message: string, objectId?: string): CanvasParseIssue {
  return {
    level: 'warning',
    kind: 'invalid-node',
    message,
    line: node.position?.start.line,
    objectId
  }
}

function invalidEdge(node: DirectiveNode, message: string, objectId?: string): CanvasParseIssue {
  return {
    level: 'warning',
    kind: 'invalid-edge',
    message,
    line: node.position?.start.line,
    objectId
  }
}

function parseNumericAttribute(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalNumericAttribute(value: string | null | undefined): number | undefined | null {
  if (value === null || value === undefined) {
    return undefined
  }

  return parseNumericAttribute(value)
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function normalizeDirectiveSyntax(source: string): string {
  const lines = source.split('\n')
  let fenceMarker: '```' | '~~~' | null = null

  return lines
    .map((line) => {
      const trimmed = line.trimStart()

      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        const marker = trimmed.startsWith('```') ? '```' : '~~~'
        fenceMarker = fenceMarker === marker ? null : marker
        return line
      }

      if (fenceMarker !== null) {
        return line
      }

      const match = /^(\s*):::\s+([A-Za-z][\w-]*)(.*)$/.exec(line)

      if (!match) {
        return line
      }

      const [, indent, name, rawAttributes] = match
      const normalizedAttributes = normalizeDirectiveAttributes(rawAttributes.trim())

      return normalizedAttributes.length > 0
        ? `${indent}:::${name}{${normalizedAttributes}}`
        : `${indent}:::${name}`
    })
    .join('\n')
}

function stringifyDirectiveContent(children: unknown[] | undefined): string {
  const contentRoot: MarkdownRoot = {
    type: 'root',
    children: children ?? []
  }

  return toMarkdown(contentRoot as never)
}

function normalizeDirectiveAttributes(rawAttributes: string): string {
  if (rawAttributes.length === 0) {
    return ''
  }

  const parts = rawAttributes.split(/\s+/).filter(Boolean)

  return parts
    .map((part) => {
      if (part.startsWith('#')) {
        return part
      }

      return part
    })
    .join(' ')
}

function splitFrontmatter(
  source: string
): Result<{ frontmatterSource: string; content: string }, CanvasParseError> {
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

  return ok({
    frontmatterSource: source.slice(4, closingIndex),
    content: source.slice(closingIndex + 5)
  })
}

function parseFrontmatterBlock(
  source: string
): Result<Record<string, unknown>, CanvasParseError> {
  const lines = source.split('\n')
  const document: Record<string, unknown> = {}
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index]
    const trimmed = rawLine.trim()

    if (trimmed.length === 0) {
      index += 1
      continue
    }

    if (/^\s/.test(rawLine)) {
      return err({
        kind: 'invalid-frontmatter',
        message: `Unexpected indentation in frontmatter at line ${index + 1}.`
      })
    }

    const separatorIndex = rawLine.indexOf(':')

    if (separatorIndex === -1) {
      return err({
        kind: 'invalid-frontmatter',
        message: `Frontmatter line ${index + 1} is missing a ":" separator.`
      })
    }

    const key = rawLine.slice(0, separatorIndex).trim()
    const rest = rawLine.slice(separatorIndex + 1).trim()

    if (key.length === 0) {
      return err({
        kind: 'invalid-frontmatter',
        message: `Frontmatter line ${index + 1} has an empty key.`
      })
    }

    if (rest.length > 0) {
      document[key] = parseScalarValue(rest)
      index += 1
      continue
    }

    const nestedObject: Record<string, unknown> = {}
    index += 1

    while (index < lines.length) {
      const nestedLine = lines[index]

      if (nestedLine.trim().length === 0) {
        index += 1
        continue
      }

      if (!/^\s+/.test(nestedLine)) {
        break
      }

      const trimmedNestedLine = nestedLine.trim()
      const nestedSeparatorIndex = trimmedNestedLine.indexOf(':')

      if (nestedSeparatorIndex === -1) {
        return err({
          kind: 'invalid-frontmatter',
          message: `Nested frontmatter line ${index + 1} is missing a ":" separator.`
        })
      }

      const nestedKey = trimmedNestedLine.slice(0, nestedSeparatorIndex).trim()
      const nestedValue = trimmedNestedLine.slice(nestedSeparatorIndex + 1).trim()

      if (nestedKey.length === 0 || nestedValue.length === 0) {
        return err({
          kind: 'invalid-frontmatter',
          message: `Nested frontmatter line ${index + 1} must contain a key and value.`
        })
      }

      nestedObject[nestedKey] = parseScalarValue(nestedValue)
      index += 1
    }

    document[key] = nestedObject
  }

  return ok(document)
}

function parseScalarValue(value: string): unknown {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  if (value === 'null') {
    return null
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  const numericValue = Number(value)

  if (Number.isFinite(numericValue) && value.trim() !== '') {
    return numericValue
  }

  return value
}
