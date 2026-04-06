import type { MarkdownContentImageActions } from '@boardmark/ui'
import type { FencedBlockImageExportResult } from '@boardmark/ui'
import type { CanvasImageExportBridge } from '@canvas-app/document/canvas-image-export-bridge'
import type { MarkdownContentImageExportFormat } from '@boardmark/ui'

export function createFencedBlockImageActions(options: {
  imageExportBridge?: CanvasImageExportBridge
} = {}): MarkdownContentImageActions {
  return {
    canCopyImageToClipboard() {
      return typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)
    },

    async copyImageToClipboard(result) {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Image clipboard write is not supported in this environment.')
      }

      const clipboardItem = new ClipboardItem({
        [result.mimeType]: result.blob
      })

      await navigator.clipboard.write([clipboardItem])
    },

    async exportImage(result, format) {
      const preparedResult = await prepareImageExportResult(result, format)

      if (options.imageExportBridge) {
        const saveResult = await options.imageExportBridge.saveImage({
          bytes: new Uint8Array(await preparedResult.blob.arrayBuffer()),
          fileName: preparedResult.fileName,
          mimeType: preparedResult.mimeType
        })

        if (!saveResult.ok) {
          if (saveResult.error.code === 'cancelled') {
            return { status: 'cancelled' as const }
          }

          throw new Error(saveResult.error.message)
        }

        return { status: 'saved' as const }
      }

      downloadBlob(preparedResult)

      return { status: 'saved' as const }
    }
  }
}

async function prepareImageExportResult(
  result: FencedBlockImageExportResult,
  format: MarkdownContentImageExportFormat
): Promise<{
  blob: Blob
  fileName: string
  mimeType: 'image/jpeg' | 'image/png'
}> {
  if (format === 'png') {
    return result
  }

  return {
    blob: await convertImageBlob(result.blob, 'image/jpeg'),
    fileName: replaceImageExtension(result.fileName, '.jpg'),
    mimeType: 'image/jpeg'
  }
}

function downloadBlob(result: {
  blob: Blob
  fileName: string
  mimeType: 'image/jpeg' | 'image/png'
}) {
  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('PNG download is not supported in this environment.')
  }

  if (!document.body) {
    throw new Error('Document body is not available for image download.')
  }

  const objectUrl = URL.createObjectURL(result.blob)
  const link = document.createElement('a')
  link.download = result.fileName
  link.href = objectUrl
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

async function convertImageBlob(
  sourceBlob: Blob,
  targetMimeType: 'image/jpeg'
): Promise<Blob> {
  const imageUrl = URL.createObjectURL(sourceBlob)

  try {
    const image = await loadImage(imageUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    if (width <= 0 || height <= 0) {
      throw new Error('Image export produced an invalid raster size.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('JPEG export is not available in this environment.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return requireBlob(await canvasToBlob(canvas, targetMimeType), 'JPEG export returned no image blob.')
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not decode image "${src}".`))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: 'image/jpeg') {
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

function requireBlob(blob: Blob | null, fallbackMessage: string) {
  if (!blob || blob.size === 0) {
    throw new Error(fallbackMessage)
  }

  return blob
}

function replaceImageExtension(fileName: string, extension: '.jpg' | '.png') {
  if (/\.[a-z0-9]+$/i.test(fileName)) {
    return fileName.replace(/\.[a-z0-9]+$/i, extension)
  }

  return `${fileName}${extension}`
}
