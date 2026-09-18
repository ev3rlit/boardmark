// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { editBoard } from './board-edit'
import { emptyBoard, type BoardFile } from '../../canvas-domain/src/board-file'
import type { CanvasDocumentEditIntent } from './edit-intents'

const note = {
  id: 'n',
  kind: 'markdown' as const,
  content: '메모',
  frame: { x: 10, y: 20, width: 320, height: 220 }
}
const image = {
  id: 'i',
  kind: 'image' as const,
  reference: { kind: 'file' as const, path: '../image.png' },
  frame: { x: 500, y: 100, width: 300, height: 200 }
}
const initial: BoardFile = {
  ...emptyBoard(),
  items: [note, image],
  connections: [{ id: 'e', source: 'n', target: 'i' }]
}
function apply(board: BoardFile, intent: CanvasDocumentEditIntent) {
  const result = editBoard(board, intent)
  if (!result.ok) throw Error(result.error.message)
  return result.value
}
describe('board edit commands', () => {
  it('keeps ids and array order stable through movement, resize, metadata and body edits', () => {
    let board = apply(initial, {
      kind: 'move-nodes',
      moves: [
        { nodeId: 'n', x: 30, y: 40 },
        { nodeId: 'i', x: 600, y: 400 }
      ]
    })
    board = apply(board, {
      kind: 'resize-node',
      nodeId: 'i',
      x: 600,
      y: 400,
      width: 640,
      height: 480
    })
    board = apply(board, { kind: 'replace-object-body', objectId: 'n', markdown: '# 새 내용' })
    board = apply(board, {
      kind: 'update-image-metadata',
      nodeId: 'i',
      alt: '설명',
      lockAspectRatio: false
    })
    board = apply(board, { kind: 'replace-edge-body', edgeId: 'e', markdown: '참조' })
    expect(board.items.map((item) => item.id)).toEqual(['n', 'i'])
    expect(board.connections[0]).toMatchObject({ id: 'e', content: '참조' })
    expect(board.items[1]).toMatchObject({
      alt: '설명',
      lockAspectRatio: false,
      reference: image.reference
    })
    expect(initial.items[0]).toEqual(note)
  })
  it('duplicates with new stable ids and remaps connection endpoints', () => {
    const board = apply(initial, {
      kind: 'duplicate-objects',
      nodeIds: ['n', 'i'],
      edgeIds: ['e'],
      offsetX: 50,
      offsetY: 60
    })
    expect(new Set([...board.items, ...board.connections].map((entry) => entry.id)).size).toBe(6)
    expect(board.connections[1].source).toBe(board.items[2].id)
    expect(board.connections[1].target).toBe(board.items[3].id)
    expect(board.items[3]).toMatchObject({ reference: image.reference, frame: { x: 550, y: 160 } })
  })
  it('rejects invalid edits without mutating the source and validates group references', () => {
    expect(
      editBoard(initial, { kind: 'update-edge-endpoints', edgeId: 'e', from: 'missing', to: 'i' })
    ).toMatchObject({ ok: false, error: { code: 'missing-target' } })
    expect(
      editBoard(initial, { kind: 'resize-node', nodeId: 'n', x: 0, y: 0, width: -2, height: 20 }).ok
    ).toBe(false)
    expect(
      editBoard(initial, { kind: 'upsert-group', groupId: 'g', nodeIds: ['missing'], z: 0 }).ok
    ).toBe(false)
    expect(initial.items).toEqual([note, image])
  })
})
