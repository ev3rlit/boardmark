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

let htmlToImagePromise: Promise<HtmlToImageModule> | null = null

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

  const svgElement = rootElement.querySelector('svg')

  if (!(svgElement instanceof SVGElement)) {
    throw new Error('Mermaid export could not find a rendered SVG element.')
  }

  const width = readSvgCaptureWidth(svgElement, rootElement)
  const height = readSvgCaptureHeight(svgElement, rootElement)
  const serialized = serializeMermaidSvg(svgElement, width, height)
  const imageUrl = URL.createObjectURL(
    new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  )
  const image = await loadImageFromUrl(imageUrl)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Mermaid export could not create a 2D canvas context.')
    }

    context.fillStyle = readMermaidBackgroundColor(rootElement)
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return {
      blob: requirePngBlob(
        await canvasToBlob(canvas, 'image/png'),
        'Mermaid export returned no PNG image.'
      ),
      fileName: 'boardmark-mermaid-diagram.png',
      mimeType: 'image/png'
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
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
  const widthAttribute = Number(svgElement.getAttribute('width'))

  if (Number.isFinite(widthAttribute) && widthAttribute > 0) {
    return Math.ceil(widthAttribute)
  }

  const bounds = svgElement.getBoundingClientRect()

  if (bounds.width > 0) {
    return Math.ceil(bounds.width)
  }

  return readElementCaptureWidth(rootElement)
}

function readSvgCaptureHeight(svgElement: SVGElement, rootElement: HTMLElement) {
  const heightAttribute = Number(svgElement.getAttribute('height'))

  if (Number.isFinite(heightAttribute) && heightAttribute > 0) {
    return Math.ceil(heightAttribute)
  }

  const bounds = svgElement.getBoundingClientRect()

  if (bounds.height > 0) {
    return Math.ceil(bounds.height)
  }

  return readElementCaptureHeight(rootElement)
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

function loadImageFromUrl(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not decode exported image "${src}".`))
    image.src = src
  })
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
