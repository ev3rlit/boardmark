import { describe, expect, it } from 'vitest'
import type { CanvasNode } from '@boardmark/canvas-domain'
import { readFlowNodes } from './canvas-scene'

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
        }
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
        }
      }
    ]

    const flowNodes = readFlowNodes(nodes)

    expect(flowNodes[0]?.id).toBe('welcome')
    expect(flowNodes[1]?.id).toBe('overview')
    expect(flowNodes[0]?.selected).toBeUndefined()
  })
})
