import type { BuiltInRendererProps, BuiltInShapeRendererData } from '@boardmark/canvas-domain'
import { rendererFrameStyle } from '../shared'

export function EllipseShapeRenderer(
  props: BuiltInRendererProps<BuiltInShapeRendererData>
) {
  const palette = props.data.palette ?? 'green'
  const tone = props.data.tone ?? 'soft'

  return (
    <div
      className="flex items-center justify-center px-4 py-3 text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={rendererFrameStyle(props, palette, tone, '#ffffff', '999px / 65%')}
    >
      {props.data.label ?? 'Ellipse'}
    </div>
  )
}
