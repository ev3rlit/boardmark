import type { BuiltInRendererProps } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import { rendererFrameStyle } from '../shared'

export function NotebookNoteRenderer(
  props: BuiltInRendererProps
) {
  const palette = 'neutral'
  const tone = 'soft'

  return (
    <StickyNoteCard
      className="flex h-full w-full flex-col"
      color="neutral"
      selected={props.selected}
      style={rendererFrameStyle(props, palette, tone, '#fffaf2', '0px')}
    >
      <div className="min-h-0 flex-1">
        <MarkdownContent
          className="markdown-content note-markdown"
          content={props.body ?? ''}
          imageResolver={props.imageResolver}
        />
      </div>
    </StickyNoteCard>
  )
}
