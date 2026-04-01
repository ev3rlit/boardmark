import { useStore } from 'zustand'
import { Button } from './button'
import { FloatingPanel } from './floating-panel'
import type { ViewerShellCapabilities } from './viewer-shell'
import type { ViewerStore } from './viewer-store'

type EntryActionsProps = {
  store: ViewerStore
  capabilities: ViewerShellCapabilities
}

export function EntryActions({ store, capabilities }: EntryActionsProps) {
  const { entryState, document, createNewDocument, resetToTemplate } = useStore(store)

  if (!entryState.showActions) {
    return null
  }

  const isResetTemplateMode = capabilities.newDocumentMode === 'reset-template'

  return (
    <FloatingPanel className="max-w-sm p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Viewer MVP
      </p>
      <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-on-surface)]">
        {document?.name ?? 'Boardmark'}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--color-on-surface-variant)]">
        {isResetTemplateMode
          ? 'Reset to the bundled sample board or open a local `.canvas.md` from the file menu.'
          : 'Start from the bundled template and create a fresh `.canvas.md`. Existing boards open from the file menu.'}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          emphasis="primary"
          onClick={() =>
            void (isResetTemplateMode ? resetToTemplate() : createNewDocument())
          }
        >
          New File
        </Button>
      </div>
    </FloatingPanel>
  )
}
