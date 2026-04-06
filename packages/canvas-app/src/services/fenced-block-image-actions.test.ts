import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFencedBlockImageActions } from './fenced-block-image-actions'

describe('createFencedBlockImageActions', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads PNG blobs through an object URL when no export bridge is provided', async () => {
    vi.useFakeTimers()
    const createObjectURLMock = vi.fn(() => 'blob:png')
    const revokeObjectURLMock = vi.fn(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock
    })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const actions = createFencedBlockImageActions()

    const outcome = await actions.exportImage({
      blob: new Blob(['png'], { type: 'image/png' }),
      fileName: 'boardmark-code-block.png',
      mimeType: 'image/png'
    })

    expect(outcome).toEqual({ status: 'saved' })
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    await vi.runAllTimersAsync()

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:png')
  })

  it('detects Clipboard image write capability and writes PNG blobs to the clipboard', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        write: writeMock
      }
    })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public readonly items: Record<string, Blob>) {}
      }
    )

    const actions = createFencedBlockImageActions()

    expect(actions.canCopyImageToClipboard()).toBe(true)

    await actions.copyImageToClipboard({
      blob: new Blob(['png'], { type: 'image/png' }),
      fileName: 'boardmark-code-block.png',
      mimeType: 'image/png'
    })

    expect(writeMock).toHaveBeenCalledTimes(1)
  })

  it('propagates clipboard write failures instead of swallowing them', async () => {
    const writeMock = vi.fn().mockRejectedValue(new Error('Clipboard unavailable'))

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        write: writeMock
      }
    })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public readonly items: Record<string, Blob>) {}
      }
    )

    const actions = createFencedBlockImageActions()

    await expect(
      actions.copyImageToClipboard({
        blob: new Blob(['png'], { type: 'image/png' }),
        fileName: 'boardmark-code-block.png',
        mimeType: 'image/png'
      })
    ).rejects.toThrow('Clipboard unavailable')
  })
})
