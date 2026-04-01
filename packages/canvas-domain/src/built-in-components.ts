export type SemanticTokenKey =
  | 'color.surface.lowest'
  | 'color.surface.base'
  | 'color.surface.low'
  | 'color.surface.container'
  | 'color.surface.high'
  | 'color.surface.highest'
  | 'color.text.primary'
  | 'color.text.secondary'
  | 'color.text.tertiary'
  | 'color.accent.primary'
  | 'color.accent.dim'
  | 'color.accent.container'
  | 'color.accent.soft'
  | 'color.accent.on'
  | 'color.object.neutral'
  | 'color.object.amber'
  | 'color.object.blue'
  | 'color.object.green'
  | 'color.object.violet'
  | 'color.object.rose'
  | 'color.state.info'
  | 'color.state.success'
  | 'color.state.warning'
  | 'font.body'
  | 'font.mono'
  | 'space.2'
  | 'space.4'
  | 'space.6'
  | 'space.8'
  | 'radius.sm'
  | 'radius.md'
  | 'radius.lg'
  | 'radius.xl'
  | 'shadow.float'
  | 'shadow.note'

export type BuiltInShapeVariant =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'circle'
  | 'triangle'

export type BuiltInNoteVariant = 'sticky' | 'note'

export type BuiltInNodeType = 'shape' | 'note'

export type BuiltInRendererKey =
  | 'boardmark.shape.rect'
  | 'boardmark.shape.roundRect'
  | 'boardmark.shape.ellipse'
  | 'boardmark.shape.circle'
  | 'boardmark.shape.triangle'
  | 'boardmark.note.sticky'
  | 'boardmark.note.note'

export type BuiltInPalette =
  | 'neutral'
  | 'amber'
  | 'blue'
  | 'green'
  | 'violet'
  | 'rose'

export type BuiltInTone = 'default' | 'soft' | 'muted' | 'strong' | 'accent'

export type BuiltInShapeRendererData = {
  label?: string
  palette?: BuiltInPalette
  tone?: BuiltInTone
}

export type BuiltInNoteRendererData = {
  palette?: BuiltInPalette
  tone?: BuiltInTone
}

export type BuiltInRendererSize = {
  width: number
  height: number
}

export type BuiltInRendererContract = {
  rendererKey: BuiltInRendererKey
  nodeType: BuiltInNodeType
  variant: BuiltInShapeVariant | BuiltInNoteVariant
  category: 'shape' | 'note'
  supportsMarkdown: boolean
  defaultSize: BuiltInRendererSize
  tokenUsage: SemanticTokenKey[]
}

export type BuiltInRendererProps<TData = Record<string, unknown>> = {
  nodeId: string
  rendererKey: BuiltInRendererKey
  selected: boolean
  width?: number
  height?: number
  content?: string
  data: TData
  tokens?: Partial<Record<SemanticTokenKey, string>>
  className?: string
}
