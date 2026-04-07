import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { MarkdownContent } from '@boardmark/ui'
import {
  buildRawFencedMarkdown,
  parseRawFencedMarkdown
} from '@canvas-app/components/editor/wysiwyg-block-helpers'

export function CodeBlockNodeView(props: NodeViewProps) {
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
  useAutoFocusSelectedCodeBlock(textareaRef, props.selected, openingFence.length)

  return (
    <NodeViewWrapper className="canvas-wysiwyg-code-block nodrag nopan">
      {props.selected ? (
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
            rows={Math.max(rawMarkdown.split(/\r\n|\r|\n/).length, 3)}
            value={rawMarkdown}
            onChange={(event) => {
              props.updateAttributes(parseRawFencedMarkdown(event.target.value))
            }}
            onKeyDown={(event) => handleCodeTextareaKeyDown(event, props)}
          />
        </div>
      ) : (
        <div
          className="canvas-wysiwyg-code-block__preview nodrag nopan"
          onMouseDown={(event) => {
            event.preventDefault()
            selectCurrentNode(props)
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

function handleCodeTextareaKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  props: NodeViewProps
) {
  if (event.key !== 'Tab') {
    return
  }

  event.preventDefault()

  const textarea = event.currentTarget
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const rawMarkdown = buildRawFencedMarkdown({
    openingFence: String(props.node.attrs.openingFence ?? '```'),
    source: String(props.node.attrs.source ?? ''),
    closingFence: String(props.node.attrs.closingFence ?? '```')
  })
  const nextValue = `${rawMarkdown.slice(0, start)}  ${rawMarkdown.slice(end)}`

  props.updateAttributes(parseRawFencedMarkdown(nextValue))

  requestAnimationFrame(() => {
    textarea.setSelectionRange(start + 2, start + 2)
  })
}

function useAutoSizeTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  useLayoutEffect(() => {
    const element = textareaRef.current

    if (!element) {
      return
    }

    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [textareaRef, value])
}

function useAutoFocusSelectedCodeBlock(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  selected: boolean,
  caretPosition: number
) {
  useEffect(() => {
    if (!selected) {
      return
    }

    const textarea = textareaRef.current

    if (!textarea || document.activeElement === textarea) {
      return
    }

    const timeout = window.setTimeout(() => {
      if (document.activeElement === textarea) {
        return
      }

      textarea.focus()
      textarea.setSelectionRange(caretPosition, caretPosition)
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [selected, caretPosition, textareaRef])
}

function selectCurrentNode(props: NodeViewProps) {
  const position = props.getPos()

  if (typeof position !== 'number') {
    return
  }

  props.editor.commands.setNodeSelection(position)
}

function ensurePreviewMarkdown(markdown: string) {
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`
}
