import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'

export function CodeBlockNodeView(props: NodeViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const language = String(props.node.attrs.language ?? '')
  const source = String(props.node.attrs.source ?? '')

  useAutoSizeTextarea(textareaRef, source)
  useAutoFocusSelectedCodeBlock(textareaRef, props.selected, source.length)

  return (
    <NodeViewWrapper className="canvas-wysiwyg-code-block nodrag nopan" data-language={language || 'plain'}>
      <div className="canvas-wysiwyg-code-block__frame">
        <label className="canvas-wysiwyg-code-block__fence">
          <span>{'```'}</span>
          <input
            aria-label="Code block language"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="canvas-wysiwyg-code-block__language-input nodrag nopan"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-lpignore="true"
            spellCheck={false}
            style={readLanguageInputStyle(language)}
            value={language}
            onChange={(event) => {
              props.updateAttributes({
                language: event.target.value
              })
            }}
          />
        </label>
        <textarea
          ref={textareaRef}
          aria-label="Code block source"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="canvas-wysiwyg-code-block__textarea nodrag nopan"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-lpignore="true"
          spellCheck={false}
          value={source}
          onChange={(event) => {
            props.updateAttributes({
              source: event.target.value
            })
          }}
          onClick={() => {
            const position = props.getPos()

            if (typeof position === 'number') {
              props.editor.commands.setNodeSelection(position)
            }
          }}
          onKeyDown={(event) => handleCodeTextareaKeyDown(event, props)}
        />
        <div
          className="canvas-wysiwyg-code-block__fence canvas-wysiwyg-code-block__fence--closing"
          aria-hidden="true"
        >
          {`\`\`\``}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

function readLanguageInputStyle(language: string): CSSProperties {
  return {
    width: `${Math.max(language.length, 1) + 0.35}ch`
  }
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
  const source = String(props.node.attrs.source ?? '')
  const nextValue = `${source.slice(0, start)}  ${source.slice(end)}`

  props.updateAttributes({
    source: nextValue
  })

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
  sourceLength: number
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
      textarea.setSelectionRange(sourceLength, sourceLength)
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [selected, sourceLength, textareaRef])
}
