import type { RefCallback } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { toPngMock } = vi.hoisted(() => ({
  toPngMock: vi.fn()
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
  })

  it('captures the preview iframe document before rasterizing the final sandpack block', async () => {
    toPngMock
      .mockResolvedValueOnce('data:image/png;base64,iframe')
      .mockResolvedValueOnce('data:image/png;base64,final')

    const dataUrl = await rasterizeSandpackBlockToDataUrl({
      source: '{"template":"react","files":{"App.js":"export default function App(){ return <div /> }"}}',
      width: 320
    })

    expect(dataUrl).toBe('data:image/png;base64,final')
    expect(toPngMock).toHaveBeenCalledTimes(2)

    const [iframeTarget] = toPngMock.mock.calls[0] as [HTMLElement]
    const [finalTarget] = toPngMock.mock.calls[1] as [HTMLElement]

    expect(iframeTarget.tagName).toBe('HTML')
    expect(finalTarget.classList.contains('sandpack-block')).toBe(true)
    expect(finalTarget.querySelector('iframe')).toBeNull()

    const previewImage = finalTarget.querySelector('img')
    expect(previewImage).toBeInstanceOf(HTMLImageElement)
    expect((previewImage as HTMLImageElement).src).toBe('data:image/png;base64,iframe')
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
