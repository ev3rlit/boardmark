import type { CanvasViewport } from '@boardmark/canvas-domain'
import type { CanvasViewportSize } from '@canvas-app/store/canvas-store-types'
import type { GuideOverlayModel } from '@canvas-app/features/smart-guides/guide-overlay-model'

export function GuideOverlay({
  overlay,
  viewport,
  viewportSize
}: {
  overlay: GuideOverlayModel
  viewport: CanvasViewport
  viewportSize: CanvasViewportSize
}) {
  if (overlay.lines.length === 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return null
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
      height={viewportSize.height}
      width={viewportSize.width}
    >
      {overlay.lines.map((line, index) => {
        const points = {
          x1: viewport.x + line.x1 * viewport.zoom,
          x2: viewport.x + line.x2 * viewport.zoom,
          y1: viewport.y + line.y1 * viewport.zoom,
          y2: viewport.y + line.y2 * viewport.zoom
        }
        const stroke = line.role === 'grid'
          ? 'rgba(96, 66, 214, 0.42)'
          : line.role === 'spacing'
            ? 'rgba(96, 66, 214, 0.68)'
            : 'rgba(96, 66, 214, 0.88)'

        return (
          <line
            key={`${line.moduleId}:${line.axis}:${index}`}
            stroke={stroke}
            strokeDasharray={line.dashed ? '5 5' : undefined}
            strokeLinecap="round"
            strokeWidth={line.emphasis === 'primary' ? 1.8 : 1.2}
            x1={points.x1}
            x2={points.x2}
            y1={points.y1}
            y2={points.y2}
          />
        )
      })}
    </svg>
  )
}
