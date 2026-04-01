import { useEffect, useId, useRef, useState } from 'react'
import { CircleEllipsis, FilePlus2, FolderOpen, Save, type LucideIcon } from 'lucide-react'
import { useStore } from 'zustand'
import type { CanvasAppCapabilities } from '@canvas-app/app/canvas-app'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type FileMenuProps = {
  store: CanvasStore
  capabilities: CanvasAppCapabilities
}

export function FileMenu({ store, capabilities }: FileMenuProps) {
  const createNewDocument = useStore(store, (state) => state.createNewDocument)
  const document = useStore(store, (state) => state.document)
  const isDirty = useStore(store, (state) => state.isDirty)
  const openDocument = useStore(store, (state) => state.openDocument)
  const resetToTemplate = useStore(store, (state) => state.resetToTemplate)
  const saveCurrentDocument = useStore(store, (state) => state.saveCurrentDocument)
  const saveState = useStore(store, (state) => state.saveState)
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const isResetTemplateMode = capabilities.newDocumentMode === 'reset-template'

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      setIsOpen(false)
      triggerRef.current?.focus()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div
      className="relative"
      ref={rootRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Open menu"
        className={[
          'inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-[var(--color-on-surface)]',
          'bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_80%,transparent)] backdrop-blur-xl',
          'shadow-[0_12px_24px_rgba(43,52,55,0.08)] outline outline-1 outline-[var(--color-outline-ghost)]',
          'transition-[transform,box-shadow,background-color,color] duration-150 hover:-translate-y-[1px]',
          'hover:bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] hover:shadow-[0_16px_30px_rgba(43,52,55,0.12)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--color-primary)_22%,transparent)]'
        ].join(' ')}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <CircleEllipsis
          aria-hidden="true"
          className="size-[1.05rem] text-[var(--color-primary)]"
          strokeWidth={2.1}
        />
        <span className="sr-only">Open menu</span>
      </button>

      {isOpen ? (
        <div
          className={[
            'absolute left-0 top-[calc(100%+0.55rem)] z-30 min-w-56 overflow-hidden rounded-[1.3rem]',
            'bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_94%,white)] p-2',
            'shadow-[0_18px_36px_rgba(43,52,55,0.10)] outline outline-1 outline-[var(--color-outline-ghost)]',
            'backdrop-blur-xl'
          ].join(' ')}
          id={menuId}
          role="menu"
        >
          <FileMenuItem
            icon={FilePlus2}
            label="New file"
            onClick={() => {
              setIsOpen(false)
              void (isResetTemplateMode ? resetToTemplate() : createNewDocument())
            }}
          />
          {capabilities.canOpen ? (
            <FileMenuItem
              icon={FolderOpen}
              label="Open file"
              onClick={() => {
                setIsOpen(false)
                void openDocument()
              }}
            />
          ) : null}
          {capabilities.canSave ? (
            <FileMenuItem
              disabled={!document || !isDirty || saveState.status === 'saving'}
              icon={Save}
              label={saveState.status === 'saving' ? 'Saving…' : 'Save'}
              onClick={() => {
                setIsOpen(false)
                void saveCurrentDocument()
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type FileMenuItemProps = {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}

function FileMenuItem({
  disabled = false,
  icon: Icon,
  label,
  onClick
}: FileMenuItemProps) {
  return (
    <button
      className={[
        'flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed text-[color:color-mix(in_oklab,var(--color-on-surface-variant)_72%,white)]'
          : [
              'cursor-pointer text-[var(--color-on-surface)]',
              'hover:bg-[color:color-mix(in_oklab,var(--color-primary)_8%,white)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--color-primary)_18%,transparent)]'
            ].join(' ')
      ].join(' ')}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span
        className={[
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          disabled
            ? 'bg-[color:color-mix(in_oklab,var(--color-surface-container-low)_72%,white)] text-[var(--color-on-surface-variant)]'
            : 'bg-[color:color-mix(in_oklab,var(--color-primary)_12%,white)] text-[var(--color-primary)]'
        ].join(' ')}
      >
        <Icon
          aria-hidden="true"
          className="size-[1rem]"
          strokeWidth={2.1}
        />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
    </button>
  )
}
