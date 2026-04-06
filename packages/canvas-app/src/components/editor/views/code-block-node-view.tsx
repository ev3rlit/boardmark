import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { highlightCodeBlock } from '@boardmark/ui'
import {
  readCodeLanguageLabel,
  readLineNumbers
} from '@canvas-app/components/editor/wysiwyg-block-helpers'

type HighlightedCodeBlock =
  | {
      kind: 'plain'
      lines: string[]
    }
  | {
      kind: 'highlighted'
      language: string
      lines: Array<{ tokens: Array<{ content: string; color?: string }> }>
    }

export function CodeBlockNodeView(props: NodeViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [highlighted, setHighlighted] = useState<HighlightedCodeBlock | null>(null)
  const language = String(props.node.attrs.language ?? '')
  const source = String(props.node.attrs.source ?? '')
  const lineNumbers = readLineNumbers(source)

  useAutoSizeTextarea(textareaRef, source)

  useEffect(() => {
    let cancelled = false

    void highlightCodeBlock({
      code: source,
      language: language || undefined
    })
      .then((result) => {
        if (cancelled) {
          return
        }

        setHighlighted(result)
      })
      .catch(() => {
        if (!cancelled) {
          setHighlighted(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [language, source])

  return (
    <NodeViewWrapper className="canvas-wysiwyg-code-block nodrag nopan" data-language={language || 'plain'}>
      <div className="canvas-wysiwyg-code-block__header">
        <span className="canvas-wysiwyg-code-block__badge">{readCodeLanguageLabel(language)}</span>
        <span className="canvas-wysiwyg-code-block__hint">Tab indents. Enter adds a new line.</span>
      </div>
      <div className="canvas-wysiwyg-code-block__body">
        <div className="canvas-wysiwyg-code-block__gutter" aria-hidden="true">
          {lineNumbers.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <div className="canvas-wysiwyg-code-block__editor">
          <div className="canvas-wysiwyg-code-block__highlight" aria-hidden="true">
            {highlighted ? <HighlightedCodeResult result={highlighted} /> : <pre>{source}</pre>}
          </div>
          <textarea
            ref={textareaRef}
            aria-label="Code block source"
            className="canvas-wysiwyg-code-block__textarea nodrag nopan"
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
        </div>
      </div>
    </NodeViewWrapper>
  )
}

function HighlightedCodeResult({ result }: { result: HighlightedCodeBlock }) {
  if (result.kind === 'plain') {
    return (
      <pre>
        {result.lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </pre>
    )
  }

  return (
    <pre>
      {result.lines.map((line, lineIndex) => (
        <div key={lineIndex}>
          {line.tokens.map((token, tokenIndex) => (
            <span key={`${lineIndex}-${tokenIndex}`} style={{ color: token.color }}>
              {token.content || ' '}
            </span>
          ))}
        </div>
      ))}
    </pre>
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
