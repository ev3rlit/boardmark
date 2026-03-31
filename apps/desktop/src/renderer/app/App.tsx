import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useStore } from 'zustand'
import defaultTemplateSource from '../../../../../fixtures/default-template.canvas.md?raw'
import { createViewerStore, type ViewerStore } from '../store/viewer-store'
import { CanvasScene } from '../features/canvas/canvas-scene'
import { ToolMenu } from '../features/canvas-controls/tool-menu'
import { ZoomControls } from '../features/canvas-controls/zoom-controls'
import { EntryActions } from '../features/document-entry/entry-actions'
import { FileMenu } from '../features/document-entry/file-menu'
import { StatusPanels } from '../features/startup/status-panels'

const fallbackGateway =
  typeof window !== 'undefined' && window.boardmarkDocument
    ? window.boardmarkDocument
    : {
        newFileFromTemplate: async () => ({
          ok: false as const,
          error: {
            code: 'create-failed' as const,
            message: 'Desktop bridge unavailable. Restart the app and try again.'
          }
        }),
        openFile: async () => ({
          ok: false as const,
          error: {
            code: 'open-failed' as const,
            message: 'Desktop bridge unavailable. Restart the app and try again.'
          }
        }),
        saveFile: async () => ({
          ok: false as const,
          error: {
            code: 'save-failed' as const,
            message: 'Desktop bridge unavailable. Restart the app and try again.'
          }
        })
      }

export const defaultViewerStore = createViewerStore(fallbackGateway)

type AppProps = {
  store?: ViewerStore
}

export function App({ store = defaultViewerStore }: AppProps) {
  const document = useStore(store, (state) => state.document)

  useEffect(() => {
    if (!document) {
      store.getState().hydrateTemplate(defaultTemplateSource)
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
                <FileMenu store={store} />
              </div>

              <div className="app-no-drag pointer-events-auto">
                <StatusPanels store={store} />
              </div>
            </div>
          </div>

          <div className="pointer-events-auto absolute left-5 top-24 z-20">
            <EntryActions store={store} />
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
