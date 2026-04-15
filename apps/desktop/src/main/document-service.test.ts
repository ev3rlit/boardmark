import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { showSaveDialogMock } = vi.hoisted(() => ({
  showSaveDialogMock: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: showSaveDialogMock
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn()
  }
}))

import { createDocumentService } from './document-service'

describe('document-service', () => {
  beforeEach(() => {
    showSaveDialogMock.mockReset()
  })

  it('uses untitled.md as the default save name for new documents', async () => {
    const service = createDocumentService()

    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/untitled'
    })

    const result = await service.pickSaveLocator({} as never)

    expect(showSaveDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'untitled.md'
      })
    )
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'file',
        path: '/tmp/untitled.md'
      }
    })
  })

  it('saves exported PNG bytes through the desktop save dialog', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'boardmark-image-export-'))
    const targetPath = join(directory, 'diagram.png')
    const service = createDocumentService()

    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: targetPath
    })

    const result = await service.saveExportedImage(
      {} as never,
      {
        bytes: new Uint8Array([137, 80, 78, 71]),
        fileName: 'diagram.png',
        mimeType: 'image/png'
      }
    )

    expect(result).toEqual({
      ok: true,
      value: undefined
    })
    expect(await readFile(targetPath)).toEqual(Buffer.from([137, 80, 78, 71]))
  })

  it('saves exported JPG bytes through the desktop save dialog', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'boardmark-image-export-'))
    const targetPath = join(directory, 'diagram.jpg')
    const service = createDocumentService()

    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: targetPath.replace(/\.jpg$/, '')
    })

    const result = await service.saveExportedImage(
      {} as never,
      {
        bytes: new Uint8Array([255, 216, 255, 224]),
        fileName: 'diagram.jpg',
        mimeType: 'image/jpeg'
      }
    )

    expect(result).toEqual({
      ok: true,
      value: undefined
    })
    expect(await readFile(targetPath)).toEqual(Buffer.from([255, 216, 255, 224]))
  })
})
