import type { BuiltInRendererProps, BuiltInShapeRendererProps } from '@boardmark/canvas-domain'
import { readBuiltInBodyLabel, readBuiltInBodyProps } from '../body'
import { rendererFrameStyle } from '../shared'

export function EllipseShapeRenderer(
  props: BuiltInRendererProps
) {
  readBuiltInBodyProps<BuiltInShapeRendererProps>(props.body)
  const label = readBuiltInBodyLabel(props.body) ?? 'Ellipse'

  return (
    <div
      className="flex items-center justify-center px-4 py-3 text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={rendererFrameStyle(props, '999px / 65%', '0 20px 40px rgba(43, 52, 55, 0.08)')}
    >
      {label}
    </div>
  )
}
