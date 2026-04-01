import { describe, expect, it } from 'vitest'
import type { CanvasNode } from '@boardmark/canvas-domain'
import { readFlowNodes } from '@canvas-app/components/scene/canvas-scene'

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

describe('CanvasScene', () => {
  it('maps canvas nodes into react flow nodes without mutating selection state', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        type: 'note',
        x: 80,
        y: 72,
        content: 'Boardmark Viewer',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        id: 'overview',
        type: 'note',
        x: 380,
        y: 72,
        content: 'Overview',
        position: {
          start: { line: 5, offset: 0 },
          end: { line: 7, offset: 12 }
        },
        sourceMap: {
          ...sourceMap,
          objectRange: {
            start: { line: 5, offset: 0 },
            end: { line: 7, offset: 12 }
          }
        }
      }
    ]

    const flowNodes = readFlowNodes(nodes)

    expect(flowNodes[0]?.id).toBe('welcome')
    expect(flowNodes[1]?.id).toBe('overview')
    expect(flowNodes[0]?.selected).toBe(false)
  })

  it('applies runtime interaction overrides only to preview nodes', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        type: 'note',
        x: 80,
        y: 72,
        w: 320,
        content: 'Boardmark Viewer',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    const flowNodes = readFlowNodes(nodes, {
      welcome: {
        x: 140,
        y: 164,
        w: 420
      }
    })

    expect(flowNodes[0]?.position).toEqual({ x: 140, y: 164 })
    expect(flowNodes[0]?.style?.width).toBe(420)
  })

  it('projects selected node ids back into controlled flow nodes', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        type: 'note',
        x: 80,
        y: 72,
        content: 'Boardmark Viewer',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    const flowNodes = readFlowNodes(nodes, {}, ['welcome'])

    expect(flowNodes[0]?.selected).toBe(true)
  })
})
