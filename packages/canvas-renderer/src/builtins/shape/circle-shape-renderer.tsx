import type { BuiltInRendererProps, BuiltInShapeRendererProps } from '@boardmark/canvas-domain'
import { readBuiltInBodyLabel, readBuiltInBodyProps } from '../body'
import { readObjectBackground, readStrokeColor, readTextColor } from '../shared'

export function CircleShapeRenderer(
  props: BuiltInRendererProps
) {
  const size = Math.max(props.width ?? 132, props.height ?? 132)
  readBuiltInBodyProps<BuiltInShapeRendererProps>(props.body)
  const label = readBuiltInBodyLabel(props.body) ?? 'Circle'
  const stroke = readStrokeColor(props.component, props.style)
  const boxShadow = stroke
    ? `0 20px 40px rgba(43, 52, 55, 0.08), inset 0 0 0 1.5px ${stroke}`
    : '0 20px 40px rgba(43, 52, 55, 0.08)'

  return (
    <div
      className="flex items-center justify-center text-center text-sm font-semibold shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: readObjectBackground(props.component, '#ffffff', props.style),
        color: readTextColor(),
        boxShadow
      }}
    >
      {label}
    </div>
  )
}
