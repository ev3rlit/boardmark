import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CanvasApp,
  EMPTY_CANVAS_SOURCE,
  MarkdownContentImageActionsProvider,
  createCanvasStore,
  createFencedBlockImageActions,
  type CanvasStore
} from '@boardmark/canvas-app'
import '@boardmark/canvas-app/styles/canvas-app.css'
import {
  createHostBridge,
  type DocumentErrorSnapshot,
  type DocumentSnapshot
} from './host-bridge'

const bridge = createHostBridge()
const fencedBlockImageActions = createFencedBlockImageActions()

const vscodeCapabilities = {
  canOpen: false,
  canSave: true,
  canPersist: true,
  canDropDocumentImport: false,
  canDropImageInsertion: false,
  supportsMultiSelect: true,
  newDocumentMode: 'reset-template'
} as const

type StoreState =
  | { status: 'waiting' }
  | { status: 'loading'; snapshot: DocumentSnapshot }
  | { status: 'ready'; store: CanvasStore }
  | { status: 'error'; message: string }

function CanvasShell() {
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(bridge.snapshot())
  const [documentError, setDocumentError] = useState<DocumentErrorSnapshot | null>(bridge.error())
  const [storeState, setStoreState] = useState<StoreState>({ status: 'waiting' })

  useEffect(() => {
    const unsubscribeSnapshots = bridge.subscribe(setSnapshot)
    const unsubscribeErrors = bridge.subscribeErrors(setDocumentError)

    bridge.notifyReady()

    return () => {
      unsubscribeSnapshots()
      unsubscribeErrors()
    }
  }, [])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const isSaveShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's'

      if (!isSaveShortcut) {
        return
      }

      event.preventDefault()
      void bridge.requestSave().catch((error: unknown) => {
        setDocumentError({
          message: error instanceof Error ? error.message : 'VS Code did not save the current Boardmark document.',
          uri: snapshot?.uri ?? ''
        })
      })
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [snapshot?.uri])

  useEffect(() => {
    if (!snapshot || storeState.status !== 'waiting') {
      return
    }

    const store = createCanvasStore({
      documentPicker: bridge.documentBridge.picker,
      documentPersistenceBridge: bridge.documentBridge.persistence,
      documentRepository: bridge.documentBridge.repository,
      imageAssetBridge: bridge.documentBridge.imageAssets,
      templateSource: EMPTY_CANVAS_SOURCE
    })

    setStoreState({ status: 'loading', snapshot })

    void store.getState().openDocument().then(() => {
      const state = store.getState()

      if (!state.document && state.loadState.status === 'error') {
        setStoreState({
          status: 'error',
          message: state.loadState.message
        })
        return
      }

      setStoreState({
        status: 'ready',
        store
      })
    })
  }, [snapshot, storeState.status])

  const content = useMemo(() => {
    if (documentError) {
      return <ErrorView message={documentError.message} />
    }

    if (storeState.status === 'ready') {
      return (
        <MarkdownContentImageActionsProvider actions={fencedBlockImageActions}>
          <CanvasApp
            store={storeState.store}
            capabilities={vscodeCapabilities}
          />
        </MarkdownContentImageActionsProvider>
      )
    }

    if (storeState.status === 'error') {
      return <ErrorView message={storeState.message} />
    }

    return <LoadingView />
  }, [documentError, storeState])

  return content
}

function LoadingView() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-surface)] px-8 text-sm text-[var(--color-on-surface-variant)]">
      Loading Boardmark canvas...
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-surface)] px-8">
      <section className="max-w-xl rounded-2xl bg-[var(--color-surface-container-lowest)] p-6 text-[var(--color-on-surface)] shadow-[0_20px_40px_rgba(43,52,55,0.06)] outline outline-1 outline-[var(--color-outline-ghost)]">
        <p className="text-sm font-semibold text-[var(--color-primary)]">Boardmark 문서가 아닙니다</p>
        <p className="mt-3 text-sm leading-6 text-[var(--color-on-surface-variant)]">{message}</p>
      </section>
    </div>
  )
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Boardmark webview root element not found.')
}

createRoot(container).render(
  <StrictMode>
    <CanvasShell />
  </StrictMode>
)
