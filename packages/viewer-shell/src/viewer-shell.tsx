import { useEffect, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useDropzone } from 'react-dropzone'
import { useStore } from 'zustand'
import { CanvasScene } from './canvas-scene'
import { FileMenu } from './file-menu'
import { StatusPanels } from './status-panels'
import { ToolMenu } from './tool-menu'
import { ZoomControls } from './zoom-controls'
import type { ViewerStore } from './viewer-store'

export type ViewerShellCapabilities = {
  canOpen: boolean
  canSave: boolean
  canPersist: boolean
  canDropImport: boolean
  supportsMultiSelect: boolean
  newDocumentMode: 'persist-template' | 'reset-template'
}

type ViewerShellProps = {
  store: ViewerStore
  capabilities: ViewerShellCapabilities
}

export function ViewerShell({ store, capabilities }: ViewerShellProps) {
  const document = useStore(store, (state) => state.document)
  const deleteSelection = useStore(store, (state) => state.deleteSelection)
  const openDroppedDocument = useStore(store, (state) => state.openDroppedDocument)
  const setDropActive = useStore(store, (state) => state.setDropActive)
  const setDropError = useStore(store, (state) => state.setDropError)
  const setPanShortcutActive = useStore(store, (state) => state.setPanShortcutActive)
  const isDropActive = useStore(store, (state) => state.dropState.status === 'active')
  const editingState = useStore(store, (state) => state.editingState)

  useEffect(() => {
    if (!document) {
      void store.getState().hydrateTemplate()
    }
  }, [document, store])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        if (editingState.status !== 'idle' || isEditableTarget(event.target)) {
          return
        }

        event.preventDefault()
        setPanShortcutActive(true)
        return
      }

      if (editingState.status !== 'idle') {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      event.preventDefault()
      void deleteSelection()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return
      }

      setPanShortcutActive(false)
    }

    const handleWindowBlur = () => {
      setPanShortcutActive(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [deleteSelection, editingState.status, setPanShortcutActive])

  const onDropAccepted = useMemo(
    () => async (files: File[]) => {
      const file = files[0]

      if (!file) {
        return
      }

      const source = await readDroppedFileText(file)
      await openDroppedDocument({
        name: file.name,
        source
      })
    },
    [openDroppedDocument]
  )

  const { getInputProps, getRootProps } = useDropzone({
    accept: {
      'text/markdown': ['.canvas.md', '.md']
    },
    disabled: !capabilities.canDropImport,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDragEnter: () => setDropActive(true),
    onDragLeave: () => setDropActive(false),
    onDrop: () => setDropActive(false),
    onDropRejected: () => setDropError('Only .canvas.md or .md files can be dropped.'),
    onDropAccepted
  })

  return (
    <ReactFlowProvider>
      <main
        {...getRootProps({
          className:
            'relative h-screen w-screen overflow-hidden bg-[var(--color-surface)] text-[var(--color-on-surface)]'
        })}
      >
        <input {...getInputProps()} />
        <CanvasScene
          store={store}
          supportsMultiSelect={capabilities.supportsMultiSelect}
        />

        {capabilities.canDropImport && isDropActive ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-[color:color-mix(in_oklab,var(--color-primary)_10%,transparent)]"
            data-testid="drop-overlay"
          >
            <div className="absolute inset-x-8 top-24 rounded-[1.4rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] px-6 py-5 text-sm text-[var(--color-on-surface)] shadow-[0_20px_40px_rgba(43,52,55,0.08)]">
              Drop a .canvas.md or .md file to replace the current board.
            </div>
          </div>
        ) : null}

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
                <StatusPanels
                  store={store}
                />
              </div>
            </div>
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

async function readDroppedFileText(file: File) {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Response(file).text()
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
