import { findNodeAtLocation, parseTree, type Node as JsonNode } from 'jsonc-parser'
import type {
  CanvasDirectiveSourceMap,
  CanvasNode,
  CanvasSourceRange
} from '../../canvas-domain/src/index'
import { parseBoard, type BoardResult } from '../../canvas-domain/src/board-file'
import type { CanvasDocumentRecord, CanvasDocumentSourceInput } from './index'

// A validated JSON board projects directly into the existing whiteboard scene.
// JSON ranges are real source locations for raw-copy; Markdown parsing/patching is never used.
export function readBoardScene(
  input: CanvasDocumentSourceInput
): BoardResult<CanvasDocumentRecord> {
  const parsed = parseBoard(input.source)
  if (!parsed.ok) return parsed
  const tree = parseTree(input.source)
  if (!tree)
    return {
      ok: false,
      error: { code: 'invalid-json', message: 'JSON 구문 트리를 읽을 수 없습니다.' }
    }
  function ranges(
    collection: string,
    index: number
  ): { position: CanvasSourceRange; sourceMap: CanvasDirectiveSourceMap } {
    const object = findNodeAtLocation(tree!, [collection, index])!
    const body = findNodeAtLocation(object, ['content'])
    const range = (node: JsonNode): CanvasSourceRange => ({
      start: { offset: node.offset, line: input.source.slice(0, node.offset).split('\n').length },
      end: {
        offset: node.offset + node.length,
        line: input.source.slice(0, node.offset + node.length).split('\n').length
      }
    })
    const objectRange = range(object)
    return {
      position: objectRange,
      sourceMap: {
        objectRange,
        headerLineRange: objectRange,
        metadataRange: objectRange,
        bodyRange: body ? range(body) : { start: objectRange.end, end: objectRange.end },
        closingLineRange: { start: objectRange.end, end: objectRange.end },
        bodyEncoding: 'json-string'
      }
    }
  }
  const board = parsed.value
  const nodes: CanvasNode[] = board.items.map((item, index) => ({
    id: item.id,
    component: item.kind === 'markdown' ? 'note' : item.kind === 'shape' ? item.component : 'image',
    at: {
      x: item.frame.x,
      y: item.frame.y,
      w: item.frame.width,
      h: item.kind === 'markdown' && item.autoHeight ? undefined : item.frame.height
    },
    body: item.kind === 'image' ? undefined : item.content,
    src: item.kind === 'image' ? item.reference.path : undefined,
    alt: item.kind === 'image' ? item.alt : undefined,
    title: item.kind === 'image' ? item.title : undefined,
    lockAspectRatio: item.kind === 'image' ? item.lockAspectRatio : undefined,
    z: item.z,
    locked: item.locked,
    style: item.style,
    ...ranges('items', index)
  }))
  return {
    ok: true,
    value: {
      storageFormat: 'boardmark',
      boardFile: board,
      locator: input.locator,
      source: input.source,
      isTemplate: input.isTemplate,
      name:
        input.locator.kind === 'file'
          ? input.locator.path.split(/[\\/]/).pop()!
          : input.locator.name,
      issues: [],
      ast: {
        frontmatter: { type: 'canvas', version: 1 },
        nodes,
        edges: board.connections.map((edge, index) => ({
          id: edge.id,
          from: edge.source,
          to: edge.target,
          body: edge.content,
          z: edge.z,
          locked: edge.locked,
          style: edge.style,
          ...ranges('connections', index)
        })),
        groups: (board.groups ?? []).map((group, index) => ({
          id: group.id,
          z: group.z,
          locked: group.locked,
          members: { nodeIds: group.items },
          ...ranges('groups', index)
        }))
      }
    }
  }
}
