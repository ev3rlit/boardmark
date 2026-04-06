import type { MarkdownContentImageActions } from '@boardmark/ui'
import type { FencedBlockImageExportResult } from '@boardmark/ui'
import type { CanvasImageExportBridge } from '@canvas-app/document/canvas-image-export-bridge'

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

    async exportImage(result) {
      if (options.imageExportBridge) {
        const saveResult = await options.imageExportBridge.saveImage({
          bytes: new Uint8Array(await result.blob.arrayBuffer()),
          fileName: result.fileName,
          mimeType: result.mimeType
        })

        if (!saveResult.ok) {
          if (saveResult.error.code === 'cancelled') {
            return { status: 'cancelled' as const }
          }

          throw new Error(saveResult.error.message)
        }

        return { status: 'saved' as const }
      }

      downloadBlob(result)

      return { status: 'saved' as const }
    }
  }
}

function downloadBlob(result: FencedBlockImageExportResult) {
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
