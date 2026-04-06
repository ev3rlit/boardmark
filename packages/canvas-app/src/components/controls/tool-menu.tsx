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
import type { BuiltInComponentKey } from '@boardmark/canvas-domain'
import { matchesEscapeKey } from '@canvas-app/keyboard/key-event-matchers'
import { isCanvasEditingActive } from '@canvas-app/store/canvas-editing-session'
import { readActiveToolMode, type CanvasStore } from '@canvas-app/store/canvas-store'

type ToolMenuProps = {
  isFullscreen: boolean
  onToggleFullscreen: () => void
  store: CanvasStore
}

export function ToolMenu({ isFullscreen, onToggleFullscreen, store }: ToolMenuProps) {
  const createFrameAtViewport = useStore(store, (state) => state.createFrameAtViewport)
  const insertImageFromFile = useStore(store, (state) => state.insertImageFromFile)
  const insertImageFromLink = useStore(store, (state) => state.insertImageFromLink)
  const createNoteAtViewport = useStore(store, (state) => state.createNoteAtViewport)
  const createShapeAtViewport = useStore(store, (state) => state.createShapeAtViewport)
  const editingState = useStore(store, (state) => state.editingState)
  const setToolMode = useStore(store, (state) => state.setToolMode)
  const activeToolMode = useStore(store, readActiveToolMode)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false)
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false)
  const shapeMenuRef = useRef<HTMLDivElement | null>(null)
  const imageMenuRef = useRef<HTMLDivElement | null>(null)
  const isBusy = isCanvasEditingActive(editingState)

  useEffect(() => {
    if (!isShapeMenuOpen && !isImageMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (
        !shapeMenuRef.current?.contains(target) &&
        !imageMenuRef.current?.contains(target)
      ) {
        setIsShapeMenuOpen(false)
        setIsImageMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesEscapeKey(event)) {
        setIsShapeMenuOpen(false)
        setIsImageMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isImageMenuOpen, isShapeMenuOpen])

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
                  key={item.component}
                  className="viewer-context-menu-item"
                  onClick={() => {
                    const contract = getBuiltInRendererContract(item.component)
                    setIsShapeMenuOpen(false)
                    void createShapeAtViewport({
                      body: item.body,
                      component: item.component,
                      height: contract.defaultSize.height,
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
      <div
        className="relative"
        ref={imageMenuRef}
      >
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]

            if (file) {
              void insertImageFromFile(file)
            }

            event.target.value = ''
            setIsImageMenuOpen(false)
          }}
          ref={imageInputRef}
          type="file"
        />
        <ToolMenuButton
          active={isImageMenuOpen}
          className="viewer-control-button--spaced"
          disabled={isBusy}
          icon={ImagePlus}
          label="Image"
          onClick={() => setIsImageMenuOpen((current) => !current)}
        />
        {isImageMenuOpen ? (
          <div
            className="viewer-context-menu bottom-[calc(100%+0.75rem)] left-0"
            role="menu"
          >
            <div className="viewer-context-menu-section">
              <button
                className="viewer-context-menu-item"
                onClick={() => {
                  const src = window.prompt('Image URL or local path')

                  if (!src || src.trim().length === 0) {
                    setIsImageMenuOpen(false)
                    return
                  }

                  const alt = window.prompt('Alt text', '') ?? ''
                  const title = window.prompt('Title (optional)', '') ?? ''

                  setIsImageMenuOpen(false)
                  void insertImageFromLink({
                    alt,
                    lockAspectRatio: true,
                    src: src.trim(),
                    title: title.trim().length > 0 ? title.trim() : undefined
                  })
                }}
                role="menuitem"
                type="button"
              >
                <ImagePlus
                  aria-hidden="true"
                  className="viewer-context-menu-icon"
                />
                <span>Link</span>
              </button>
              <button
                className="viewer-context-menu-item"
                onClick={() => imageInputRef.current?.click()}
                role="menuitem"
                type="button"
              >
                <ImagePlus
                  aria-hidden="true"
                  className="viewer-context-menu-icon"
                />
                <span>File</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
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
  body: string
  component: BuiltInComponentKey
  icon: LucideIcon
  label: string
}> = [
  {
    body: createShapeBody('Rectangle', {
      palette: 'neutral',
      tone: 'default'
    }),
    component: 'boardmark.shape.rect',
    icon: Square,
    label: 'Rectangle'
  },
  {
    body: createShapeBody('Rounded rectangle', {
      palette: 'blue',
      tone: 'soft'
    }),
    component: 'boardmark.shape.roundRect',
    icon: Square,
    label: 'Rounded rectangle'
  },
  {
    body: createShapeBody('Ellipse', {
      palette: 'green',
      tone: 'soft'
    }),
    component: 'boardmark.shape.ellipse',
    icon: Circle,
    label: 'Ellipse'
  },
  {
    body: createShapeBody('Circle', {
      palette: 'violet',
      tone: 'default'
    }),
    component: 'boardmark.shape.circle',
    icon: Circle,
    label: 'Circle'
  },
  {
    body: createShapeBody('Triangle', {
      palette: 'rose',
      tone: 'default'
    }),
    component: 'boardmark.shape.triangle',
    icon: Triangle,
    label: 'Triangle'
  }
]

function createShapeBody(label: string, props: Record<string, string>) {
  return `${label}\n\n\`\`\`yaml props\n${Object.entries(props)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n\`\`\``
}
