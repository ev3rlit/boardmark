import type { CSSProperties } from 'react'
import type { BuiltInRendererProps, BuiltInShapeRendererData } from '@boardmark/canvas-domain'
import { readObjectBackground } from '../shared'

export function TriangleShapeRenderer(
  props: BuiltInRendererProps<BuiltInShapeRendererData>
) {
  const width = props.width ?? 160
  const height = props.height ?? 136
  const palette = props.data.palette ?? 'rose'
  const tone = props.data.tone ?? 'default'
  const style = {
    '--boardmark-triangle-fill': readObjectBackground(palette, tone, '#ffffff')
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
          color: 'var(--color-text-primary, #2b3437)'
        }}
      >
        {props.data.label ?? 'Triangle'}
      </span>
    </div>
  )
}
