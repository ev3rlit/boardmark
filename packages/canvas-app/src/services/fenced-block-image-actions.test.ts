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
    }, 'png')

    expect(outcome).toEqual({ status: 'saved' })
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    await vi.runAllTimersAsync()

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:png')
  })

  it('converts PNG runtime output to JPG when JPG export is requested', async () => {
    const createObjectURLMock = vi.fn()
      .mockReturnValueOnce('blob:source-png')
      .mockReturnValueOnce('blob:jpeg')
    const revokeObjectURLMock = vi.fn(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock
    })
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        naturalHeight = 120
        naturalWidth = 240

        set src(_value: string) {
          this.onload?.()
        }
      }
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: ''
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const actions = createFencedBlockImageActions()

    const outcome = await actions.exportImage({
      blob: new Blob(['png'], { type: 'image/png' }),
      fileName: 'boardmark-code-block.png',
      mimeType: 'image/png'
    }, 'jpeg')

    expect(outcome).toEqual({ status: 'saved' })
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenNthCalledWith(1, expect.any(Blob))
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
