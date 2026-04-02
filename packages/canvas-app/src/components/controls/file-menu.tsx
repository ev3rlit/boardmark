import { useEffect, useId, useRef, useState } from 'react'
import { CircleEllipsis, FilePlus2, FolderOpen, Save, type LucideIcon } from 'lucide-react'
import { useStore } from 'zustand'
import type { CanvasAppCapabilities } from '@canvas-app/app/canvas-app'
import { matchesEscapeKey } from '@canvas-app/keyboard/key-event-matchers'
import { Button } from '@canvas-app/components/primitives/button'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type FileMenuProps = {
  store: CanvasStore
  capabilities: CanvasAppCapabilities
}

type PendingFileAction = 'new' | 'open'

export function FileMenu({ store, capabilities }: FileMenuProps) {
  const createNewDocument = useStore(store, (state) => state.createNewDocument)
  const document = useStore(store, (state) => state.document)
  const isDirty = useStore(store, (state) => state.isDirty)
  const openDocument = useStore(store, (state) => state.openDocument)
  const resetToTemplate = useStore(store, (state) => state.resetToTemplate)
  const saveCurrentDocument = useStore(store, (state) => state.saveCurrentDocument)
  const saveState = useStore(store, (state) => state.saveState)
  const [isOpen, setIsOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingFileAction | null>(null)
  const [isResolvingPendingAction, setIsResolvingPendingAction] = useState(false)
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
      if (!matchesEscapeKey(event)) {
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

  useEffect(() => {
    if (!pendingAction) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesEscapeKey(event) && !isResolvingPendingAction) {
        setPendingAction(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isResolvingPendingAction, pendingAction])

  const runFileAction = async (action: PendingFileAction) => {
    if (action === 'open') {
      await openDocument()
      return
    }

    await (isResetTemplateMode ? resetToTemplate() : createNewDocument())
  }

  const requestFileAction = (action: PendingFileAction) => {
    setIsOpen(false)

    if (document && isDirty) {
      setPendingAction(action)
      return
    }

    void runFileAction(action)
  }

  const confirmDiscardAndContinue = () => {
    if (!pendingAction) {
      return
    }

    const action = pendingAction
    setPendingAction(null)
    void runFileAction(action)
  }

  const saveAndContinue = async () => {
    if (!pendingAction) {
      return
    }

    const action = pendingAction
    setIsResolvingPendingAction(true)
    await saveCurrentDocument()
    setIsResolvingPendingAction(false)

    if (store.getState().isDirty) {
      return
    }

    setPendingAction(null)
    await runFileAction(action)
  }

  const pendingActionCopy = readPendingActionCopy(pendingAction)

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
              requestFileAction('new')
            }}
          />
          {capabilities.canOpen ? (
            <FileMenuItem
              icon={FolderOpen}
              label="Open file"
              onClick={() => {
                requestFileAction('open')
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

      {pendingAction && pendingActionCopy ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[color:color-mix(in_oklab,var(--color-on-surface)_18%,transparent)] px-6">
          <div
            aria-labelledby="unsaved-changes-title"
            aria-modal="true"
            className={[
              'w-full max-w-md rounded-[1.6rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_96%,white)] p-6',
              'shadow-[0_28px_60px_rgba(43,52,55,0.14)] outline outline-1 outline-[var(--color-outline-ghost)] backdrop-blur-xl'
            ].join(' ')}
            role="dialog"
          >
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]"
              id="unsaved-changes-title"
            >
              Unsaved Changes
            </p>
            <p className="mt-3 text-base font-semibold text-[var(--color-on-surface)]">
              {pendingActionCopy.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">
              {pendingActionCopy.body}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                disabled={isResolvingPendingAction}
                emphasis="ghost"
                onClick={() => setPendingAction(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={isResolvingPendingAction}
                emphasis="secondary"
                onClick={confirmDiscardAndContinue}
              >
                Don't save
              </Button>
              <Button
                disabled={isResolvingPendingAction}
                emphasis="primary"
                onClick={() => void saveAndContinue()}
              >
                {isResolvingPendingAction ? 'Saving…' : 'Save and continue'}
              </Button>
            </div>
          </div>
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

function readPendingActionCopy(action: PendingFileAction | null) {
  if (action === 'open') {
    return {
      title: 'Open another file?',
      body: 'The current board has unsaved changes. Save it first, discard the changes, or stay on this board.'
    }
  }

  if (action === 'new') {
    return {
      title: 'Create a new file?',
      body: 'The current board has unsaved changes. Save it first, discard the changes, or stay on this board.'
    }
  }

  return null
}
