const MAX_IMPORTED_IMAGE_EDGE = 4096
const MAX_CANVAS_DISPLAY_EDGE = 720
const DEFAULT_IMPORTED_IMAGE_SIZE = {
  width: 320,
  height: 240
}

export type PreparedCanvasImageAsset = {
  alt: string
  fileName: string
  height: number
  width: number
  bytes: Uint8Array
}

export async function prepareCanvasImageAsset(input: {
  blob: Blob
  fileName: string
}): Promise<PreparedCanvasImageAsset> {
  const fallbackBytes = new Uint8Array(await input.blob.arrayBuffer())
  const intrinsicSize = await readImageIntrinsicSize(input.blob)

  if (!intrinsicSize || !hasCanvasSupport()) {
    return {
      alt: '',
      fileName: normalizeAssetFileName(input.fileName, input.blob.type),
      height: DEFAULT_IMPORTED_IMAGE_SIZE.height,
      width: DEFAULT_IMPORTED_IMAGE_SIZE.width,
      bytes: fallbackBytes
    }
  }

  const nextSize = clampImageSize(intrinsicSize, MAX_IMPORTED_IMAGE_EDGE)

  if (!supportsCanvasNormalization(input.blob.type)) {
    return {
      alt: '',
      fileName: normalizeAssetFileName(input.fileName, input.blob.type),
      height: nextSize.height,
      width: nextSize.width,
      bytes: fallbackBytes
    }
  }

  const objectUrl = URL.createObjectURL(input.blob)

  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = nextSize.width
    canvas.height = nextSize.height

    const context = canvas.getContext('2d')

    if (!context) {
      return {
        alt: '',
        fileName: normalizeAssetFileName(input.fileName, input.blob.type),
        height: nextSize.height,
        width: nextSize.width,
        bytes: fallbackBytes
      }
    }

    context.drawImage(image, 0, 0, nextSize.width, nextSize.height)
    const nextBlob = await canvasToBlob(canvas, input.blob.type || 'image/png')

    return {
      alt: '',
      fileName: normalizeAssetFileName(input.fileName, nextBlob.type || input.blob.type),
      height: nextSize.height,
      width: nextSize.width,
      bytes: new Uint8Array(await nextBlob.arrayBuffer())
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function fitCanvasImageSize(width: number, height: number) {
  return clampImageSize({
    width,
    height
  }, MAX_CANVAS_DISPLAY_EDGE)
}

export function normalizeAssetFileName(fileName: string, mimeType?: string) {
  const fallbackExtension = readExtensionFromMimeType(mimeType)
  const sanitized = fileName.trim().replace(/[^\w.-]+/g, '-')
  const match = /^(.*?)(\.[^.]+)?$/.exec(sanitized)
  const baseName = match?.[1] && match[1].length > 0 ? match[1] : 'image'
  const extension = match?.[2] ?? fallbackExtension

  return `${baseName}${extension}`
}

export function readMarkdownImageSyntax(src: string, alt = '') {
  return `![${alt}](${src})`
}

function clampImageSize(
  size: {
    width: number
    height: number
  },
  maxEdge: number
) {
  const longestEdge = Math.max(size.width, size.height)

  if (longestEdge <= maxEdge) {
    return {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height))
    }
  }

  const scale = maxEdge / longestEdge

  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale))
  }
}

async function readImageIntrinsicSize(blob: Blob) {
  if (typeof URL.createObjectURL !== 'function') {
    return null
  }

  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await loadImage(objectUrl)

    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height
    }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
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

function hasCanvasSupport() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function'
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas export is not available.'))
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export returned no image blob.'))
        return
      }

      resolve(blob)
    }, mimeType)
  })
}

function readExtensionFromMimeType(mimeType?: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/svg+xml':
      return '.svg'
    default:
      return '.png'
  }
}

function supportsCanvasNormalization(mimeType?: string) {
  return mimeType !== 'image/gif' && mimeType !== 'image/svg+xml'
}
