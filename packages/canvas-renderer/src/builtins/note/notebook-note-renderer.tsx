import type { BuiltInNoteRendererData, BuiltInRendererProps } from '@boardmark/canvas-domain'
import { MarkdownContent } from '@boardmark/ui'
import { rendererFrameStyle } from '../shared'

export function NotebookNoteRenderer(
  props: BuiltInRendererProps<BuiltInNoteRendererData>
) {
  const palette = props.data.palette ?? 'neutral'
  const tone = props.data.tone ?? 'soft'

  return (
    <div
      className="relative overflow-hidden px-5 py-4 shadow-[0_24px_60px_rgba(43,52,55,0.08)]"
      style={rendererFrameStyle(props, palette, tone, '#fffaf2', '1.2rem')}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-55"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, transparent 0, transparent 31px, rgba(96, 66, 214, 0.08) 31px, rgba(96, 66, 214, 0.08) 32px)',
          backgroundSize: '100% 32px'
        }}
      />
      <div className="relative">
        <MarkdownContent
          className="markdown-content note-markdown"
          content={props.content ?? ''}
        />
      </div>
    </div>
  )
}
