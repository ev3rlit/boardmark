import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_RENDERER_CONTRACTS,
  toFlowEdge,
  toFlowNode,
  toFlowViewport
} from './index'

const sourceMap = {
  objectRange: {
    start: { line: 1, offset: 0 },
    end: { line: 3, offset: 12 }
  },
  openingLineRange: {
    start: { line: 1, offset: 0 },
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
  it('maps a canvas note to an interactive react flow node', () => {
    const node = toFlowNode({
      id: 'a',
      type: 'note',
      x: 100,
      y: 80,
      w: 360,
      h: 220,
      color: 'yellow',
      content: 'A',
      position: {
        start: { line: 1, offset: 0 },
        end: { line: 3, offset: 12 }
      },
      sourceMap
    })

    expect(node.type).toBe('canvas-note')
    expect(node.position).toEqual({ x: 100, y: 80 })
    expect(node.draggable).toBe(true)
    expect(node.connectable).toBe(true)
    expect(node.width).toBe(360)
    expect(node.height).toBe(220)
    expect(node.initialWidth).toBe(360)
    expect(node.initialHeight).toBe(220)
    expect(node.data.color).toBe('yellow')
    expect(node.data.width).toBe(360)
    expect(node.data.height).toBe(220)
    expect(node.style?.width).toBe(360)
    expect(node.style?.height).toBe(220)
  })

  it('maps a canvas shape to an interactive react flow shape node', () => {
    const node = toFlowNode({
      id: 'shape-a',
      type: 'shape',
      x: 120,
      y: 140,
      w: 420,
      h: 280,
      rendererKey: 'boardmark.shape.roundRect',
      label: 'Frame',
      palette: 'neutral',
      tone: 'soft',
      position: {
        start: { line: 1, offset: 0 },
        end: { line: 3, offset: 12 }
      },
      sourceMap
    })

    expect(node.type).toBe('canvas-shape')
    expect(node.position).toEqual({ x: 120, y: 140 })
    expect(node.data.rendererKey).toBe('boardmark.shape.roundRect')
    expect(node.data.label).toBe('Frame')
    expect(node.style?.width).toBe(420)
    expect(node.style?.height).toBe(280)
  })

  it('maps a canvas edge and viewport to react flow data', () => {
    const edge = toFlowEdge({
      id: 'edge-1',
      from: 'a',
      to: 'b',
      kind: 'curve',
      content: 'Edge',
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
    expect(edge.data?.content).toBe('Edge')
    expect(viewport).toEqual({ x: -120, y: -40, zoom: 1 })
  })

  it('exports built-in renderer contracts for shapes and notes', () => {
    expect(BUILT_IN_RENDERER_CONTRACTS['boardmark.note.sticky']?.supportsMarkdown).toBe(true)
    expect(BUILT_IN_RENDERER_CONTRACTS['boardmark.shape.circle']?.nodeType).toBe('shape')
    expect(BUILT_IN_RENDERER_CONTRACTS['boardmark.note.sticky']?.tokenUsage).toContain(
      'color.object.amber'
    )
    expect(Object.keys(BUILT_IN_RENDERER_CONTRACTS)).toHaveLength(7)
  })
})
