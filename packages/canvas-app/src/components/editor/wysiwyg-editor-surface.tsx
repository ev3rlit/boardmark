import { startTransition, useEffect, useMemo } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { matchesEscapeKey } from '@canvas-app/keyboard/key-event-matchers'
import type {
  CanvasEditingBlockMode,
  CanvasEditingInteractionState
} from '@canvas-app/store/canvas-store-types'
import { FloatingToolbar } from '@canvas-app/components/editor/floating-toolbar'
import { createWysiwygMarkdownBridge } from '@canvas-app/components/editor/wysiwyg-markdown-bridge'

type WysiwygEditorSurfaceProps = {
  ariaLabel: string
  autoFocus?: boolean
  editable?: boolean
  markdown: string
  onBlockModeChange: (mode: CanvasEditingBlockMode) => void
  onCancel: () => void
  onInteractionChange: (interaction: CanvasEditingInteractionState) => void
  onMarkdownChange: (markdown: string) => void
}

export function WysiwygEditorSurface({
  ariaLabel,
  autoFocus = false,
  editable = true,
  markdown,
  onBlockModeChange,
  onCancel,
  onInteractionChange,
  onMarkdownChange
}: WysiwygEditorSurfaceProps) {
  const bridge = useMemo(() => createWysiwygMarkdownBridge({
    onBlockModeChange
  }), [onBlockModeChange])

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: bridge.extensions,
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'markdown-content canvas-wysiwyg-surface__content nodrag nopan',
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
      handleDOMEvents: {
        blur: () => {
          onInteractionChange('inactive')
          return false
        },
        focus: () => {
          onInteractionChange('active')
          return false
        }
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
        onMarkdownChange(nextEditor.getMarkdown())
      })
    }
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    if (editor.getMarkdown() !== markdown) {
      editor.commands.setContent(markdown, {
        contentType: 'markdown'
      })
    }
  }, [editor, markdown])

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

  return (
    <div className="canvas-wysiwyg-surface">
      <FloatingToolbar editor={editor as Editor | null} />
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  )
}
