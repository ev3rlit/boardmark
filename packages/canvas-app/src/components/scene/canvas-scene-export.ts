import type { CanvasImageExportBridge } from '@canvas-app/document/canvas-image-export-bridge'
import { saveRasterImageExport, type RasterImageExportFormat, type RasterImageSaveOutcome } from '@canvas-app/services/raster-image-export'
import { readDocumentSelection, type CanvasSelectionSnapshot } from '@canvas-app/store/canvas-object-selection'
import type { CanvasViewport } from '@boardmark/canvas-domain'

type HtmlToImageModule = typeof import('html-to-image')

export type CanvasExportFormat = RasterImageExportFormat
export type CanvasExportScope = 'document' | 'selection'

type CanvasSceneExportState = CanvasSelectionSnapshot & {
  viewport: CanvasViewport
}

type FlowBounds = {
  height: number
  width: number
  x: number
  y: number
}

const EXPORT_PADDING = 24
const EXPORT_IGNORE_SELECTOR = '[data-boardmark-export-ignore="true"]'
const EXPORT_IGNORE_CLASS_NAMES = new Set([
  'boardmark-flow__resize-handle',
  'boardmark-flow__resize-line',
  'react-flow__attribution',
  'react-flow__controls',
  'react-flow__handle',
  'react-flow__node-toolbar',
  'react-flow__nodesselection',
  'react-flow__resize-control',
  'react-flow__selection',
  'react-flow__selectionpane',
  'react-flow__viewport-portal'
])

let htmlToImagePromise: Promise<HtmlToImageModule> | null = null

export async function exportCanvasSceneImage(input: {
  format: CanvasExportFormat
  imageExportBridge?: CanvasImageExportBridge
  rootElement: HTMLElement
  scope: CanvasExportScope
  state: CanvasSceneExportState
}): Promise<RasterImageSaveOutcome> {
  const flowElement = requireFlowElement(input.rootElement)
  const bounds = readSceneExportBounds({
    flowElement,
    scope: input.scope,
    state: input.state
  })

  if (!bounds) {
    throw new Error(
      input.scope === 'selection'
        ? 'Selection export could not find any rendered objects.'
        : 'Canvas export could not find any rendered objects.'
    )
  }

  const exportWidth = Math.max(1, Math.ceil(bounds.width + EXPORT_PADDING * 2))
  const exportHeight = Math.max(1, Math.ceil(bounds.height + EXPORT_PADDING * 2))
  const translateX = Math.round(EXPORT_PADDING - bounds.x)
  const translateY = Math.round(EXPORT_PADDING - bounds.y)
  const cloneRoot = flowElement.cloneNode(true)

  if (!(cloneRoot instanceof HTMLElement)) {
    throw new Error('Canvas export could not clone the React Flow surface.')
  }

  const cloneViewport = requireViewportElement(cloneRoot)
  applyCloneRootLayout(cloneRoot, exportWidth, exportHeight)
  applyCloneContainerLayout(cloneRoot, exportWidth, exportHeight)
  cloneViewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(1)`
  cloneViewport.style.transformOrigin = '0 0'
  cloneViewport.style.width = `${exportWidth}px`
  cloneViewport.style.height = `${exportHeight}px`

  if (!document.body) {
    throw new Error('Canvas export requires a document body.')
  }

  document.body.append(cloneRoot)

  try {
    const htmlToImage = await loadHtmlToImage()
    const blob = await htmlToImage.toBlob(cloneRoot, {
      backgroundColor: readSceneBackgroundColor(flowElement),
      cacheBust: true,
      canvasHeight: exportHeight,
      canvasWidth: exportWidth,
      filter: (node) => !shouldSkipCanvasSceneNode(node),
      height: exportHeight,
      pixelRatio: readPixelRatio(),
      skipAutoScale: true,
      width: exportWidth
    })

    return saveRasterImageExport({
      blob: requirePngBlob(blob, 'Canvas export produced no PNG image.'),
      fileName: input.scope === 'selection' ? 'boardmark-selection.png' : 'boardmark-canvas.png',
      mimeType: 'image/png'
    }, input.format, {
      imageExportBridge: input.imageExportBridge
    })
  } finally {
    cloneRoot.remove()
  }
}

export function readSceneExportBounds(input: {
  flowElement: HTMLElement
  scope: CanvasExportScope
  state: CanvasSceneExportState
}) {
  const renderedBounds = readRenderedBounds(input.flowElement, input.state.viewport)

  if (input.scope === 'document') {
    return mergeBounds([...renderedBounds.nodeBoundsById.values(), ...renderedBounds.edgeBoundsById.values()])
  }

  const selection = readDocumentSelection(input.state, {
    includeLocked: true
  })

  return mergeBounds([
    ...selection.nodeIds
      .map((nodeId) => renderedBounds.nodeBoundsById.get(nodeId) ?? null)
      .filter((entry): entry is FlowBounds => entry !== null),
    ...selection.edgeIds
      .map((edgeId) => renderedBounds.edgeBoundsById.get(edgeId) ?? null)
      .filter((entry): entry is FlowBounds => entry !== null)
  ])
}

function readRenderedBounds(flowElement: HTMLElement, viewport: CanvasViewport) {
  const flowRect = flowElement.getBoundingClientRect()

  return {
    edgeBoundsById: readRenderedBoundsMap(flowElement, '.react-flow__edge[data-id]', flowRect, viewport),
    nodeBoundsById: readRenderedBoundsMap(flowElement, '.react-flow__node[data-id]', flowRect, viewport)
  }
}

function readRenderedBoundsMap(
  flowElement: HTMLElement,
  selector: string,
  flowRect: DOMRect,
  viewport: CanvasViewport
) {
  const boundsById = new Map<string, FlowBounds>()

  flowElement.querySelectorAll(selector).forEach((element) => {
    const id = element.getAttribute('data-id')

    if (!id) {
      return
    }

    const bounds = toFlowBounds(element, flowRect, viewport)

    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return
    }

    boundsById.set(id, bounds)
  })

  return boundsById
}

function toFlowBounds(
  element: Element,
  flowRect: DOMRect,
  viewport: CanvasViewport
): FlowBounds | null {
  if (typeof element.getBoundingClientRect !== 'function') {
    return null
  }

  const rect = element.getBoundingClientRect()

  if (rect.width <= 0 || rect.height <= 0 || viewport.zoom === 0) {
    return null
  }

  return {
    x: (rect.left - flowRect.left - viewport.x) / viewport.zoom,
    y: (rect.top - flowRect.top - viewport.y) / viewport.zoom,
    width: rect.width / viewport.zoom,
    height: rect.height / viewport.zoom
  }
}

function mergeBounds(bounds: FlowBounds[]) {
  if (bounds.length === 0) {
    return null
  }

  const left = Math.min(...bounds.map((entry) => entry.x))
  const top = Math.min(...bounds.map((entry) => entry.y))
  const right = Math.max(...bounds.map((entry) => entry.x + entry.width))
  const bottom = Math.max(...bounds.map((entry) => entry.y + entry.height))

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
}

function requireFlowElement(rootElement: HTMLElement) {
  if (rootElement.classList.contains('react-flow')) {
    return rootElement
  }

  const flowElement = rootElement.querySelector('.react-flow')

  if (!(flowElement instanceof HTMLElement)) {
    throw new Error('Canvas export could not find the React Flow surface.')
  }

  return flowElement
}

function requireViewportElement(rootElement: HTMLElement) {
  const viewportElement = rootElement.querySelector('.react-flow__viewport')

  if (!(viewportElement instanceof HTMLElement)) {
    throw new Error('Canvas export could not find the React Flow viewport.')
  }

  return viewportElement
}

function applyCloneRootLayout(rootElement: HTMLElement, width: number, height: number) {
  rootElement.style.width = `${width}px`
  rootElement.style.height = `${height}px`
  rootElement.style.position = 'fixed'
  rootElement.style.left = '0'
  rootElement.style.top = '0'
  rootElement.style.pointerEvents = 'none'
  rootElement.style.overflow = 'hidden'
  rootElement.style.zIndex = '-1'
}

function applyCloneContainerLayout(rootElement: HTMLElement, width: number, height: number) {
  rootElement
    .querySelectorAll<HTMLElement>(
      '.react-flow__container, .react-flow__renderer, .react-flow__viewport, .react-flow__nodes, .react-flow__edges, .react-flow__edgelabel-renderer'
    )
    .forEach((element) => {
      element.style.width = `${width}px`
      element.style.height = `${height}px`
    })
}

function shouldSkipCanvasSceneNode(node: HTMLElement | SVGElement) {
  if (!(node instanceof Element)) {
    return false
  }

  if (node.closest(EXPORT_IGNORE_SELECTOR)) {
    return true
  }

  return [...node.classList].some((className) => EXPORT_IGNORE_CLASS_NAMES.has(className))
}

function readSceneBackgroundColor(flowElement: HTMLElement) {
  const backgroundColor = window.getComputedStyle(flowElement).backgroundColor

  if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
    return backgroundColor
  }

  return '#f8f9fa'
}

async function loadHtmlToImage() {
  if (!htmlToImagePromise) {
    htmlToImagePromise = import('html-to-image').catch((error) => {
      htmlToImagePromise = null
      throw error
    })
  }

  return htmlToImagePromise
}

function readPixelRatio() {
  if (typeof window === 'undefined') {
    return 1
  }

  return Math.max(1, Math.ceil(window.devicePixelRatio || 1))
}

function requirePngBlob(blob: Blob | null, fallbackMessage: string) {
  if (!blob || blob.size === 0) {
    throw new Error(fallbackMessage)
  }

  return blob
}
