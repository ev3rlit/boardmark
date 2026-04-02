import type { BuiltInRendererProps } from '@boardmark/canvas-domain'
import { useResolvedImageSource } from '@boardmark/ui'

export function ImageRenderer(props: BuiltInRendererProps) {
  const resolution = useResolvedImageSource(props.src, props.imageResolver)

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.1rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_94%,white)] shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={{
        width: props.width ?? '100%',
        minHeight: props.height ?? 120
      }}
    >
      {resolution.status === 'resolved' ? (
        <img
          alt={props.alt ?? ''}
          className="h-full w-full object-contain"
          src={resolution.src}
          title={props.title}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-4 py-3 text-center text-xs text-[var(--color-on-surface-variant)]">
          {resolution.status === 'error' ? resolution.message : 'Loading image'}
        </div>
      )}
    </div>
  )
}
