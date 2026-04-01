import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { CanvasNode } from '@boardmark/canvas-domain'
import {
  applyNodeChangesToStore,
  mergeFlowNodes,
  readFlowNodes
} from '@canvas-app/components/scene/canvas-scene'
import type { CanvasFlowNodeData } from '@boardmark/canvas-renderer'

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
        w: 320,
        h: 220,
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
        w: 320,
        h: 220,
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
        h: 220,
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
        w: 420,
        h: 280
      }
    })

    expect(flowNodes[0]?.position).toEqual({ x: 140, y: 164 })
    expect(flowNodes[0]?.style?.width).toBe(420)
    expect(flowNodes[0]?.style?.height).toBe(280)
  })

  it('projects selected node ids back into controlled flow nodes', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        type: 'note',
        x: 80,
        y: 72,
        w: 320,
        h: 220,
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

  it('uses onNodesChange position updates for drag preview state', () => {
    const previewNodeMove = vi.fn()
    const replaceSelectedNodes = vi.fn()

    applyNodeChangesToStore({
      changes: [
        {
          id: 'welcome',
          type: 'position',
          position: { x: 144, y: 168 },
          dragging: true
        }
      ],
      previewNodeMove,
      replaceSelectedNodes,
      selectedNodeIds: []
    })

    expect(previewNodeMove).toHaveBeenCalledWith('welcome', 144, 168)
    expect(replaceSelectedNodes).not.toHaveBeenCalled()
  })

  it('projects selection changes back into the controlled selection state', () => {
    const previewNodeMove = vi.fn()
    const replaceSelectedNodes = vi.fn()

    applyNodeChangesToStore({
      changes: [
        {
          id: 'welcome',
          type: 'select',
          selected: true
        },
        {
          id: 'overview',
          type: 'select',
          selected: false
        }
      ],
      previewNodeMove,
      replaceSelectedNodes,
      selectedNodeIds: ['overview']
    })

    expect(previewNodeMove).not.toHaveBeenCalled()
    expect(replaceSelectedNodes).toHaveBeenCalledWith(['welcome'])
  })

  it('preserves react flow runtime node state across source-driven updates', () => {
    const nextFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        type: 'note',
        x: 144,
        y: 168,
        w: 320,
        h: 220,
        content: 'Boardmark Viewer',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const currentFlowNodes: Node<CanvasFlowNodeData>[] = [
      {
        ...nextFlowNodes[0]!,
        dragging: true,
        height: 160,
        measured: {
          width: 320,
          height: 160
        },
        width: 320
      }
    ]

    const mergedFlowNodes = mergeFlowNodes(nextFlowNodes, currentFlowNodes)

    expect(mergedFlowNodes[0]?.position).toEqual({ x: 144, y: 168 })
    expect(mergedFlowNodes[0]?.measured).toEqual({ width: 320, height: 160 })
    expect(mergedFlowNodes[0]?.dragging).toBe(true)
    expect(mergedFlowNodes[0]?.width).toBe(320)
    expect(mergedFlowNodes[0]?.height).toBe(160)
  })

  it('maps shape nodes into dedicated flow nodes with width and height', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'frame-a',
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
      }
    ]

    const flowNodes = readFlowNodes(nodes)

    expect(flowNodes[0]?.type).toBe('canvas-shape')
    expect(flowNodes[0]?.data.rendererKey).toBe('boardmark.shape.roundRect')
    expect(flowNodes[0]?.style?.height).toBe(280)
  })
})
