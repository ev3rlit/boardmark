export type WysiwygPhase0Sample = {
  id: string
  name: string
  description: string
  markdown: string
}

export type SpecialFencedBlockKind = 'mermaid' | 'sandpack'

export type FallbackBlockKind = 'html'

export type WysiwygPhase0Finding = {
  id: string
  label: string
  status: 'pass' | 'warning'
  detail: string
}
