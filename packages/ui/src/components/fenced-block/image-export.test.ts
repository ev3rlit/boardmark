import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportCodeBlockImage, exportMermaidBlockImage } from './image-export'

const {
  canvgFromStringMock,
  canvgRenderMock,
  canvasContextScaleMock,
  canvasContextFillRectMock,
  toBlobMock
} = vi.hoisted(() => ({
  canvgFromStringMock: vi.fn(),
  canvgRenderMock: vi.fn(),
  canvasContextScaleMock: vi.fn(),
  canvasContextFillRectMock: vi.fn(),
  toBlobMock: vi.fn()
}))

vi.mock('html-to-image', () => ({
  toBlob: toBlobMock
}))

vi.mock('canvg', () => ({
  Canvg: {
    fromString: canvgFromStringMock
  }
}))

describe('fenced block image export', () => {
  beforeEach(() => {
    canvgFromStringMock.mockReset()
    canvgRenderMock.mockReset()
    canvasContextScaleMock.mockReset()
    canvasContextFillRectMock.mockReset()
    toBlobMock.mockReset()
    toBlobMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    canvgRenderMock.mockResolvedValue(undefined)
    canvgFromStringMock.mockReturnValue({
      render: canvgRenderMock
    })
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mermaid-svg')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(() => undefined)
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: canvasContextScaleMock,
      drawImage: vi.fn(),
      fillRect: canvasContextFillRectMock,
      fillStyle: ''
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png'], { type: 'image/png' }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports code block roots to PNG blobs with language-aware file names', async () => {
    const root = document.createElement('div')
    root.style.backgroundColor = 'rgb(43, 52, 55)'
    const ignoredButton = document.createElement('button')
    ignoredButton.dataset.boardmarkExportIgnore = 'true'
    root.append(ignoredButton)
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: 420 })
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 180 })
    root.getBoundingClientRect = () =>
      ({
        bottom: 180,
        height: 180,
        left: 0,
        right: 420,
        top: 0,
        width: 420,
        x: 0,
        y: 0,
        toJSON: () => undefined
      }) as DOMRect

    const result = await exportCodeBlockImage({
      kind: 'code',
      language: 'TypeScript',
      rootElement: root
    })

    expect(result.fileName).toBe('boardmark-code-block-typescript.png')
    expect(result.mimeType).toBe('image/png')
    expect(result.blob.size).toBeGreaterThan(0)
    expect(toBlobMock).toHaveBeenCalledWith(
      root,
      expect.objectContaining({
        canvasHeight: 180,
        canvasWidth: 420,
        filter: expect.any(Function),
        width: 420
      })
    )
    const [, options] = toBlobMock.mock.calls[0] as [HTMLElement, { filter: (node: HTMLElement) => boolean }]
    expect(options.filter(ignoredButton)).toBe(false)
  })

  it('exports ready Mermaid SVG surfaces through the SVG-aware path', async () => {
    const root = document.createElement('figure')
    root.dataset.state = 'ready'
    root.style.backgroundColor = 'rgb(248, 249, 250)'
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: 320 })
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 200 })
    root.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => undefined
      }) as DOMRect

    const viewport = document.createElement('div')
    viewport.className = 'mermaid-diagram__viewport'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '188')
    svg.setAttribute('height', '296')
    svg.setAttribute('viewBox', '0 0 640 960')
    viewport.append(svg)
    root.append(viewport)

    const result = await exportMermaidBlockImage({
      kind: 'mermaid',
      rootElement: root
    })

    expect(result.fileName).toBe('boardmark-mermaid-diagram.png')
    expect(result.mimeType).toBe('image/png')
    expect(result.blob.size).toBeGreaterThan(0)
    expect(canvgFromStringMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('<svg'),
      expect.objectContaining({
        ignoreAnimation: true,
        ignoreDimensions: true,
        ignoreMouse: true
      })
    )
    expect(canvgRenderMock).toHaveBeenCalledTimes(1)
    expect(canvasContextScaleMock).toHaveBeenCalledWith(2, 2)
    expect(canvasContextFillRectMock).toHaveBeenCalledWith(0, 0, 640, 960)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects Mermaid export when the surface is not ready', async () => {
    const root = document.createElement('figure')
    root.dataset.state = 'loading'
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: 320 })
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 200 })
    root.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => undefined
      }) as DOMRect

    await expect(
      exportMermaidBlockImage({
        kind: 'mermaid',
        rootElement: root
      })
    ).rejects.toThrow('Mermaid image export is only available after the diagram is rendered.')
  })

  it('rejects Mermaid export when no SVG element is present', async () => {
    const root = document.createElement('figure')
    root.dataset.state = 'ready'
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: 320 })
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 200 })
    root.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => undefined
      }) as DOMRect

    await expect(
      exportMermaidBlockImage({
        kind: 'mermaid',
        rootElement: root
      })
    ).rejects.toThrow('Mermaid export could not find a rendered SVG element.')
  })
})
