import type { MarkdownContentImageActions } from '@boardmark/ui'
import type { CanvasImageExportBridge } from '@canvas-app/document/canvas-image-export-bridge'
import { saveRasterImageExport } from '@canvas-app/services/raster-image-export'

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
      return saveRasterImageExport(result, format, {
        imageExportBridge: options.imageExportBridge
      })
    }
  }
}
