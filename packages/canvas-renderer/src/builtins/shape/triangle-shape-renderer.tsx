import type { CSSProperties } from 'react'
import type { BuiltInRendererProps, BuiltInShapeRendererProps } from '@boardmark/canvas-domain'
import { readBuiltInBodyLabel, readBuiltInBodyProps } from '../body'
import { readObjectBackground, readTextColor } from '../shared'

export function TriangleShapeRenderer(
  props: BuiltInRendererProps
) {
  const width = props.width ?? 160
  const height = props.height ?? 136
  const shapeProps = readBuiltInBodyProps<BuiltInShapeRendererProps>(props.body)
  const palette = shapeProps.palette ?? 'rose'
  const tone = shapeProps.tone ?? 'default'
  const label = readBuiltInBodyLabel(props.body) ?? 'Triangle'
  const style = {
    '--boardmark-triangle-fill': readObjectBackground(palette, tone, '#ffffff', props.style)
  } as CSSProperties

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width,
        height
      }}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 drop-shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
        style={style}
        viewBox={`0 0 ${width} ${height}`}
      >
        <polygon
          fill="var(--boardmark-triangle-fill)"
          points={`${width / 2},0 0,${height} ${width},${height}`}
        />
      </svg>
      <span
        className="relative px-6 text-center text-sm font-semibold"
        style={{
          color: readTextColor(props.style)
        }}
      >
        {label}
      </span>
    </div>
  )
}
