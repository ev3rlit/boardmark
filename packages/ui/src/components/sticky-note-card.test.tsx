import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StickyNoteCard } from './sticky-note-card'

describe('StickyNoteCard', () => {
  it('renders a square paper-textured note surface', () => {
    const { container } = render(
      <StickyNoteCard>Paper note</StickyNoteCard>
    )

    const card = container.querySelector('[data-note-surface="sticky"]')
    const texture = container.querySelector('[data-note-texture="paper"]')

    expect(card).not.toBeNull()
    expect(card?.className).toContain('rounded-none')
    expect(texture).not.toBeNull()
    expect(screen.getByText('Paper note')).toBeInTheDocument()
  })

  it('preserves caller-provided surface styles', () => {
    const { container } = render(
      <StickyNoteCard style={{ minHeight: 144 }}>
        Sized note
      </StickyNoteCard>
    )

    const card = container.querySelector('[data-note-surface="sticky"]') as HTMLDivElement | null

    expect(card?.style.minHeight).toBe('144px')
  })

  it('drops the paper texture while dragging to keep the surface lightweight', () => {
    const { container } = render(
      <StickyNoteCard dragged>Dragging note</StickyNoteCard>
    )

    const texture = container.querySelector('[data-note-texture="paper"]')
    const card = container.querySelector('[data-note-surface="sticky"]')

    expect(texture).toBeNull()
    expect(card?.className).toContain('will-change-transform')
  })
})
