import type { BuiltInRendererProps } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import { readTextColor } from '../shared'

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
  style
}: BuiltInRendererProps) {
  const palette = 'amber'

  return (
    <div style={{ color: readTextColor(style) }}>
      <StickyNoteCard
        color={paletteToCardColor[palette]}
        selected={selected}
      >
        <MarkdownContent
          className="markdown-content note-markdown"
          content={body}
        />
      </StickyNoteCard>
    </div>
  )
}
