import type {
  GuideAdjustment,
  GuideAxis,
  GuideAxisAdjustment,
  GuideAxisBehavior,
  GuideFrame,
  GuideReference,
  GuideViewport
} from '@canvas-app/features/smart-guides/contracts'

const MIN_FRAME_SIZE = 1

export function readGuideReferences(behavior: GuideAxisBehavior): GuideReference[] {
  switch (behavior) {
    case 'translate':
      return ['center', 'min', 'max']

    case 'resize-from-min':
      return ['min']

    case 'resize-from-max':
      return ['max']

    case 'disabled':
      return []
  }
}

export function readFrameReference(
  frame: GuideFrame,
  axis: GuideAxis,
  reference: GuideReference
) {
  if (axis === 'x') {
    if (reference === 'min') {
      return frame.x
    }

    if (reference === 'center') {
      return frame.x + frame.width / 2
    }

    return frame.x + frame.width
  }

  if (reference === 'min') {
    return frame.y
  }

  if (reference === 'center') {
    return frame.y + frame.height / 2
  }

  return frame.y + frame.height
}

export function readViewportFrame(viewport: GuideViewport): GuideFrame {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1
  const width = viewport.width > 0 ? viewport.width / zoom : 0
  const height = viewport.height > 0 ? viewport.height / zoom : 0

  return {
    id: 'viewport',
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width,
    height
  }
}

export function expandGuideFrame(frame: GuideFrame, margin: number): GuideFrame {
  return {
    ...frame,
    x: frame.x - margin,
    y: frame.y - margin,
    width: frame.width + margin * 2,
    height: frame.height + margin * 2
  }
}

export function mergeGuideFrames(id: string, frames: GuideFrame[]): GuideFrame {
  if (frames.length === 0) {
    return {
      id,
      x: 0,
      y: 0,
      width: MIN_FRAME_SIZE,
      height: MIN_FRAME_SIZE
    }
  }

  const left = Math.min(...frames.map((frame) => frame.x))
  const top = Math.min(...frames.map((frame) => frame.y))
  const right = Math.max(...frames.map((frame) => frame.x + frame.width))
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height))

  return {
    id,
    x: left,
    y: top,
    width: Math.max(MIN_FRAME_SIZE, right - left),
    height: Math.max(MIN_FRAME_SIZE, bottom - top)
  }
}

export function intersectGuideFrames(left: GuideFrame, right: GuideFrame) {
  return !(
    left.x + left.width < right.x ||
    right.x + right.width < left.x ||
    left.y + left.height < right.y ||
    right.y + right.height < left.y
  )
}

export function readGuideFrameDistanceSq(left: GuideFrame, right: GuideFrame) {
  const dx = readFrameReference(left, 'x', 'center') - readFrameReference(right, 'x', 'center')
  const dy = readFrameReference(left, 'y', 'center') - readFrameReference(right, 'y', 'center')

  return dx * dx + dy * dy
}

export function readGuideOverlapRange(
  left: GuideFrame,
  right: GuideFrame,
  axis: GuideAxis
) {
  if (axis === 'x') {
    const start = Math.max(left.x, right.x)
    const end = Math.min(left.x + left.width, right.x + right.width)

    return end > start ? { end, start } : null
  }

  const start = Math.max(left.y, right.y)
  const end = Math.min(left.y + left.height, right.y + right.height)

  return end > start ? { end, start } : null
}

export function applyGuideAdjustments(input: {
  adjustment: GuideAdjustment | null
  frame: GuideFrame
  xBehavior: GuideAxisBehavior
  yBehavior: GuideAxisBehavior
}) {
  let nextFrame = { ...input.frame }

  if (input.adjustment?.x) {
    nextFrame = applyGuideAxisAdjustment(nextFrame, input.adjustment.x, input.xBehavior)
  }

  if (input.adjustment?.y) {
    nextFrame = applyGuideAxisAdjustment(nextFrame, input.adjustment.y, input.yBehavior)
  }

  return roundGuideFrame(nextFrame)
}

function applyGuideAxisAdjustment(
  frame: GuideFrame,
  adjustment: GuideAxisAdjustment,
  behavior: GuideAxisBehavior
) {
  if (behavior === 'disabled') {
    return frame
  }

  if (adjustment.axis === 'x') {
    return applyHorizontalGuideAxisAdjustment(frame, adjustment, behavior)
  }

  return applyVerticalGuideAxisAdjustment(frame, adjustment, behavior)
}

function applyHorizontalGuideAxisAdjustment(
  frame: GuideFrame,
  adjustment: GuideAxisAdjustment,
  behavior: GuideAxisBehavior
) {
  if (behavior === 'translate') {
    return {
      ...frame,
      x: readTranslatedAxisOrigin(frame.width, adjustment)
    }
  }

  if (behavior === 'resize-from-min') {
    const right = frame.x + frame.width

    return {
      ...frame,
      x: adjustment.target,
      width: Math.max(MIN_FRAME_SIZE, right - adjustment.target)
    }
  }

  return {
    ...frame,
    width: Math.max(MIN_FRAME_SIZE, adjustment.target - frame.x)
  }
}

function applyVerticalGuideAxisAdjustment(
  frame: GuideFrame,
  adjustment: GuideAxisAdjustment,
  behavior: GuideAxisBehavior
) {
  if (behavior === 'translate') {
    return {
      ...frame,
      y: readTranslatedAxisOrigin(frame.height, adjustment)
    }
  }

  if (behavior === 'resize-from-min') {
    const bottom = frame.y + frame.height

    return {
      ...frame,
      y: adjustment.target,
      height: Math.max(MIN_FRAME_SIZE, bottom - adjustment.target)
    }
  }

  return {
    ...frame,
    height: Math.max(MIN_FRAME_SIZE, adjustment.target - frame.y)
  }
}

function readTranslatedAxisOrigin(size: number, adjustment: GuideAxisAdjustment) {
  if (adjustment.reference === 'min') {
    return adjustment.target
  }

  if (adjustment.reference === 'center') {
    return adjustment.target - size / 2
  }

  return adjustment.target - size
}

function roundGuideFrame(frame: GuideFrame): GuideFrame {
  return {
    ...frame,
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.max(MIN_FRAME_SIZE, Math.round(frame.width)),
    height: Math.max(MIN_FRAME_SIZE, Math.round(frame.height))
  }
}

