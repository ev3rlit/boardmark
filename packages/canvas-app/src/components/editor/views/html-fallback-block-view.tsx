import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import type { CanvasEditingBlockMode } from '@canvas-app/store/canvas-store-types'

type HtmlFallbackCallbacks = {
  onBlockModeChange?: (mode: CanvasEditingBlockMode) => void
}

export function HtmlFallbackBlockView(
  props: NodeViewProps & { callbacks?: HtmlFallbackCallbacks }
) {
  const raw = String(props.node.attrs.raw ?? '')
  const blockKind = String(props.node.attrs.kind ?? 'html')

  return (
    <NodeViewWrapper className="canvas-wysiwyg-html-block nodrag nopan">
      <div className="canvas-wysiwyg-html-block__header">
        <span className="canvas-wysiwyg-html-block__badge">{blockKind}</span>
        <span className="canvas-wysiwyg-html-block__title">Block-local fallback keeps raw HTML isolated.</span>
      </div>
      <textarea
        aria-label="HTML fallback source"
        className="canvas-wysiwyg-html-block__textarea nodrag nopan"
        spellCheck={false}
        value={raw}
        onFocus={() => {
          props.callbacks?.onBlockModeChange?.({
            status: 'html-fallback'
          })
        }}
        onBlur={() => {
          props.callbacks?.onBlockModeChange?.({
            status: 'none'
          })
        }}
        onChange={(event) => {
          props.updateAttributes({
            raw: event.target.value
          })
        }}
      />
    </NodeViewWrapper>
  )
}
