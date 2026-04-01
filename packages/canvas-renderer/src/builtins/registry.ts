import type {
  BuiltInComponentKey,
  BuiltInRendererContract
} from '@boardmark/canvas-domain'
import { NotebookNoteRenderer } from './note/notebook-note-renderer'
import { CircleShapeRenderer } from './shape/circle-shape-renderer'
import { EllipseShapeRenderer } from './shape/ellipse-shape-renderer'
import { RectShapeRenderer } from './shape/rect-shape-renderer'
import { RoundRectShapeRenderer } from './shape/round-rect-shape-renderer'
import { TriangleShapeRenderer } from './shape/triangle-shape-renderer'

export const BUILT_IN_RENDERER_CONTRACTS: Record<
  BuiltInComponentKey,
  BuiltInRendererContract
> = {
  note: {
    component: 'note',
    variant: 'note',
    category: 'note',
    supportsMarkdown: true,
    defaultSize: { width: 340, height: 240 },
    tokenUsage: ['color.surface.lowest', 'color.text.primary', 'color.accent.primary', 'shadow.note']
  },
  'boardmark.shape.rect': {
    component: 'boardmark.shape.rect',
    variant: 'rect',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 180, height: 120 },
    tokenUsage: ['color.object.neutral', 'color.text.primary', 'radius.md', 'shadow.float']
  },
  'boardmark.shape.roundRect': {
    component: 'boardmark.shape.roundRect',
    variant: 'roundRect',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 180, height: 120 },
    tokenUsage: ['color.object.blue', 'color.text.primary', 'radius.xl', 'shadow.float']
  },
  'boardmark.shape.ellipse': {
    component: 'boardmark.shape.ellipse',
    variant: 'ellipse',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 200, height: 120 },
    tokenUsage: ['color.object.green', 'color.text.primary', 'shadow.float']
  },
  'boardmark.shape.circle': {
    component: 'boardmark.shape.circle',
    variant: 'circle',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 144, height: 144 },
    tokenUsage: ['color.object.violet', 'color.text.primary', 'shadow.float']
  },
  'boardmark.shape.triangle': {
    component: 'boardmark.shape.triangle',
    variant: 'triangle',
    category: 'shape',
    supportsMarkdown: false,
    defaultSize: { width: 160, height: 136 },
    tokenUsage: ['color.object.rose', 'color.text.primary', 'shadow.float']
  }
}

export const BUILT_IN_RENDERER_COMPONENTS = {
  note: NotebookNoteRenderer,
  'boardmark.shape.rect': RectShapeRenderer,
  'boardmark.shape.roundRect': RoundRectShapeRenderer,
  'boardmark.shape.ellipse': EllipseShapeRenderer,
  'boardmark.shape.circle': CircleShapeRenderer,
  'boardmark.shape.triangle': TriangleShapeRenderer
} as const

export function getBuiltInRendererContract(component: BuiltInComponentKey) {
  return BUILT_IN_RENDERER_CONTRACTS[component]
}
