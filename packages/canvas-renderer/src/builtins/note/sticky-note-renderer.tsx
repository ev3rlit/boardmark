import type { BuiltInNoteRendererData, BuiltInRendererProps } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'

const paletteToCardColor = {
  neutral: 'default',
  amber: 'amber',
  blue: 'blue',
  green: 'green',
  violet: 'violet',
  rose: 'rose'
} as const

export function StickyNoteRenderer({
  content = '',
  data,
  selected
}: BuiltInRendererProps<BuiltInNoteRendererData>) {
  const palette = data.palette ?? 'amber'

  return (
    <StickyNoteCard
      color={paletteToCardColor[palette]}
      selected={selected}
    >
      <MarkdownContent
        className="markdown-content note-markdown"
        content={content}
      />
    </StickyNoteCard>
  )
}
