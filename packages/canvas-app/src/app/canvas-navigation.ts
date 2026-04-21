import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  type CanvasEdge,
  type CanvasNode,
  type CanvasViewport
} from '@boardmark/canvas-domain'
import { readDocumentSelection, type CanvasSelectionSnapshot } from '@canvas-app/store/canvas-object-selection'
import type { CanvasViewportSize } from '@canvas-app/store/canvas-store-types'

export type CanvasNavigationBounds = {
  height: number
  width: number
  x: number
  y: number
}

export type CanvasNavigationEntry = {
  bodyText: string
  bounds: CanvasNavigationBounds | null
  id: string
  kind: 'edge' | 'node'
  label: string
  summary: string
}

export type CanvasNavigationMatch = {
  entry: CanvasNavigationEntry
  snippet: string
}

const JUMP_PADDING = 72
const FIT_PADDING = 96

export function readCanvasNavigationEntries(input: {
  edges: CanvasEdge[]
  nodes: CanvasNode[]
}) {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]))

  return [
    ...input.nodes.map<CanvasNavigationEntry>((node) => {
      const bodyText = normalizeBodyText(node.body)

      return {
        bodyText,
        bounds: readNodeBounds(node),
        id: node.id,
        kind: 'node',
        label: readPrimaryLabel(bodyText, node.id),
        summary: readSecondarySummary(bodyText, node.id)
      }
    }),
    ...input.edges.map<CanvasNavigationEntry>((edge) => {
      const bodyText = normalizeBodyText(edge.body)

      return {
        bodyText,
        bounds: readEdgeBounds(edge, nodesById),
        id: edge.id,
        kind: 'edge',
        label: readPrimaryLabel(bodyText, edge.id),
        summary: readSecondarySummary(bodyText, edge.id),
      }
    })
  ]
}

export function searchCanvasNavigationEntries(entries: CanvasNavigationEntry[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (normalizedQuery.length === 0) {
    return []
  }

  return entries
    .flatMap((entry, index) => {
      const match = readEntryMatch(entry, normalizedQuery)

      if (!match) {
        return []
      }

      return [{
        entry,
        index,
        snippet: match.snippet,
        weight: match.weight
      }]
    })
    .sort((left, right) => {
      if (left.weight !== right.weight) {
        return left.weight - right.weight
      }

      return left.index - right.index
    })
    .map<CanvasNavigationMatch>(({ entry, snippet }) => ({
      entry,
      snippet
    }))
}

export function readCanvasDocumentBounds(input: {
  edges: CanvasEdge[]
  nodes: CanvasNode[]
}) {
  return mergeBounds(readCanvasObjectBounds(input))
}

export function readCanvasSelectionBounds(state: CanvasSelectionSnapshot) {
  const selection = readDocumentSelection(state, {
    includeLocked: true
  })
  const nodesById = new Map(state.nodes.map((node) => [node.id, node]))

  return mergeBounds([
    ...selection.nodeIds
      .map((nodeId) => nodesById.get(nodeId) ?? null)
      .filter((node): node is CanvasNode => node !== null)
      .map((node) => readNodeBounds(node)),
    ...selection.edgeIds
      .map((edgeId) => state.edges.find((edge) => edge.id === edgeId) ?? null)
      .filter((edge): edge is CanvasEdge => edge !== null)
      .map((edge) => readEdgeBounds(edge, nodesById))
      .filter((bounds): bounds is CanvasNavigationBounds => bounds !== null)
  ])
}

export function readViewportForNavigationJump(input: {
  bounds: CanvasNavigationBounds
  viewport: CanvasViewport
  viewportSize: CanvasViewportSize
}) {
  if (!hasViewportSize(input.viewportSize)) {
    return null
  }

  const fittedZoom = readFittedZoom(input.bounds, input.viewportSize, JUMP_PADDING)
  const nextZoom = clampZoom(Math.min(input.viewport.zoom, fittedZoom))
  return centerViewportAroundBounds(input.bounds, input.viewportSize, nextZoom)
}

export function readViewportForFitBounds(input: {
  bounds: CanvasNavigationBounds
  viewportSize: CanvasViewportSize
}) {
  if (!hasViewportSize(input.viewportSize)) {
    return null
  }

  const nextZoom = readFittedZoom(input.bounds, input.viewportSize, FIT_PADDING)
  return centerViewportAroundBounds(input.bounds, input.viewportSize, nextZoom)
}

function readCanvasObjectBounds(input: {
  edges: CanvasEdge[]
  nodes: CanvasNode[]
}) {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]))

  return [
    ...input.nodes.map((node) => readNodeBounds(node)),
    ...input.edges
      .map((edge) => readEdgeBounds(edge, nodesById))
      .filter((bounds): bounds is CanvasNavigationBounds => bounds !== null)
  ]
}

function readNodeBounds(node: CanvasNode): CanvasNavigationBounds {
  return {
    x: node.at.x,
    y: node.at.y,
    width: Math.max(1, node.at.w ?? DEFAULT_NOTE_WIDTH),
    height: Math.max(1, node.at.h ?? DEFAULT_NOTE_HEIGHT)
  }
}

function readEdgeBounds(edge: CanvasEdge, nodesById: Map<string, CanvasNode>) {
  const fromNode = nodesById.get(edge.from)
  const toNode = nodesById.get(edge.to)

  if (!fromNode || !toNode) {
    return null
  }

  const fromCenter = readNodeCenter(fromNode)
  const toCenter = readNodeCenter(toNode)
  const left = Math.min(fromCenter.x, toCenter.x)
  const top = Math.min(fromCenter.y, toCenter.y)
  const right = Math.max(fromCenter.x, toCenter.x)
  const bottom = Math.max(fromCenter.y, toCenter.y)

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
}

function readNodeCenter(node: CanvasNode) {
  const bounds = readNodeBounds(node)

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  }
}

function mergeBounds(bounds: CanvasNavigationBounds[]) {
  if (bounds.length === 0) {
    return null
  }

  const left = Math.min(...bounds.map((entry) => entry.x))
  const top = Math.min(...bounds.map((entry) => entry.y))
  const right = Math.max(...bounds.map((entry) => entry.x + entry.width))
  const bottom = Math.max(...bounds.map((entry) => entry.y + entry.height))

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
}

function readEntryMatch(entry: CanvasNavigationEntry, query: string) {
  const labelIndex = entry.label.toLowerCase().indexOf(query)

  if (labelIndex >= 0) {
    return {
      snippet: entry.label,
      weight: 0
    }
  }

  const idIndex = entry.id.toLowerCase().indexOf(query)

  if (idIndex >= 0) {
    return {
      snippet: entry.id,
      weight: 1
    }
  }

  const bodyIndex = entry.bodyText.toLowerCase().indexOf(query)

  if (bodyIndex >= 0) {
    return {
      snippet: readMatchSnippet(entry.bodyText, bodyIndex, query.length),
      weight: 2
    }
  }

  return null
}

function readPrimaryLabel(bodyText: string, id: string) {
  const firstLine = readMeaningfulLines(bodyText)[0]

  if (!firstLine) {
    return id
  }

  const cleaned = stripMarkdownLine(firstLine)
  return cleaned.length > 0 ? cleaned : id
}

function readSecondarySummary(bodyText: string, id: string) {
  const meaningfulLines = readMeaningfulLines(bodyText)

  if (meaningfulLines.length === 0) {
    return id
  }

  const [firstLine, ...rest] = meaningfulLines
  const fallback = stripMarkdownLine(firstLine)
  const secondLine = rest.find((line) => stripMarkdownLine(line).length > 0)

  if (!secondLine) {
    return fallback.length > 0 ? fallback : id
  }

  return stripMarkdownLine(secondLine)
}

function readMeaningfulLines(bodyText: string) {
  return bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function stripMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .trim()
}

function normalizeBodyText(body: string | undefined) {
  return (body ?? '').replace(/\r\n/g, '\n').trim()
}

function readMatchSnippet(bodyText: string, startIndex: number, queryLength: number) {
  const snippetStart = Math.max(0, startIndex - 28)
  const snippetEnd = Math.min(bodyText.length, startIndex + queryLength + 36)
  const prefix = snippetStart > 0 ? '...' : ''
  const suffix = snippetEnd < bodyText.length ? '...' : ''

  return `${prefix}${bodyText.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim()}${suffix}`
}

function readFittedZoom(
  bounds: CanvasNavigationBounds,
  viewportSize: CanvasViewportSize,
  padding: number
) {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2)
  const availableHeight = Math.max(1, viewportSize.height - padding * 2)
  const widthZoom = availableWidth / Math.max(1, bounds.width)
  const heightZoom = availableHeight / Math.max(1, bounds.height)

  return clampZoom(Math.min(widthZoom, heightZoom))
}

function centerViewportAroundBounds(
  bounds: CanvasNavigationBounds,
  viewportSize: CanvasViewportSize,
  zoom: number
): CanvasViewport {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2

  return {
    x: Number((viewportSize.width / 2 - centerX * zoom).toFixed(2)),
    y: Number((viewportSize.height / 2 - centerY * zoom).toFixed(2)),
    zoom
  }
}

function clampZoom(zoom: number) {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number(zoom.toFixed(2))))
}

function hasViewportSize(viewportSize: CanvasViewportSize) {
  return viewportSize.width > 0 && viewportSize.height > 0
}
