import { useEffect, useRef, useState } from 'react'
import {
  Circle,
  Expand,
  Frame,
  Hand,
  ImagePlus,
  MousePointer2,
  Shapes,
  Shrink,
  Square,
  StickyNote,
  Triangle,
  type LucideIcon
} from 'lucide-react'
import { getBuiltInRendererContract } from '@boardmark/canvas-renderer'
import { useStore } from 'zustand'
import type { CanvasShapeNode } from '@boardmark/canvas-domain'
import { readActiveToolMode, type CanvasStore } from '@canvas-app/store/canvas-store'

type ToolMenuProps = {
  isFullscreen: boolean
  onToggleFullscreen: () => void
  store: CanvasStore
}

export function ToolMenu({ isFullscreen, onToggleFullscreen, store }: ToolMenuProps) {
  const createFrameAtViewport = useStore(store, (state) => state.createFrameAtViewport)
  const createNoteAtViewport = useStore(store, (state) => state.createNoteAtViewport)
  const createShapeAtViewport = useStore(store, (state) => state.createShapeAtViewport)
  const editingState = useStore(store, (state) => state.editingState)
  const setToolMode = useStore(store, (state) => state.setToolMode)
  const activeToolMode = useStore(store, readActiveToolMode)
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false)
  const shapeMenuRef = useRef<HTMLDivElement | null>(null)
  const isBusy = editingState.status !== 'idle'

  useEffect(() => {
    if (!isShapeMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!shapeMenuRef.current?.contains(event.target as Node)) {
        setIsShapeMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsShapeMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isShapeMenuOpen])

  return (
    <div
      aria-label="Canvas tools"
      className="viewer-control-group viewer-control-group--tool-menu"
      role="toolbar"
    >
      <ToolMenuButton
        active={activeToolMode === 'select'}
        icon={MousePointer2}
        label="Select"
        onClick={() => setToolMode('select')}
      />
      <ToolMenuButton
        active={activeToolMode === 'pan'}
        icon={Hand}
        label="Pan"
        onClick={() => setToolMode('pan')}
      />
      <ToolMenuButton
        className="viewer-control-button--spaced"
        disabled={isBusy}
        icon={StickyNote}
        label="New note"
        onClick={() => void createNoteAtViewport()}
      />

      <div
        className="relative"
        ref={shapeMenuRef}
      >
        <ToolMenuButton
          active={isShapeMenuOpen}
          className="viewer-control-button--spaced"
          disabled={isBusy}
          icon={Shapes}
          label="Shape"
          onClick={() => setIsShapeMenuOpen((current) => !current)}
        />
        {isShapeMenuOpen ? (
          <div
            className="viewer-context-menu bottom-[calc(100%+0.75rem)] left-0"
            role="menu"
          >
            <div className="viewer-context-menu-section">
              {SHAPE_MENU_ITEMS.map((item) => (
                <button
                  key={item.rendererKey}
                  className="viewer-context-menu-item"
                  onClick={() => {
                    const contract = getBuiltInRendererContract(item.rendererKey)
                    setIsShapeMenuOpen(false)
                    void createShapeAtViewport({
                      height: contract.defaultSize.height,
                      label: item.label,
                      palette: item.palette,
                      rendererKey: item.rendererKey,
                      tone: item.tone,
                      width: contract.defaultSize.width
                    })
                  }}
                  role="menuitem"
                  type="button"
                >
                  <item.icon
                    aria-hidden="true"
                    className="viewer-context-menu-icon"
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <ToolMenuButton
        className="viewer-control-button--spaced"
        disabled={isBusy}
        icon={Frame}
        label="Frame"
        onClick={() => void createFrameAtViewport()}
      />
      <ToolMenuButton
        className="viewer-control-button--pending"
        disabled
        icon={ImagePlus}
        label="Image"
        onClick={() => undefined}
        title="Image coming soon"
      />
      <ToolMenuButton
        active={isFullscreen}
        className="viewer-control-button--spaced"
        icon={isFullscreen ? Shrink : Expand}
        label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        onClick={onToggleFullscreen}
      />
    </div>
  )
}

type ToolMenuButtonProps = {
  active?: boolean
  className?: string
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
  title?: string
}

function ToolMenuButton({
  active = false,
  className,
  disabled = false,
  icon: Icon,
  label,
  onClick,
  title
}: ToolMenuButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={[
        'viewer-control-button',
        'viewer-control-button--tool-menu',
        active ? 'viewer-control-button--active' : '',
        className ? ` ${className}` : ''
      ].join(' ').trim()}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className="viewer-control-icon viewer-control-icon--tool-menu"
      />
      <span className="sr-only">{label}</span>
    </button>
  )
}

const SHAPE_MENU_ITEMS: Array<{
  icon: LucideIcon
  label: string
  palette: NonNullable<CanvasShapeNode['palette']>
  rendererKey: CanvasShapeNode['rendererKey']
  tone: NonNullable<CanvasShapeNode['tone']>
}> = [
  {
    icon: Square,
    label: 'Rectangle',
    palette: 'neutral',
    rendererKey: 'boardmark.shape.rect',
    tone: 'default'
  },
  {
    icon: Square,
    label: 'Rounded rectangle',
    palette: 'blue',
    rendererKey: 'boardmark.shape.roundRect',
    tone: 'soft'
  },
  {
    icon: Circle,
    label: 'Ellipse',
    palette: 'green',
    rendererKey: 'boardmark.shape.ellipse',
    tone: 'soft'
  },
  {
    icon: Circle,
    label: 'Circle',
    palette: 'violet',
    rendererKey: 'boardmark.shape.circle',
    tone: 'default'
  },
  {
    icon: Triangle,
    label: 'Triangle',
    palette: 'rose',
    rendererKey: 'boardmark.shape.triangle',
    tone: 'default'
  }
]
