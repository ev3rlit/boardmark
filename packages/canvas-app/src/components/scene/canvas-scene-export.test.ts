import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportCanvasSceneImage } from './canvas-scene-export'
import type { CanvasEdge, CanvasGroup, CanvasNode } from '@boardmark/canvas-domain'

const { toBlobMock, toPngMock } = vi.hoisted(() => ({
  toBlobMock: vi.fn(),
  toPngMock: vi.fn()
}))
const {
  rasterizeSandpackBlockToDataUrlMock,
  readSandpackBlockPayloadMock
} = vi.hoisted(() => ({
  rasterizeSandpackBlockToDataUrlMock: vi.fn(),
  readSandpackBlockPayloadMock: vi.fn()
}))

vi.mock('html-to-image', () => ({
  toBlob: toBlobMock,
  toPng: toPngMock
}))

vi.mock('@boardmark/ui', () => ({
  rasterizeSandpackBlockToDataUrl: rasterizeSandpackBlockToDataUrlMock,
  readSandpackBlockPayload: readSandpackBlockPayloadMock
}))

describe('canvas scene export', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    toBlobMock.mockReset()
    toPngMock.mockReset()
    rasterizeSandpackBlockToDataUrlMock.mockReset()
    readSandpackBlockPayloadMock.mockReset()
    toBlobMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    toPngMock.mockResolvedValue('data:image/png;base64,sandpack-preview')
    rasterizeSandpackBlockToDataUrlMock.mockResolvedValue('data:image/png;base64,sandpack-preview')
    readSandpackBlockPayloadMock.mockReturnValue(null)
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports document scope from rendered object bounds instead of the current viewport', async () => {
    const saveImageMock = vi.fn().mockResolvedValue({
      ok: true as const,
      value: undefined
    })
    const { flowElement, viewport } = createFlowScene({
      flowRect: { left: 100, top: 80, width: 900, height: 640 },
      viewport: { x: 10, y: 20, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 50, y: 40, width: 60, height: 30 },
      id: 'node-1',
      kind: 'node',
      viewport: { x: 10, y: 20, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 200, y: 80, width: 80, height: 40 },
      id: 'node-2',
      kind: 'node',
      viewport: { x: 10, y: 20, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 30, y: 20, width: 250, height: 10 },
      id: 'edge-1',
      kind: 'edge',
      viewport: { x: 10, y: 20, zoom: 2 }
    })
    const ignoredElement = document.createElement('button')
    ignoredElement.dataset.boardmarkExportIgnore = 'true'
    viewport.append(ignoredElement)

    const outcome = await exportCanvasSceneImage({
      format: 'png',
      imageExportBridge: {
        saveImage: saveImageMock
      },
      rootElement: flowElement,
      scope: 'document',
      state: {
        edges: [
          createEdge('edge-1', 'node-1', 'node-2')
        ],
        groupSelectionState: { status: 'idle' },
        groups: [],
        nodes: [
          createNode('node-1', { x: 50, y: 40, w: 60, h: 30 }),
          createNode('node-2', { x: 200, y: 80, w: 80, h: 40 })
        ],
        selectedEdgeIds: [],
        selectedGroupIds: [],
        selectedNodeIds: [],
        viewport: { x: 10, y: 20, zoom: 2 }
      }
    })

    expect(outcome).toEqual({ status: 'saved' })
    const [cloneRoot, options] = toBlobMock.mock.calls[0] as [HTMLElement, {
      canvasHeight: number
      canvasWidth: number
      filter: (node: HTMLElement) => boolean
    }]
    expect(options.canvasWidth).toBe(298)
    expect(options.canvasHeight).toBe(148)
    expect(cloneRoot).toHaveStyle({
      left: '0px',
      top: '0px',
      zIndex: '-1'
    })
    expect(cloneRoot.querySelector('.react-flow__viewport')).toHaveStyle({
      transform: 'translate(-6px, 4px) scale(1)',
      width: '298px',
      height: '148px'
    })
    expect(options.filter(ignoredElement)).toBe(false)
    expect(saveImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'boardmark-canvas.png',
        mimeType: 'image/png'
      })
    )
  })

  it('includes group members, related edges, and locked items when exporting selection scope', async () => {
    const saveImageMock = vi.fn().mockResolvedValue({
      ok: true as const,
      value: undefined
    })
    const { flowElement, viewport } = createFlowScene({
      flowRect: { left: 40, top: 60, width: 800, height: 600 },
      viewport: { x: -30, y: -10, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 10, y: 10, width: 30, height: 20 },
      id: 'node-1',
      kind: 'node',
      viewport: { x: -30, y: -10, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 100, y: 50, width: 40, height: 30 },
      id: 'node-2',
      kind: 'node',
      viewport: { x: -30, y: -10, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 20, y: 15, width: 90, height: 10 },
      id: 'edge-related',
      kind: 'edge',
      viewport: { x: -30, y: -10, zoom: 2 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 130, y: 60, width: 40, height: 20 },
      id: 'edge-explicit',
      kind: 'edge',
      viewport: { x: -30, y: -10, zoom: 2 }
    })

    await exportCanvasSceneImage({
      format: 'png',
      imageExportBridge: {
        saveImage: saveImageMock
      },
      rootElement: flowElement,
      scope: 'selection',
      state: {
        edges: [
          createEdge('edge-related', 'node-1', 'node-2'),
          createEdge('edge-explicit', 'node-2', 'node-3', { locked: true })
        ],
        groupSelectionState: { status: 'idle' },
        groups: [
          createGroup('group-1', ['node-1'])
        ],
        nodes: [
          createNode('node-1', { x: 10, y: 10, w: 30, h: 20 }, { locked: true }),
          createNode('node-2', { x: 100, y: 50, w: 40, h: 30 })
        ],
        selectedEdgeIds: ['edge-explicit'],
        selectedGroupIds: ['group-1'],
        selectedNodeIds: ['node-2'],
        viewport: { x: -30, y: -10, zoom: 2 }
      }
    })

    const [, options] = toBlobMock.mock.calls[0] as [HTMLElement, {
      canvasHeight: number
      canvasWidth: number
    }]
    expect(options.canvasWidth).toBe(208)
    expect(options.canvasHeight).toBe(118)
    expect(saveImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'boardmark-selection.png',
        mimeType: 'image/png'
      })
    )
  })

  it('converts runtime PNG output to JPG when JPG export is requested', async () => {
    const saveImageMock = vi.fn().mockResolvedValue({
      ok: true as const,
      value: undefined
    })
    const { flowElement, viewport } = createFlowScene({
      flowRect: { left: 0, top: 0, width: 640, height: 480 },
      viewport: { x: 0, y: 0, zoom: 1 }
    })
    appendRenderedElement(viewport, {
      flowRect: { x: 20, y: 20, width: 80, height: 50 },
      id: 'node-1',
      kind: 'node',
      viewport: { x: 0, y: 0, zoom: 1 }
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:source-png')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(() => undefined)
    })
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        naturalHeight = 98
        naturalWidth = 148

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
      callback(new Blob(['jpg'], { type: 'image/jpeg' }))
    })

    const outcome = await exportCanvasSceneImage({
      format: 'jpeg',
      imageExportBridge: {
        saveImage: saveImageMock
      },
      rootElement: flowElement,
      scope: 'document',
      state: {
        edges: [],
        groupSelectionState: { status: 'idle' },
        groups: [],
        nodes: [
          createNode('node-1', { x: 20, y: 20, w: 80, h: 50 })
        ],
        selectedEdgeIds: [],
        selectedGroupIds: [],
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    })

    expect(outcome).toEqual({ status: 'saved' })
    expect(saveImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'boardmark-canvas.jpg',
        mimeType: 'image/jpeg'
      })
    )
  })

  it('replaces sandpack preview iframes with static export images before rasterizing the scene', async () => {
    const saveImageMock = vi.fn().mockResolvedValue({
      ok: true as const,
      value: undefined
    })
    const { flowElement, viewport } = createFlowScene({
      flowRect: { left: 0, top: 0, width: 640, height: 480 },
      viewport: { x: 0, y: 0, zoom: 1 }
    })
    const nodeElement = appendRenderedElement(viewport, {
      flowRect: { x: 20, y: 20, width: 240, height: 180 },
      id: 'node-1',
      kind: 'node',
      viewport: { x: 0, y: 0, zoom: 1 }
    })

    appendSandpackBlock(nodeElement)
    readSandpackBlockPayloadMock.mockReturnValue({
      meta: '{"template":"react"}',
      source: '```App.js\\nexport default function App() { return <div /> }\\n```'
    })

    await exportCanvasSceneImage({
      format: 'png',
      imageExportBridge: {
        saveImage: saveImageMock
      },
      rootElement: flowElement,
      scope: 'selection',
      state: {
        edges: [],
        groupSelectionState: { status: 'idle' },
        groups: [],
        nodes: [
          createNode('node-1', { x: 20, y: 20, w: 240, h: 180 })
        ],
        selectedEdgeIds: [],
        selectedGroupIds: [],
        selectedNodeIds: ['node-1'],
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    })

    expect(rasterizeSandpackBlockToDataUrlMock).toHaveBeenCalledTimes(1)
    expect(rasterizeSandpackBlockToDataUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: '{"template":"react"}',
        source: '```App.js\\nexport default function App() { return <div /> }\\n```',
        width: 220
      })
    )

    const [cloneRoot] = toBlobMock.mock.calls[0] as [HTMLElement]
    expect(cloneRoot.querySelector('.sandpack-block iframe')).toBeNull()

    const exportedPreview = cloneRoot.querySelector('[data-boardmark-export-sandpack-image="true"]')

    expect(exportedPreview).toBeInstanceOf(HTMLImageElement)
    expect((exportedPreview as HTMLImageElement).src).toBe('data:image/png;base64,sandpack-preview')
  })
})

function createFlowScene(input: {
  flowRect: {
    height: number
    left: number
    top: number
    width: number
  }
  viewport: {
    x: number
    y: number
    zoom: number
  }
}) {
  const flowElement = document.createElement('div')
  flowElement.className = 'react-flow boardmark-flow'
  flowElement.style.backgroundColor = 'rgb(248, 249, 250)'
  flowElement.getBoundingClientRect = () =>
    createDomRect(input.flowRect.left, input.flowRect.top, input.flowRect.width, input.flowRect.height)

  const viewport = document.createElement('div')
  viewport.className = 'react-flow__viewport'
  flowElement.append(viewport)
  document.body.append(flowElement)

  return {
    flowElement,
    viewport
  }
}

function appendRenderedElement(
  parent: HTMLElement,
  input: {
    flowRect: {
      height: number
      width: number
      x: number
      y: number
    }
    id: string
    kind: 'edge' | 'node'
    viewport: {
      x: number
      y: number
      zoom: number
    }
  }
) {
  const element = document.createElement('div')
  element.className = input.kind === 'node' ? 'react-flow__node' : 'react-flow__edge'
  element.setAttribute('data-id', input.id)
  const flowElement = parent.closest('.react-flow')

  if (!(flowElement instanceof HTMLElement)) {
    throw new Error('React Flow root not found for test element.')
  }

  const flowRootRect = flowElement.getBoundingClientRect()
  element.getBoundingClientRect = () =>
    createDomRect(
      flowRootRect.left + input.viewport.x + input.flowRect.x * input.viewport.zoom,
      flowRootRect.top + input.viewport.y + input.flowRect.y * input.viewport.zoom,
      input.flowRect.width * input.viewport.zoom,
      input.flowRect.height * input.viewport.zoom
    )
  parent.append(element)

  return element
}

function appendSandpackBlock(parent: HTMLElement) {
  const block = document.createElement('figure')
  block.className = 'sandpack-block'
  Object.defineProperty(block, 'clientWidth', {
    configurable: true,
    value: 220
  })
  Object.defineProperty(block, 'clientHeight', {
    configurable: true,
    value: 140
  })
  block.getBoundingClientRect = () => createDomRect(0, 0, 220, 140)

  const iframe = document.createElement('iframe')
  iframe.title = 'Sandpack Preview'
  block.append(iframe)
  parent.append(block)

  return block
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

function createNode(
  id: string,
  at: { h?: number; w?: number; x: number; y: number },
  extra: Partial<CanvasNode> = {}
): CanvasNode {
  return {
    id,
    component: 'note',
    at,
    position: TEST_SOURCE_RANGE,
    sourceMap: TEST_SOURCE_MAP,
    ...extra
  }
}

function createEdge(
  id: string,
  from: string,
  to: string,
  extra: Partial<CanvasEdge> = {}
): CanvasEdge {
  return {
    id,
    from,
    to,
    position: TEST_SOURCE_RANGE,
    sourceMap: TEST_SOURCE_MAP,
    ...extra
  }
}

function createGroup(id: string, nodeIds: string[], extra: Partial<CanvasGroup> = {}): CanvasGroup {
  return {
    id,
    members: {
      nodeIds
    },
    position: TEST_SOURCE_RANGE,
    sourceMap: TEST_SOURCE_MAP,
    ...extra
  }
}

const TEST_SOURCE_RANGE = {
  start: { line: 1, offset: 0 },
  end: { line: 1, offset: 1 }
} as const

const TEST_SOURCE_MAP = {
  objectRange: TEST_SOURCE_RANGE,
  headerLineRange: TEST_SOURCE_RANGE,
  bodyRange: TEST_SOURCE_RANGE,
  closingLineRange: TEST_SOURCE_RANGE
} as const
