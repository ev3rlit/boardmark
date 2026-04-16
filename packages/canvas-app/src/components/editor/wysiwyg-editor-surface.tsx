import { startTransition, useEffect, useMemo, type CSSProperties } from 'react'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import {
  matchesEscapeKey,
  readZoomDirectionFromWheelEvent
} from '@canvas-app/keyboard/key-event-matchers'
import { readEditorDerivedBlockMode } from '@canvas-app/components/editor/caret-navigation/selection-state'
import type {
  CanvasEditingBlockMode,
  CanvasEditingInteractionState
} from '@canvas-app/store/canvas-store-types'
import { createWysiwygMarkdownBridge } from '@canvas-app/components/editor/wysiwyg-markdown-bridge'

type WysiwygEditorSurfaceProps = {
  ariaLabel: string
  autoFocus?: boolean
  documentContent?: JSONContent | null
  editable?: boolean
  markdownLayoutStyle?: CSSProperties
  markdown: string
  onDocumentChange: (content: JSONContent) => void
  onEditorChange?: (editor: Editor | null) => void
  onBlockModeChange: (mode: CanvasEditingBlockMode) => void
  onCancel: () => void
  onInteractionChange: (interaction: CanvasEditingInteractionState) => void
}

export function WysiwygEditorSurface({
  ariaLabel,
  autoFocus = false,
  documentContent = null,
  editable = true,
  markdownLayoutStyle,
  markdown,
  onDocumentChange,
  onEditorChange,
  onBlockModeChange,
  onCancel,
  onInteractionChange
}: WysiwygEditorSurfaceProps) {
  const bridge = useMemo(() => createWysiwygMarkdownBridge({
    onExitToHost: onCancel
  }), [onCancel])
  const initialContent = useMemo(() => {
    return documentContent ?? bridge.fromMarkdown(markdown)
  }, [bridge, documentContent, markdown])

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: bridge.extensions,
    content: initialContent,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'markdown-content canvas-wysiwyg-surface__content nodrag nopan nowheel',
        role: 'textbox'
      },
      handleClick(_view, _pos, event) {
        const target = event.target instanceof HTMLElement ? event.target.closest('a') : null

        if (!(target instanceof HTMLAnchorElement)) {
          return false
        }

        if (!(event.metaKey || event.ctrlKey)) {
          return false
        }

        event.preventDefault()
        window.open(target.href, '_blank', 'noopener,noreferrer')
        return true
      },
      handleKeyDown(_view, event) {
        if (!matchesEscapeKey(event)) {
          return false
        }

        onCancel()
        return true
      }
    },
    onUpdate({ editor: nextEditor }) {
      startTransition(() => {
        onDocumentChange(nextEditor.getJSON())
      })
    }
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextContent = documentContent ?? bridge.fromMarkdown(markdown)

    if (!bridge.isDocumentEqual(editor.getJSON(), nextContent)) {
      editor.commands.setContent(nextContent, {
        emitUpdate: false
      })
    }
  }, [bridge, documentContent, editor, markdown])

  useEffect(() => {
    if (!editor || !autoFocus) {
      return
    }

    const animationFrame = requestAnimationFrame(() => {
      if (editor.isDestroyed) {
        return
      }

      try {
        editor.view.dom.focus()
      } catch {
        return
      }
    })

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [autoFocus, editor])

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextStyleEntries = Object.entries(markdownLayoutStyle ?? {})
      .filter(([key, value]) => key.startsWith('--') && value !== undefined)
      .map(([key, value]) => [key, String(value)] as const)

    for (const [key, value] of nextStyleEntries) {
      editor.view.dom.style.setProperty(key, value)
    }

    return () => {
      for (const [key] of nextStyleEntries) {
        editor.view.dom.style.removeProperty(key)
      }
    }
  }, [editor, markdownLayoutStyle])

  useEffect(() => {
    onEditorChange?.(editor as Editor | null)

    return () => {
      onEditorChange?.(null)
    }
  }, [editor, onEditorChange])

  useEffect(() => {
    if (!editor) {
      return
    }

    const updateBlockMode = () => {
      if (editor.isDestroyed) {
        return
      }

      onBlockModeChange(
        readEditorDerivedBlockMode(editor.view.dom, document.activeElement)
      )
    }
    const handleFocusOut = () => {
      requestAnimationFrame(updateBlockMode)
    }

    updateBlockMode()
    editor.on('selectionUpdate', updateBlockMode)
    editor.view.dom.addEventListener('focusin', updateBlockMode)
    editor.view.dom.addEventListener('focusout', handleFocusOut)

    return () => {
      editor.off('selectionUpdate', updateBlockMode)
      editor.view.dom.removeEventListener('focusin', updateBlockMode)
      editor.view.dom.removeEventListener('focusout', handleFocusOut)
      onBlockModeChange({ status: 'none' })
    }
  }, [editor, onBlockModeChange])

  return (
    <div
      className="canvas-wysiwyg-surface nowheel"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return
        }

        onInteractionChange('inactive')
      }}
      onFocusCapture={() => {
        onInteractionChange('active')
      }}
      onWheelCapture={(event) => {
        if (readZoomDirectionFromWheelEvent(event.nativeEvent) === null) {
          event.stopPropagation()
        }
      }}
    >
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  )
}
