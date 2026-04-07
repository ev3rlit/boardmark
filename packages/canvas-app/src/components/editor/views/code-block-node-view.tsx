import { useRef } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { MarkdownContent } from '@boardmark/ui'
import {
  buildRawFencedMarkdown,
  parseRawFencedMarkdown
} from '@canvas-app/components/editor/wysiwyg-block-helpers'
import {
  buildRawBlockSourceAttributes,
  handleRawBlockKeyDown,
  readNodePosition,
  requestRawBlockSourceEntry,
  useAutoSizeTextarea,
  useRawBlockEditingState
} from '@canvas-app/components/editor/views/raw-block-editor'

type CodeBlockCallbacks = {
  onExitToHost?: () => void
}

export function CodeBlockNodeView(
  props: NodeViewProps & { callbacks?: CodeBlockCallbacks }
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const openingFence = String(props.node.attrs.openingFence ?? '```')
  const source = String(props.node.attrs.source ?? '')
  const closingFence = String(props.node.attrs.closingFence ?? '```')
  const rawMarkdown = buildRawFencedMarkdown({
    openingFence,
    source,
    closingFence
  })

  useAutoSizeTextarea(textareaRef, rawMarkdown)
  const { isEditing, setIsEditing } = useRawBlockEditingState({
    caretPosition: openingFence.length,
    props,
    textareaRef
  })

  return (
    <NodeViewWrapper className="canvas-wysiwyg-code-block nodrag nopan">
      {isEditing ? (
        <div className="canvas-wysiwyg-code-block__frame">
          <textarea
            ref={textareaRef}
            aria-label="Code block markdown"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="canvas-wysiwyg-code-block__textarea nodrag nopan nowheel"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-lpignore="true"
            spellCheck={false}
            {...buildRawBlockSourceAttributes('code')}
            rows={Math.max(rawMarkdown.split(/\r\n|\r|\n/).length, 3)}
            value={rawMarkdown}
            onBlur={() => {
              setIsEditing(false)
            }}
            onChange={(event) => {
              props.updateAttributes(parseRawFencedMarkdown(event.target.value))
            }}
            onFocus={() => {
              setIsEditing(true)
            }}
            onKeyDown={(event) => {
              handleRawBlockKeyDown({
                event,
                onEscapeToHost: props.callbacks?.onExitToHost,
                onValueChange(nextValue) {
                  props.updateAttributes(parseRawFencedMarkdown(nextValue))
                },
                position: readNodePosition(props),
                setIsEditing,
                value: rawMarkdown,
                viewProps: props
              })
            }}
          />
        </div>
      ) : (
        <div
          className="canvas-wysiwyg-code-block__preview nodrag nopan"
          onMouseDown={(event) => {
            event.preventDefault()
            setIsEditing(true)
            requestRawBlockSourceEntry(props)
          }}
        >
          <MarkdownContent
            className="markdown-content"
            content={ensurePreviewMarkdown(rawMarkdown)}
          />
        </div>
      )}
    </NodeViewWrapper>
  )
}

function ensurePreviewMarkdown(markdown: string) {
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`
}
