import type { BuiltInRendererProps, BuiltInShapeRendererProps } from '@boardmark/canvas-domain'
import { readBuiltInBodyLabel, readBuiltInBodyProps } from '../body'
import { readObjectBackground, readTextColor } from '../shared'

export function CircleShapeRenderer(
  props: BuiltInRendererProps
) {
  const size = Math.max(props.width ?? 132, props.height ?? 132)
  const shapeProps = readBuiltInBodyProps<BuiltInShapeRendererProps>(props.body)
  const palette = shapeProps.palette ?? 'violet'
  const tone = shapeProps.tone ?? 'default'
  const label = readBuiltInBodyLabel(props.body) ?? 'Circle'

  return (
    <div
      className="flex items-center justify-center text-center text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: readObjectBackground(palette, tone, '#ffffff', props.style),
        color: readTextColor(props.style)
      }}
    >
      {label}
    </div>
  )
}
