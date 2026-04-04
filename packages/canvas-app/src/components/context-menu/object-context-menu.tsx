import {
  AlignLeft,
  BetweenHorizontalStart,
  CheckCheck,
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
  mode: 'canvas' | 'selection'
  selectionLabel: string
  x: number
  y: number
  canEdit: boolean
  canCopy: boolean
  canCut: boolean
  canDelete: boolean
  canDuplicate: boolean
  canGroup: boolean
  canPaste: boolean
  canSelectAll: boolean
  canUngroup: boolean
  imageActions?: {
    canReveal: boolean
    lockAspectRatioLabel: string
    onEditAltText: () => void
    onOpenSource: () => void
    onReplaceImage: () => void
    onRevealFile: () => void
    onToggleLockAspectRatio: () => void
  } | null
  onCopy: () => void
  onCut: () => void
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
  onGroup: () => void
  onPaste: () => void
  onPasteInPlace: () => void
  onSelectAll: () => void
  onUngroup: () => void
}

export function ObjectContextMenu({
  mode,
  selectionLabel,
  x,
  y,
  canEdit,
  canCopy,
  canCut,
  canDelete,
  canDuplicate,
  canGroup,
  canPaste,
  canSelectAll,
  canUngroup,
  imageActions,
  onCopy,
  onCut,
  onDelete,
  onDuplicate,
  onEdit,
  onGroup,
  onPaste,
  onPasteInPlace,
  onSelectAll,
  onUngroup
}: ObjectContextMenuProps) {
  if (mode === 'canvas') {
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
            disabled={!canPaste}
            icon={BetweenHorizontalStart}
            label="Paste"
            onClick={onPaste}
          />
          <ContextMenuItem
            disabled={!canPaste}
            icon={BetweenHorizontalStart}
            label="Paste in place"
            onClick={onPasteInPlace}
          />
          <ContextMenuItem
            disabled={!canSelectAll}
            icon={CheckCheck}
            label="Select all"
            onClick={onSelectAll}
          />
        </div>
      </div>
    )
  }

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
          disabled={!canDelete}
          icon={Trash2}
          label={`Delete ${selectionLabel}`}
          onClick={onDelete}
        />
      </div>

      <div className="viewer-context-menu-section">
        {imageActions ? (
          <>
            <ContextMenuItem
              icon={Copy}
              label="Replace image"
              onClick={imageActions.onReplaceImage}
            />
            <ContextMenuItem
              icon={Palette}
              label="Edit alt text"
              onClick={imageActions.onEditAltText}
            />
            <ContextMenuItem
              icon={Layers}
              label={imageActions.lockAspectRatioLabel}
              onClick={imageActions.onToggleLockAspectRatio}
            />
            <ContextMenuItem
              icon={BetweenHorizontalStart}
              label="Open source"
              onClick={imageActions.onOpenSource}
            />
            <ContextMenuItem
              disabled={!imageActions.canReveal}
              icon={Lock}
              label="Reveal file"
              onClick={imageActions.onRevealFile}
            />
          </>
        ) : null}
      </div>

      <div className="viewer-context-menu-section">
        <ContextMenuItem
          disabled={!canCopy}
          icon={Copy}
          label="Copy"
          onClick={onCopy}
        />
        <ContextMenuItem
          disabled={!canCut}
          icon={Trash2}
          label="Cut"
          onClick={onCut}
        />
        <ContextMenuItem
          disabled={!canPaste}
          icon={BetweenHorizontalStart}
          label="Paste"
          onClick={onPaste}
        />
      </div>

      <div className="viewer-context-menu-section">
        <ContextMenuItem
          disabled={!canDuplicate}
          icon={Copy}
          label="Duplicate"
          onClick={onDuplicate}
        />
        <ContextMenuItem
          disabled={!canGroup}
          icon={Group}
          label="Group"
          onClick={onGroup}
        />
        <ContextMenuItem
          disabled={!canUngroup}
          icon={Group}
          label="Ungroup"
          onClick={onUngroup}
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
          disabled={!canPaste}
          icon={BetweenHorizontalStart}
          label="Paste in place"
          onClick={onPasteInPlace}
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
