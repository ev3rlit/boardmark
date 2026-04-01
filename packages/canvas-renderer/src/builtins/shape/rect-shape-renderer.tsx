import type { BuiltInRendererProps, BuiltInShapeRendererData } from '@boardmark/canvas-domain'
import { rendererFrameStyle } from '../shared'

export function RectShapeRenderer(
  props: BuiltInRendererProps<BuiltInShapeRendererData>
) {
  const palette = props.data.palette ?? 'neutral'
  const tone = props.data.tone ?? 'default'

  return (
    <div
      className="flex items-center justify-center px-4 py-3 text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={rendererFrameStyle(props, palette, tone, '#ffffff', '0.75rem')}
    >
      {props.data.label ?? 'Rectangle'}
    </div>
  )
}
