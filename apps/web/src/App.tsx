import {
  CanvasApp,
  EMPTY_CANVAS_SOURCE,
  MarkdownContentImageActionsProvider,
  createCanvasStore,
  createFencedBlockImageActions,
  type CanvasStore
} from '@boardmark/canvas-app'
import { WysiwygPhase0Spike } from '@boardmark/canvas-app/components/wysiwyg-phase0/wysiwyg-phase0-spike'
import { createBrowserDocumentBridge } from './document-bridge'

const browserBridge = createBrowserDocumentBridge()
const fencedBlockImageActions = createFencedBlockImageActions()

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

  return (
    <MarkdownContentImageActionsProvider actions={fencedBlockImageActions}>
      {spikeMode === 'wysiwyg-phase0' ? (
        <WysiwygPhase0Spike />
      ) : (
        <CanvasApp
          store={store}
          capabilities={webCapabilities}
        />
      )}
    </MarkdownContentImageActionsProvider>
  )
}
