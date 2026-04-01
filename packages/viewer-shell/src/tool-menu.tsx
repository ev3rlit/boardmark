import { Hand, MousePointer2, StickyNote, type LucideIcon } from 'lucide-react'
import { useStore } from 'zustand'
import { readActiveToolMode, type ViewerStore } from './viewer-store'

type ToolMenuProps = {
  store: ViewerStore
}

export function ToolMenu({ store }: ToolMenuProps) {
  const { createNoteAtViewport, editingState, setToolMode } = useStore(store)
  const activeToolMode = useStore(store, readActiveToolMode)

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
        disabled={editingState.status !== 'idle'}
        icon={StickyNote}
        label="New note"
        onClick={() => void createNoteAtViewport()}
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
}

function ToolMenuButton({
  active = false,
  className,
  disabled = false,
  icon: Icon,
  label,
  onClick
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
      title={label}
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
