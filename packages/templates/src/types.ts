import type { SemanticTokenKey } from '@boardmark/canvas-domain'

export type TemplateRendererKey = 'boardmark.template.calendar'

export type TemplateRendererContract = {
  rendererKey: TemplateRendererKey
  category: 'template'
  defaultSize: { width: number; height: number }
  tokenUsage: SemanticTokenKey[]
}

export type TemplateRendererProps<TData = Record<string, unknown>> = {
  nodeId: string
  rendererKey: TemplateRendererKey
  selected: boolean
  width?: number
  height?: number
  tokens?: Partial<Record<SemanticTokenKey, string>>
  data: TData
}
