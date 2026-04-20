import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'

type MermaidDiagramActionProps = {
  disabled: boolean
  icon: LucideIcon
  label: string
  menu: ReactElement | null
  onBlurWithin: () => void
  onClick: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  rootRef: RefObject<HTMLElement | null>
  setTriggerNode: (node: HTMLDivElement | null) => void
  visible: boolean
}

type ActionPosition = {
  left: number
  top: number
}

const ACTION_INSET_X = 18
const ACTION_INSET_Y = 18

export function MermaidDiagramAction({
  disabled,
  icon: Icon,
  label,
  menu,
  onBlurWithin,
  onClick,
  onPointerEnter,
  onPointerLeave,
  rootRef,
  setTriggerNode,
  visible
}: MermaidDiagramActionProps) {
  const [position, setPosition] = useState<ActionPosition | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!visible) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const root = rootRef.current

      if (!root) {
        setPosition(null)
        frameRef.current = requestAnimationFrame(updatePosition)
        return
      }

      const rect = root.getBoundingClientRect()
      setPosition({
        left: Math.max(ACTION_INSET_X, rect.right - ACTION_INSET_X),
        top: Math.max(ACTION_INSET_Y, rect.top + ACTION_INSET_Y)
      })
      frameRef.current = requestAnimationFrame(updatePosition)
    }

    frameRef.current = requestAnimationFrame(updatePosition)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
      frameRef.current = null
    }
  }, [rootRef, visible])

  if (!visible || !position || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      ref={setTriggerNode}
      className="mermaid-diagram__floating-action"
      data-boardmark-export-ignore="true"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return
        }

        onBlurWithin()
      }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        aria-label={label}
        className="mermaid-diagram__floating-action-button"
        disabled={disabled}
        onClick={onClick}
        title={label}
        type="button"
      >
        <Icon
          aria-hidden="true"
          className="mermaid-diagram__floating-action-icon"
        />
      </button>
      {menu}
    </div>,
    document.body
  )
}
