import type { CSSProperties } from 'react'
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH
} from '@boardmark/canvas-domain'

const NOTE_CARD_HORIZONTAL_PADDING = 40
const NOTE_CARD_VERTICAL_PADDING = 32
const NOTE_CONTENT_BASE_WIDTH = Math.max(1, DEFAULT_NOTE_WIDTH - NOTE_CARD_HORIZONTAL_PADDING)
const NOTE_CONTENT_BASE_HEIGHT = Math.max(1, DEFAULT_NOTE_HEIGHT - NOTE_CARD_VERTICAL_PADDING)
const NOTE_CONTENT_SCALE_FLOOR = 0.4

export type MarkdownLayoutStyleInput = {
  autoHeight: boolean
  height?: number
  width?: number
}

export function readMarkdownLayoutStyle({
  autoHeight,
  height,
  width
}: MarkdownLayoutStyleInput): CSSProperties {
  const bodyWidth = Math.max(1, Math.round((width ?? DEFAULT_NOTE_WIDTH) - NOTE_CARD_HORIZONTAL_PADDING))
  const bodyHeight = Math.max(1, Math.round((height ?? DEFAULT_NOTE_HEIGHT) - NOTE_CARD_VERTICAL_PADDING))
  const scaleX = bodyWidth / NOTE_CONTENT_BASE_WIDTH
  const scaleY = bodyHeight / NOTE_CONTENT_BASE_HEIGHT
  const scale = Math.max(
    NOTE_CONTENT_SCALE_FLOOR,
    autoHeight ? scaleX : Math.min(scaleX, scaleY)
  )

  return {
    '--markdown-body-height': `${bodyHeight}px`,
    '--markdown-body-width': `${bodyWidth}px`,
    '--markdown-block-max-height': autoHeight
      ? 'none'
      : `max(96px, calc(${bodyHeight}px - 0.75rem * ${scale}))`,
    '--markdown-mermaid-svg-height': autoHeight ? 'auto' : '100%',
    '--markdown-mermaid-viewport-height': autoHeight
      ? 'auto'
      : `min(var(--markdown-block-max-height), max(calc(8rem * ${scale}), calc(${bodyHeight}px * 0.72)))`,
    '--markdown-scale': `${scale}`,
    '--markdown-scale-x': `${scaleX}`,
    '--markdown-scale-y': `${scaleY}`
  } as CSSProperties
}
