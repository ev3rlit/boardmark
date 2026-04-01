import type { PropsWithChildren } from 'react'

type FloatingPanelProps = PropsWithChildren<{
  className?: string
}>

export function FloatingPanel({ children, className }: FloatingPanelProps) {
  return (
    <div
      className={[
        'rounded-[1.6rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_78%,transparent)] p-2 backdrop-blur-xl',
        'shadow-[0_20px_40px_rgba(43,52,55,0.08)] outline outline-1 outline-[var(--color-outline-ghost)]',
        className ?? ''
      ].join(' ')}
    >
      {children}
    </div>
  )
}
