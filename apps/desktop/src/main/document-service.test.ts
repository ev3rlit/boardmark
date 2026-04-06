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

describe('document-service image export', () => {
  beforeEach(() => {
    showSaveDialogMock.mockReset()
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
})
