import { useStore } from 'zustand'
import type { CanvasLoadState, CanvasSaveState } from '@boardmark/canvas-domain'
import { Button } from './button'
import { FloatingPanel } from './floating-panel'
import type { ViewerDocumentSession } from './document-session'
import type { ViewerDropState } from './viewer-store'
import type { ViewerShellCapabilities } from './viewer-shell'
import type { ViewerStore } from './viewer-store'

type StatusPanelsProps = {
  store: ViewerStore
  capabilities: ViewerShellCapabilities
}

export function StatusPanels({ store, capabilities }: StatusPanelsProps) {
  const {
    conflictState,
    document,
    documentSession,
    dropState,
    invalidState,
    isDirty,
    lastSavedAt,
    loadState,
    operationError,
    parseIssues,
    reloadFromDisk,
    keepLocalDraft,
    saveState,
    viewport
  } =
    useStore(store)

  return (
    <>
      {conflictState.status === 'conflict' ? (
        <FloatingPanel className="max-w-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            External Change
          </p>
          <p className="mt-2 text-sm text-[var(--color-on-surface)]">
            The file changed on disk while this draft still has local edits.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void reloadFromDisk()}>Reload from disk</Button>
            <Button onClick={() => keepLocalDraft()}>Keep local draft</Button>
          </div>
        </FloatingPanel>
      ) : null}

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
        {capabilities.canDropImport ? <p className="mt-1">{readDropMessage(dropState)}</p> : null}
        <p className="mt-1">{readDocumentMessage(document?.name, documentSession, isDirty)}</p>
        <p className="mt-1">{readSaveMessage(saveState, lastSavedAt)}</p>
        {invalidState.status === 'invalid' ? <p className="mt-1">{invalidState.message}</p> : null}
        {operationError ? <p className="mt-1">{operationError}</p> : null}
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

function readDropMessage(dropState: ViewerDropState) {
  switch (dropState.status) {
    case 'active':
      return 'Drop a .canvas.md or .md file to open it.'
    case 'opened':
      return `Dropped ${dropState.name}`
    case 'error':
      return dropState.message
    default:
      return 'Drag a markdown canvas into the shell to replace it.'
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
