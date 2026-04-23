import type {
  GuideAxis,
  GuideEvaluationInput,
  GuideFrame,
  GuideModule
} from '@canvas-app/features/smart-guides/contracts'
import type { GuideVisualLine } from '@canvas-app/features/smart-guides/guide-overlay-model'
import {
  readGuideOverlapRange
} from '@canvas-app/features/smart-guides/geometry/guide-geometry'

const DEFAULT_SPACING_THRESHOLD = 6

export function createSpacingGuidesModule(
  threshold = DEFAULT_SPACING_THRESHOLD
): GuideModule {
  return {
    id: 'spacing-guides',
    evaluate(input) {
      const horizontal = input.xBehavior === 'disabled'
        ? null
        : readSpacingTriple(input.activeFrame, input.candidateFrames, 'x', threshold)
      const vertical = input.yBehavior === 'disabled'
        ? null
        : readSpacingTriple(input.activeFrame, input.candidateFrames, 'y', threshold)

      if (!horizontal && !vertical) {
        return null
      }

      return {
        moduleId: 'spacing-guides',
        adjustment: null,
        overlay: {
          lines: [
            ...(horizontal ?? []),
            ...(vertical ?? [])
          ]
        }
      }
    }
  }
}

function readSpacingTriple(
  activeFrame: GuideFrame,
  candidateFrames: GuideFrame[],
  axis: GuideAxis,
  threshold: number
) {
  const frames = [activeFrame, ...candidateFrames]
    .filter((frame) => {
      return frame.id === activeFrame.id ||
        readGuideOverlapRange(frame, activeFrame, axis === 'x' ? 'y' : 'x') !== null
    })
    .sort((left, right) => {
      return readAxisMin(left, axis) - readAxisMin(right, axis)
    })

  const matches: Array<{
    lines: GuideVisualLine[]
    totalSpan: number
    variance: number
  }> = []

  for (let index = 0; index <= frames.length - 3; index += 1) {
    const left = frames[index]
    const middle = frames[index + 1]
    const right = frames[index + 2]

    if (![left.id, middle.id, right.id].includes(activeFrame.id)) {
      continue
    }

    const firstGap = readGuideGap(left, middle, axis)
    const secondGap = readGuideGap(middle, right, axis)

    if (firstGap < 0 || secondGap < 0) {
      continue
    }

    const variance = Math.abs(firstGap - secondGap)

    if (variance > threshold) {
      continue
    }

    matches.push({
      lines: readSpacingGuideLines(axis, left, middle, right),
      totalSpan: firstGap + secondGap,
      variance
    })
  }

  matches.sort((left, right) => {
    const varianceDelta = left.variance - right.variance

    if (varianceDelta !== 0) {
      return varianceDelta
    }

    return left.totalSpan - right.totalSpan
  })

  return matches[0]?.lines ?? null
}

function readSpacingGuideLines(
  axis: GuideAxis,
  left: GuideFrame,
  middle: GuideFrame,
  right: GuideFrame
): GuideVisualLine[] {
  const cross = readSpacingCrossCoordinate(axis, left, middle, right)

  if (axis === 'x') {
    const lines: GuideVisualLine[] = [
      {
        kind: 'line',
        axis,
        emphasis: 'secondary',
        moduleId: 'spacing-guides',
        role: 'spacing',
        x1: left.x + left.width,
        x2: middle.x,
        y1: cross,
        y2: cross
      },
      {
        kind: 'line',
        axis,
        emphasis: 'secondary',
        moduleId: 'spacing-guides',
        role: 'spacing',
        x1: middle.x + middle.width,
        x2: right.x,
        y1: cross,
        y2: cross
      }
    ]

    return lines
  }

  const lines: GuideVisualLine[] = [
    {
      kind: 'line',
      axis,
      emphasis: 'secondary',
      moduleId: 'spacing-guides',
      role: 'spacing',
      x1: cross,
      x2: cross,
      y1: left.y + left.height,
      y2: middle.y
    },
    {
      kind: 'line',
      axis,
      emphasis: 'secondary',
      moduleId: 'spacing-guides',
      role: 'spacing',
      x1: cross,
      x2: cross,
      y1: middle.y + middle.height,
      y2: right.y
    }
  ]

  return lines
}

function readSpacingCrossCoordinate(
  axis: GuideAxis,
  left: GuideFrame,
  middle: GuideFrame,
  right: GuideFrame
) {
  const overlapAxis = axis === 'x' ? 'y' : 'x'
  const ranges = [
    readGuideOverlapRange(left, middle, overlapAxis),
    readGuideOverlapRange(middle, right, overlapAxis)
  ].filter((entry): entry is { end: number; start: number } => entry !== null)

  if (ranges.length === 2) {
    const start = Math.max(...ranges.map((range) => range.start))
    const end = Math.min(...ranges.map((range) => range.end))

    if (end > start) {
      return (start + end) / 2
    }
  }

  return axis === 'x'
    ? (
      (left.y + left.height / 2) +
      (middle.y + middle.height / 2) +
      (right.y + right.height / 2)
    ) / 3
    : (
      (left.x + left.width / 2) +
      (middle.x + middle.width / 2) +
      (right.x + right.width / 2)
    ) / 3
}

function readGuideGap(left: GuideFrame, right: GuideFrame, axis: GuideAxis) {
  if (axis === 'x') {
    return right.x - (left.x + left.width)
  }

  return right.y - (left.y + left.height)
}

function readAxisMin(frame: GuideFrame, axis: GuideAxis) {
  return axis === 'x' ? frame.x : frame.y
}
