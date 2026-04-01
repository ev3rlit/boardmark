import { describe, expect, it } from 'vitest'
import type { CanvasNode } from '@boardmark/canvas-domain'
import { readFlowNodes } from './canvas-scene'

describe('CanvasScene', () => {
  it('maps the store selection set onto flow nodes', () => {
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

    const flowNodes = readFlowNodes(nodes, ['welcome', 'overview'])

    expect(flowNodes[0]?.selected).toBe(true)
    expect(flowNodes[1]?.selected).toBe(true)
  })
})
