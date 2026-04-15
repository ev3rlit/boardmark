import type { CanvasImageExportBridge } from '@canvas-app/document/canvas-image-export-bridge'

export type RasterImageExportFormat = 'jpeg' | 'png'

export type RasterImageExportResult = {
  blob: Blob
  fileName: string
  mimeType: 'image/png'
}

export type RasterImageSaveOutcome =
  | { status: 'saved' }
  | { status: 'cancelled' }

export async function saveRasterImageExport(
  result: RasterImageExportResult,
  format: RasterImageExportFormat,
  options: {
    imageExportBridge?: CanvasImageExportBridge
  } = {}
): Promise<RasterImageSaveOutcome> {
  const preparedResult = await prepareRasterImageExport(result, format)

  if (options.imageExportBridge) {
    const saveResult = await options.imageExportBridge.saveImage({
      bytes: await readBlobBytes(preparedResult.blob),
      fileName: preparedResult.fileName,
      mimeType: preparedResult.mimeType
    })

    if (!saveResult.ok) {
      if (saveResult.error.code === 'cancelled') {
        return { status: 'cancelled' }
      }

      throw new Error(saveResult.error.message)
    }

    return { status: 'saved' }
  }

  downloadBlob(preparedResult)

  return { status: 'saved' }
}

export async function prepareRasterImageExport(
  result: RasterImageExportResult,
  format: RasterImageExportFormat
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

async function readBlobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }

  if (typeof Response !== 'undefined') {
    return new Uint8Array(await new Response(blob).arrayBuffer())
  }

  return new Uint8Array(await readBlobArrayBuffer(blob))
}

function readBlobArrayBuffer(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('Image export could not read the generated blob.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Image export could not read the generated blob.'))
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }

      reject(new Error('Image export returned an invalid blob payload.'))
    }
    reader.readAsArrayBuffer(blob)
  })
}
