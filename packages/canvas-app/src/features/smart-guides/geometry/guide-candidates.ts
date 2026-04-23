import type { GuideFrame, GuideViewport } from '@canvas-app/features/smart-guides/contracts'
import {
  expandGuideFrame,
  intersectGuideFrames,
  readGuideFrameDistanceSq,
  readViewportFrame
} from '@canvas-app/features/smart-guides/geometry/guide-geometry'

const ACTIVE_FRAME_MARGIN = 240
const MAX_CANDIDATES = 64
const VIEWPORT_MARGIN = 160

export function readGuideCandidateFrames(input: {
  activeFrame: GuideFrame
  candidateFrames: GuideFrame[]
  viewport: GuideViewport
}) {
  const activeSearchBounds = expandGuideFrame(input.activeFrame, ACTIVE_FRAME_MARGIN)
  const viewportSearchBounds = expandGuideFrame(readViewportFrame(input.viewport), VIEWPORT_MARGIN)

  return input.candidateFrames
    .filter((candidate) => {
      return intersectGuideFrames(candidate, activeSearchBounds) ||
        intersectGuideFrames(candidate, viewportSearchBounds)
    })
    .sort((left, right) => {
      return readGuideFrameDistanceSq(left, input.activeFrame) -
        readGuideFrameDistanceSq(right, input.activeFrame)
    })
    .slice(0, MAX_CANDIDATES)
}

