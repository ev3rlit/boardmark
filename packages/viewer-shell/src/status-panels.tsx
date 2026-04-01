import { useStore } from 'zustand'
import type { CanvasLoadState, CanvasSaveState } from '@boardmark/canvas-domain'
import { FloatingPanel } from './floating-panel'
import type { ViewerDocumentSession } from './document-session'
import type { ViewerStore } from './viewer-store'

type StatusPanelsProps = {
  store: ViewerStore
}

export function StatusPanels({ store }: StatusPanelsProps) {
  const { document, documentSession, isDirty, lastSavedAt, loadState, parseIssues, saveState, viewport } =
    useStore(store)

  return (
    <>
      {parseIssues.length > 0 ? (
        <FloatingPanel className="max-w-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Parse Issues
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-on-surface)]">
            {parseIssues.slice(0, 3).map((issue) => (
              <li key={`${issue.kind}-${issue.line}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </FloatingPanel>
      ) : null}

      <FloatingPanel className="p-4 text-sm text-[var(--color-on-surface-variant)]">
        <p>{readStatusMessage(loadState)}</p>
        <p className="mt-1">{readDocumentMessage(document?.name, documentSession, isDirty)}</p>
        <p className="mt-1">{readSaveMessage(saveState, lastSavedAt)}</p>
        <p className="mt-1">Zoom {Math.round(viewport.zoom * 100)}%</p>
      </FloatingPanel>
    </>
  )
}

function readStatusMessage(loadState: CanvasLoadState) {
  switch (loadState.status) {
    case 'loading':
      return 'Waiting for file selection...'
    case 'error':
      return loadState.message
    default:
      return 'Canvas ready'
  }
}

function readDocumentMessage(
  documentName: string | undefined,
  documentSession: ViewerDocumentSession | null,
  isDirty: boolean
) {
  if (!documentName || !documentSession) {
    return 'No document loaded'
  }

  const persistenceLabel = documentSession.isPersisted ? 'Persisted document' : 'Unsaved draft'
  const dirtyLabel = isDirty ? 'unsaved changes' : 'all changes saved'

  return `${documentName} • ${persistenceLabel} • ${dirtyLabel}`
}

function readSaveMessage(saveState: CanvasSaveState, lastSavedAt: number | null) {
  switch (saveState.status) {
    case 'saving':
      return 'Saving changes...'
    case 'saved':
      return lastSavedAt ? `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Saved'
    case 'error':
      return saveState.message
    default:
      return 'Save service ready'
  }
}
