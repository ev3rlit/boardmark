import { useState } from 'react'
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
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const kind = String(props.node.attrs.kind ?? 'mermaid') as 'mermaid' | 'sandpack'
  const source = String(props.node.attrs.source ?? '')

  const switchMode = (nextMode: 'preview' | 'source') => {
    setMode(nextMode)
    props.callbacks?.onBlockModeChange?.(
      nextMode === 'source'
        ? {
            status: 'special-fenced-source',
            blockKind: kind
          }
        : { status: 'none' }
    )
  }

  return (
    <NodeViewWrapper className="canvas-wysiwyg-special-block nodrag nopan">
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
          onClick={() => switchMode(mode === 'preview' ? 'source' : 'preview')}
        >
          {mode === 'preview' ? 'Edit source' : 'Show preview'}
        </button>
      </div>
      {mode === 'preview' ? (
        <div className="canvas-wysiwyg-special-block__preview markdown-content">
          <MarkdownContent content={buildFencedMarkdown(kind, source)} />
        </div>
      ) : (
        <textarea
          aria-label={`${kind} source`}
          className="canvas-wysiwyg-special-block__textarea nodrag nopan"
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
      )}
    </NodeViewWrapper>
  )
}
