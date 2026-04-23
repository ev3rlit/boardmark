import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { CanvasFlowNodeData } from '@boardmark/canvas-renderer'
import { createGuideSession } from '@canvas-app/features/smart-guides/guide-session'
import {
  readDragGuidePreview,
  readResizeGuidePreview
} from '@canvas-app/features/smart-guides/scene-guide-preview'

const guideSession = createGuideSession()

describe('smart guides and snapping', () => {
  it('prefers object alignment snapping over grid snapping when both are available', () => {
    const result = guideSession.evaluate({
      activeFrame: {
        id: 'active',
        x: 196,
        y: 120,
        width: 120,
        height: 80
      },
      candidateFrames: [
        {
          id: 'target',
          x: 200,
          y: 60,
          width: 140,
          height: 180
        }
      ],
      interaction: 'drag',
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
        width: 1200,
        height: 800
      },
      xBehavior: 'translate',
      yBehavior: 'translate'
    })

    expect(result.adjustedFrame.x).toBe(200)
    expect(result.overlay.lines.some((line) => {
      return line.axis === 'x' && line.moduleId === 'object-alignment-snapping'
    })).toBe(true)
    expect(result.overlay.lines.some((line) => {
      return line.axis === 'x' && line.moduleId === 'grid-snapping'
    })).toBe(false)
  })

  it('falls back to grid snapping when no object alignment candidate is present', () => {
    const result = guideSession.evaluate({
      activeFrame: {
        id: 'active',
        x: 49,
        y: 77,
        width: 120,
        height: 80
      },
      candidateFrames: [],
      interaction: 'drag',
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
        width: 1200,
        height: 800
      },
      xBehavior: 'translate',
      yBehavior: 'translate'
    })

    expect(result.adjustedFrame.x).toBe(48)
    expect(result.overlay.lines.some((line) => line.moduleId === 'grid-snapping')).toBe(true)
  })

  it('renders equal-spacing guides without moving the frame', () => {
    const result = guideSession.evaluate({
      activeFrame: {
        id: 'middle',
        x: 150,
        y: 100,
        width: 100,
        height: 100
      },
      candidateFrames: [
        {
          id: 'left',
          x: 0,
          y: 100,
          width: 100,
          height: 100
        },
        {
          id: 'right',
          x: 300,
          y: 100,
          width: 100,
          height: 100
        }
      ],
      interaction: 'drag',
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
        width: 1200,
        height: 800
      },
      xBehavior: 'translate',
      yBehavior: 'translate'
    })

    expect(result.adjustedFrame).toEqual({
      id: 'middle',
      x: 150,
      y: 100,
      width: 100,
      height: 100
    })
    expect(result.overlay.lines.filter((line) => line.role === 'spacing')).toHaveLength(2)
  })

  it('snaps multi-selection drag previews using the selection bounding box', () => {
    const preview = readDragGuidePreview({
      draggedNodeId: 'left-selected',
      draggedNodeIds: ['left-selected', 'right-selected'],
      flowNodes: [
        createFlowNode('left-selected', 132, 96, 100, 80),
        createFlowNode('right-selected', 272, 96, 100, 80),
        createFlowNode('anchor', 200, 40, 100, 220)
      ],
      guideSession,
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      },
      viewportSize: {
        width: 1200,
        height: 800
      }
    })

    expect(preview).not.toBeNull()
    expect(preview?.nodePositions.get('left-selected')).toEqual({ x: 130, y: 96 })
    expect(preview?.nodePositions.get('right-selected')).toEqual({ x: 270, y: 96 })
  })

  it('leaves unsnapped drag preview positions to the flow runtime', () => {
    const preview = readDragGuidePreview({
      draggedNodeId: 'floating',
      draggedNodeIds: ['floating'],
      flowNodes: [
        createFlowNode('floating', 131.7, 103.4, 95, 73),
        createFlowNode('far-away', 480, 320, 120, 120)
      ],
      guideSession,
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      },
      viewportSize: {
        width: 1200,
        height: 800
      }
    })

    expect(preview).toBeNull()
  })

  it('keeps a drag snap latched until the pointer clearly leaves the release zone', () => {
    const initialPreview = readDragGuidePreview({
      draggedNodeId: 'dragged',
      draggedNodeIds: ['dragged'],
      flowNodes: [
        createFlowNode('dragged', 49, 120, 120, 80)
      ],
      guideSession,
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      },
      viewportSize: {
        width: 1200,
        height: 800
      }
    })

    expect(initialPreview).not.toBeNull()

    const retainedPreview = readDragGuidePreview({
      draggedNodeId: 'dragged',
      draggedNodeIds: ['dragged'],
      flowNodes: [
        createFlowNode('dragged', 55.2, 120, 120, 80)
      ],
      guideSession,
      previousSnapState: initialPreview?.snapState,
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      },
      viewportSize: {
        width: 1200,
        height: 800
      }
    })

    expect(retainedPreview?.nodePositions.get('dragged')).toEqual({
      x: 48,
      y: 120
    })
  })

  it('keeps resize preview and commit geometry on the same snapped frame', () => {
    const preview = readResizeGuidePreview({
      baseFlowNodes: [
        createFlowNode('resizing', 100, 100, 100, 80),
        createFlowNode('anchor', 144, 40, 120, 220)
      ],
      flowNodes: [
        createFlowNode('resizing', 100, 100, 100, 80),
        createFlowNode('anchor', 144, 40, 120, 220)
      ],
      geometry: {
        x: 146,
        y: 100,
        width: 54,
        height: 80
      },
      guideSession,
      nodeId: 'resizing',
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      },
      viewportSize: {
        width: 1200,
        height: 800
      }
    })

    expect(preview?.geometry).toEqual({
      x: 144,
      y: 100,
      width: 56,
      height: 80
    })
  })
})

function createFlowNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): Node<CanvasFlowNodeData> {
  return {
    id,
    type: 'canvas-note',
    position: {
      x,
      y
    },
    data: {
      id,
      component: 'note',
      width,
      height
    },
    width,
    height,
    style: {
      width,
      height
    }
  }
}
