import type { BoardFile, BoardResult } from '../../canvas-domain/src/board-file'

export type BoardRecord = { path: string; source: string; board: BoardFile }
export type ProjectEntry = { name: string; path: string; kind: 'directory' | 'board' | 'file' }
export type ProjectFolder = { path: string; entries: ProjectEntry[] }

// File-board bridge is independent of Markdown/DB document persistence.
export type BoardFileBridge = {
  openProject(): Promise<BoardResult<ProjectFolder | null>>
  listFolder(path: string): Promise<BoardResult<ProjectFolder>>
  createEntry(
    directory: string,
    name: string,
    kind: 'file' | 'directory'
  ): Promise<BoardResult<ProjectEntry>>
  openBoard(path?: string): Promise<BoardResult<BoardRecord | null>>
  saveBoard(input: {
    path: string
    board: BoardFile
    expectedSource: string
  }): Promise<BoardResult<BoardRecord>>
  referenceImageFile(boardPath: string, file: File): Promise<BoardResult<{ path: string }>>
  resolveImage(boardPath: string, reference: string): Promise<BoardResult<{ src: string }>>
}
