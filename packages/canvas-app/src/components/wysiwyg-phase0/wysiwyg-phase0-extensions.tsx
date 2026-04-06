import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { MarkdownContent, highlightCodeBlock } from '@boardmark/ui'
import type {
  FallbackBlockKind,
  SpecialFencedBlockKind
} from './wysiwyg-phase0-types'
import {
  buildFencedMarkdown,
  ensureTrailingNewline,
  readCodeLanguageLabel,
  readLineNumbers
} from './wysiwyg-phase0-helpers'

type MarkdownCodeToken = {
  type: 'code'
  lang?: string
  text?: string
} & Record<string, unknown>

type MarkdownHtmlToken = {
  type: 'html'
  raw?: string
  text?: string
} & Record<string, unknown>

const CODE_BLOCK_DATA_ATTRIBUTE = 'data-wysiwyg-phase0-code-block'
const SPECIAL_BLOCK_DATA_ATTRIBUTE = 'data-wysiwyg-phase0-special-block'
const HTML_BLOCK_DATA_ATTRIBUTE = 'data-wysiwyg-phase0-html-block'

type HighlightedCodeBlock =
  | {
      kind: 'plain'
      lines: string[]
      theme: string
    }
  | {
      kind: 'highlighted'
      language: string
      lines: Array<{ tokens: Array<{ content: string; color?: string }> }>
      theme: string
    }

export const WysiwygCodeBlock = Node.create({
  name: 'wysiwygCodeBlock',
  group: 'block',
  atom: true,
  code: true,
  selectable: true,
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      language: {
        default: ''
      },
      source: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [{ tag: `[${CODE_BLOCK_DATA_ATTRIBUTE}]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [CODE_BLOCK_DATA_ATTRIBUTE]: '' })]
  },
  markdownTokenName: 'code',
  parseMarkdown(token, helpers) {
    const codeToken = token as MarkdownCodeToken

    if (codeToken.lang === 'mermaid' || codeToken.lang === 'sandpack') {
      return []
    }

    return helpers.createNode('wysiwygCodeBlock', {
      language: codeToken.lang ?? '',
      source: codeToken.text ?? ''
    })
  },
  renderMarkdown(node) {
    return buildFencedMarkdown(node.attrs?.language ?? '', node.attrs?.source ?? '')
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  }
})

export const WysiwygSpecialFencedBlock = Node.create({
  name: 'wysiwygSpecialFencedBlock',
  group: 'block',
  atom: true,
  selectable: true,
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'mermaid'
      },
      source: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [{ tag: `[${SPECIAL_BLOCK_DATA_ATTRIBUTE}]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [SPECIAL_BLOCK_DATA_ATTRIBUTE]: '' })]
  },
  markdownTokenName: 'code',
  parseMarkdown(token, helpers) {
    const codeToken = token as MarkdownCodeToken

    if (codeToken.lang !== 'mermaid' && codeToken.lang !== 'sandpack') {
      return []
    }

    return helpers.createNode('wysiwygSpecialFencedBlock', {
      kind: codeToken.lang,
      source: codeToken.text ?? ''
    })
  },
  renderMarkdown(node) {
    return buildFencedMarkdown(node.attrs?.kind ?? 'mermaid', node.attrs?.source ?? '')
  },
  addNodeView() {
    return ReactNodeViewRenderer(SpecialFencedBlockNodeView)
  }
})

export const WysiwygHtmlFallbackBlock = Node.create({
  name: 'wysiwygHtmlFallbackBlock',
  group: 'block',
  atom: true,
  selectable: true,
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'html'
      },
      raw: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [{ tag: `[${HTML_BLOCK_DATA_ATTRIBUTE}]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [HTML_BLOCK_DATA_ATTRIBUTE]: '' })]
  },
  markdownTokenName: 'html',
  parseMarkdown(token, helpers) {
    const htmlToken = token as MarkdownHtmlToken
    const raw = htmlToken.raw ?? htmlToken.text

    if (!raw || !raw.trim()) {
      return []
    }

    return helpers.createNode('wysiwygHtmlFallbackBlock', {
      kind: 'html',
      raw
    })
  },
  renderMarkdown(node) {
    return ensureTrailingNewline(node.attrs?.raw ?? '')
  },
  addNodeView() {
    return ReactNodeViewRenderer(HtmlFallbackBlockNodeView)
  }
})

function CodeBlockNodeView(props: NodeViewProps) {
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
        if (!cancelled) {
          setHighlighted(result)
        }
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
    <NodeViewWrapper className="wysiwyg-phase0-code-block" data-language={language || 'plain'}>
      <div className="wysiwyg-phase0-code-block__header">
        <span className="wysiwyg-phase0-code-block__badge">{readCodeLanguageLabel(language)}</span>
        <span className="wysiwyg-phase0-code-block__hint">Tab indents. Enter adds a new line.</span>
      </div>
      <div className="wysiwyg-phase0-code-block__body">
        <div className="wysiwyg-phase0-code-block__gutter" aria-hidden="true">
          {lineNumbers.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <div className="wysiwyg-phase0-code-block__editor">
          <div className="wysiwyg-phase0-code-block__highlight" aria-hidden="true">
            {highlighted ? <HighlightedCodeResult result={highlighted} /> : <pre>{source}</pre>}
          </div>
          <textarea
            ref={textareaRef}
            aria-label="Code block source"
            className="wysiwyg-phase0-code-block__textarea"
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

function SpecialFencedBlockNodeView(props: NodeViewProps) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const kind = String(props.node.attrs.kind ?? 'mermaid') as SpecialFencedBlockKind
  const source = String(props.node.attrs.source ?? '')

  return (
    <NodeViewWrapper className="wysiwyg-phase0-special-block">
      <div className="wysiwyg-phase0-special-block__header">
        <div>
          <span className="wysiwyg-phase0-special-block__badge">{kind}</span>
          <span className="wysiwyg-phase0-special-block__title">
            {kind === 'mermaid' ? 'Preview shell with source toggle' : 'Sandpack preview shell'}
          </span>
        </div>
        <button
          type="button"
          className="wysiwyg-phase0-inline-button"
          onClick={() => setMode((current) => (current === 'preview' ? 'source' : 'preview'))}
        >
          {mode === 'preview' ? 'Edit source' : 'Show preview'}
        </button>
      </div>
      {mode === 'preview' ? (
        <div className="wysiwyg-phase0-special-block__preview markdown-content">
          <MarkdownContent content={buildFencedMarkdown(kind, source)} />
        </div>
      ) : (
        <textarea
          aria-label={`${kind} source`}
          className="wysiwyg-phase0-special-block__textarea"
          spellCheck={false}
          value={source}
          onChange={(event) => {
            props.updateAttributes({
              source: event.target.value
            })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setMode('preview')
            }
          }}
        />
      )}
    </NodeViewWrapper>
  )
}

function HtmlFallbackBlockNodeView(props: NodeViewProps) {
  const raw = String(props.node.attrs.raw ?? '')
  const blockKind = String(props.node.attrs.kind ?? 'html') as FallbackBlockKind

  return (
    <NodeViewWrapper className="wysiwyg-phase0-html-block">
      <div className="wysiwyg-phase0-html-block__header">
        <span className="wysiwyg-phase0-html-block__badge">{blockKind}</span>
        <span className="wysiwyg-phase0-html-block__title">Block-local fallback keeps raw HTML isolated.</span>
      </div>
      <textarea
        aria-label="HTML fallback source"
        className="wysiwyg-phase0-html-block__textarea"
        spellCheck={false}
        value={raw}
        onChange={(event) => {
          props.updateAttributes({
            raw: event.target.value
          })
        }}
      />
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
