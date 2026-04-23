import type { GuideOverlayModel } from '@canvas-app/features/smart-guides/guide-overlay-model'

export type GuideModuleId =
  | 'object-alignment-snapping'
  | 'grid-snapping'
  | 'spacing-guides'

export type GuideAxis = 'x' | 'y'

export type GuideReference = 'min' | 'center' | 'max'

export type GuideAxisBehavior =
  | 'disabled'
  | 'translate'
  | 'resize-from-min'
  | 'resize-from-max'

export type GuideFrame = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type GuideViewport = {
  height: number
  width: number
  x: number
  y: number
  zoom: number
}

export type GuideAxisAdjustment = {
  axis: GuideAxis
  delta: number
  moduleId: GuideModuleId
  reference: GuideReference
  target: number
}

export type GuideAdjustment = {
  x?: GuideAxisAdjustment
  y?: GuideAxisAdjustment
}

export type GuideEvaluationInput = {
  activeFrame: GuideFrame
  candidateFrames: GuideFrame[]
  interaction: 'drag' | 'resize'
  viewport: GuideViewport
  xBehavior: GuideAxisBehavior
  yBehavior: GuideAxisBehavior
}

export type GuideModuleResult = {
  adjustment: GuideAdjustment | null
  moduleId: GuideModuleId
  overlay: GuideOverlayModel
}

export type GuideEvaluationResult = {
  adjustedFrame: GuideFrame
  adjustment: GuideAdjustment | null
  overlay: GuideOverlayModel
}

export type GuideModule = {
  evaluate: (input: GuideEvaluationInput) => GuideModuleResult | null
  id: GuideModuleId
}

export type GuideRegistry = {
  modules: readonly GuideModule[]
}

export type GuideSession = {
  evaluate: (input: GuideEvaluationInput) => GuideEvaluationResult
}

