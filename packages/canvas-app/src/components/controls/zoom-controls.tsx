import { Check, Ellipsis, Expand, Grid2x2, Minus, Plus, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'
import type { CanvasStore } from '@canvas-app/store/canvas-store'
import { matchesEscapeKey } from '@canvas-app/keyboard/key-event-matchers'

export type ZoomControlsMenuItem = {
  checked?: boolean
  icon?: LucideIcon
  id: string
  kind?: 'action' | 'toggle'
  label: string
  onSelect: () => void
}

type ZoomControlsProps = {
  canFitCanvas: boolean
  dispatchCanvasInput: (input: CanvasMatchedInput) => boolean
  menuItems?: ZoomControlsMenuItem[]
  onFitCanvas: () => void
  store: CanvasStore
}

export function ZoomControls({
  canFitCanvas,
  dispatchCanvasInput,
  menuItems = [],
  onFitCanvas,
  store
}: ZoomControlsProps) {
  const viewport = useStore(store, (state) => state.viewport)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (!menuRef.current?.contains(target)) {
        setIsMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesEscapeKey(event)) {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMenuOpen])

  return (
    <div
      className="viewer-control-group"
      ref={menuRef}
    >
      <button
        aria-label="Fit canvas"
        className="viewer-control-button"
        disabled={!canFitCanvas}
        onClick={onFitCanvas}
        type="button"
      >
        <Expand
          aria-hidden="true"
          className="viewer-control-icon viewer-control-icon--zoom"
        />
        <span className="sr-only">Fit canvas</span>
      </button>
      <button
        aria-label="Zoom out"
        className="viewer-control-button"
        onClick={() => {
          dispatchCanvasInput({
            allowEditableTarget: true,
            intent: {
              kind: 'viewport-zoom',
              source: 'keyboard',
              mode: 'step',
              direction: 'out',
              target: null
            },
            preventDefault: false
          })
        }}
        type="button"
      >
        <Minus
          aria-hidden="true"
          className="viewer-control-icon viewer-control-icon--zoom"
        />
        <span className="sr-only">Zoom out</span>
      </button>
      <div className="viewer-control-readout">
        {Math.round(viewport.zoom * 100)}%
      </div>
      <button
        aria-label="Zoom in"
        className="viewer-control-button"
        onClick={() => {
          dispatchCanvasInput({
            allowEditableTarget: true,
            intent: {
              kind: 'viewport-zoom',
              source: 'keyboard',
              mode: 'step',
              direction: 'in',
              target: null
            },
            preventDefault: false
          })
        }}
        type="button"
      >
        <Plus
          aria-hidden="true"
          className="viewer-control-icon viewer-control-icon--zoom"
        />
        <span className="sr-only">Zoom in</span>
      </button>
      {menuItems.length > 0 ? (
        <div className="relative">
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label="Zoom options"
            className={[
              'viewer-control-button',
              isMenuOpen ? 'viewer-control-button--active' : ''
            ].join(' ')}
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            <Ellipsis
              aria-hidden="true"
              className="viewer-control-icon viewer-control-icon--zoom"
            />
            <span className="sr-only">Zoom options</span>
          </button>
          {isMenuOpen ? (
            <div
              className="viewer-context-menu bottom-[calc(100%+0.75rem)] right-0 min-w-52"
              role="menu"
            >
              <div className="viewer-context-menu-section">
                {menuItems.map((item) => {
                  const Icon = item.icon ?? Grid2x2
                  const isToggle = item.kind === 'toggle'

                  return (
                    <button
                      aria-checked={isToggle ? Boolean(item.checked) : undefined}
                      className="viewer-context-menu-item"
                      key={item.id}
                      onClick={() => {
                        item.onSelect()
                        setIsMenuOpen(false)
                      }}
                      role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
                      type="button"
                    >
                      <Icon
                        aria-hidden="true"
                        className="viewer-context-menu-icon"
                      />
                      <span className="flex-1">{item.label}</span>
                      {isToggle && item.checked ? (
                        <Check
                          aria-hidden="true"
                          className="viewer-context-menu-icon"
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
