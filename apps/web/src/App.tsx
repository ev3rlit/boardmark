import defaultTemplateSource from '@fixtures/default-template.canvas.md?raw'
import { ViewerShell, createViewerStore, type ViewerStore } from '@boardmark/viewer-shell'
import { createBrowserDocumentBridge } from './document-bridge'

const browserBridge = createBrowserDocumentBridge()

const defaultViewerStore = createViewerStore({
  documentPicker: browserBridge.picker,
  documentRepository: browserBridge.repository,
  templateSource: defaultTemplateSource
})

const webCapabilities = {
  canOpen: true,
  canSave: false,
  newDocumentMode: 'reset-template'
} as const

type AppProps = {
  store?: ViewerStore
}

export function App({ store = defaultViewerStore }: AppProps) {
  return (
    <ViewerShell
      store={store}
      capabilities={webCapabilities}
    />
  )
}
