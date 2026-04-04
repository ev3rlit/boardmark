import { useEffect } from 'react'
import {
  insertTextAtSelection,
  isEditableTarget,
  readClipboardImageFile
} from '@canvas-app/app/utils/canvas-app-helpers'
import type { CanvasEditingState } from '@canvas-app/store/canvas-store-types'

type UseCanvasPasteOptions = {
  createMarkdownImageAsset: (file: File) => Promise<string | null>
  clipboardReady: boolean
  editingState: CanvasEditingState
  insertImageFromClipboard: (file: File) => Promise<void>
  pasteClipboard: () => Promise<void>
}

export function useCanvasPaste({
  createMarkdownImageAsset,
  clipboardReady,
  editingState,
  insertImageFromClipboard,
  pasteClipboard
}: UseCanvasPasteOptions) {
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const imageFile = readClipboardImageFile(event)

      if (imageFile && editingState.status !== 'idle' && event.target instanceof HTMLTextAreaElement) {
        event.preventDefault()
        const markdown = await createMarkdownImageAsset(imageFile)

        if (!markdown) {
          return
        }

        insertTextAtSelection(event.target, markdown)
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      if (imageFile) {
        event.preventDefault()
        await insertImageFromClipboard(imageFile)
        return
      }

      if (!clipboardReady) {
        return
      }

      event.preventDefault()
      await pasteClipboard()
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [clipboardReady, createMarkdownImageAsset, editingState, insertImageFromClipboard, pasteClipboard])
}
