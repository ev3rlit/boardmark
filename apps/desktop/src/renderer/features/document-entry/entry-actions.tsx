import { useStore } from 'zustand'
import { Button } from '../../components/button'
import { FloatingPanel } from '../../components/floating-panel'
import type { ViewerStore } from '../../store/viewer-store'

type EntryActionsProps = {
  store: ViewerStore
}

export function EntryActions({ store }: EntryActionsProps) {
  const { entryState, document, createNewDocument } = useStore(store)

  if (!entryState.showActions) {
    return null
  }

  return (
    <FloatingPanel className="max-w-sm p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Viewer MVP
      </p>
      <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-on-surface)]">
        {document?.name ?? 'Boardmark'}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--color-on-surface-variant)]">
        Start from the bundled template and create a fresh `.canvas.md`. Existing boards open from the file menu.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          emphasis="primary"
          onClick={() => void createNewDocument()}
        >
          New File
        </Button>
      </div>
    </FloatingPanel>
  )
}
