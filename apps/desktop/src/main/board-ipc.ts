import { dialog, ipcMain, type BrowserWindow } from 'electron'
import path from 'node:path'
import { realpath } from 'node:fs/promises'
import type { BoardResult } from '../../../../packages/canvas-domain/src/board-file'
import type { BoardFileBridge } from '../../../../packages/canvas-repository/src/board-file-contract'
import {
  BoardFileError,
  createProjectEntry,
  imageMime,
  listProjectFolder,
  readBoard,
  readImage,
  relativeImagePath,
  saveBoard
} from './board-files'

export function registerBoardIpc(getWindow: () => BrowserWindow) {
  const opened = new Set<string>()
  let projectRoot: string | null = null
  async function inProject(folder: string) {
    if (!projectRoot) throw new BoardFileError('no-project', '먼저 프로젝트 폴더를 여세요.')
    const actual = await realpath(folder)
    const relative = path.relative(projectRoot, actual)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new BoardFileError('outside-project', '현재 프로젝트 안의 폴더를 선택하세요.')
    return actual
  }
  function requireOpened(file: string) {
    if (!opened.has(file)) throw new BoardFileError('not-open', '먼저 이 보드 파일을 여세요.')
  }
  const service: Omit<BoardFileBridge, 'referenceImageFile'> = {
    openProject: () =>
      result(async () => {
        const choice = await dialog.showOpenDialog(getWindow(), {
          title: '프로젝트 폴더 열기',
          properties: ['openDirectory']
        })
        if (choice.canceled) return null
        const folder = await realpath(choice.filePaths[0])
        const listing = await listProjectFolder(folder)
        projectRoot = folder
        return listing
      }),
    listFolder: (folder) => result(async () => listProjectFolder(await inProject(folder))),
    createEntry: (directory, name, kind) =>
      result(async () => {
        const folder = await inProject(directory)
        return createProjectEntry(folder, name, kind)
      }),
    openBoard: (file) =>
      result(async () => {
        if (file) await inProject(path.dirname(file))
        else {
          const choice = await dialog.showOpenDialog(getWindow(), {
            title: '보드 열기',
            defaultPath: projectRoot ?? undefined,
            properties: ['openFile'],
            filters: [{ name: 'Boardmark 보드', extensions: ['boardmark'] }]
          })
          if (choice.canceled) return null
          file = choice.filePaths[0]
        }
        const record = await readBoard(file)
        opened.add(file)
        return record
      }),
    saveBoard: (input) =>
      result(async () => {
        requireOpened(input.path)
        if (typeof input.expectedSource !== 'string')
          throw new BoardFileError('invalid-request', '저장 기준 원문이 없습니다.')
        return saveBoard(input.path, input.board, input.expectedSource)
      }),
    resolveImage: (boardPath, reference) =>
      result(async () => {
        requireOpened(boardPath)
        return readImage(boardPath, reference)
      })
  }
  ipcMain.handle('boardmark/board/open-project', () => service.openProject())
  ipcMain.handle('boardmark/board/list-folder', (_event, folder) => service.listFolder(folder))
  ipcMain.handle('boardmark/board/create-entry', (_event, folder, name, kind) =>
    service.createEntry(folder, name, kind)
  )
  ipcMain.handle('boardmark/board/open', (_event, file) => service.openBoard(file))
  ipcMain.handle('boardmark/board/save', (_event, input) => service.saveBoard(input))
  ipcMain.handle('boardmark/board/reference-image', (_event, boardPath, imagePath) =>
    result(async () => {
      requireOpened(boardPath)
      if (typeof imagePath !== 'string' || !path.isAbsolute(imagePath))
        throw new BoardFileError(
          'no-image-file',
          '원본 파일이 없는 클립보드 이미지는 참조할 수 없습니다. 이미지 파일을 저장한 뒤 선택하세요.'
        )
      imageMime(imagePath)
      return { path: relativeImagePath(boardPath, imagePath) }
    })
  )
  ipcMain.handle('boardmark/board/resolve-image', (_event, file, reference) =>
    service.resolveImage(file, reference)
  )
}

async function result<T>(operation: () => Promise<T>): Promise<BoardResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error instanceof BoardFileError ? error.code : 'file-operation-failed',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
