import {
  CanvasApp,
  MarkdownContentImageActionsProvider,
  createFencedBlockImageActions,
  type CanvasStore
} from '@boardmark/canvas-app'
import { WysiwygPhase0Spike } from '@boardmark/canvas-app/components/wysiwyg-phase0/wysiwyg-phase0-spike'
import { ManagedApp } from './managed-app'

const fencedBlockImageActions = createFencedBlockImageActions()

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

export function App({ store }: AppProps) {
  const searchParams =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  const spikeMode = searchParams?.get('spike')

  return (
    <MarkdownContentImageActionsProvider actions={fencedBlockImageActions}>
      {spikeMode === 'wysiwyg-phase0' ? (
        <WysiwygPhase0Spike />
      ) : !store ? <ManagedApp /> : (
        <CanvasApp
          store={store}
          capabilities={webCapabilities}
        />
      )}
    </MarkdownContentImageActionsProvider>
  )
}
