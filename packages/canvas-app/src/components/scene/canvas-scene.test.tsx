import { describe, expect, it, vi } from 'vitest'
import { applyNodeChanges, type Node } from '@xyflow/react'
import type { CanvasGroup, CanvasNode } from '@boardmark/canvas-domain'
import {
  applyFlowNodeGeometryDrafts,
  applyNodeChangesToStore,
  mergeFlowNodes,
  readFlowNodes
} from '@canvas-app/components/scene/canvas-scene'
import {
  normalizeTopLevelNodeSelection,
  readCommittedNodeMovesFromDraggedNodes
} from '@canvas-app/components/scene/flow/flow-selection-changes'
import type { CanvasFlowNodeData } from '@boardmark/canvas-renderer'

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

describe('CanvasScene', () => {
  it('maps canvas nodes into react flow nodes without mutating selection state', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        id: 'overview',
        component: 'boardmark.calender',
        at: { x: 380, y: 72, w: 320, h: 220 },
        body: 'Overview\n',
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
    expect(flowNodes[1]?.type).toBe('canvas-component')
  })

  it('applies runtime interaction overrides only to preview nodes', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
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
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
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

  it('keeps drag preview position changes out of store selection writes', () => {
    const replaceSelection = vi.fn()

    applyNodeChangesToStore({
      changes: [
        {
          id: 'welcome',
          type: 'position',
          position: { x: 144, y: 168 },
          dragging: true
        }
      ],
      groups: [],
      replaceSelection,
      selectedEdgeIds: [],
      selectedNodeIds: []
    })

    expect(replaceSelection).not.toHaveBeenCalled()
  })

  it('preserves react flow runtime node state across source-driven updates', () => {
    const nextFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 144, y: 168, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
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

  it('applies local resize drafts without regenerating unrelated flow nodes', () => {
    const flowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        id: 'overview',
        component: 'note',
        at: { x: 380, y: 72, w: 320, h: 220 },
        body: 'Overview\n',
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
    ])

    const resizedFlowNodes = applyFlowNodeGeometryDrafts(flowNodes, {
      welcome: {
        x: 144,
        y: 168,
        width: 420,
        height: 280
      }
    })

    expect(resizedFlowNodes[0]?.position).toEqual({ x: 144, y: 168 })
    expect(resizedFlowNodes[0]?.width).toBe(420)
    expect(resizedFlowNodes[0]?.data.width).toBe(420)
    expect(resizedFlowNodes[0]?.style?.height).toBe(280)
    expect(resizedFlowNodes[1]).toBe(flowNodes[1])
  })

  it('reconciles local drag preview nodes back to store-backed geometry', () => {
    const storeBackedFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const localPreviewFlowNodes = applyNodeChanges(
      [
        {
          id: 'welcome',
          type: 'position',
          position: { x: 144, y: 168 },
          dragging: true
        }
      ],
      storeBackedFlowNodes
    )

    const mergedFlowNodes = mergeFlowNodes(storeBackedFlowNodes, localPreviewFlowNodes)

    expect(mergedFlowNodes[0]?.position).toEqual({ x: 80, y: 72 })
    expect(mergedFlowNodes[0]?.dragging).toBe(true)
  })

  it('reconciles local resize preview geometry back to store-backed geometry', () => {
    const storeBackedFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const localPreviewFlowNodes = applyFlowNodeGeometryDrafts(storeBackedFlowNodes, {
      welcome: {
        x: 144,
        y: 168,
        width: 420,
        height: 280
      }
    })

    const mergedFlowNodes = mergeFlowNodes(storeBackedFlowNodes, localPreviewFlowNodes)

    expect(mergedFlowNodes[0]?.position).toEqual({ x: 80, y: 72 })
    expect(mergedFlowNodes[0]?.width).toBe(320)
    expect(mergedFlowNodes[0]?.height).toBe(220)
  })

  it('maps component nodes into generic flow nodes with width, height, and raw body', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'frame-a',
        component: 'boardmark.shape.roundRect',
        at: { x: 120, y: 140, w: 420, h: 280 },
        body: 'Frame\n\n```yaml props\npalette: neutral\ntone: soft\n```',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    const flowNodes = readFlowNodes(nodes, {}, [], {
      defaultStyle: 'boardmark.editorial.soft'
    })

    expect(flowNodes[0]?.type).toBe('canvas-component')
    expect(flowNodes[0]?.data.component).toBe('boardmark.shape.roundRect')
    expect(flowNodes[0]?.data.body).toContain('palette: neutral')
    expect(flowNodes[0]?.data.resolvedThemeRef).toBe('boardmark.editorial.soft')
    expect(flowNodes[0]?.style?.height).toBe(280)
  })

  it('normalizes grouped member node ids to top-level group ids', () => {
    const groups: CanvasGroup[] = [
      {
        id: 'ideation-group',
        z: 10,
        members: {
          nodeIds: ['welcome', 'overview']
        },
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 5, offset: 0 }
        },
        sourceMap
      }
    ]

    expect(normalizeTopLevelNodeSelection(['welcome', 'overview', 'solo'], groups)).toEqual({
      groupIds: ['ideation-group'],
      nodeIds: ['solo']
    })
  })

  it('normalizes dragged nodes into commit moves using top-level, drilldown, and lock rules', () => {
    const groups: CanvasGroup[] = [
      {
        id: 'ideation-group',
        z: 10,
        members: {
          nodeIds: ['welcome', 'overview']
        },
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 5, offset: 0 }
        },
        sourceMap
      }
    ]
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        id: 'overview',
        component: 'note',
        at: { x: 380, y: 72, w: 320, h: 220 },
        body: 'Overview\n',
        locked: true,
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
      },
      {
        id: 'solo',
        component: 'note',
        at: { x: 760, y: 72, w: 320, h: 220 },
        body: 'Solo\n',
        position: {
          start: { line: 9, offset: 0 },
          end: { line: 11, offset: 12 }
        },
        sourceMap: {
          ...sourceMap,
          objectRange: {
            start: { line: 9, offset: 0 },
            end: { line: 11, offset: 12 }
          }
        }
      }
    ]
    const draggedNodes = readFlowNodes(nodes)

    expect(readCommittedNodeMovesFromDraggedNodes({
      draggedNodes: [
        {
          ...draggedNodes[0]!,
          position: { x: 111.6, y: 155.2 }
        },
        {
          ...draggedNodes[1]!,
          position: { x: 420, y: 180 }
        },
        {
          ...draggedNodes[2]!,
          position: { x: 810.4, y: 166.8 }
        }
      ],
      groupSelectionState: {
        status: 'group-selected',
        groupId: 'ideation-group'
      },
      groups,
      nodes
    })).toEqual([
      {
        nodeId: 'solo',
        x: 810,
        y: 167
      }
    ])

    expect(readCommittedNodeMovesFromDraggedNodes({
      draggedNodes: [
        {
          ...draggedNodes[0]!,
          position: { x: 112.2, y: 156.8 }
        }
      ],
      groupSelectionState: {
        status: 'drilldown',
        groupId: 'ideation-group',
        nodeId: 'welcome'
      },
      groups,
      nodes
    })).toEqual([
      {
        nodeId: 'welcome',
        x: 112,
        y: 157
      }
    ])
  })
})
