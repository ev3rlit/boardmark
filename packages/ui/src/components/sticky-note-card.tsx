import type { ReactNode } from 'react'

type StickyNoteCardProps = {
  color?:
    | 'yellow'
    | 'blue'
    | 'pink'
    | 'green'
    | 'purple'
    | 'default'
    | 'amber'
    | 'violet'
    | 'rose'
    | 'neutral'
  selected?: boolean
  children: ReactNode
}

export function StickyNoteCard({
  color = 'default',
  selected = false,
  children
}: StickyNoteCardProps) {
  return (
    <div
      className={[
        'rounded-[1.4rem] px-5 py-4 shadow-[0_24px_60px_rgba(43,52,55,0.08)] transition-transform duration-200',
        'bg-[var(--note-surface)] text-[var(--color-on-surface)]',
        selected ? 'translate-y-[-2px] ring-2 ring-[color:color-mix(in_oklab,var(--color-primary)_28%,transparent)]' : '',
        noteColorClassName(color)
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function noteColorClassName(color: StickyNoteCardProps['color']) {
  switch (color) {
    case 'amber':
    case 'yellow':
      return 'bg-[var(--note-yellow)]'
    case 'blue':
      return 'bg-[var(--note-blue)]'
    case 'rose':
    case 'pink':
      return 'bg-[var(--note-pink)]'
    case 'green':
      return 'bg-[var(--note-green)]'
    case 'violet':
    case 'purple':
      return 'bg-[var(--note-purple)]'
    case 'neutral':
      return 'bg-[var(--note-default)]'
    default:
      return 'bg-[var(--note-default)]'
  }
}
