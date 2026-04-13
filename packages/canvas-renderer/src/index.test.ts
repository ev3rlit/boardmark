import { createElement } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_RENDERER_CONTRACTS,
  NotebookNoteRenderer,
  RectShapeRenderer,
  toFlowEdge,
  toFlowNode,
  toFlowViewport
} from './index'
import {
  readBuiltInBodyLabel,
  readBuiltInBodyParts,
  readBuiltInBodyProps
} from './builtins/body'

const sourceMap = {
  objectRange: {
    start: { line: 1, offset: 0 },
    end: { line: 3, offset: 12 }
  },
  headerLineRange: {
    start: { line: 1, offset: 0 },
    end: { line: 1, offset: 10 }
  },
  metadataRange: {
    start: { line: 1, offset: 8 },
    end: { line: 1, offset: 10 }
  },
  bodyRange: {
    start: { line: 2, offset: 11 },
    end: { line: 3, offset: 12 }
  },
  closingLineRange: {
    start: { line: 3, offset: 9 },
    end: { line: 3, offset: 12 }
  }
} as const

describe('canvas renderer helpers', () => {
  it('maps a note node to a react flow note with resolved theme data', () => {
    const node = toFlowNode(
      {
        id: 'a',
        component: 'note',
        at: { x: 100, y: 80, w: 360, h: 220 },
        style: {
          bg: {
            color: '#FFF9DB'
          },
          stroke: {
            color: '#6042D6CC'
          }
        },
        body: '# A\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        defaultStyle: 'boardmark.editorial.default'
      }
    )

    expect(node.type).toBe('canvas-note')
    expect(node.position).toEqual({ x: 100, y: 80 })
    expect(node.width).toBe(360)
    expect(node.height).toBe(220)
    expect(node.data.component).toBe('note')
    expect(node.data.body).toBe('# A\n')
    expect(node.data.resolvedThemeRef).toBe('boardmark.editorial.default')
    expect(node.data.style?.bg?.color).toBe('#FFF9DB')
    expect(node.data.style?.stroke?.color).toBe('#6042D6CC')
    expect(node.draggable).toBeUndefined()
    expect(node.selectable).toBeUndefined()
    expect(node.connectable).toBeUndefined()
  })

  it('maps component nodes using component keys and at geometry', () => {
    const node = toFlowNode(
      {
        id: 'shape-a',
        component: 'boardmark.shape.roundRect',
        at: { x: 120, y: 140, w: 420, h: 280 },
        body: 'Frame\n\n```yaml props\npalette: neutral\ntone: soft\n```',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        defaultStyle: 'boardmark.editorial.soft'
      }
    )

    expect(node.type).toBe('canvas-component')
    expect(node.position).toEqual({ x: 120, y: 140 })
    expect(node.data.component).toBe('boardmark.shape.roundRect')
    expect(node.data.body).toContain('palette: neutral')
    expect(node.style?.width).toBe(420)
    expect(node.style?.height).toBe(280)
    expect(node.data.resolvedThemeRef).toBe('boardmark.editorial.soft')
  })

  it('maps image nodes with image metadata and a resolver', () => {
    const imageResolver = async () => ({
      status: 'resolved' as const,
      src: 'file:///tmp/mockup.png'
    })
    const node = toFlowNode(
      {
        id: 'image-1',
        component: 'image',
        at: { x: 120, y: 140, w: 420, h: 280 },
        src: './welcome.assets/mockup.png',
        alt: 'Mockup',
        title: 'Welcome',
        lockAspectRatio: true,
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        imageResolver
      }
    )

    expect(node.data.component).toBe('image')
    expect(node.data.src).toBe('./welcome.assets/mockup.png')
    expect(node.data.alt).toBe('Mockup')
    expect(node.data.lockAspectRatio).toBe(true)
    expect(node.data.imageResolver).toBe(imageResolver)
  })

  it('maps edges and viewport to react flow data', () => {
    const edge = toFlowEdge({
      id: 'edge-1',
      from: 'a',
      to: 'b',
      body: 'Edge label\n',
      position: {
        start: { line: 1, offset: 0 },
        end: { line: 2, offset: 12 }
      },
      sourceMap: {
        ...sourceMap,
        objectRange: {
          start: { line: 1, offset: 0 },
          end: { line: 2, offset: 12 }
        },
        closingLineRange: {
          start: { line: 2, offset: 9 },
          end: { line: 2, offset: 12 }
        }
      }
    })
    const viewport = toFlowViewport({ x: -120, y: -40, zoom: 1 })

    expect(edge.type).toBe('canvas-edge')
    expect(edge.source).toBe('a')
    expect(edge.target).toBe('b')
    expect(edge.data?.body).toBe('Edge label\n')
    expect(edge.selectable).toBeUndefined()
    expect(edge.reconnectable).toBeUndefined()
    expect(viewport).toEqual({ x: -120, y: -40, zoom: 1 })
  })

  it('reads built-in shape body prose and structured props without involving the parser', () => {
    const body = `Frame

\`\`\`yaml props
palette: neutral
tone: soft
\`\`\`

\`\`\`json data
{"ignored":true}
\`\`\``

    expect(readBuiltInBodyLabel(body)).toBe('Frame')
    expect(readBuiltInBodyProps<{ palette?: string; tone?: string }>(body)).toEqual({
      palette: 'neutral',
      tone: 'soft'
    })
    expect(readBuiltInBodyParts(body).blocks).toHaveLength(2)
  })

  it('exports built-in renderer contracts for note and shape components', () => {
    expect(BUILT_IN_RENDERER_CONTRACTS.note.supportsMarkdown).toBe(true)
    expect(BUILT_IN_RENDERER_CONTRACTS.image?.category).toBe('image')
    expect(BUILT_IN_RENDERER_CONTRACTS['boardmark.shape.circle']?.category).toBe('shape')
    expect(BUILT_IN_RENDERER_CONTRACTS.note.tokenUsage).toContain('shadow.note')
    expect(Object.keys(BUILT_IN_RENDERER_CONTRACTS)).toHaveLength(7)
  })

  it('renders note and shape defaults from the canonical color contract', () => {
    const noteView = render(createElement(NotebookNoteRenderer, {
      component: 'note',
      nodeId: 'note-1',
      selected: false
    }))
    const noteSurface = noteView.container.querySelector('[data-note-surface="sticky"]') as HTMLDivElement | null

    expect(noteSurface).not.toBeNull()
    expect(noteSurface?.style.background).toContain('255, 245, 191')
    expect(noteSurface?.style.boxShadow).not.toContain('inset')

    const shapeView = render(createElement(RectShapeRenderer, {
      component: 'boardmark.shape.rect',
      nodeId: 'shape-1',
      selected: false
    }))
    const rectSurface = shapeView.container.firstElementChild as HTMLDivElement | null

    expect(rectSurface).not.toBeNull()
    expect(rectSurface?.style.background).toContain('255, 255, 255')
    expect(rectSurface?.style.boxShadow).toContain('#6042D6')
  })
})
