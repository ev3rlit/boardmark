import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { FloatingToolbar } from '@canvas-app/components/editor/floating-toolbar'
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
  toolbarAnchorRef?: RefObject<HTMLElement | null>
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
  session,
  toolbarAnchorRef
}: BodyEditorHostProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [toolbarEditor, setToolbarEditor] = useState<Editor | null>(null)
  const toolbarPosition = useToolbarOverlayPosition({
    anchorRef: session.surface === 'wysiwyg' ? toolbarAnchorRef : undefined,
    enabled: session.surface === 'wysiwyg' && toolbarEditor !== null,
    toolbarRef
  })

  useEffect(() => {
    if (!autoFocus || session.surface !== 'textarea' || !textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    textareaRef.current.select()
  }, [autoFocus, session.surface])

  useEffect(() => {
    if (session.surface !== 'wysiwyg') {
      setToolbarEditor(null)
    }
  }, [session.surface])

  return (
    <div
      className={[
        'canvas-body-editor-host',
        session.surface === 'wysiwyg' ? 'canvas-body-editor-host--wysiwyg' : ''
      ].join(' ').trim()}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return
        }

        if (
          nextTarget instanceof HTMLElement &&
          nextTarget.closest('[data-body-editor-toolbar-root="true"]')
        ) {
          return
        }

        void onCommit()
      }}
    >
      {session.surface === 'wysiwyg' ? (
        <>
          <WysiwygEditorSurface
            ariaLabel={ariaLabel}
            autoFocus={autoFocus}
            editable={editable}
            markdown={session.draftMarkdown}
            onBlockModeChange={onBlockModeChange}
            onCancel={onCancel}
            onEditorChange={setToolbarEditor}
            onInteractionChange={onInteractionChange}
            onMarkdownChange={onMarkdownChange}
          />
        </>
      ) : (
        <textarea
          ref={textareaRef}
          aria-label={ariaLabel}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="canvas-body-editor-host__textarea nodrag nopan"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-lpignore="true"
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
      {session.surface === 'wysiwyg' && toolbarEditor && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="canvas-body-editor-host__toolbar-shell"
              data-body-editor-toolbar-root="true"
              data-placement={toolbarPosition?.placement ?? 'above'}
              style={{
                left: toolbarPosition ? `${toolbarPosition.left}px` : '0px',
                top: toolbarPosition ? `${toolbarPosition.top}px` : '0px',
                visibility: toolbarPosition ? 'visible' : 'hidden'
              }}
            >
              <div
                ref={toolbarRef}
                className="canvas-body-editor-host__toolbar"
              >
                <FloatingToolbar editor={toolbarEditor} />
              </div>
            </div>,
            document.body
          )
        : null}
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

function useToolbarOverlayPosition({
  anchorRef,
  enabled,
  toolbarRef
}: {
  anchorRef?: RefObject<HTMLElement | null>
  enabled: boolean
  toolbarRef: RefObject<HTMLDivElement | null>
}) {
  const [position, setPosition] = useState<{
    left: number
    placement: 'above' | 'below'
    top: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      setPosition(null)
      return
    }

    const anchor = anchorRef?.current
    const toolbar = toolbarRef.current

    if (!anchor || !toolbar || typeof window === 'undefined') {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect()
      const toolbarRect = toolbar.getBoundingClientRect()
      const toolbarWidth = toolbarRect.width
      const toolbarHeight = toolbarRect.height

      if (toolbarWidth === 0 || toolbarHeight === 0) {
        setPosition(null)
        return
      }

      const viewportPadding = 12
      const gap = 16
      const preferredLeft = anchorRect.left + anchorRect.width / 2 - toolbarWidth / 2
      const maxLeft = Math.max(viewportPadding, window.innerWidth - toolbarWidth - viewportPadding)
      const left = clampNumber(preferredLeft, viewportPadding, maxLeft)

      const hasRoomAbove = anchorRect.top - toolbarHeight - gap >= viewportPadding
      const placement = hasRoomAbove ? 'above' : 'below'
      const preferredTop = placement === 'above'
        ? anchorRect.top - toolbarHeight - gap
        : anchorRect.bottom + gap
      const maxTop = Math.max(viewportPadding, window.innerHeight - toolbarHeight - viewportPadding)
      const top = clampNumber(preferredTop, viewportPadding, maxTop)

      setPosition({
        left,
        placement,
        top
      })
    }

    updatePosition()

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        updatePosition()
      })
      observer.observe(anchor)
      observer.observe(toolbar)

      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)

      return () => {
        observer.disconnect()
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, enabled, toolbarRef])

  return position
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
