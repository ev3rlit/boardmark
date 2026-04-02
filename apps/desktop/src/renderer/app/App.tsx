import type { BoardmarkDocumentBridge } from '@boardmark/canvas-repository'
import {
  CanvasApp,
  EMPTY_CANVAS_SOURCE,
  createCanvasStore,
  type CanvasDocumentPersistenceBridge,
  type CanvasStore
} from '@boardmark/canvas-app'

type DesktopDocumentBridge = BoardmarkDocumentBridge & {
  persistence?: CanvasDocumentPersistenceBridge
}

const fallbackBridge: DesktopDocumentBridge =
  typeof window !== 'undefined' && window.boardmarkDocument
    ? window.boardmarkDocument
    : {
        picker: {
          pickOpenLocator: async () => ({
            ok: false as const,
            error: {
              code: 'open-failed' as const,
              message: 'Desktop bridge unavailable. Restart the app and try again.'
            }
          }),
          pickSaveLocator: async () => ({
            ok: false as const,
            error: {
              code: 'save-failed' as const,
              message: 'Desktop bridge unavailable. Restart the app and try again.'
            }
          })
        },
        repository: {
          read: async () => ({
            ok: false as const,
            error: {
              kind: 'read-failed' as const,
              message: 'Desktop bridge unavailable. Restart the app and try again.'
            }
          }),
          readSource: async () => ({
            ok: false as const,
            error: {
              kind: 'parse-failed' as const,
              message: 'Desktop bridge unavailable. Restart the app and try again.'
            }
          }),
          save: async () => ({
            ok: false as const,
            error: {
              kind: 'write-failed' as const,
              message: 'Desktop bridge unavailable. Restart the app and try again.'
            }
          })
        },
        persistence: {
          openDocument: async () => ({
            ok: false as const,
            error: {
              code: 'open-failed' as const,
              message: 'Desktop persistence bridge unavailable. Restart the app and try again.'
            }
          }),
          saveDocument: async () => ({
            ok: false as const,
            error: {
              code: 'save-failed' as const,
              message: 'Desktop persistence bridge unavailable. Restart the app and try again.'
            }
          }),
          saveDocumentAs: async () => ({
            ok: false as const,
            error: {
              code: 'save-failed' as const,
              message: 'Desktop persistence bridge unavailable. Restart the app and try again.'
            }
          })
        }
      }

export const defaultCanvasStore = createCanvasStore({
  documentPicker: fallbackBridge.picker,
  documentPersistenceBridge: fallbackBridge.persistence,
  documentRepository: fallbackBridge.repository,
  templateSource: EMPTY_CANVAS_SOURCE
})

const desktopCapabilities = {
  canOpen: true,
  canSave: true,
  canPersist: true,
  canDropImport: false,
  supportsMultiSelect: false,
  newDocumentMode: 'persist-template'
} as const

type AppProps = {
  store?: CanvasStore
}

export function App({ store = defaultCanvasStore }: AppProps) {
  return (
    <CanvasApp
      store={store}
      capabilities={desktopCapabilities}
    />
  )
}
