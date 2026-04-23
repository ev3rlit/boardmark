import type {
  GuideAxis,
  GuideAxisAdjustment,
  GuideEvaluationInput,
  GuideModule
} from '@canvas-app/features/smart-guides/contracts'
import type { GuideVisualLine } from '@canvas-app/features/smart-guides/guide-overlay-model'
import {
  readFrameReference,
  readGuideReferences,
  readViewportFrame
} from '@canvas-app/features/smart-guides/geometry/guide-geometry'

const DEFAULT_GRID_SIZE = 24
const DEFAULT_GRID_THRESHOLD = 4

export function createGridSnappingModule(
  threshold = DEFAULT_GRID_THRESHOLD,
  gridSize = DEFAULT_GRID_SIZE
): GuideModule {
  return {
    id: 'grid-snapping',
    evaluate(input) {
      const horizontal = readBestGridCandidate(input, 'x', threshold, gridSize)
      const vertical = readBestGridCandidate(input, 'y', threshold, gridSize)

      if (!horizontal && !vertical) {
        return null
      }

      return {
        moduleId: 'grid-snapping',
        adjustment: {
          x: horizontal?.adjustment,
          y: vertical?.adjustment
        },
        overlay: {
          lines: [
            ...(horizontal ? [horizontal.line] : []),
            ...(vertical ? [vertical.line] : [])
          ]
        }
      }
    }
  }
}

function readBestGridCandidate(
  input: GuideEvaluationInput,
  axis: GuideAxis,
  threshold: number,
  gridSize: number
) {
  const references = readGuideReferences(axis === 'x' ? input.xBehavior : input.yBehavior)

  if (references.length === 0) {
    return null
  }

  const candidates: Array<{
    adjustment: GuideAxisAdjustment
    line: GuideVisualLine
  }> = []

  for (const reference of references) {
    const source = readFrameReference(input.activeFrame, axis, reference)
    const target = Math.round(source / gridSize) * gridSize
    const delta = target - source

    if (Math.abs(delta) > threshold) {
      continue
    }

    candidates.push({
      adjustment: {
        axis,
        delta,
        moduleId: 'grid-snapping',
        reference,
        target
      },
      line: readGridGuideLine(axis, target, input)
    })
  }

  candidates.sort((left, right) => {
    return Math.abs(left.adjustment.delta) - Math.abs(right.adjustment.delta)
  })

  return candidates[0] ?? null
}

function readGridGuideLine(
  axis: GuideAxis,
  target: number,
  input: GuideEvaluationInput
): GuideVisualLine {
  const viewportFrame = readViewportFrame(input.viewport)

  if (axis === 'x') {
    return {
      kind: 'line',
      axis,
      dashed: true,
      emphasis: 'secondary',
      moduleId: 'grid-snapping',
      role: 'grid',
      x1: target,
      x2: target,
      y1: viewportFrame.y,
      y2: viewportFrame.y + viewportFrame.height
    }
  }

  return {
    kind: 'line',
    axis,
    dashed: true,
    emphasis: 'secondary',
    moduleId: 'grid-snapping',
    role: 'grid',
    x1: viewportFrame.x,
    x2: viewportFrame.x + viewportFrame.width,
    y1: target,
    y2: target
  }
}

