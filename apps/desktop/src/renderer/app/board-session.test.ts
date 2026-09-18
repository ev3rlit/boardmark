import { describe, expect, it, vi } from 'vitest'
import { createBoardSession } from './board-session'
import {
  emptyBoard,
  serializeBoard,
  type BoardFile
} from '../../../../../packages/canvas-domain/src/board-file'
import type {
  BoardFileBridge,
  BoardRecord
} from '../../../../../packages/canvas-repository/src/board-file-contract'
import {
  readSelectionMarkdownContentBody,
  readSelectionRawText
} from '@boardmark/canvas-app/services/selection-plain-text'

function record(board = emptyBoard()): BoardRecord {
  const serialized = serializeBoard(board)
  if (!serialized.ok) throw Error(serialized.error.message)
  return { path: 'C:\\project\\board.boardmark', source: serialized.value, board }
}
function setup(board?: BoardFile) {
  let disk = record(board)
  const bridge: BoardFileBridge = {
    openProject: vi.fn(),
    listFolder: vi.fn(),
    createEntry: vi.fn(),
    openBoard: vi.fn(),
    referenceImageFile: vi.fn(),
    resolveImage: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'missing-image', message: '원본 이미지 없음' }
    })),
    saveBoard: vi.fn(async (input) => {
      if (input.expectedSource !== disk.source)
        return { ok: false as const, error: { code: 'external-change', message: '외부 변경' } }
      disk = record(input.board)
      return { ok: true as const, value: disk }
    })
  }
  const session = createBoardSession(bridge)
  session.install(disk)
  return { session, store: session.store, bridge, disk: () => disk }
}

describe('JSON board using the unchanged canvas store commands', () => {
  it('edits notes, moves, resizes, connects, saves and restores the existing scene', async () => {
    const { store, bridge, disk } = setup()
    await store.getState().createNoteAtViewport()
    const id = store.getState().nodes[0].id
    store.getState().startObjectEditing(id)
    store.getState().updateEditingMarkdown('# 원래 편집기\n\n**한글 메모**')
    expect(await store.getState().flushEditingSession({ reason: 'explicit' })).toBe(true)
    await store.getState().commitNodeMove(id, -70, 130)
    await store.getState().commitNodeResize(id, { x: -70, y: 130, width: 420, height: 310 })
    await store.getState().insertImageFromLink({ src: '../assets/image.png', alt: '시안' })
    const image = store.getState().nodes.find((node) => node.component === 'image')!
    await store.getState().createEdgeFromConnection(id, image.id)
    expect(bridge.saveBoard).not.toHaveBeenCalled()
    expect(store.getState().isDirty).toBe(true)
    await store.getState().saveCurrentDocument()
    expect(store.getState().isDirty).toBe(false)
    expect(disk().board.items[0]).toMatchObject({
      id,
      kind: 'markdown',
      content: '# 원래 편집기\n\n**한글 메모**',
      frame: { x: -70, y: 130, width: 420, height: 310 }
    })
    expect(disk().board.items[1]).toMatchObject({
      kind: 'image',
      reference: { kind: 'file', path: '../assets/image.png' }
    })
    const restarted = createBoardSession(bridge)
    restarted.install(disk())
    expect(restarted.store.getState().nodes).toEqual(store.getState().nodes)
    expect(restarted.store.getState().edges).toEqual(store.getState().edges)
  })
  it('preserves selection, color, shape, grouping, copy, undo and redo commands', async () => {
    const { store } = setup()
    await store.getState().createNoteAtViewport()
    await store
      .getState()
      .createShapeAtViewport({
        component: 'boardmark.shape.rect',
        body: 'Shape',
        width: 200,
        height: 100
      })
    const ids = store.getState().nodes.map((node) => node.id)
    store.getState().replaceSelectedNodes(ids)
    await store.getState().setSelectedObjectColor('bg', '#AABBCC')
    expect(store.getState().nodes.every((node) => node.style?.bg?.color === '#AABBCC')).toBe(true)
    await store.getState().groupSelection()
    expect(store.getState().groups[0].members.nodeIds).toEqual(ids)
    await store.getState().undo()
    expect(store.getState().groups).toHaveLength(0)
    await store.getState().redo()
    expect(store.getState().groups).toHaveLength(1)
    store.getState().replaceSelectedNodes([ids[0]])
    expect(readSelectionMarkdownContentBody(store.getState())).toBe('New note')
    expect(readSelectionRawText(store.getState())).toContain('"kind": "markdown"')
  })
  it('keeps a failed save and a late successful save from replacing the live draft', async () => {
    const { store, bridge } = setup()
    await store.getState().createNoteAtViewport()
    const before = store.getState().draftSource
    vi.mocked(bridge.saveBoard).mockResolvedValueOnce({
      ok: false,
      error: { code: 'write-failed', message: '디스크 오류' }
    })
    await store.getState().saveCurrentDocument()
    expect(store.getState().draftSource).toBe(before)
    expect(store.getState().isDirty).toBe(true)
    expect(store.getState().saveState).toMatchObject({ status: 'error' })
    let complete!: (result: Awaited<ReturnType<BoardFileBridge['saveBoard']>>) => void
    vi.mocked(bridge.saveBoard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const saving = store.getState().saveCurrentDocument()
    await vi.waitFor(() => expect(complete).toBeDefined())
    const snapshot = store.getState().document!.boardFile!
    const id = store.getState().nodes[0].id
    await store.getState().commitNodeMove(id, 999, 111)
    complete({ ok: true, value: record(snapshot) })
    await saving
    expect(store.getState().nodes[0].at.x).toBe(999)
    expect(store.getState().isDirty).toBe(true)
  })
  it('keeps missing images editable and removes only the selected placement and its edges', async () => {
    const { store } = setup()
    await store.getState().createNoteAtViewport()
    await store.getState().insertImageFromLink({ src: 'gone.png', alt: '누락' })
    const [note, image] = store.getState().nodes
    await store.getState().createEdgeFromConnection(note.id, image.id)
    store.getState().replaceSelectedNodes([image.id])
    await store.getState().deleteSelection()
    expect(store.getState().nodes.map((node) => node.id)).toEqual([note.id])
    expect(store.getState().edges).toHaveLength(0)
    await store.getState().undo()
    expect(store.getState().nodes).toHaveLength(2)
    expect(store.getState().edges).toHaveLength(1)
  })
  it('uses the existing image file command without importing or serializing image bytes', async () => {
    const { store, bridge, disk } = setup()
    vi.mocked(bridge.referenceImageFile).mockResolvedValue({
      ok: true,
      value: { path: '../assets/원본.png' }
    })
    const file = new File(['test image bytes'], '원본.png', { type: 'image/png' })
    await store.getState().insertImageFromFile(file)
    expect(bridge.referenceImageFile).toHaveBeenCalledWith('C:\\project\\board.boardmark', file)
    expect(store.getState().nodes[0].src).toBe('../assets/원본.png')
    await store.getState().saveCurrentDocument()
    expect(disk().source).not.toContain('test image bytes')
    expect(disk().source).not.toContain('base64')
  })
})
