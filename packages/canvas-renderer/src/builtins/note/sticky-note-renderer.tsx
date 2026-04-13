import type { BuiltInRendererProps } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import { rendererFrameStyle } from '../shared'

const paletteToCardColor = {
  neutral: 'default',
  amber: 'amber',
  blue: 'blue',
  green: 'green',
  violet: 'violet',
  rose: 'rose'
} as const

export function StickyNoteRenderer({
  body = '',
  selected,
  ...props
}: BuiltInRendererProps) {
  return (
    <StickyNoteCard
      className="flex h-full w-full flex-col"
      color={paletteToCardColor.amber}
      selected={selected}
      style={rendererFrameStyle(
        {
          ...props,
          body,
          selected
        },
        '0px',
        '0 18px 40px rgba(43, 52, 55, 0.09)'
      )}
    >
      <MarkdownContent
        className="markdown-content note-markdown"
        content={body}
      />
    </StickyNoteCard>
  )
}
