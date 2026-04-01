import type { BuiltInRendererProps, BuiltInShapeRendererData } from '@boardmark/canvas-domain'
import { rendererFrameStyle } from '../shared'

export function RoundRectShapeRenderer(
  props: BuiltInRendererProps<BuiltInShapeRendererData>
) {
  const palette = props.data.palette ?? 'blue'
  const tone = props.data.tone ?? 'soft'

  return (
    <div
      className="flex items-center justify-center px-4 py-3 text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={rendererFrameStyle(props, palette, tone, '#ffffff', '1.6rem')}
    >
      {props.data.label ?? 'Rounded Rectangle'}
    </div>
  )
}
