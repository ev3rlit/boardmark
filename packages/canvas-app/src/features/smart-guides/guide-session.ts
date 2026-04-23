import type {
  GuideEvaluationInput,
  GuideEvaluationResult,
  GuideRegistry,
  GuideSession
} from '@canvas-app/features/smart-guides/contracts'
import { composeGuideResults } from '@canvas-app/features/smart-guides/guide-composer'
import { readGuideCandidateFrames } from '@canvas-app/features/smart-guides/geometry/guide-candidates'
import { createDefaultGuideRegistry } from '@canvas-app/features/smart-guides/guide-registry'

export function createGuideSession(
  registry: GuideRegistry = createDefaultGuideRegistry()
): GuideSession {
  return {
    evaluate(input: GuideEvaluationInput): GuideEvaluationResult {
      const candidateFrames = readGuideCandidateFrames({
        activeFrame: input.activeFrame,
        candidateFrames: input.candidateFrames,
        viewport: input.viewport
      })
      const results = registry.modules
        .map((module) => module.evaluate({
          ...input,
          candidateFrames
        }))
        .filter((result): result is NonNullable<typeof result> => result !== null)

      return composeGuideResults({
        evaluation: {
          ...input,
          candidateFrames
        },
        results
      })
    }
  }
}

export function createConfiguredGuideSession(input?: {
  gridSnappingEnabled?: boolean
}): GuideSession {
  return createGuideSession(createDefaultGuideRegistry(input))
}
