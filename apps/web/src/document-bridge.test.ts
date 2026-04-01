import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserDocumentBridge } from './document-bridge'

const uploadedSource = `---
type: canvas
version: 1
---

::: note #upload x=20 y=20
Uploaded Board
:::`

describe('browser document bridge', () => {
  beforeEach(() => {
    delete window.showOpenFilePicker
    delete window.showSaveFilePicker
  })

  it('opens persisted files through the File System Access API', async () => {
    const openHandle = createFileHandle('opened.canvas.md', uploadedSource)
    window.showOpenFilePicker = vi.fn(async () => [openHandle])

    const bridge = createBrowserDocumentBridge({
      readFileText: async () => uploadedSource
    })
    const result = await bridge.persistence.openDocument()

    expect(window.showOpenFilePicker).toHaveBeenCalled()
    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.value.fileHandle?.name).toBe('opened.canvas.md')
    expect(result.value.source).toBe(uploadedSource)
    expect(result.value.locator).toEqual({
      kind: 'file',
      path: 'browser-file-0/opened.canvas.md'
    })
  })

  it('creates a new persisted target through showSaveFilePicker and repository.save', async () => {
    const saveHandle = createFileHandle('saved.canvas.md', '')
    window.showSaveFilePicker = vi.fn(async () => saveHandle)

    const bridge = createBrowserDocumentBridge({
      readFileText: async () => uploadedSource
    })
    const saveAsResult = await bridge.persistence.saveDocumentAs({
      defaultName: 'saved.canvas.md',
      locator: {
        kind: 'memory',
        key: 'draft',
        name: 'saved.canvas.md'
      },
      source: uploadedSource
    })

    expect(window.showSaveFilePicker).toHaveBeenCalled()
    expect(saveAsResult.ok).toBe(true)

    if (!saveAsResult.ok) {
      return
    }

    expect(saveHandle.writeMock).toHaveBeenCalledWith(uploadedSource)

    const repositorySave = await bridge.repository.save({
      locator: saveAsResult.value.locator,
      source: uploadedSource,
      isTemplate: false
    })

    expect(repositorySave.ok).toBe(true)
    expect(saveHandle.writeMock).toHaveBeenCalledTimes(2)
  })

  it('overwrites an existing file handle without opening a new picker', async () => {
    const openHandle = createFileHandle('opened.canvas.md', uploadedSource)
    window.showOpenFilePicker = vi.fn(async () => [openHandle])

    const bridge = createBrowserDocumentBridge({
      readFileText: async () => uploadedSource
    })
    const openResult = await bridge.persistence.openDocument()

    if (!openResult.ok) {
      throw new Error('Expected persisted open result.')
    }

    const nextSource = `${uploadedSource}\n\nUpdated`
    const saveResult = await bridge.persistence.saveDocument({
      defaultName: 'opened.canvas.md',
      locator: openResult.value.locator,
      fileHandle: openResult.value.fileHandle,
      source: nextSource
    })

    expect(saveResult.ok).toBe(true)
    expect(openHandle.writeMock).toHaveBeenCalledWith(nextSource)
    expect(window.showOpenFilePicker).toHaveBeenCalledTimes(1)
  })
})

function createFileHandle(name: string, source: string) {
  const writeMock = vi.fn(async (_nextSource: BlobPart) => {})

  const handle = {
    kind: 'file',
    name,
    writeMock,
    async createWritable() {
      return {
        close: vi.fn(async () => {}),
        write: writeMock
      } as unknown as FileSystemWritableFileStream
    },
    async getFile() {
      return new File([source], name, {
        type: 'text/markdown'
      })
    }
  } as unknown as FileSystemFileHandle & { writeMock: typeof writeMock }

  return handle
}
