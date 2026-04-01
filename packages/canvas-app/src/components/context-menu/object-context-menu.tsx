import {
  AlignLeft,
  BetweenHorizontalStart,
  Copy,
  Group,
  Layers,
  Lock,
  Palette,
  Pencil,
  Trash2,
  type LucideIcon
} from 'lucide-react'

type ObjectContextMenuProps = {
  selectionLabel: string
  x: number
  y: number
  canEdit: boolean
  onDelete: () => void
  onEdit: () => void
}

export function ObjectContextMenu({
  selectionLabel,
  x,
  y,
  canEdit,
  onDelete,
  onEdit
}: ObjectContextMenuProps) {
  return (
    <div
      className="viewer-context-menu"
      role="menu"
      style={{
        left: x,
        top: y
      }}
    >
      <div className="viewer-context-menu-section">
        <ContextMenuItem
          disabled={!canEdit}
          icon={Pencil}
          label={`Edit ${selectionLabel}`}
          onClick={onEdit}
        />
        <ContextMenuItem
          icon={Trash2}
          label={`Delete ${selectionLabel}`}
          onClick={onDelete}
        />
      </div>

      <div className="viewer-context-menu-section">
        <ContextMenuItem
          disabled
          icon={Copy}
          label="Duplicate"
          onClick={() => undefined}
        />
        <ContextMenuItem
          disabled
          icon={Group}
          label="Group"
          onClick={() => undefined}
        />
        <ContextMenuItem
          disabled
          icon={AlignLeft}
          label="Align"
          onClick={() => undefined}
        />
      </div>

      <div className="viewer-context-menu-section">
        <ContextMenuItem
          disabled
          icon={BetweenHorizontalStart}
          label="Distribute"
          onClick={() => undefined}
        />
        <ContextMenuItem
          disabled
          icon={Layers}
          label="Arrange"
          onClick={() => undefined}
        />
        <ContextMenuItem
          disabled
          icon={Palette}
          label="Color"
          onClick={() => undefined}
        />
        <ContextMenuItem
          disabled
          icon={Lock}
          label="Lock"
          onClick={() => undefined}
        />
      </div>
    </div>
  )
}

type ContextMenuItemProps = {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}

function ContextMenuItem({
  disabled = false,
  icon: Icon,
  label,
  onClick
}: ContextMenuItemProps) {
  return (
    <button
      className="viewer-context-menu-item"
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <Icon
        aria-hidden="true"
        className="viewer-context-menu-icon"
      />
      <span>{label}</span>
    </button>
  )
}
