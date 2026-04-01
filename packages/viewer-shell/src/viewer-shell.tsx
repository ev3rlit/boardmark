import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useStore } from 'zustand'
import { CanvasScene } from './canvas-scene'
import { EntryActions } from './entry-actions'
import { FileMenu } from './file-menu'
import { StatusPanels } from './status-panels'
import { ToolMenu } from './tool-menu'
import { ZoomControls } from './zoom-controls'
import type { ViewerStore } from './viewer-store'

export type ViewerShellCapabilities = {
  canOpen: boolean
  canSave: boolean
  newDocumentMode: 'persist-template' | 'reset-template'
}

type ViewerShellProps = {
  store: ViewerStore
  capabilities: ViewerShellCapabilities
}

export function ViewerShell({ store, capabilities }: ViewerShellProps) {
  const document = useStore(store, (state) => state.document)

  useEffect(() => {
    if (!document) {
      void store.getState().hydrateTemplate()
    }
  }, [document, store])

  return (
    <ReactFlowProvider>
      <main className="relative h-screen w-screen overflow-hidden bg-[var(--color-surface)] text-[var(--color-on-surface)]">
        <CanvasScene store={store} />

        <div className="pointer-events-none absolute inset-0">
          <div className="app-drag-region absolute inset-x-0 top-0 z-20 h-18">
            <div className="flex h-full items-start justify-between px-5 pt-4">
              <div className="app-no-drag pointer-events-auto">
                <FileMenu
                  store={store}
                  capabilities={capabilities}
                />
              </div>

              <div className="app-no-drag pointer-events-auto">
                <StatusPanels store={store} />
              </div>
            </div>
          </div>

          <div className="pointer-events-auto absolute left-5 top-24 z-20">
            <EntryActions
              store={store}
              capabilities={capabilities}
            />
          </div>

          <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2">
            <ToolMenu store={store} />
          </div>

          <div className="pointer-events-auto absolute bottom-5 right-5">
            <ZoomControls store={store} />
          </div>
        </div>
      </main>
    </ReactFlowProvider>
  )
}
