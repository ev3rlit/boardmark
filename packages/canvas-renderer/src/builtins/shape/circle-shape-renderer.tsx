import type { BuiltInRendererProps, BuiltInShapeRendererData } from '@boardmark/canvas-domain'
import { readObjectBackground } from '../shared'

export function CircleShapeRenderer(
  props: BuiltInRendererProps<BuiltInShapeRendererData>
) {
  const size = Math.max(props.width ?? 132, props.height ?? 132)
  const palette = props.data.palette ?? 'violet'
  const tone = props.data.tone ?? 'default'

  return (
    <div
      className="flex items-center justify-center text-center text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: readObjectBackground(palette, tone, '#ffffff'),
        color: 'var(--color-text-primary, #2b3437)'
      }}
    >
      {props.data.label ?? 'Circle'}
    </div>
  )
}
