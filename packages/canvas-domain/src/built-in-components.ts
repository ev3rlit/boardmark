import type { CanvasObjectStyle } from './index'

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

export type BuiltInNoteVariant = 'note'
export type BuiltInImageVariant = 'image'

export type BuiltInComponentCategory = 'shape' | 'note' | 'image'

export type BuiltInComponentKey =
  | 'note'
  | 'image'
  | 'boardmark.shape.rect'
  | 'boardmark.shape.roundRect'
  | 'boardmark.shape.ellipse'
  | 'boardmark.shape.circle'
  | 'boardmark.shape.triangle'

export type BuiltInPalette =
  | 'neutral'
  | 'amber'
  | 'blue'
  | 'green'
  | 'violet'
  | 'rose'

export type BuiltInTone = 'default' | 'soft' | 'muted' | 'strong' | 'accent'

export type BuiltInShapeRendererProps = {
  palette?: BuiltInPalette
  tone?: BuiltInTone
}

export type BuiltInNoteRendererProps = {
  palette?: BuiltInPalette
  tone?: BuiltInTone
}

export type BuiltInRendererSize = {
  width: number
  height: number
}

export type BuiltInRendererContract = {
  component: BuiltInComponentKey
  variant: BuiltInShapeVariant | BuiltInNoteVariant | BuiltInImageVariant
  category: BuiltInComponentCategory
  supportsMarkdown: boolean
  defaultSize: BuiltInRendererSize
  tokenUsage: SemanticTokenKey[]
}

export type BuiltInImageResolution =
  | { status: 'resolved'; src: string }
  | { status: 'error'; message: string }

export type BuiltInImageResolver = (
  src: string
) => Promise<BuiltInImageResolution>

export type BuiltInRendererProps = {
  nodeId: string
  component: BuiltInComponentKey
  selected: boolean
  width?: number
  height?: number
  body?: string
  src?: string
  alt?: string
  title?: string
  lockAspectRatio?: boolean
  style?: CanvasObjectStyle
  resolvedThemeRef?: string
  imageResolver?: BuiltInImageResolver
  tokens?: Partial<Record<SemanticTokenKey, string>>
  className?: string
}
