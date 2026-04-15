import { Suspense, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { AlertCircle, Check, Copy } from 'lucide-react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { BuiltInImageResolution, BuiltInImageResolver } from '@boardmark/canvas-domain'
import {
  highlightCodeBlock,
  resolveCodeTheme
} from '../code-highlight'
import type { HighlightedCodeBlock } from '../code-highlight/adapter'
import { extractFencedBlock } from './fenced-block/extract'
import { useFencedBlockImageControls } from './fenced-block/image-export-controls'
import { getFencedBlockRenderer } from './fenced-block/registry'

type MarkdownContentProps = {
  content: string
  className?: string
  imageResolver?: BuiltInImageResolver
}

type MarkdownPreProps = ComponentProps<'pre'> & {
  node?: unknown
}

const defaultMarkdownComponents: Components = {
  table({ children }) {
    return (
      <div className="markdown-table-wrap">
        <table>{children}</table>
      </div>
    )
  },
  pre({ children, node, ...props }: MarkdownPreProps) {
    const block = extractFencedBlock(node)

    if (block) {
      const Renderer = block.language
        ? getFencedBlockRenderer(block.language)
        : undefined

      if (Renderer) {
        return (
          <Suspense fallback={null}>
            <Renderer source={block.source} />
          </Suspense>
        )
      }

      return (
        <CodeBlockRenderer
          code={block.source}
          language={block.language}
          {...props}
        />
      )
    }

    return <pre {...props}>{children}</pre>
  },
}

export function MarkdownContent({
  content,
  className,
  imageResolver
}: MarkdownContentProps) {
  const markdownComponents = useMemo(() => ({
    ...defaultMarkdownComponents,
    img(props: ComponentProps<'img'>) {
      return (
        <MarkdownImage
          {...props}
          imageResolver={imageResolver}
        />
      )
    }
  } satisfies Components), [imageResolver])

  return (
    <div className={className}>
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkHtmlBreakToMdastBreak]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function remarkHtmlBreakToMdastBreak() {
  return (tree: { children?: unknown[] }) => {
    replaceHtmlBreakNodes(tree)
  }
}

function replaceHtmlBreakNodes(node: { children?: unknown[] }) {
  if (!Array.isArray(node.children)) {
    return
  }

  node.children = node.children.flatMap((child) => {
    if (!isMdastNode(child)) {
      return [child]
    }

    replaceHtmlBreakNodes(child)

    if (child.type !== 'html') {
      return [child]
    }

    return isHtmlBreakNode(child.value)
      ? [{ type: 'break' }]
      : [child]
  })
}

function isMdastNode(value: unknown): value is {
  children?: unknown[]
  type: string
  value?: string
} {
  return typeof value === 'object' && value !== null && 'type' in value
}

function isHtmlBreakNode(value: unknown) {
  return typeof value === 'string' && /^<br\s*\/?>$/i.test(value.trim())
}

function MarkdownImage({
  alt,
  imageResolver,
  src,
  title
}: ComponentProps<'img'> & { imageResolver?: BuiltInImageResolver }) {
  const resolution = useResolvedImageSource(src, imageResolver)

  if (resolution.status === 'loading') {
    return (
      <span className="inline-flex min-h-20 min-w-20 items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--color-surface-low)_82%,white)] px-4 py-3 text-xs text-[var(--color-on-surface-variant)]">
        Loading image
      </span>
    )
  }

  if (resolution.status === 'error') {
    return (
      <span className="inline-flex min-h-20 min-w-20 items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--color-surface-low)_90%,white)] px-4 py-3 text-xs text-[var(--color-state-warning)]">
        {resolution.message}
      </span>
    )
  }

  if (resolution.status !== 'resolved') {
    return (
      <span className="inline-flex min-h-20 min-w-20 items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--color-surface-low)_82%,white)] px-4 py-3 text-xs text-[var(--color-on-surface-variant)]">
        Loading image
      </span>
    )
  }

  return (
    <img
      alt={alt ?? ''}
      className="max-h-[28rem] max-w-full rounded-xl object-contain"
      src={resolution.src}
      title={title}
    />
  )
}

type ResolvedImageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'resolved'; src: string }
  | { status: 'error'; message: string }

export function useResolvedImageSource(
  src: string | undefined,
  imageResolver?: BuiltInImageResolver
): ResolvedImageState {
  const [state, setState] = useState<ResolvedImageState>(() => {
    if (!src) {
      return {
        status: 'error',
        message: 'Image source is missing.'
      }
    }

    if (isDirectlyRenderableImageSource(src)) {
      return {
        status: 'resolved',
        src
      }
    }

    return imageResolver
      ? { status: 'loading' }
      : { status: 'error', message: 'Image source could not be resolved.' }
  })

  useEffect(() => {
    if (!src) {
      setState({
        status: 'error',
        message: 'Image source is missing.'
      })
      return
    }

    if (isDirectlyRenderableImageSource(src)) {
      setState({
        status: 'resolved',
        src
      })
      return
    }

    if (!imageResolver) {
      setState({
        status: 'error',
        message: 'Image source could not be resolved.'
      })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    void imageResolver(src).then((result: BuiltInImageResolution) => {
      if (cancelled) {
        return
      }

      if (result.status === 'resolved') {
        setState(result)
        return
      }

      setState({
        status: 'error',
        message: result.message
      })
    })

    return () => {
      cancelled = true
    }
  }, [imageResolver, src])

  return state
}

function isDirectlyRenderableImageSource(src: string) {
  return /^(https?:|data:|blob:|file:)/.test(src)
}

type CodeBlockRendererProps = ComponentProps<'pre'> & {
  code: string
  language?: string
}

type CodeBlockCopyStatus = 'idle' | 'copied' | 'error'

function CodeBlockRenderer({
  className,
  code,
  language,
  ...props
}: CodeBlockRendererProps) {
  const [result, setResult] = useState<HighlightedCodeBlock | null>(null)
  const [copyStatus, setCopyStatus] = useState<CodeBlockCopyStatus>('idle')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const imageControls = useFencedBlockImageControls({
    kind: 'code',
    language,
    rootRef
  })

  useEffect(() => {
    let cancelled = false

    setResult(null)

    void highlightCodeBlock({
      code,
      language
    })
      .then((nextResult) => {
        if (!cancelled) {
          setResult(nextResult)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        console.error('MarkdownContent failed to highlight a fenced code block.', error)
        setResult(createPlainResult(code))
      })

    return () => {
      cancelled = true
    }
  }, [code, language])

  useEffect(() => {
    if (copyStatus === 'idle') {
      return
    }

    const timeoutHandle = window.setTimeout(() => {
      setCopyStatus('idle')
    }, 1500)

    return () => {
      window.clearTimeout(timeoutHandle)
    }
  }, [copyStatus])

  const languageLabel = readCodeBlockLanguageLabel(result, language)
  const copyAction = readCopyAction(copyStatus)
  const CopyIcon = copyAction.icon
  const QuickActionIcon = imageControls.quickAction?.icon

  return (
    <div
      ref={rootRef}
      className="markdown-code-block"
      onContextMenu={imageControls.onContextMenu}
    >
      <div className="markdown-code-block__header">
        <div className="markdown-code-block__header-slot">
          {languageLabel ? (
            <span className="markdown-code-block__language">
              {languageLabel}
            </span>
          ) : null}
        </div>
        {imageControls.statusMessage ? (
          <span
            data-boardmark-export-ignore="true"
            className={joinClassName(
              'markdown-code-block__action-status',
              imageControls.statusTone === 'error'
                ? 'markdown-code-block__action-status--error'
                : imageControls.statusTone === 'success'
                  ? 'markdown-code-block__action-status--success'
                  : undefined
            )}
          >
            {imageControls.statusMessage}
          </span>
        ) : null}
        {imageControls.quickAction && QuickActionIcon ? (
          <div
            ref={imageControls.quickActionTriggerRef}
            className="markdown-content__fenced-block-trigger"
          >
            <button
              aria-label={imageControls.quickAction.label}
              data-boardmark-export-ignore="true"
              className={joinClassName(
                'markdown-code-block__copy-button',
                'markdown-code-block__copy-button--image',
                imageControls.quickAction.label === 'Image exported'
                  ? 'markdown-code-block__copy-button--copied'
                  : undefined,
                imageControls.quickAction.label === 'Export failed'
                  ? 'markdown-code-block__copy-button--error'
                  : undefined
              )}
              disabled={imageControls.quickAction.disabled}
              onClick={() => {
                imageControls.quickAction?.onClick()
              }}
              title={imageControls.quickAction.label}
              type="button"
            >
              <QuickActionIcon
                aria-hidden="true"
                className={joinClassName(
                  'markdown-code-block__copy-icon',
                  imageControls.quickAction.label === 'Exporting image'
                    ? 'markdown-code-block__copy-icon--spinning'
                    : undefined
                )}
              />
            </button>
            {imageControls.quickActionMenu}
          </div>
        ) : null}
        <button
          aria-label={copyAction.label}
          data-boardmark-export-ignore="true"
          className={joinClassName(
            'markdown-code-block__copy-button',
            copyStatus === 'copied' ? 'markdown-code-block__copy-button--copied' : undefined,
            copyStatus === 'error' ? 'markdown-code-block__copy-button--error' : undefined
          )}
          onClick={() => void handleCopyCode(code, setCopyStatus)}
          title={copyAction.label}
          type="button"
        >
          <CopyIcon
            aria-hidden="true"
            className="markdown-code-block__copy-icon"
          />
        </button>
      </div>
      <pre
        {...props}
        className={joinClassName(className, 'markdown-code-block__pre')}
      >
        <code className={joinClassName(language ? `language-${language}` : undefined, 'markdown-code-block__code')}>
          {result
            ? renderCodeBlockLines(result)
            : (
                <span className="markdown-code-block__loading">
                  Loading code
                </span>
              )}
        </code>
      </pre>
      {imageControls.contextMenu}
    </div>
  )
}

function readCodeBlockLanguageLabel(
  result: HighlightedCodeBlock | null,
  language?: string
) {
  if (result?.kind === 'highlighted') {
    return result.language
  }

  return language
}

async function handleCopyCode(
  code: string,
  setCopyStatus: (status: CodeBlockCopyStatus) => void
) {
  try {
    await navigator.clipboard.writeText(code)
    setCopyStatus('copied')
  } catch {
    setCopyStatus('error')
  }
}

function readCopyAction(copyStatus: CodeBlockCopyStatus): {
  icon: typeof Copy
  label: string
} {
  if (copyStatus === 'copied') {
    return {
      icon: Check,
      label: 'Copied'
    }
  }

  if (copyStatus === 'error') {
    return {
      icon: AlertCircle,
      label: 'Copy failed'
    }
  }

  return {
    icon: Copy,
    label: 'Copy code'
  }
}

function renderCodeBlockLines(result: HighlightedCodeBlock) {
  if (result.kind === 'plain') {
    return result.lines.map((line, index) => (
      <span
        key={index}
        className="markdown-code-block__line"
      >
        {line.length > 0 ? line : ' '}
      </span>
    ))
  }

  return result.lines.map((line, lineIndex) => (
    <span
      key={lineIndex}
      className="markdown-code-block__line"
    >
      {line.tokens.length > 0
        ? line.tokens.map((token, tokenIndex) => (
            <span
              key={tokenIndex}
              style={{
                color: token.color,
                fontStyle: token.fontStyle,
                fontWeight: token.fontWeight,
                textDecoration: token.textDecoration
              }}
            >
              {token.content}
            </span>
          ))
        : ' '}
    </span>
  ))
}

function createPlainResult(code: string): HighlightedCodeBlock {
  return {
    kind: 'plain',
    lines: code.length > 0 ? code.split(/\r\n|\r|\n/) : [''],
    theme: resolveCodeTheme()
  }
}

function joinClassName(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ')
}
