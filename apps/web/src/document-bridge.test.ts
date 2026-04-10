import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserDocumentBridge } from './document-bridge'

const uploadedSource = `---
type: canvas
version: 1
---

::: note #upload x=20 y=20 w=320 h=220
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
    expect(openHandle.queryPermissionMock).toHaveBeenCalledWith({ mode: 'readwrite' })
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

  it('uses untitled.md as the default save target name for new drafts', async () => {
    window.showSaveFilePicker = vi.fn(async () => createFileHandle('saved.md', ''))

    const bridge = createBrowserDocumentBridge({
      readFileText: async () => uploadedSource
    })

    const result = await bridge.picker.pickSaveLocator()

    expect(window.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'untitled.md'
      })
    )
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'file',
        path: 'browser-file-0/saved.md'
      }
    })
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
    expect(openHandle.requestPermissionMock).toHaveBeenCalledTimes(1)
    expect(openHandle.writeMock).toHaveBeenCalledWith(nextSource)
    expect(window.showOpenFilePicker).toHaveBeenCalledTimes(1)
  })

  it('checks external file changes on window focus', async () => {
    let nextSource = uploadedSource
    const openHandle = createFileHandle('opened.canvas.md', () => nextSource)
    window.showOpenFilePicker = vi.fn(async () => [openHandle])

    const bridge = createBrowserDocumentBridge({
      readFileText: async () => nextSource
    })
    const openResult = await bridge.persistence.openDocument()

    if (!openResult.ok) {
      throw new Error('Expected persisted open result.')
    }

    let receivedSource: string | null = null
    const dispose = await bridge.persistence.subscribeExternalChanges?.({
      locator: openResult.value.locator,
      fileHandle: openResult.value.fileHandle,
      onExternalChange(source) {
        receivedSource = source
      }
    })

    nextSource = `${uploadedSource}\n\nChanged on disk`
    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(receivedSource).toContain('Changed on disk')
    dispose?.()
  })

  it('logs external file refresh failures instead of ignoring them silently', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const openHandle = createFileHandle('opened.canvas.md', uploadedSource)
    window.showOpenFilePicker = vi.fn(async () => [openHandle])

    let shouldFail = false
    const bridge = createBrowserDocumentBridge({
      readFileText: async () => {
        if (shouldFail) {
          throw new Error('Read failed on focus.')
        }

        return uploadedSource
      }
    })
    const openResult = await bridge.persistence.openDocument()

    if (!openResult.ok) {
      throw new Error('Expected persisted open result.')
    }

    const dispose = await bridge.persistence.subscribeExternalChanges?.({
      locator: openResult.value.locator,
      fileHandle: openResult.value.fileHandle,
      onExternalChange() {}
    })

    shouldFail = true
    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(consoleWarn).toHaveBeenCalledWith(
      '[boardmark] Browser bridge could not refresh an opened file after window focus.',
      expect.objectContaining({
        locator: 'browser-file-0/opened.canvas.md',
        message: 'Read failed on focus.'
      })
    )

    dispose?.()
    consoleWarn.mockRestore()
  })
})

function createFileHandle(name: string, source: string | (() => string)) {
  const writeMock = vi.fn(async (_nextSource: BlobPart) => {})
  let permissionState: PermissionState = 'prompt'
  const queryPermissionMock = vi.fn(async () => permissionState)
  const requestPermissionMock = vi.fn(async () => {
    permissionState = 'granted'
    return permissionState
  })

  const handle = {
    kind: 'file',
    name,
    writeMock,
    queryPermissionMock,
    queryPermission: queryPermissionMock,
    requestPermissionMock,
    requestPermission: requestPermissionMock,
    async createWritable() {
      return {
        close: vi.fn(async () => {}),
        write: writeMock
      } as unknown as FileSystemWritableFileStream
    },
    async getFile() {
      const content = typeof source === 'function' ? source() : source
      return new File([content], name, {
        type: 'text/markdown'
      })
    }
  } as unknown as FileSystemFileHandle & {
    queryPermissionMock: typeof queryPermissionMock
    requestPermissionMock: typeof requestPermissionMock
    writeMock: typeof writeMock
  }

  return handle
}
