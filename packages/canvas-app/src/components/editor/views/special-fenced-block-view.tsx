import { useEffect, useRef, useState } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { MarkdownContent } from '@boardmark/ui'
import type { CanvasEditingBlockMode } from '@canvas-app/store/canvas-store-types'
import { buildFencedMarkdown } from '@canvas-app/components/editor/wysiwyg-block-helpers'

type SpecialBlockCallbacks = {
  onBlockModeChange?: (mode: CanvasEditingBlockMode) => void
}

export function SpecialFencedBlockView(
  props: NodeViewProps & { callbacks?: SpecialBlockCallbacks }
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [draftKind, setDraftKind] = useState('mermaid')
  const [mode, setMode] = useState<'preview' | 'source'>(() => {
    return props.selected ? 'source' : 'preview'
  })
  const kind = String(props.node.attrs.kind ?? 'mermaid') as 'mermaid' | 'sandpack'
  const source = String(props.node.attrs.source ?? '')

  const switchMode = (nextMode: 'preview' | 'source') => {
    setMode(nextMode)
  }

  useEffect(() => {
    props.callbacks?.onBlockModeChange?.(
      mode === 'source'
        ? {
            status: 'special-fenced-source',
            blockKind: kind
          }
        : { status: 'none' }
    )
  }, [kind, mode, props.callbacks])

  useEffect(() => {
    setDraftKind(kind)
  }, [kind])

  useEffect(() => {
    if (mode !== 'source') {
      return
    }

    const textarea = textareaRef.current

    if (!textarea || document.activeElement === textarea) {
      return
    }

    const timeout = window.setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(source.length, source.length)
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [mode, source.length])

  return (
    <NodeViewWrapper className="canvas-wysiwyg-special-block nodrag nopan">
      {mode === 'preview' ? (
        <>
          <div className="canvas-wysiwyg-special-block__header">
            <div>
              <span className="canvas-wysiwyg-special-block__badge">{kind}</span>
              <span className="canvas-wysiwyg-special-block__title">
                {kind === 'mermaid' ? 'Preview shell with source toggle' : 'Sandpack preview shell'}
              </span>
            </div>
            <button
              type="button"
              className="canvas-wysiwyg-inline-button"
              onClick={() => switchMode('source')}
            >
              Edit source
            </button>
          </div>
          <div className="canvas-wysiwyg-special-block__preview markdown-content">
            <MarkdownContent content={buildFencedMarkdown(kind, source)} />
          </div>
        </>
      ) : (
        <>
          <div className="canvas-wysiwyg-special-block__frame">
            <label className="canvas-wysiwyg-special-block__fence">
              <span>{'```'}</span>
              <input
                aria-label="Special fenced block language"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                className="canvas-wysiwyg-special-block__kind-input nodrag nopan"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                data-lpignore="true"
                spellCheck={false}
                value={draftKind}
                onChange={(event) => {
                  const nextDraftKind = event.target.value
                  setDraftKind(nextDraftKind)
                  const normalizedKind = normalizeSpecialBlockKind(nextDraftKind)

                  if (normalizedKind) {
                    props.updateAttributes({
                      kind: normalizedKind
                    })
                  }
                }}
                onBlur={() => {
                  setDraftKind(kind)
                }}
                list="canvas-wysiwyg-special-block-kinds"
              />
              <datalist id="canvas-wysiwyg-special-block-kinds">
                <option value="mermaid" />
                <option value="sandpack" />
              </datalist>
            </label>
            <textarea
              ref={textareaRef}
              aria-label={`${kind} source`}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="canvas-wysiwyg-special-block__textarea nodrag nopan"
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
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  switchMode('preview')
                }
              }}
            />
            <div className="canvas-wysiwyg-special-block__fence canvas-wysiwyg-special-block__fence--closing" aria-hidden="true">
              {'```'}
            </div>
          </div>
        </>
      )}
    </NodeViewWrapper>
  )
}

function normalizeSpecialBlockKind(value: string): 'mermaid' | 'sandpack' | null {
  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'mermaid' || normalizedValue === 'sandpack') {
    return normalizedValue
  }

  return null
}
