import type {
  GuideAxis,
  GuideEvaluationInput,
  GuideEvaluationResult,
  GuideModuleId,
  GuideModuleResult
} from '@canvas-app/features/smart-guides/contracts'
import type { GuideVisualLine } from '@canvas-app/features/smart-guides/guide-overlay-model'
import { applyGuideAdjustments } from '@canvas-app/features/smart-guides/geometry/guide-geometry'

const MODULE_PRIORITY: GuideModuleId[] = [
  'object-alignment-snapping',
  'grid-snapping',
  'spacing-guides'
]

export function composeGuideResults(input: {
  evaluation: GuideEvaluationInput
  results: GuideModuleResult[]
}): GuideEvaluationResult {
  if (input.results.length === 0) {
    return {
      adjustedFrame: input.evaluation.activeFrame,
      adjustment: null,
      overlay: {
        lines: []
      }
    }
  }

  const prioritizedResults = [...input.results].sort((left, right) => {
    return readModulePriority(left.moduleId) - readModulePriority(right.moduleId)
  })
  const xSource = readAdjustmentSource(prioritizedResults, 'x')
  const ySource = readAdjustmentSource(prioritizedResults, 'y')
  const adjustment = xSource || ySource
    ? {
      x: xSource?.adjustment.x,
      y: ySource?.adjustment.y
    }
    : null

  const chosenLines = new Map<string, GuideVisualLine>()

  appendChosenOverlayLines(chosenLines, xSource, 'x')
  appendChosenOverlayLines(chosenLines, ySource, 'y')

  for (const result of prioritizedResults) {
    if (result.moduleId !== 'spacing-guides') {
      continue
    }

    for (const line of result.overlay.lines) {
      chosenLines.set(readGuideLineKey(line), line)
    }
  }

  return {
    adjustedFrame: applyGuideAdjustments({
      adjustment,
      frame: input.evaluation.activeFrame,
      xBehavior: input.evaluation.xBehavior,
      yBehavior: input.evaluation.yBehavior
    }, {
      round: input.evaluation.interaction !== 'drag'
    }),
    adjustment,
    overlay: {
      lines: [...chosenLines.values()]
    }
  }
}

function readAdjustmentSource(
  results: GuideModuleResult[],
  axis: GuideAxis
) {
  return results.find((result): result is GuideModuleResult & { adjustment: NonNullable<GuideModuleResult['adjustment']> } => {
    return Boolean(result.adjustment?.[axis])
  }) ?? null
}

function appendChosenOverlayLines(
  target: Map<string, GuideVisualLine>,
  result: GuideModuleResult | null,
  axis: GuideAxis
) {
  if (!result) {
    return
  }

  for (const line of result.overlay.lines) {
    if (line.axis !== axis) {
      continue
    }

    target.set(readGuideLineKey(line), line)
  }
}

function readModulePriority(moduleId: GuideModuleId) {
  const index = MODULE_PRIORITY.indexOf(moduleId)

  return index >= 0 ? index : MODULE_PRIORITY.length
}

function readGuideLineKey(line: GuideVisualLine) {
  return [
    line.axis,
    line.moduleId,
    line.role,
    line.x1,
    line.x2,
    line.y1,
    line.y2
  ].join(':')
}
