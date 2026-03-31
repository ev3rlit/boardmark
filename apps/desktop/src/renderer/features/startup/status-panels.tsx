import { useStore } from 'zustand'
import type { CanvasLoadState } from '@boardmark/canvas-domain'
import { FloatingPanel } from '../../components/floating-panel'
import type { ViewerStore } from '../../store/viewer-store'

type StatusPanelsProps = {
  store: ViewerStore
}

export function StatusPanels({ store }: StatusPanelsProps) {
  const { parseIssues, loadState, viewport } = useStore(store)

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
