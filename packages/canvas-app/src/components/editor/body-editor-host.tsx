import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { WysiwygEditorSurface } from '@canvas-app/components/editor/wysiwyg-editor-surface'
import { matchesEscapeKey } from '@canvas-app/keyboard/key-event-matchers'
import type {
  CanvasEditingBlockMode,
  CanvasEditingInteractionState,
  CanvasEditingSessionState
} from '@canvas-app/store/canvas-store-types'

type BodyEditorHostProps = {
  ariaLabel: string
  autoFocus?: boolean
  editable?: boolean
  onBlockModeChange: (mode: CanvasEditingBlockMode) => void
  onCancel: () => void
  onCommit: () => Promise<unknown>
  onInteractionChange: (interaction: CanvasEditingInteractionState) => void
  onMarkdownChange: (markdown: string) => void
  session: CanvasEditingSessionState
}

export function BodyEditorHost({
  ariaLabel,
  autoFocus = false,
  editable = true,
  onBlockModeChange,
  onCancel,
  onCommit,
  onInteractionChange,
  onMarkdownChange,
  session
}: BodyEditorHostProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!autoFocus || session.surface !== 'textarea' || !textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    textareaRef.current.select()
  }, [autoFocus, session.surface])

  return (
    <div
      className="canvas-body-editor-host"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget as Node | null

        if (nextTarget && event.currentTarget.contains(nextTarget)) {
          return
        }

        void onCommit()
      }}
    >
      {session.surface === 'wysiwyg' ? (
        <WysiwygEditorSurface
          ariaLabel={ariaLabel}
          autoFocus={autoFocus}
          editable={editable}
          markdown={session.draftMarkdown}
          onBlockModeChange={onBlockModeChange}
          onCancel={onCancel}
          onInteractionChange={onInteractionChange}
          onMarkdownChange={onMarkdownChange}
        />
      ) : (
        <textarea
          ref={textareaRef}
          aria-label={ariaLabel}
          className="canvas-body-editor-host__textarea nodrag nopan"
          spellCheck={false}
          value={session.draftMarkdown}
          onFocus={() => onInteractionChange('active')}
          onBlur={() => onInteractionChange('inactive')}
          onChange={(event) => onMarkdownChange(event.target.value)}
          onKeyDown={(event) => {
            handleTextareaKeyDown(event, onCancel)
          }}
        />
      )}
    </div>
  )
}

function handleTextareaKeyDown(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  onCancel: () => void
) {
  if (!matchesEscapeKey(event.nativeEvent)) {
    return
  }

  event.preventDefault()
  onCancel()
}
