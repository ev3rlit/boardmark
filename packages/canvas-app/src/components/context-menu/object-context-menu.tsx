import {
  BetweenHorizontalStart,
  CheckCheck,
  Copy,
  Download,
  Group,
  Layers,
  Lock,
  Maximize2,
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
  canBringForward: boolean
  canBringToFront: boolean
  canLock: boolean
  canPaste: boolean
  canSendBackward: boolean
  canSendToBack: boolean
  canSelectAll: boolean
  canUngroup: boolean
  canExport: boolean
  imageActions?: {
    canReveal: boolean
    lockAspectRatioLabel: string
    onEditAltText: () => void
    onOpenSource: () => void
    onReplaceImage: () => void
    onRevealFile: () => void
    onToggleLockAspectRatio: () => void
  } | null
  lockLabel: string
  onBringForward: () => void
  onBringToFront: () => void
  onCopy: () => void
  onCut: () => void
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
  onGroup: () => void
  onLock: () => void
  onPaste: () => void
  onPasteInPlace: () => void
  onSendBackward: () => void
  onSendToBack: () => void
  onSelectAll: () => void
  onUngroup: () => void
  onExport: () => void
  canResetHeight?: boolean
  onResetHeight?: () => void
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
  canBringForward,
  canBringToFront,
  canLock,
  canPaste,
  canSendBackward,
  canSendToBack,
  canSelectAll,
  canUngroup,
  canExport,
  imageActions,
  lockLabel,
  canResetHeight,
  onResetHeight,
  onBringForward,
  onBringToFront,
  onCopy,
  onCut,
  onDelete,
  onDuplicate,
  onEdit,
  onGroup,
  onLock,
  onPaste,
  onPasteInPlace,
  onSendBackward,
  onSendToBack,
  onSelectAll,
  onUngroup,
  onExport
}: ObjectContextMenuProps) {
  const sections = mode === 'canvas'
    ? buildCanvasContextMenuSections({
        canExport,
        canPaste,
        canSelectAll,
        onExport,
        onPaste,
        onPasteInPlace,
        onSelectAll
      })
    : buildSelectionContextMenuSections({
        canBringForward,
        canBringToFront,
        canCopy,
        canCut,
        canDelete,
        canDuplicate,
        canEdit,
        canExport,
        canGroup,
        canLock,
        canPaste,
        canResetHeight,
        canSendBackward,
        canSendToBack,
        canUngroup,
        imageActions,
        lockLabel,
        onBringForward,
        onBringToFront,
        onCopy,
        onCut,
        onDelete,
        onDuplicate,
        onEdit,
        onExport,
        onGroup,
        onLock,
        onPaste,
        onPasteInPlace,
        onResetHeight,
        onSendBackward,
        onSendToBack,
        onUngroup,
        selectionLabel
      })

  if (sections.length === 0) {
    return null
  }

  if (mode === 'canvas') {
    return (
      <div
        className="viewer-context-menu"
        data-boardmark-export-ignore="true"
        role="menu"
        style={{
          left: x,
          top: y
        }}
      >
        {sections.map((section, index) => (
          <div
            className="viewer-context-menu-section"
            key={index}
          >
            {section.map((item) => (
              <ContextMenuItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                onClick={item.onClick}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="viewer-context-menu"
      data-boardmark-export-ignore="true"
      role="menu"
      style={{
        left: x,
        top: y
      }}
    >
      {sections.map((section, index) => (
        <div
          className="viewer-context-menu-section"
          key={index}
        >
          {section.map((item) => (
            <ContextMenuItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

type MenuItemDefinition = {
  icon: LucideIcon
  label: string
  onClick: () => void
}

type ContextMenuItemProps = {
  icon: LucideIcon
  label: string
  onClick: () => void
}

function ContextMenuItem({
  icon: Icon,
  label,
  onClick
}: ContextMenuItemProps) {
  return (
    <button
      className="viewer-context-menu-item"
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

function buildCanvasContextMenuSections(input: {
  canExport: boolean
  canPaste: boolean
  canSelectAll: boolean
  onExport: () => void
  onPaste: () => void
  onPasteInPlace: () => void
  onSelectAll: () => void
}) {
  return [
    [
      createMenuItem(input.canExport, Download, 'Export…', input.onExport)
    ],
    [
      createMenuItem(input.canPaste, BetweenHorizontalStart, 'Paste', input.onPaste),
      createMenuItem(input.canPaste, BetweenHorizontalStart, 'Paste in place', input.onPasteInPlace)
    ],
    [
      createMenuItem(input.canSelectAll, CheckCheck, 'Select all', input.onSelectAll)
    ]
  ].map(filterMenuItems).filter(hasMenuItems)
}

function buildSelectionContextMenuSections(input: {
  canBringForward: boolean
  canBringToFront: boolean
  canCopy: boolean
  canCut: boolean
  canDelete: boolean
  canDuplicate: boolean
  canEdit: boolean
  canExport: boolean
  canGroup: boolean
  canLock: boolean
  canPaste: boolean
  canResetHeight?: boolean
  canSendBackward: boolean
  canSendToBack: boolean
  canUngroup: boolean
  imageActions?: ObjectContextMenuProps['imageActions']
  lockLabel: string
  onBringForward: () => void
  onBringToFront: () => void
  onCopy: () => void
  onCut: () => void
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
  onExport: () => void
  onGroup: () => void
  onLock: () => void
  onPaste: () => void
  onPasteInPlace: () => void
  onResetHeight?: () => void
  onSendBackward: () => void
  onSendToBack: () => void
  onUngroup: () => void
  selectionLabel: string
}) {
  return [
    [
      createMenuItem(input.canExport, Download, 'Export…', input.onExport),
      createMenuItem(input.canEdit, Pencil, `Edit ${input.selectionLabel}`, input.onEdit),
      createMenuItem(input.canDelete, Trash2, `Delete ${input.selectionLabel}`, input.onDelete),
      createMenuItem(
        input.canResetHeight === true && input.onResetHeight !== undefined,
        Maximize2,
        'Auto height',
        input.onResetHeight ?? (() => undefined)
      )
    ],
    input.imageActions
      ? [
          createMenuItem(true, Copy, 'Replace image', input.imageActions.onReplaceImage),
          createMenuItem(true, Palette, 'Edit alt text', input.imageActions.onEditAltText),
          createMenuItem(
            true,
            Layers,
            input.imageActions.lockAspectRatioLabel,
            input.imageActions.onToggleLockAspectRatio
          ),
          createMenuItem(true, BetweenHorizontalStart, 'Open source', input.imageActions.onOpenSource),
          createMenuItem(
            input.imageActions.canReveal,
            Lock,
            'Reveal file',
            input.imageActions.onRevealFile
          )
        ]
      : [],
    [
      createMenuItem(input.canCopy, Copy, 'Copy', input.onCopy),
      createMenuItem(input.canCut, Trash2, 'Cut', input.onCut),
      createMenuItem(input.canPaste, BetweenHorizontalStart, 'Paste', input.onPaste),
      createMenuItem(input.canPaste, BetweenHorizontalStart, 'Paste in place', input.onPasteInPlace)
    ],
    [
      createMenuItem(input.canDuplicate, Copy, 'Duplicate', input.onDuplicate),
      createMenuItem(input.canGroup, Group, 'Group', input.onGroup),
      createMenuItem(input.canUngroup, Group, 'Ungroup', input.onUngroup),
      createMenuItem(input.canBringForward, Layers, 'Bring forward', input.onBringForward),
      createMenuItem(input.canSendBackward, Layers, 'Send backward', input.onSendBackward),
      createMenuItem(input.canBringToFront, Layers, 'Bring to front', input.onBringToFront),
      createMenuItem(input.canSendToBack, Layers, 'Send to back', input.onSendToBack),
      createMenuItem(input.canLock, Lock, input.lockLabel, input.onLock)
    ]
  ].map(filterMenuItems).filter(hasMenuItems)
}

function createMenuItem(
  enabled: boolean,
  icon: LucideIcon,
  label: string,
  onClick: () => void
): MenuItemDefinition | null {
  return enabled
    ? {
        icon,
        label,
        onClick
      }
    : null
}

function filterMenuItems(items: Array<MenuItemDefinition | null>) {
  return items.filter((item): item is MenuItemDefinition => item !== null)
}

function hasMenuItems(items: MenuItemDefinition[]) {
  return items.length > 0
}
