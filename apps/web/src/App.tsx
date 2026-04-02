import { CanvasApp, EMPTY_CANVAS_SOURCE, createCanvasStore, type CanvasStore } from '@boardmark/canvas-app'
import { createBrowserDocumentBridge } from './document-bridge'

const browserBridge = createBrowserDocumentBridge()

const defaultCanvasStore = createCanvasStore({
  documentPicker: browserBridge.picker,
  documentPersistenceBridge: browserBridge.persistence,
  documentRepository: browserBridge.repository,
  templateSource: EMPTY_CANVAS_SOURCE
})

const webCapabilities = {
  canOpen: true,
  canSave: true,
  canPersist: true,
  canDropImport: true,
  supportsMultiSelect: true,
  newDocumentMode: 'reset-template'
} as const

type AppProps = {
  store?: CanvasStore
}

export function App({ store = defaultCanvasStore }: AppProps) {
  return (
    <CanvasApp
      store={store}
      capabilities={webCapabilities}
    />
  )
}
