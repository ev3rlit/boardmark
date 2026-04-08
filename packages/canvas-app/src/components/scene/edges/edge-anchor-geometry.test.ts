import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'
import {
  readEdgeAnchorPath,
  type EdgeAnchorBounds,
  type EdgeAnchorPath
} from '@canvas-app/components/scene/edges/edge-anchor-geometry'

const fallback: EdgeAnchorPath = {
  sourcePosition: Position.Right,
  sourceX: 10,
  sourceY: 20,
  targetPosition: Position.Left,
  targetX: 30,
  targetY: 40
}

describe('edge anchor geometry', () => {
  it.each([
    {
      name: 'selects right-to-left anchors for nodes laid out horizontally',
      sourceBounds: { x: 0, y: 0, width: 100, height: 60 },
      targetBounds: { x: 200, y: 0, width: 100, height: 60 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      sourcePoint: { x: 100, y: 30 },
      targetPoint: { x: 200, y: 30 }
    },
    {
      name: 'selects left-to-right anchors when the source is to the right',
      sourceBounds: { x: 200, y: 0, width: 100, height: 60 },
      targetBounds: { x: 0, y: 0, width: 100, height: 60 },
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
      sourcePoint: { x: 200, y: 30 },
      targetPoint: { x: 100, y: 30 }
    },
    {
      name: 'selects bottom-to-top anchors for vertical stacks',
      sourceBounds: { x: 0, y: 0, width: 100, height: 60 },
      targetBounds: { x: 0, y: 200, width: 100, height: 60 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      sourcePoint: { x: 50, y: 60 },
      targetPoint: { x: 50, y: 200 }
    },
    {
      name: 'selects top-to-bottom anchors when the source is below the target',
      sourceBounds: { x: 0, y: 200, width: 100, height: 60 },
      targetBounds: { x: 0, y: 0, width: 100, height: 60 },
      sourcePosition: Position.Top,
      targetPosition: Position.Bottom,
      sourcePoint: { x: 50, y: 200 },
      targetPoint: { x: 50, y: 60 }
    }
  ])('$name', ({ sourceBounds, targetBounds, sourcePosition, targetPosition, sourcePoint, targetPoint }) => {
    const path = readEdgeAnchorPath({
      fallback,
      sourceBounds,
      targetBounds
    })

    expect(path.sourcePosition).toBe(sourcePosition)
    expect(path.targetPosition).toBe(targetPosition)
    expect(path.sourceX).toBeCloseTo(sourcePoint.x, 5)
    expect(path.sourceY).toBeCloseTo(sourcePoint.y, 5)
    expect(path.targetX).toBeCloseTo(targetPoint.x, 5)
    expect(path.targetY).toBeCloseTo(targetPoint.y, 5)
  })

  it('keeps diagonal anchors on the perimeter of each bounding box', () => {
    const sourceBounds: EdgeAnchorBounds = { x: 40, y: 80, width: 120, height: 80 }
    const targetBounds: EdgeAnchorBounds = { x: 280, y: 220, width: 160, height: 120 }
    const path = readEdgeAnchorPath({
      fallback,
      sourceBounds,
      targetBounds
    })

    expect(path.sourcePosition).toBe(Position.Right)
    expect(path.targetPosition).toBe(Position.Left)
    expectPointOnPerimeter(sourceBounds, { x: path.sourceX, y: path.sourceY })
    expectPointOnPerimeter(targetBounds, { x: path.targetX, y: path.targetY })
  })

  it('falls back when geometry is missing', () => {
    expect(readEdgeAnchorPath({
      fallback,
      sourceBounds: { x: 0, y: 0, width: 100, height: 60 }
    })).toEqual(fallback)
  })

  it('falls back when both node centers overlap', () => {
    const overlappingBounds = { x: 0, y: 0, width: 100, height: 60 }

    expect(readEdgeAnchorPath({
      fallback,
      sourceBounds: overlappingBounds,
      targetBounds: overlappingBounds
    })).toEqual(fallback)
  })
})

function expectPointOnPerimeter(
  bounds: EdgeAnchorBounds,
  point: {
    x: number
    y: number
  }
) {
  const touchesVerticalEdge = closeTo(point.x, bounds.x) || closeTo(point.x, bounds.x + bounds.width)
  const touchesHorizontalEdge = closeTo(point.y, bounds.y) || closeTo(point.y, bounds.y + bounds.height)

  expect(point.x).toBeGreaterThanOrEqual(bounds.x)
  expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width)
  expect(point.y).toBeGreaterThanOrEqual(bounds.y)
  expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height)
  expect(touchesVerticalEdge || touchesHorizontalEdge).toBe(true)
}

function closeTo(left: number, right: number) {
  return Math.abs(left - right) < 0.00001
}
