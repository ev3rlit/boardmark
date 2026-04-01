import type {
  BuiltInRendererContract,
  BuiltInRendererKey
} from '@boardmark/canvas-domain'
import { StickyNoteRenderer } from './note/sticky-note-renderer'
import { NotebookNoteRenderer } from './note/notebook-note-renderer'
import { CircleShapeRenderer } from './shape/circle-shape-renderer'
import { EllipseShapeRenderer } from './shape/ellipse-shape-renderer'
import { RectShapeRenderer } from './shape/rect-shape-renderer'
import { RoundRectShapeRenderer } from './shape/round-rect-shape-renderer'
import { TriangleShapeRenderer } from './shape/triangle-shape-renderer'

export const BUILT_IN_RENDERER_CONTRACTS: Record<
  BuiltInRendererKey,
  BuiltInRendererContract
> = {
  'boardmark.shape.rect': {
    rendererKey: 'boardmark.shape.rect',
    nodeType: 'shape',
    variant: 'rect',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 180, height: 120 },
    tokenUsage: ['color.object.neutral', 'color.text.primary', 'radius.md', 'shadow.float']
  },
  'boardmark.shape.roundRect': {
    rendererKey: 'boardmark.shape.roundRect',
    nodeType: 'shape',
    variant: 'roundRect',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 180, height: 120 },
    tokenUsage: ['color.object.blue', 'color.text.primary', 'radius.xl', 'shadow.float']
  },
  'boardmark.shape.ellipse': {
    rendererKey: 'boardmark.shape.ellipse',
    nodeType: 'shape',
    variant: 'ellipse',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 200, height: 120 },
    tokenUsage: ['color.object.green', 'color.text.primary', 'shadow.float']
  },
  'boardmark.shape.circle': {
    rendererKey: 'boardmark.shape.circle',
    nodeType: 'shape',
    variant: 'circle',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 144, height: 144 },
    tokenUsage: ['color.object.violet', 'color.text.primary', 'shadow.float']
  },
  'boardmark.shape.triangle': {
    rendererKey: 'boardmark.shape.triangle',
    nodeType: 'shape',
    variant: 'triangle',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 160, height: 136 },
    tokenUsage: ['color.object.rose', 'color.text.primary', 'shadow.float']
  },
  'boardmark.note.sticky': {
    rendererKey: 'boardmark.note.sticky',
    nodeType: 'note',
    variant: 'sticky',
    category: 'note',
    supportsMarkdown: true,
    defaultSize: { width: 320, height: 220 },
    tokenUsage: [
      'color.object.amber',
      'color.object.blue',
      'color.object.green',
      'color.object.violet',
      'color.object.rose',
      'color.text.primary',
      'shadow.note'
    ]
  },
  'boardmark.note.note': {
    rendererKey: 'boardmark.note.note',
    nodeType: 'note',
    variant: 'note',
    category: 'note',
    supportsMarkdown: true,
    defaultSize: { width: 340, height: 240 },
    tokenUsage: ['color.surface.lowest', 'color.text.primary', 'color.accent.primary', 'shadow.note']
  }
}

export const BUILT_IN_RENDERER_COMPONENTS = {
  'boardmark.shape.rect': RectShapeRenderer,
  'boardmark.shape.roundRect': RoundRectShapeRenderer,
  'boardmark.shape.ellipse': EllipseShapeRenderer,
  'boardmark.shape.circle': CircleShapeRenderer,
  'boardmark.shape.triangle': TriangleShapeRenderer,
  'boardmark.note.sticky': StickyNoteRenderer,
  'boardmark.note.note': NotebookNoteRenderer
} as const

export function getBuiltInRendererContract(rendererKey: BuiltInRendererKey) {
  return BUILT_IN_RENDERER_CONTRACTS[rendererKey]
}
