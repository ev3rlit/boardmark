import { createRoot } from 'react-dom/client'
import { SandpackBlock } from './sandpack-block'

type HtmlToImageModule = typeof import('html-to-image')

const SANDBOX_IFRAME_SELECTOR = 'iframe[title="Sandpack Preview"], iframe'
const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const SNAPSHOT_REQUEST_TYPE = 'boardmark:snapshot-request'
const SNAPSHOT_RESPONSE_TYPE = 'boardmark:snapshot-response'

let htmlToImagePromise: Promise<HtmlToImageModule> | null = null

export async function rasterizeSandpackBlockToDataUrl(input: {
  blockElement?: HTMLElement
  meta?: string
  source: string
  width: number
}) {
  if (!document.body) {
    throw new Error('Sandpack raster export requires a document body.')
  }

  const liveBlockResult = await rasterizeLiveSandpackBlockToDataUrl(input)

  if (liveBlockResult) {
    return liveBlockResult
  }

  const mount = document.createElement('div')
  mount.style.position = 'fixed'
  mount.style.left = '-100000px'
  mount.style.top = '0'
  mount.style.width = `${Math.max(1, Math.ceil(input.width))}px`
  mount.style.pointerEvents = 'none'
  mount.style.background = '#ffffff'
  mount.style.zIndex = '-1'

  const content = document.createElement('div')
  content.className = 'markdown-content'
  content.style.width = '100%'
  mount.append(content)
  document.body.append(mount)

  const root = createRoot(content)
  root.render(
    <SandpackBlock
      meta={input.meta}
      source={input.source}
    />
  )

  try {
    const target = await waitForRasterizableSandpack(content)
    const htmlToImage = await loadHtmlToImage()
    const dataUrl = await rasterizeSandpackSurfaceToDataUrl(target, htmlToImage, {
      allowShellFallback: true
    })

    if (!dataUrl) {
      throw new Error('Sandpack export surface produced no preview snapshot.')
    }

    return dataUrl
  } finally {
    root.unmount()
    mount.remove()
  }
}

async function rasterizeLiveSandpackBlockToDataUrl(input: {
  blockElement?: HTMLElement
  meta?: string
  source: string
  width: number
}) {
  const blockElement = input.blockElement

  if (!blockElement) {
    return null
  }

  await waitForRasterizableSandpack(blockElement)
  const htmlToImage = await loadHtmlToImage()

  return rasterizeSandpackSurfaceToDataUrl(blockElement, htmlToImage, {
    allowShellFallback: false
  })
}

async function rasterizeSandpackSurfaceToDataUrl(
  blockElement: HTMLElement,
  htmlToImage: HtmlToImageModule,
  options: {
    allowShellFallback: boolean
  }
) {
  // NOTE(boardmark): the shell consistently rasterizes, but the live preview can
  // still return blank from inside the iframe. Keep shell capture and preview
  // snapshot separate so future fixes can focus on the child runtime only.
  const shellDataUrl = await rasterizeSandpackShellToDataUrl(blockElement, htmlToImage)
  const iframe = blockElement.querySelector<HTMLIFrameElement>(SANDBOX_IFRAME_SELECTOR)

  if (!iframe) {
    return shellDataUrl
  }

  const previewDataUrl = await requestPreviewSnapshotFromIframe(iframe).catch(() => null)

  if (!previewDataUrl) {
    return options.allowShellFallback ? shellDataUrl : null
  }

  return composeShellAndPreviewDataUrl({
    blockElement,
    iframeElement: iframe,
    previewDataUrl,
    shellDataUrl
  })
}

async function rasterizeSandpackShellToDataUrl(
  blockElement: HTMLElement,
  htmlToImage: HtmlToImageModule
) {
  if (!document.body) {
    throw new Error('Sandpack shell raster export requires a document body.')
  }

  const shellRoot = blockElement.cloneNode(true)

  if (!(shellRoot instanceof HTMLElement)) {
    throw new Error('Sandpack shell export could not clone the block.')
  }

  const width = readCaptureWidth(blockElement)
  const height = readCaptureHeight(blockElement)

  shellRoot.style.position = 'fixed'
  shellRoot.style.left = '-100000px'
  shellRoot.style.top = '0'
  shellRoot.style.width = `${width}px`
  shellRoot.style.height = `${height}px`
  shellRoot.style.pointerEvents = 'none'
  shellRoot.style.background = '#ffffff'
  shellRoot.style.zIndex = '-1'

  replaceShellPreviewIframes(shellRoot, blockElement)
  document.body.append(shellRoot)

  try {
    return await htmlToImage.toPng(shellRoot, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      canvasHeight: height,
      canvasWidth: width,
      height,
      pixelRatio: 1,
      skipAutoScale: true,
      skipFonts: true,
      width
    })
  } finally {
    shellRoot.remove()
  }
}

function replaceShellPreviewIframes(
  shellRoot: HTMLElement,
  sourceBlock: HTMLElement
) {
  const sourceIframes = [...sourceBlock.querySelectorAll<HTMLIFrameElement>(SANDBOX_IFRAME_SELECTOR)]
  const shellIframes = [...shellRoot.querySelectorAll<HTMLIFrameElement>(SANDBOX_IFRAME_SELECTOR)]

  for (let index = 0; index < Math.min(sourceIframes.length, shellIframes.length); index += 1) {
    const sourceIframe = sourceIframes[index]
    const shellIframe = shellIframes[index]
    const placeholder = document.createElement('div')

    placeholder.style.display = 'block'
    placeholder.style.width = `${Math.max(1, Math.ceil(sourceIframe.clientWidth))}px`
    placeholder.style.height = `${Math.max(1, Math.ceil(sourceIframe.clientHeight))}px`
    placeholder.style.border = '0'
    placeholder.style.background = '#ffffff'
    shellIframe.replaceWith(placeholder)
  }
}

async function requestPreviewSnapshotFromIframe(iframe: HTMLIFrameElement) {
  const targetWindow = iframe.contentWindow

  if (!targetWindow) {
    throw new Error('Sandpack preview window is unavailable.')
  }

  // NOTE(boardmark): when this request times out, exports fall back to the shell
  // image only. The visible buttons in failed exports come from that shell path.
  const requestId = createRequestId()

  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Sandpack preview snapshot request timed out.'))
    }, DEFAULT_WAIT_TIMEOUT_MS)

    function cleanup() {
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
    }

    function handleMessage(event: MessageEvent) {
      if (event.source !== targetWindow) {
        return
      }

      const data = event.data

      if (!data || data.type !== SNAPSHOT_RESPONSE_TYPE || data.requestId !== requestId) {
        return
      }

      cleanup()

      if (typeof data.error === 'string' && data.error.length > 0) {
        reject(new Error(data.error))
        return
      }

      if (typeof data.dataUrl !== 'string' || data.dataUrl.length === 0) {
        reject(new Error('Sandpack preview snapshot returned no image data.'))
        return
      }

      resolve(data.dataUrl)
    }

    window.addEventListener('message', handleMessage)
    targetWindow.postMessage({
      type: SNAPSHOT_REQUEST_TYPE,
      requestId
    }, '*')
  })
}

async function composeShellAndPreviewDataUrl(input: {
  blockElement: HTMLElement
  iframeElement: HTMLIFrameElement
  previewDataUrl: string
  shellDataUrl: string
}) {
  const width = readCaptureWidth(input.blockElement)
  const height = readCaptureHeight(input.blockElement)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Sandpack composite export could not create a 2D canvas context.')
  }

  const [shellImage, previewImage] = await Promise.all([
    loadImage(input.shellDataUrl),
    loadImage(input.previewDataUrl)
  ])

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(shellImage, 0, 0, width, height)

  const blockRect = input.blockElement.getBoundingClientRect()
  const iframeRect = input.iframeElement.getBoundingClientRect()
  const previewX = Math.max(0, Math.round(iframeRect.left - blockRect.left))
  const previewY = Math.max(0, Math.round(iframeRect.top - blockRect.top))
  const previewWidth = Math.max(1, Math.ceil(iframeRect.width))
  const previewHeight = Math.max(1, Math.ceil(iframeRect.height))

  context.drawImage(previewImage, previewX, previewY, previewWidth, previewHeight)

  return canvas.toDataURL('image/png')
}

async function waitForRasterizableSandpack(rootElement: HTMLElement) {
  const deadline = Date.now() + DEFAULT_WAIT_TIMEOUT_MS

  while (Date.now() < deadline) {
    const block =
      rootElement.matches('.sandpack-block[data-state]')
        ? rootElement
        : rootElement.querySelector<HTMLElement>('.sandpack-block[data-state]')

    if (block) {
      if (block.dataset.state === 'error') {
        return block
      }

      if (await isSandpackPreviewReady(block)) {
        await waitForNextFrame()
        await waitForNextFrame()
        return block
      }
    }

    await wait(50)
  }

  throw new Error('Sandpack export surface did not become ready in time.')
}

async function isSandpackPreviewReady(block: HTMLElement) {
  const iframe = block.querySelector<HTMLIFrameElement>(SANDBOX_IFRAME_SELECTOR)

  if (!iframe) {
    return block.getBoundingClientRect().height > 0
  }

  const frameDocument = iframe.contentDocument ?? iframe.contentWindow?.document
  const body = frameDocument?.body

  if (!body) {
    return false
  }

  if (iframe.clientWidth <= 0 || iframe.clientHeight <= 0) {
    return false
  }

  return body.childElementCount > 0 || body.textContent?.trim().length !== 0
}

function readCaptureWidth(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()

  return Math.max(
    1,
    Math.ceil(bounds.width),
    Math.ceil(element.scrollWidth),
    Math.ceil(element.clientWidth)
  )
}

function readCaptureHeight(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()

  return Math.max(
    1,
    Math.ceil(bounds.height),
    Math.ceil(element.scrollHeight),
    Math.ceil(element.clientHeight)
  )
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

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function createRequestId() {
  return `boardmark-snapshot-${Math.random().toString(36).slice(2)}`
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not decode image "${src}".`))
    image.src = src
  })
}
