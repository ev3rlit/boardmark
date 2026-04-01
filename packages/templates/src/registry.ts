import type { TemplateRendererKey, TemplateRendererContract } from './types'
import { CALENDAR_CONTRACT } from './calendar/calendar.contract'
import { CalendarTemplate } from './calendar/Calendar'

export const TEMPLATE_CONTRACTS: Record<TemplateRendererKey, TemplateRendererContract> = {
  'boardmark.template.calendar': CALENDAR_CONTRACT
}

export const TEMPLATE_COMPONENTS = {
  'boardmark.template.calendar': CalendarTemplate
} as const

export function getTemplateContract(key: TemplateRendererKey): TemplateRendererContract {
  return TEMPLATE_CONTRACTS[key]
}

export function getTemplateComponent(key: TemplateRendererKey) {
  return TEMPLATE_COMPONENTS[key]
}
