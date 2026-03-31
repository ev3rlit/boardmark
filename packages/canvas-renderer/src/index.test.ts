import { describe, expect, it } from 'vitest'
import { toFlowEdge, toFlowNode, toFlowViewport } from './index'

describe('canvas renderer helpers', () => {
  it('maps a canvas note to a non-draggable react flow node', () => {
    const node = toFlowNode({
      id: 'a',
      type: 'note',
      x: 100,
      y: 80,
      w: 360,
      color: 'yellow',
      content: 'A',
      position: {
        start: { line: 1, offset: 0 },
        end: { line: 3, offset: 12 }
      }
    })

    expect(node.type).toBe('canvas-note')
    expect(node.position).toEqual({ x: 100, y: 80 })
    expect(node.draggable).toBe(false)
    expect(node.data.color).toBe('yellow')
    expect(node.style?.width).toBe(360)
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
      }
    })
    const viewport = toFlowViewport({ x: -120, y: -40, zoom: 1 })

    expect(edge.type).toBe('canvas-edge')
    expect(edge.source).toBe('a')
    expect(edge.target).toBe('b')
    expect(edge.data?.content).toBe('Edge')
    expect(viewport).toEqual({ x: -120, y: -40, zoom: 1 })
  })
})
