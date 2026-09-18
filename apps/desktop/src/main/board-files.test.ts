// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBoard,
  createProjectEntry,
  listProjectFolder,
  readBoard,
  saveBoard,
  readImage,
  relativeImagePath,
  resolveImagePath
} from './board-files'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return { ...original, rename: vi.fn(original.rename) }
})
const folders: string[] = []
afterEach(async () => {
  vi.mocked(rename).mockClear()
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})
async function project() {
  const root = await mkdtemp(path.join(tmpdir(), 'boardmark-files-'))
  folders.push(root)
  await mkdir(path.join(root, 'design'))
  await mkdir(path.join(root, 'assets'))
  await writeFile(
    path.join(root, 'assets', 'original.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="purple"/></svg>'
  )
  return root
}

describe('desktop board files', () => {
  it('creates folders, boards and ordinary files directly inside the chosen folder', async () => {
    const root = await project()
    const folder = await createProjectEntry(root, '새 폴더', 'directory')
    const board = await createProjectEntry(folder.path, '회의.boardmark', 'file')
    const text = await createProjectEntry(folder.path, 'notes.md', 'file')
    expect((await readBoard(board.path)).board.items).toEqual([])
    expect(await readFile(text.path, 'utf8')).toBe('')
    expect((await listProjectFolder(folder.path)).entries).toEqual(
      expect.arrayContaining([board, text])
    )
    await writeFile(text.path, '원본 보존')
    await expect(createProjectEntry(folder.path, 'notes.md', 'file')).rejects.toMatchObject({
      code: 'already-exists'
    })
    await expect(createProjectEntry(root, '새 폴더', 'directory')).rejects.toMatchObject({
      code: 'already-exists'
    })
    await expect(createProjectEntry(folder.path, '회의.boardmark', 'file')).rejects.toMatchObject({
      code: 'already-exists'
    })
    expect(await readFile(text.path, 'utf8')).toBe('원본 보존')
  })
  it.each([
    '',
    ' ',
    '.',
    '..',
    '../outside',
    'a/b',
    'a\\b',
    'C:\\file',
    'nul',
    'CON.txt',
    'com1.md',
    'a:stream',
    'trailing.',
    'trailing ',
    'a\u0000b'
  ])('rejects invalid explorer entry name %j', async (name) => {
    const root = await project()
    await expect(createProjectEntry(root, name, 'file')).rejects.toMatchObject({
      code: 'invalid-name'
    })
  })
  it('saves and reopens content, image references, geometry and connections in any folder', async () => {
    const root = await project()
    for (const file of [
      path.join(root, 'root.boardmark'),
      path.join(root, 'design', 'nested.boardmark')
    ]) {
      const initial = await createBoard(file)
      const board = {
        ...initial.board,
        items: [
          {
            id: 'n',
            kind: 'markdown' as const,
            content: '# 메모\n보드 소유',
            frame: { x: -30, y: 70, width: 400, height: 250 }
          },
          {
            id: 'i',
            kind: 'image' as const,
            reference: {
              kind: 'file' as const,
              path: relativeImagePath(file, path.join(root, 'assets', 'original.svg'))
            },
            frame: { x: 600, y: 120, width: 200, height: 100 }
          }
        ],
        connections: [{ id: 'e', source: 'n', target: 'i' }]
      }
      const saved = await saveBoard(file, board, initial.source)
      expect(await readBoard(file)).toEqual(saved)
      expect((await readImage(file, board.items[1].reference!.path)).src).toContain(
        'data:image/svg+xml;base64,'
      )
      expect(saved.source).not.toContain('base64')
    }
  })
  it('preserves references after moving a project and never deletes original images on item removal', async () => {
    const root = await project()
    const file = path.join(root, 'design', 'nested.boardmark')
    const initial = await createBoard(file)
    const image = {
      id: 'i',
      kind: 'image' as const,
      frame: { x: 0, y: 0, width: 200, height: 100 },
      reference: { kind: 'file' as const, path: '../assets/original.svg' }
    }
    await saveBoard(file, { ...initial.board, items: [image] }, initial.source)
    const original = await readImage(file, image.reference.path)
    const moved = path.join(await project(), 'relocated')
    await rename(root, moved)
    const movedFile = path.join(moved, 'design', 'nested.boardmark')
    expect(await readImage(movedFile, image.reference.path)).toEqual(original)
    await expect(readBoard(file)).rejects.toMatchObject({ code: 'ENOENT' })
    const reopened = await readBoard(movedFile)
    await saveBoard(movedFile, { ...reopened.board, items: [] }, reopened.source)
    expect(await readFile(path.join(moved, 'assets', 'original.svg'), 'utf8')).toContain('<svg')
  })
  it('keeps missing references loadable and reports their file error separately', async () => {
    const root = await project()
    const initial = await createBoard(path.join(root, 'missing.boardmark'))
    const board = {
      ...initial.board,
      items: [
        {
          id: 'i',
          kind: 'image' as const,
          frame: { x: 0, y: 0, width: 200, height: 100 },
          reference: { kind: 'file' as const, path: 'gone.png' }
        }
      ]
    }
    await saveBoard(initial.path, board, initial.source)
    expect((await readBoard(initial.path)).board).toEqual(board)
    await expect(readImage(initial.path, 'gone.png')).rejects.toMatchObject({
      code: 'missing-image'
    })
  })
  it('preserves original and draft on failed replacement, invalid save, external changes and duplicate creation', async () => {
    const root = await project()
    const initial = await createBoard(path.join(root, 'safe.boardmark'))
    const draft = {
      ...initial.board,
      items: [
        {
          id: 'n',
          kind: 'markdown' as const,
          content: '초안',
          frame: { x: 1, y: 2, width: 300, height: 200 }
        }
      ]
    }
    vi.mocked(rename).mockRejectedValueOnce(new Error('replacement denied'))
    await expect(saveBoard(initial.path, draft, initial.source)).rejects.toThrow(
      'replacement denied'
    )
    expect(await readFile(initial.path, 'utf8')).toBe(initial.source)
    expect(draft.items[0].content).toBe('초안')
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    await expect(
      saveBoard(initial.path, { ...draft, items: [draft.items[0], draft.items[0]] }, initial.source)
    ).rejects.toMatchObject({ code: 'duplicate-id' })
    await expect(createBoard(initial.path)).rejects.toMatchObject({ code: 'EEXIST' })
    await writeFile(initial.path, 'externally changed')
    await expect(saveBoard(initial.path, draft, initial.source)).rejects.toMatchObject({
      code: 'external-change'
    })
    expect(await readFile(initial.path, 'utf8')).toBe('externally changed')
  })
  it('rejects malformed load without changing disk', async () => {
    const root = await project()
    const file = path.join(root, 'bad.boardmark')
    for (const [source, code] of [
      ['{', 'invalid-json'],
      ['{"format":"boardmark","version":99}', 'unsupported-version'],
      ['{}', 'invalid-structure']
    ]) {
      await writeFile(file, source)
      await expect(readBoard(file)).rejects.toMatchObject({ code })
      expect(await readFile(file, 'utf8')).toBe(source)
    }
  })
  it('supports Windows separators and rejects cross-drive references', () => {
    expect(
      relativeImagePath('C:\\work\\design\\a.boardmark', 'C:\\work\\assets\\a.png', path.win32)
    ).toBe('../assets/a.png')
    expect(resolveImagePath('C:\\work\\design\\a.boardmark', '..\\assets\\a.png', path.win32)).toBe(
      'C:\\work\\assets\\a.png'
    )
    expect(() => relativeImagePath('C:\\work\\a.boardmark', 'D:\\a.png', path.win32)).toThrow(
      '같은 드라이브'
    )
    expect(() =>
      resolveImagePath('C:\\work\\a.boardmark', '\\\\server\\a.png', path.win32)
    ).toThrow('상대')
  })
})
