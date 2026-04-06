import { CanvasApp, EMPTY_CANVAS_SOURCE, createCanvasStore, type CanvasStore } from '@boardmark/canvas-app'
import { WysiwygPhase0Spike } from '@boardmark/canvas-app/components/wysiwyg-phase0/wysiwyg-phase0-spike'
import { createBrowserDocumentBridge } from './document-bridge'

const browserBridge = createBrowserDocumentBridge()

const defaultCanvasStore = createCanvasStore({
  documentPicker: browserBridge.picker,
  documentPersistenceBridge: browserBridge.persistence,
  imageAssetBridge: browserBridge.imageAssets,
  documentRepository: browserBridge.repository,
  templateSource: EMPTY_CANVAS_SOURCE
})

const webCapabilities = {
  canOpen: true,
  canSave: true,
  canPersist: true,
  canDropDocumentImport: true,
  canDropImageInsertion: true,
  supportsMultiSelect: true,
  newDocumentMode: 'reset-template'
} as const

type AppProps = {
  store?: CanvasStore
}

export function App({ store = defaultCanvasStore }: AppProps) {
  const searchParams =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  const spikeMode = searchParams?.get('spike')

  if (spikeMode === 'wysiwyg-phase0') {
    return <WysiwygPhase0Spike />
  }

  return (
    <CanvasApp
      store={store}
      capabilities={webCapabilities}
    />
  )
}
