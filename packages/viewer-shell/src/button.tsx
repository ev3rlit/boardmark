import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    emphasis?: 'primary' | 'secondary' | 'ghost'
    active?: boolean
  }
>

export function Button({
  emphasis = 'secondary',
  active = false,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-semibold',
        'shadow-[0_10px_22px_rgba(43,52,55,0.08)] transition-[transform,box-shadow,background-color,color] duration-150',
        'hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(43,52,55,0.12)]',
        'active:translate-y-[1px] active:shadow-[0_6px_14px_rgba(43,52,55,0.10)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--color-primary)_22%,transparent)]',
        'disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none disabled:opacity-60',
        emphasisClassName(emphasis, active),
        className ?? ''
      ].join(' ')}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

function emphasisClassName(emphasis: ButtonProps['emphasis'], active: boolean) {
  if (active) {
    return 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dim)]'
  }

  switch (emphasis) {
    case 'primary':
      return [
        'bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-dim))] text-white',
        'hover:bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-primary)_88%,white),color-mix(in_oklab,var(--color-primary-dim)_92%,white))]'
      ].join(' ')
    case 'ghost':
      return [
        'bg-transparent text-[var(--color-primary)] shadow-none',
        'hover:bg-[color:color-mix(in_oklab,var(--color-primary)_10%,transparent)]',
        'active:bg-[color:color-mix(in_oklab,var(--color-primary)_16%,transparent)]'
      ].join(' ')
    default:
      return [
        'bg-[color:color-mix(in_oklab,var(--color-primary)_10%,white)] text-[var(--color-on-surface)]',
        'hover:bg-[color:color-mix(in_oklab,var(--color-primary)_18%,white)]',
        'active:bg-[color:color-mix(in_oklab,var(--color-primary)_24%,white)]'
      ].join(' ')
  }
}
