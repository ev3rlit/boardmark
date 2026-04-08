import { Position } from '@xyflow/react'

export type EdgeAnchorBounds = {
  height: number
  width: number
  x: number
  y: number
}

export type EdgeAnchorPath = {
  sourcePosition: Position
  sourceX: number
  sourceY: number
  targetPosition: Position
  targetX: number
  targetY: number
}

export function readEdgeAnchorPath(input: {
  fallback: EdgeAnchorPath
  sourceBounds?: EdgeAnchorBounds
  targetBounds?: EdgeAnchorBounds
}): EdgeAnchorPath {
  const { fallback, sourceBounds, targetBounds } = input

  if (!isValidBounds(sourceBounds) || !isValidBounds(targetBounds)) {
    return fallback
  }

  const sourceCenter = readBoundsCenter(sourceBounds)
  const targetCenter = readBoundsCenter(targetBounds)
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y

  if (dx === 0 && dy === 0) {
    return fallback
  }

  const sourceAnchor = readBoundsIntersection(sourceBounds, dx, dy)
  const targetAnchor = readBoundsIntersection(targetBounds, -dx, -dy)

  if (!sourceAnchor || !targetAnchor) {
    return fallback
  }

  const { sourcePosition, targetPosition } = readAnchorPositions(dx, dy)

  return {
    sourcePosition,
    sourceX: sourceAnchor.x,
    sourceY: sourceAnchor.y,
    targetPosition,
    targetX: targetAnchor.x,
    targetY: targetAnchor.y
  }
}

function isValidBounds(bounds: EdgeAnchorBounds | undefined): bounds is EdgeAnchorBounds {
  if (!bounds) {
    return false
  }

  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  )
}

function readBoundsCenter(bounds: EdgeAnchorBounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  }
}

function readBoundsIntersection(bounds: EdgeAnchorBounds, dx: number, dy: number) {
  const center = readBoundsCenter(bounds)
  const halfWidth = bounds.width / 2
  const halfHeight = bounds.height / 2
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx)
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)

  if (!Number.isFinite(scale) || scale <= 0) {
    return null
  }

  return {
    x: clampNumber(center.x + dx * scale, bounds.x, bounds.x + bounds.width),
    y: clampNumber(center.y + dy * scale, bounds.y, bounds.y + bounds.height)
  }
}

function readAnchorPositions(dx: number, dy: number) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? {
          sourcePosition: Position.Right,
          targetPosition: Position.Left
        }
      : {
          sourcePosition: Position.Left,
          targetPosition: Position.Right
        }
  }

  return dy >= 0
    ? {
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
      }
    : {
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom
      }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
