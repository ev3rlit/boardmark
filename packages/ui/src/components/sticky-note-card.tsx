import type { CSSProperties, ReactNode } from 'react'

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
  className?: string
  style?: CSSProperties
  children: ReactNode
}

const PAPER_TEXTURE_CLASS_NAME = [
  'absolute inset-0 pointer-events-none',
  'bg-[linear-gradient(180deg,rgba(255,255,255,0.2),rgba(255,255,255,0.04))]',
  'mix-blend-soft-light opacity-70'
].join(' ')

const PAPER_TEXTURE_STYLE: CSSProperties = {
  backgroundImage: [
    'linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04))',
    'radial-gradient(circle at 18% 20%, rgba(255, 255, 255, 0.22) 0 0.8px, transparent 1px)',
    'radial-gradient(circle at 72% 28%, rgba(43, 52, 55, 0.08) 0 0.7px, transparent 1px)',
    'radial-gradient(circle at 34% 74%, rgba(255, 255, 255, 0.18) 0 0.9px, transparent 1.1px)',
    'radial-gradient(circle at 82% 78%, rgba(43, 52, 55, 0.06) 0 0.8px, transparent 1px)'
  ].join(','),
  backgroundSize: '100% 100%, 28px 28px, 32px 32px, 36px 36px, 40px 40px',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.32), inset 0 -18px 28px rgba(43, 52, 55, 0.04)'
}

export function StickyNoteCard({
  color = 'default',
  className,
  selected = false,
  style,
  children
}: StickyNoteCardProps) {
  return (
    <div
      data-note-surface="sticky"
      className={[
        'relative overflow-hidden rounded-none px-5 py-4 shadow-[0_18px_40px_rgba(43,52,55,0.09)] transition-transform duration-200',
        'bg-[var(--note-surface)] text-[var(--color-on-surface)]',
        selected ? 'ring-2 ring-[color:color-mix(in_oklab,var(--color-primary)_28%,transparent)]' : '',
        className ?? '',
        noteColorClassName(color)
      ].join(' ')}
      style={style}
    >
      <div
        aria-hidden="true"
        className={PAPER_TEXTURE_CLASS_NAME}
        data-note-texture="paper"
        style={PAPER_TEXTURE_STYLE}
      />
      <div className="relative z-10">
        {children}
      </div>
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
