import type {
  GuideAxis,
  GuideAxisAdjustment,
  GuideEvaluationInput,
  GuideFrame,
  GuideModule
} from '@canvas-app/features/smart-guides/contracts'
import type { GuideVisualLine } from '@canvas-app/features/smart-guides/guide-overlay-model'
import {
  readFrameReference,
  readGuideReferences
} from '@canvas-app/features/smart-guides/geometry/guide-geometry'

const ALIGNMENT_PADDING = 16
const DEFAULT_ALIGNMENT_THRESHOLD = 6

export function createObjectAlignmentSnappingModule(
  threshold = DEFAULT_ALIGNMENT_THRESHOLD
): GuideModule {
  return {
    id: 'object-alignment-snapping',
    evaluate(input) {
      const horizontal = readBestAlignmentCandidate(input, 'x', threshold)
      const vertical = readBestAlignmentCandidate(input, 'y', threshold)

      if (!horizontal && !vertical) {
        return null
      }

      return {
        moduleId: 'object-alignment-snapping',
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

function readBestAlignmentCandidate(
  input: GuideEvaluationInput,
  axis: GuideAxis,
  threshold: number
) {
  const references = readGuideReferences(axis === 'x' ? input.xBehavior : input.yBehavior)

  if (references.length === 0) {
    return null
  }

  const matches: Array<{
    adjustment: GuideAxisAdjustment
    candidateFrame: GuideFrame
    line: GuideVisualLine
    priority: number
  }> = []

  for (const reference of references) {
    const source = readFrameReference(input.activeFrame, axis, reference)

    for (const candidateFrame of input.candidateFrames) {
      const target = readFrameReference(candidateFrame, axis, reference)
      const delta = target - source

      if (Math.abs(delta) > threshold) {
        continue
      }

      matches.push({
        adjustment: {
          axis,
          delta,
          moduleId: 'object-alignment-snapping',
          reference,
          target
        },
        candidateFrame,
        line: readAlignmentGuideLine(axis, target, input.activeFrame, candidateFrame),
        priority: readAlignmentReferencePriority(reference)
      })
    }
  }

  if (matches.length === 0) {
    return null
  }

  matches.sort((left, right) => {
    const priorityDelta = left.priority - right.priority

    if (priorityDelta !== 0) {
      return priorityDelta
    }

    const deltaDistance = Math.abs(left.adjustment.delta) - Math.abs(right.adjustment.delta)

    if (deltaDistance !== 0) {
      return deltaDistance
    }

    return readCrossAxisDistance(axis, input.activeFrame, left.candidateFrame) -
      readCrossAxisDistance(axis, input.activeFrame, right.candidateFrame)
  })

  return matches[0] ?? null
}

function readAlignmentGuideLine(
  axis: GuideAxis,
  target: number,
  activeFrame: GuideFrame,
  candidateFrame: GuideFrame
): GuideVisualLine {
  if (axis === 'x') {
    const top = Math.min(activeFrame.y, candidateFrame.y) - ALIGNMENT_PADDING
    const bottom = Math.max(
      activeFrame.y + activeFrame.height,
      candidateFrame.y + candidateFrame.height
    ) + ALIGNMENT_PADDING

    return {
      kind: 'line',
      axis,
      emphasis: 'primary',
      moduleId: 'object-alignment-snapping',
      role: 'alignment',
      x1: target,
      x2: target,
      y1: top,
      y2: bottom
    }
  }

  const left = Math.min(activeFrame.x, candidateFrame.x) - ALIGNMENT_PADDING
  const right = Math.max(
    activeFrame.x + activeFrame.width,
    candidateFrame.x + candidateFrame.width
  ) + ALIGNMENT_PADDING

  return {
    kind: 'line',
    axis,
    emphasis: 'primary',
    moduleId: 'object-alignment-snapping',
    role: 'alignment',
    x1: left,
    x2: right,
    y1: target,
    y2: target
  }
}

function readAlignmentReferencePriority(reference: GuideAxisAdjustment['reference']) {
  return reference === 'center' ? 0 : 1
}

function readCrossAxisDistance(
  axis: GuideAxis,
  activeFrame: GuideFrame,
  candidateFrame: GuideFrame
) {
  return Math.abs(
    readFrameReference(activeFrame, axis === 'x' ? 'y' : 'x', 'center') -
      readFrameReference(candidateFrame, axis === 'x' ? 'y' : 'x', 'center')
  )
}

