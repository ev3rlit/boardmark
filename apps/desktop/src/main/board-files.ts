import { open, readFile, rename, unlink, link, readdir, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  emptyBoard,
  parseBoard,
  serializeBoard,
  type BoardFile
} from '../../../../packages/canvas-domain/src/board-file'
import type {
  BoardRecord,
  ProjectEntry,
  ProjectFolder
} from '../../../../packages/canvas-repository/src/board-file-contract'

export class BoardFileError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export async function readBoard(file: string): Promise<BoardRecord> {
  assertBoardExtension(file)
  const source = await readFile(file, 'utf8')
  const parsed = parseBoard(source)
  if (!parsed.ok) throw new BoardFileError(parsed.error.code, `${file}\n${parsed.error.message}`)
  return { path: file, source, board: parsed.value }
}

// Serialize writes per file, including the external-change check and replacement.
const pendingWrites = new Map<string, Promise<unknown>>()
export async function saveBoard(
  file: string,
  board: BoardFile,
  expectedSource: string | null
): Promise<BoardRecord> {
  const key = path.resolve(file).toLowerCase()
  const previous = pendingWrites.get(key) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(() => writeBoard(file, board, expectedSource))
  pendingWrites.set(key, operation)
  try {
    return await operation
  } finally {
    if (pendingWrites.get(key) === operation) pendingWrites.delete(key)
  }
}

export function createBoard(file: string) {
  return saveBoard(file, emptyBoard(), null)
}

// The IPC boundary resolves and checks the parent against the selected project.
// Accept a single portable name, never a path or a Windows device/stream name.
export async function createProjectEntry(
  directory: string,
  name: string,
  kind: 'file' | 'directory'
): Promise<ProjectEntry> {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name === '.' ||
    name === '..' ||
    /[\\/\u0000-\u001f<>:"|?*]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) ||
    (kind !== 'file' && kind !== 'directory')
  )
    throw new BoardFileError(
      'invalid-name',
      '경로 구분자나 예약 문자가 없는 파일·폴더 이름을 입력하세요.'
    )
  const file = path.join(directory, name)
  const entryKind =
    kind === 'directory' ? kind : name.toLowerCase().endsWith('.boardmark') ? 'board' : 'file'
  try {
    if (entryKind === 'directory') await mkdir(file)
    else if (entryKind === 'board') await createBoard(file)
    else {
      const handle = await open(file, 'wx')
      await handle.close()
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
      throw new BoardFileError('already-exists', `같은 이름의 파일 또는 폴더가 있습니다: ${name}`)
    throw error
  }
  return { path: file, name, kind: entryKind }
}

async function writeBoard(
  file: string,
  board: BoardFile,
  expectedSource: string | null
): Promise<BoardRecord> {
  assertBoardExtension(file)
  const serialized = serializeBoard(board)
  if (!serialized.ok) throw new BoardFileError(serialized.error.code, serialized.error.message)
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  let created = false
  try {
    const handle = await open(temp, 'wx')
    created = true
    try {
      await handle.writeFile(serialized.value, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (expectedSource === null) {
      // Exclusive creation: choosing an existing name can never truncate it.
      await link(temp, file)
    } else {
      const current = await readFile(file, 'utf8')
      if (current !== expectedSource)
        throw new BoardFileError(
          'external-change',
          '보드 파일이 앱 밖에서 변경되었습니다. 초안을 유지했습니다. 파일을 확인한 뒤 다시 여세요.'
        )
      // Same-directory rename replaces the complete file, never a partially written source.
      await rename(temp, file)
      created = false
    }
    return { path: file, source: serialized.value, board }
  } finally {
    if (created) await unlink(temp)
  }
}

export async function listProjectFolder(folder: string): Promise<ProjectFolder> {
  const entries = await readdir(folder, { withFileTypes: true })
  return {
    path: folder,
    entries: entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({
        name: entry.name,
        path: path.join(folder, entry.name),
        kind: entry.isDirectory()
          ? ('directory' as const)
          : entry.name.toLowerCase().endsWith('.boardmark')
            ? ('board' as const)
            : ('file' as const)
      }))
      .sort(
        (a, b) =>
          Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
          a.name.localeCompare(b.name)
      )
  }
}

export function relativeImagePath(boardPath: string, imagePath: string, paths = path): string {
  const result = paths.relative(paths.dirname(boardPath), imagePath).replace(/\\/g, '/')
  if (!result || paths.isAbsolute(result) || /^[a-z]:/i.test(result)) {
    throw new BoardFileError(
      'invalid-reference',
      '이미지는 보드와 같은 드라이브에 있어야 상대 경로로 참조할 수 있습니다.'
    )
  }
  return result
}

export function resolveImagePath(boardPath: string, reference: string, paths = path): string {
  if (!reference || /^[\\/]|^[a-z][a-z0-9+.-]*:|[\u0000-\u001f<>:"|?*]/i.test(reference)) {
    throw new BoardFileError(
      'invalid-reference',
      '이미지 참조는 보드 파일 기준의 상대 파일 경로여야 합니다.'
    )
  }
  return paths.resolve(paths.dirname(boardPath), reference.replace(/[\\/]/g, paths.sep))
}

export async function readImage(boardPath: string, reference: string): Promise<{ src: string }> {
  const file = resolveImagePath(boardPath, reference)
  const mime = imageMime(file)
  try {
    const bytes = await readFile(file)
    return { src: `data:${mime};base64,${bytes.toString('base64')}` }
  } catch (error) {
    throw new BoardFileError(
      'missing-image',
      `이미지를 읽을 수 없습니다: ${reference}\n${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function imageMime(file: string): string {
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp'
  }
  const result = mime[path.extname(file).toLowerCase()]
  if (!result)
    throw new BoardFileError(
      'unsupported-image',
      'PNG, JPEG, GIF, WebP, SVG, AVIF, BMP 이미지 파일을 선택하세요.'
    )
  return result
}

function assertBoardExtension(file: string) {
  if (!path.isAbsolute(file) || !file.toLowerCase().endsWith('.boardmark')) {
    throw new BoardFileError(
      'invalid-path',
      '절대 경로의 .boardmark 파일을 선택하세요. .boardmark.json은 DB 문서 묶음입니다.'
    )
  }
}
