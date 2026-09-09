import type { RefCallback } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { toPngMock, snapshotRequestMock } = vi.hoisted(() => ({
  toPngMock: vi.fn(),
  snapshotRequestMock: vi.fn()
}))

vi.mock('html-to-image', () => ({
  toPng: toPngMock
}))

vi.mock('./sandpack-block', () => ({
  SandpackBlock: () => (
    <figure
      className="sandpack-block"
      data-state="ready"
    >
      <iframe
        ref={createIframeRef()}
        title="Sandpack Preview"
      />
    </figure>
  )
}))

import { rasterizeSandpackBlockToDataUrl } from './sandpack-block-rasterizer'

describe('rasterizeSandpackBlockToDataUrl', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    toPngMock.mockReset()
    snapshotRequestMock.mockReset()
    vi.restoreAllMocks()
  })

  it('requests the iframe snapshot and composites it over the shell without directly reading preview pixels', async () => {
    toPngMock.mockResolvedValue('data:image/png;base64,shell')
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), drawImage
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,final')
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLImageElement, src) {
      this.setAttribute('src', src)
      queueMicrotask(() => this.dispatchEvent(new Event('load')))
    })

    const dataUrl = await rasterizeSandpackBlockToDataUrl({
      source: '{"template":"react","files":{"App.js":"export default function App(){ return <div /> }"}}',
      width: 320
    })

    expect(dataUrl).toBe('data:image/png;base64,final')
    expect(toPngMock).toHaveBeenCalledTimes(1)
    expect(snapshotRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'boardmark:snapshot-request', requestId: expect.any(String)
    }), '*')
    const [finalTarget] = toPngMock.mock.calls[0] as [HTMLElement]
    expect(finalTarget.classList.contains('sandpack-block')).toBe(true)
    expect(finalTarget.querySelector('iframe')).toBeNull()
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(drawImage.mock.calls[0]?.[0].src).toBe('data:image/png;base64,shell')
    expect(drawImage.mock.calls[1]?.[0].src).toBe('data:image/png;base64,iframe')
    expect(drawImage.mock.calls[1]?.slice(1)).toEqual([0, 0, 240, 140])
  })
})

function createIframeRef(): RefCallback<HTMLIFrameElement> {
  return (node) => {
    if (!node) {
      return
    }

    defineSize(node, 'clientWidth', 240)
    defineSize(node, 'clientHeight', 140)
    node.getBoundingClientRect = () => createDomRect(0, 0, 240, 140)

    const frameDocument = node.contentDocument ?? node.contentWindow?.document

    if (!frameDocument) {
      throw new Error('Test iframe document is unavailable.')
    }

    frameDocument.open()
    frameDocument.write('<!doctype html><html><body style="margin:0;background:#ffffff"><main style="height:140px">Preview</main></body></html>')
    frameDocument.close()
    const frameWindow = node.contentWindow!
    vi.spyOn(frameWindow, 'postMessage').mockImplementation((request, origin) => {
      snapshotRequestMock(request, origin)
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        data: { type: 'boardmark:snapshot-response', requestId: request.requestId, dataUrl: 'data:image/png;base64,iframe' }
      }))
    })
  }
}

function defineSize(target: object, key: 'clientHeight' | 'clientWidth', value: number) {
  Object.defineProperty(target, key, {
    configurable: true,
    value
  })
}

function createDomRect(left: number, top: number, width: number, height: number) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => undefined
  } as DOMRect
}
