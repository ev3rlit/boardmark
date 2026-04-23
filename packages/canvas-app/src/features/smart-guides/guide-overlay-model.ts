import type { GuideAxis, GuideModuleId } from '@canvas-app/features/smart-guides/contracts'

export type GuideVisualLine = {
  kind: 'line'
  axis: GuideAxis
  dashed?: boolean
  emphasis: 'primary' | 'secondary'
  moduleId: GuideModuleId
  role: 'alignment' | 'grid' | 'spacing'
  x1: number
  x2: number
  y1: number
  y2: number
}

export type GuideOverlayModel = {
  lines: GuideVisualLine[]
}

