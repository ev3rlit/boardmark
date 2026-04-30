import type { CSSProperties } from 'react'
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH
} from '@boardmark/canvas-domain'

const NOTE_CARD_HORIZONTAL_PADDING = 40
const NOTE_CARD_VERTICAL_PADDING = 32

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

  return {
    '--markdown-body-height': `${bodyHeight}px`,
    '--markdown-body-width': `${bodyWidth}px`,
    '--markdown-block-max-height': autoHeight
      ? 'none'
      : `max(96px, calc(${bodyHeight}px - 0.75rem))`,
    '--markdown-mermaid-svg-height': autoHeight ? 'auto' : '100%',
    '--markdown-mermaid-viewport-height': autoHeight
      ? 'auto'
      : `min(var(--markdown-block-max-height), max(8rem, calc(${bodyHeight}px * 0.72)))`
  } as CSSProperties
}
