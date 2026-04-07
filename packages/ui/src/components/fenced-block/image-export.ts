export type FencedBlockImageExportRequest = {
  kind: 'code' | 'mermaid'
  rootElement: HTMLElement
  language?: string
}

export type FencedBlockImageExportResult = {
  blob: Blob
  mimeType: 'image/png'
  fileName: string
}

type HtmlToImageModule = typeof import('html-to-image')
type CanvgModule = typeof import('canvg')

let htmlToImagePromise: Promise<HtmlToImageModule> | null = null
let canvgPromise: Promise<CanvgModule> | null = null
const MIN_MERMAID_EXPORT_SCALE = 2
const MAX_MERMAID_EXPORT_SCALE = 3

export async function exportCodeBlockImage(
  request: FencedBlockImageExportRequest
): Promise<FencedBlockImageExportResult> {
  if (request.kind !== 'code') {
    throw new Error(`Code block exporter received unsupported kind "${request.kind}".`)
  }

  const rootElement = requireExportRoot(request.rootElement, 'Code block')
  const width = readElementCaptureWidth(rootElement)
  const height = readElementCaptureHeight(rootElement)
  const htmlToImage = await loadHtmlToImage()
  const blob = await htmlToImage.toBlob(rootElement, {
    backgroundColor: readCodeBlockBackgroundColor(rootElement),
    cacheBust: true,
    canvasHeight: height,
    canvasWidth: width,
    filter: (node) => !shouldSkipNodeDuringExport(node),
    height,
    pixelRatio: readPixelRatio(),
    skipAutoScale: true,
    width
  })

  return {
    blob: requirePngBlob(blob, 'Code block export produced no PNG image.'),
    fileName: readCodeBlockFileName(request.language),
    mimeType: 'image/png'
  }
}

export async function exportMermaidBlockImage(
  request: FencedBlockImageExportRequest
): Promise<FencedBlockImageExportResult> {
  if (request.kind !== 'mermaid') {
    throw new Error(`Mermaid exporter received unsupported kind "${request.kind}".`)
  }

  const rootElement = requireExportRoot(request.rootElement, 'Mermaid block')

  if (rootElement.dataset.state !== 'ready') {
    throw new Error('Mermaid image export is only available after the diagram is rendered.')
  }

  const svgElement = rootElement.querySelector('.mermaid-diagram__viewport svg')

  if (!(svgElement instanceof SVGElement)) {
    throw new Error('Mermaid export could not find a rendered SVG element.')
  }

  const width = readSvgCaptureWidth(svgElement, rootElement)
  const height = readSvgCaptureHeight(svgElement, rootElement)
  const exportScale = readMermaidExportScale()
  const serialized = serializeMermaidSvg(svgElement, width, height)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * exportScale))
  canvas.height = Math.max(1, Math.ceil(height * exportScale))

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Mermaid export could not create a 2D canvas context.')
  }

  context.scale(exportScale, exportScale)
  context.fillStyle = readMermaidBackgroundColor(rootElement)
  context.fillRect(0, 0, width, height)

  const { Canvg } = await loadCanvg()
  const renderer = Canvg.fromString(context, serialized, {
    ignoreAnimation: true,
    ignoreDimensions: true,
    ignoreMouse: true
  })

  await renderer.render()

  return {
    blob: requirePngBlob(
      await canvasToBlob(canvas, 'image/png'),
      'Mermaid export returned no PNG image.'
    ),
    fileName: 'boardmark-mermaid-diagram.png',
    mimeType: 'image/png'
  }
}

function shouldSkipNodeDuringExport(node: HTMLElement | SVGElement) {
  return node.dataset.boardmarkExportIgnore === 'true'
}

function requireExportRoot(rootElement: HTMLElement, label: string) {
  if (!rootElement) {
    throw new Error(`${label} export root is missing.`)
  }

  const width = readElementCaptureWidth(rootElement)
  const height = readElementCaptureHeight(rootElement)

  if (width <= 0 || height <= 0) {
    throw new Error(`${label} export root has no visible size.`)
  }

  return rootElement
}

function readElementCaptureWidth(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()

  return Math.max(
    1,
    Math.ceil(bounds.width),
    Math.ceil(element.scrollWidth),
    Math.ceil(element.clientWidth)
  )
}

function readElementCaptureHeight(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()

  return Math.max(
    1,
    Math.ceil(bounds.height),
    Math.ceil(element.scrollHeight),
    Math.ceil(element.clientHeight)
  )
}

function readCodeBlockFileName(language?: string) {
  const normalizedLanguage = language?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

  if (!normalizedLanguage) {
    return 'boardmark-code-block.png'
  }

  return `boardmark-code-block-${normalizedLanguage}.png`
}

function readCodeBlockBackgroundColor(rootElement: HTMLElement) {
  const backgroundColor = window.getComputedStyle(rootElement).backgroundColor

  if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
    return backgroundColor
  }

  return '#2b3437'
}

function readMermaidBackgroundColor(rootElement: HTMLElement) {
  const backgroundColor = window.getComputedStyle(rootElement).backgroundColor

  if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
    return backgroundColor
  }

  return '#f8f9fa'
}

function readSvgCaptureWidth(svgElement: SVGElement, rootElement: HTMLElement) {
  const viewBoxSize = readSvgViewBoxSize(svgElement)
  const widthAttribute = Number(svgElement.getAttribute('width'))
  const bounds = svgElement.getBoundingClientRect()
  return Math.max(
    viewBoxSize?.width ?? 0,
    Number.isFinite(widthAttribute) && widthAttribute > 0 ? widthAttribute : 0,
    bounds.width > 0 ? bounds.width : 0,
    readElementCaptureWidth(rootElement)
  )
}

function readSvgCaptureHeight(svgElement: SVGElement, rootElement: HTMLElement) {
  const viewBoxSize = readSvgViewBoxSize(svgElement)
  const heightAttribute = Number(svgElement.getAttribute('height'))
  const bounds = svgElement.getBoundingClientRect()
  return Math.max(
    viewBoxSize?.height ?? 0,
    Number.isFinite(heightAttribute) && heightAttribute > 0 ? heightAttribute : 0,
    bounds.height > 0 ? bounds.height : 0,
    readElementCaptureHeight(rootElement)
  )
}

function readSvgViewBoxSize(svgElement: SVGElement) {
  const viewBox = svgElement.getAttribute('viewBox')

  if (!viewBox) {
    return null
  }

  const parts = viewBox
    .trim()
    .split(/[,\s]+/)
    .map((part) => Number(part))

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null
  }

  const width = parts[2]
  const height = parts[3]

  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    height: Math.ceil(height),
    width: Math.ceil(width)
  }
}

function serializeMermaidSvg(svgElement: SVGElement, width: number, height: number) {
  const clone = svgElement.cloneNode(true)

  if (!(clone instanceof SVGElement)) {
    throw new Error('Mermaid export could not clone the SVG element.')
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  return new XMLSerializer().serializeToString(clone)
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

async function loadCanvg() {
  if (!canvgPromise) {
    canvgPromise = import('canvg').catch((error) => {
      canvgPromise = null
      throw error
    })
  }

  return canvgPromise
}

function readPixelRatio() {
  if (typeof window === 'undefined') {
    return 1
  }

  return Math.max(1, Math.ceil(window.devicePixelRatio || 1))
}

function readMermaidExportScale() {
  return Math.max(
    MIN_MERMAID_EXPORT_SCALE,
    Math.min(MAX_MERMAID_EXPORT_SCALE, readPixelRatio())
  )
}

function requirePngBlob(blob: Blob | null, fallbackMessage: string) {
  if (!blob || blob.size === 0) {
    throw new Error(fallbackMessage)
  }

  return blob
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob | null>((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas export is not available.'))
      return
    }

    canvas.toBlob((blob) => {
      resolve(blob)
    }, mimeType)
  })
}
