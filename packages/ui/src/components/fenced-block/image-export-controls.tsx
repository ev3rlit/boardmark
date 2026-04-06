import {
  AlertCircle,
  Check,
  Copy,
  Download,
  LoaderCircle,
  type LucideIcon
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from 'react'
import { useMarkdownContentImageActions } from './image-actions-context'
import {
  exportCodeBlockImage,
  exportMermaidBlockImage,
  type FencedBlockImageExportRequest
} from './image-export'
import type { MarkdownContentImageExportFormat } from './image-actions-context'

type FencedBlockImageActionState =
  | { status: 'idle' }
  | { status: 'exporting' }
  | { status: 'copying' }
  | { status: 'exported'; message: string }
  | { status: 'copied'; message: string }
  | { status: 'error'; message: string }

type ContextMenuState = {
  x: number
  y: number
}

type MenuItem = {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onSelect: () => void
}

type ActionRunnerInput = {
  imageActions: ReturnType<typeof useMarkdownContentImageActions>
  kind: 'code' | 'mermaid'
  language?: string
  rootRef: RefObject<HTMLElement | null>
  setActionState: (state: FencedBlockImageActionState) => void
  setContextMenu: (state: ContextMenuState | null) => void
  setQuickActionMenuOpen: (open: boolean) => void
}

export function useFencedBlockImageControls<TElement extends HTMLElement>({
  enabled = true,
  kind,
  language,
  rootRef
}: {
  enabled?: boolean
  kind: 'code' | 'mermaid'
  language?: string
  rootRef: RefObject<TElement | null>
}) {
  const imageActions = useMarkdownContentImageActions()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [quickActionMenuOpen, setQuickActionMenuOpen] = useState(false)
  const [actionState, setActionState] = useState<FencedBlockImageActionState>({ status: 'idle' })
  const menuRef = useRef<HTMLDivElement | null>(null)
  const quickActionMenuRef = useRef<HTMLDivElement | null>(null)
  const quickActionTriggerRef = useRef<HTMLDivElement | null>(null)
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const quickActionMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const canShowAffordance = Boolean(imageActions) && enabled
  const canCopyImage = Boolean(imageActions?.canCopyImageToClipboard())
  const isBusy = actionState.status === 'exporting' || actionState.status === 'copying'

  useEffect(() => {
    if (
      actionState.status === 'idle' ||
      actionState.status === 'exporting' ||
      actionState.status === 'copying'
    ) {
      return
    }

    const timeoutHandle = window.setTimeout(() => {
      setActionState({ status: 'idle' })
    }, 1800)

    return () => {
      window.clearTimeout(timeoutHandle)
    }
  }, [actionState])

  useEffect(() => {
    if (!contextMenu && !quickActionMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (target instanceof HTMLElement && menuRef.current?.contains(target)) {
        return
      }

      if (target instanceof HTMLElement && quickActionMenuRef.current?.contains(target)) {
        return
      }

      if (target instanceof HTMLElement && quickActionTriggerRef.current?.contains(target)) {
        return
      }

      setContextMenu(null)
      setQuickActionMenuOpen(false)
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setQuickActionMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [contextMenu, quickActionMenuOpen])

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!imageActions) {
      return []
    }

    return [
      {
        disabled: !canCopyImage,
        icon: Copy,
        label: 'Copy image to clipboard',
        onSelect: () => {
          void runCopyImageAction({
            imageActions,
            kind,
            language,
            rootRef,
            setActionState,
            setContextMenu,
            setQuickActionMenuOpen
          })
        }
      },
      {
        icon: Download,
        label: 'Export PNG',
        onSelect: () => {
          void runExportImageAction({
            imageActions,
            format: 'png',
            kind,
            language,
            rootRef,
            setActionState,
            setContextMenu,
            setQuickActionMenuOpen
          })
        }
      },
      {
        icon: Download,
        label: 'Export JPG',
        onSelect: () => {
          void runExportImageAction({
            imageActions,
            format: 'jpeg',
            kind,
            language,
            rootRef,
            setActionState,
            setContextMenu,
            setQuickActionMenuOpen
          })
        }
      }
    ]
  }, [canCopyImage, imageActions, kind, language, rootRef])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const firstEnabledIndex = menuItems.findIndex((item) => !item.disabled)

    if (firstEnabledIndex < 0) {
      return
    }

    menuItemRefs.current[firstEnabledIndex]?.focus()
  }, [contextMenu, menuItems])

  useEffect(() => {
    if (!quickActionMenuOpen) {
      return
    }

    const firstEnabledIndex = menuItems.findIndex((item) => !item.disabled)

    if (firstEnabledIndex < 0) {
      return
    }

    quickActionMenuItemRefs.current[firstEnabledIndex]?.focus()
  }, [menuItems, quickActionMenuOpen])

  const quickAction = readQuickAction(actionState)
  const statusMessage =
    actionState.status === 'idle' || actionState.status === 'exporting' || actionState.status === 'copying'
      ? null
      : actionState.message

  return {
    canShowAffordance,
    contextMenu:
      canShowAffordance && contextMenu
        ? (
            <div
              ref={menuRef}
              data-boardmark-export-ignore="true"
              className="viewer-context-menu markdown-content__fenced-block-menu"
              role="menu"
              style={alignMenuPosition(contextMenu)}
              onKeyDown={(event) => {
                handleMenuKeyDown(event, menuItems, menuItemRefs, () => setContextMenu(null))
              }}
            >
              <div className="viewer-context-menu-section">
                {menuItems.map((item, index) => {
                  const Icon = item.icon

                  return (
                    <button
                      key={item.label}
                      ref={(button) => {
                        menuItemRefs.current[index] = button
                      }}
                      className="viewer-context-menu-item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onSelect()
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Icon
                        aria-hidden="true"
                        className="viewer-context-menu-icon"
                      />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        : null,
    quickActionMenu:
      canShowAffordance && quickActionMenuOpen
        ? (
            <div
              ref={quickActionMenuRef}
              data-boardmark-export-ignore="true"
              className="viewer-context-menu markdown-content__fenced-block-popover"
              role="menu"
              onKeyDown={(event) => {
                handleMenuKeyDown(
                  event,
                  menuItems,
                  quickActionMenuItemRefs,
                  () => setQuickActionMenuOpen(false)
                )
              }}
            >
              <div className="viewer-context-menu-section">
                {menuItems.map((item, index) => {
                  const Icon = item.icon

                  return (
                    <button
                      key={item.label}
                      ref={(button) => {
                        quickActionMenuItemRefs.current[index] = button
                      }}
                      className="viewer-context-menu-item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onSelect()
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Icon
                        aria-hidden="true"
                        className="viewer-context-menu-icon"
                      />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        : null,
    quickActionTriggerRef,
    onContextMenu:
      canShowAffordance
        ? (event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault()
          setContextMenu({
            x: event.clientX,
            y: event.clientY
          })
          setQuickActionMenuOpen(false)
        }
        : undefined,
    quickAction:
      canShowAffordance
        ? {
            disabled: isBusy,
            icon: quickAction.icon,
            label: quickAction.label,
            onClick: () => {
              setContextMenu(null)
              setQuickActionMenuOpen((currentValue) => !currentValue)
            }
          }
        : null,
    statusMessage,
    statusTone: readStatusTone(actionState)
  }
}

function alignMenuPosition(position: ContextMenuState) {
  return {
    left: Math.min(position.x, window.innerWidth - 248),
    top: Math.min(position.y, window.innerHeight - 132)
  }
}

function handleMenuKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  items: MenuItem[],
  itemRefs: { current: Array<HTMLButtonElement | null> },
  onClose: () => void
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return
  }

  event.preventDefault()

  const enabledIndices = items
    .map((item, index) => (!item.disabled ? index : -1))
    .filter((index) => index >= 0)

  if (enabledIndices.length === 0) {
    return
  }

  const activeIndex = itemRefs.current.findIndex((button) => button === document.activeElement)

  if (event.key === 'Home') {
    itemRefs.current[enabledIndices[0]]?.focus()
    return
  }

  if (event.key === 'End') {
    itemRefs.current[enabledIndices[enabledIndices.length - 1]]?.focus()
    return
  }

  const enabledActiveIndex = enabledIndices.findIndex((index) => index === activeIndex)
  const nextEnabledIndex =
    event.key === 'ArrowDown'
      ? enabledIndices[(enabledActiveIndex + 1 + enabledIndices.length) % enabledIndices.length]
      : enabledIndices[(enabledActiveIndex - 1 + enabledIndices.length) % enabledIndices.length]

  itemRefs.current[nextEnabledIndex]?.focus()
}

function readQuickAction(actionState: FencedBlockImageActionState): {
  icon: LucideIcon
  label: string
} {
  if (actionState.status === 'exporting') {
    return {
      icon: LoaderCircle,
      label: 'Exporting image'
    }
  }

  if (actionState.status === 'exported') {
    return {
      icon: Check,
      label: 'Image exported'
    }
  }

  if (actionState.status === 'error') {
    return {
      icon: AlertCircle,
      label: 'Export image'
    }
  }

  return {
    icon: Download,
    label: 'Export image'
  }
}

function readStatusTone(actionState: FencedBlockImageActionState) {
  if (actionState.status === 'error') {
    return 'error'
  }

  if (actionState.status === 'copied' || actionState.status === 'exported') {
    return 'success'
  }

  return 'muted'
}

async function runExportImageAction({
  imageActions,
  format,
  kind,
  language,
  rootRef,
  setActionState,
  setContextMenu,
  setQuickActionMenuOpen
}: ActionRunnerInput & { format: MarkdownContentImageExportFormat }) {
  if (!imageActions) {
    return
  }

  setContextMenu(null)
  setQuickActionMenuOpen(false)
  setActionState({ status: 'exporting' })

  try {
    const result = await exportImageForSurface({
      kind,
      language,
      rootRef
    })
    const outcome = await imageActions.exportImage(result, format)

    if (outcome.status === 'cancelled') {
      setActionState({ status: 'idle' })
      return
    }

    setActionState({
      status: 'exported',
      message: format === 'jpeg' ? 'JPG exported' : 'PNG exported'
    })
  } catch (error) {
    setActionState({
      status: 'error',
      message: readErrorMessage(error, 'Image export failed. Try again.')
    })
  }
}

async function runCopyImageAction({
  imageActions,
  kind,
  language,
  rootRef,
  setActionState,
  setContextMenu,
  setQuickActionMenuOpen
}: ActionRunnerInput) {
  if (!imageActions) {
    return
  }

  setContextMenu(null)
  setQuickActionMenuOpen(false)
  setActionState({ status: 'copying' })

  try {
    const result = await exportImageForSurface({
      kind,
      language,
      rootRef
    })
    await imageActions.copyImageToClipboard(result)
    setActionState({
      status: 'copied',
      message: 'Image copied'
    })
  } catch (error) {
    setActionState({
      status: 'error',
      message: readErrorMessage(error, 'Image copy failed. Try again.')
    })
  }
}

async function exportImageForSurface({
  kind,
  language,
  rootRef
}: Omit<
  ActionRunnerInput,
  'imageActions' | 'setActionState' | 'setContextMenu' | 'setQuickActionMenuOpen'
>) {
  const rootElement = rootRef.current

  if (!rootElement) {
    throw new Error('Image export root is missing.')
  }

  const request: FencedBlockImageExportRequest = {
    kind,
    language,
    rootElement
  }

  if (kind === 'mermaid') {
    return exportMermaidBlockImage(request)
  }

  return exportCodeBlockImage(request)
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}
