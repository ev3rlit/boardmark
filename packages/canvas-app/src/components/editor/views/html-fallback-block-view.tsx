import { useRef } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import {
  buildRawBlockSourceAttributes,
  handleRawBlockKeyDown,
  readNodePosition,
  requestRawBlockSourceEntry,
  useAutoSizeTextarea,
  useRawBlockEditingState
} from '@canvas-app/components/editor/views/raw-block-editor'

type HtmlFallbackCallbacks = {
  onExitToHost?: () => void
}

export function HtmlFallbackBlockView(
  props: NodeViewProps & { callbacks?: HtmlFallbackCallbacks }
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const raw = String(props.node.attrs.raw ?? '')
  const blockKind = String(props.node.attrs.kind ?? 'html')
  useAutoSizeTextarea(textareaRef, raw)
  const { isEditing, setIsEditing } = useRawBlockEditingState({
    caretPosition: raw.length,
    props,
    textareaRef
  })

  return (
    <NodeViewWrapper className="canvas-wysiwyg-html-block nodrag nopan">
      <div className="canvas-wysiwyg-html-block__header">
        <span className="canvas-wysiwyg-html-block__badge">{blockKind}</span>
        <span className="canvas-wysiwyg-html-block__title">Block-local fallback keeps raw HTML isolated.</span>
      </div>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          aria-label="HTML fallback source"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="canvas-wysiwyg-html-block__textarea nodrag nopan nowheel"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-lpignore="true"
          spellCheck={false}
          {...buildRawBlockSourceAttributes('html')}
          value={raw}
          onBlur={() => {
            setIsEditing(false)
          }}
          onChange={(event) => {
            props.updateAttributes({
              raw: event.target.value
            })
          }}
          onFocus={() => {
            setIsEditing(true)
          }}
          onKeyDown={(event) => {
            handleRawBlockKeyDown({
              event,
              onEscapeToHost: props.callbacks?.onExitToHost,
              onValueChange(nextValue) {
                props.updateAttributes({
                  raw: nextValue
                })
              },
              position: readNodePosition(props),
              setIsEditing,
              value: raw,
              viewProps: props
            })
          }}
        />
      ) : (
        <div
          className="canvas-wysiwyg-html-block__preview nodrag nopan"
          onMouseDown={(event) => {
            event.preventDefault()
            setIsEditing(true)
            requestRawBlockSourceEntry(props)
          }}
        >
          <pre className="canvas-wysiwyg-html-block__preview-source">{raw}</pre>
        </div>
      )}
    </NodeViewWrapper>
  )
}
