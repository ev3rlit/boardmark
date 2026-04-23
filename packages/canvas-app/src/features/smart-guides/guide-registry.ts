import type { GuideModule, GuideRegistry } from '@canvas-app/features/smart-guides/contracts'
import { createGridSnappingModule } from '@canvas-app/features/smart-guides/grid-snapping'
import { createObjectAlignmentSnappingModule } from '@canvas-app/features/smart-guides/object-alignment-snapping'
import { createSpacingGuidesModule } from '@canvas-app/features/smart-guides/spacing-guides'

export function createGuideRegistry(modules: GuideModule[]): GuideRegistry {
  return {
    modules
  }
}

export function createDefaultGuideRegistry(input?: {
  gridSnappingEnabled?: boolean
}): GuideRegistry {
  return createGuideRegistry([
    createObjectAlignmentSnappingModule(),
    ...(input?.gridSnappingEnabled === false ? [] : [createGridSnappingModule()]),
    createSpacingGuidesModule()
  ])
}
