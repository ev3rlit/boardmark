import type { TemplateRendererContract } from '../types'

export const CALENDAR_CONTRACT: TemplateRendererContract = {
  rendererKey: 'boardmark.template.calendar',
  category: 'template',
  defaultSize: { width: 340, height: 320 },
  tokenUsage: [
    'color.surface.lowest',
    'color.surface.low',
    'color.surface.container',
    'color.text.primary',
    'color.text.secondary',
    'color.text.tertiary',
    'color.accent.primary',
    'color.accent.container',
    'color.accent.on',
    'radius.md',
    'radius.lg',
    'shadow.float'
  ]
}
