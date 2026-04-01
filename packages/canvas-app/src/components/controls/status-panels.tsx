import { useStore } from 'zustand'
import type { CanvasLoadState, CanvasSaveState } from '@boardmark/canvas-domain'
import { Button } from '@canvas-app/components/primitives/button'
import type { CanvasStore } from '@canvas-app/store/canvas-store'
import type { CanvasDropState, CanvasInvalidState } from '@canvas-app/store/canvas-store-types'

type StatusPanelsProps = {
  store: CanvasStore
}

export function StatusPanels({ store }: StatusPanelsProps) {
  const conflictState = useStore(store, (state) => state.conflictState)
  const dropState = useStore(store, (state) => state.dropState)
  const invalidState = useStore(store, (state) => state.invalidState)
  const loadState = useStore(store, (state) => state.loadState)
  const operationError = useStore(store, (state) => state.operationError)
  const parseIssues = useStore(store, (state) => state.parseIssues)
  const reloadFromDisk = useStore(store, (state) => state.reloadFromDisk)
  const keepLocalDraft = useStore(store, (state) => state.keepLocalDraft)
  const saveState = useStore(store, (state) => state.saveState)

  const messages = readStatusMessages({
    dropState,
    invalidState,
    loadState,
    operationError,
    saveState
  })

  return (
    <>
      {conflictState.status === 'conflict' ? (
        <div
          className={[
            'max-w-sm rounded-[1.45rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] p-4',
            'shadow-[0_18px_34px_rgba(43,52,55,0.08)] outline outline-1 outline-[var(--color-outline-ghost)] backdrop-blur-xl'
          ].join(' ')}
        >
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
        </div>
      ) : null}

      {parseIssues.length > 0 ? (
        <div
          className={[
            'max-w-sm rounded-[1.45rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] p-4',
            'shadow-[0_18px_34px_rgba(43,52,55,0.08)] outline outline-1 outline-[var(--color-outline-ghost)] backdrop-blur-xl'
          ].join(' ')}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Parse Issues
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-on-surface)]">
            {parseIssues.slice(0, 3).map((issue) => (
              <li key={`${issue.kind}-${issue.line}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div
          className={[
            'max-w-sm rounded-[1.45rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] p-4',
            'shadow-[0_18px_34px_rgba(43,52,55,0.08)] outline outline-1 outline-[var(--color-outline-ghost)] backdrop-blur-xl'
          ].join(' ')}
        >
          <ul className="space-y-2 text-sm text-[var(--color-on-surface)]">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

function readStatusMessages({
  dropState,
  invalidState,
  loadState,
  operationError,
  saveState
}: {
  dropState: CanvasDropState
  invalidState: CanvasInvalidState
  loadState: CanvasLoadState
  operationError: string | null
  saveState: CanvasSaveState
}) {
  const messages: string[] = []

  if (loadState.status === 'loading') {
    messages.push('Waiting for file selection')
  }

  if (loadState.status === 'error') {
    messages.push(loadState.message)
  }

  if (dropState.status === 'error') {
    messages.push(dropState.message)
  }

  if (saveState.status === 'error') {
    messages.push(saveState.message)
  }

  if (invalidState.status === 'invalid') {
    messages.push(invalidState.message)
  }

  if (operationError) {
    messages.push(operationError)
  }

  return messages
}
