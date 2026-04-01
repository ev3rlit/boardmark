import { useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useDropzone } from 'react-dropzone'
import { useStore } from 'zustand'
import {
  selectCanvasDocument,
  selectCanvasEditingState,
  selectCanvasIsDropActive
} from '@canvas-app/store/canvas-selectors'
import { CanvasScene } from '@canvas-app/components/scene/canvas-scene'
import { FileMenu } from '@canvas-app/components/controls/file-menu'
import { ObjectContextMenu } from '@canvas-app/components/context-menu/object-context-menu'
import { StatusPanels } from '@canvas-app/components/controls/status-panels'
import { ToolMenu } from '@canvas-app/components/controls/tool-menu'
import { ZoomControls } from '@canvas-app/components/controls/zoom-controls'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

export type CanvasAppCapabilities = {
  canOpen: boolean
  canSave: boolean
  canPersist: boolean
  canDropImport: boolean
  supportsMultiSelect: boolean
  newDocumentMode: 'persist-template' | 'reset-template'
}

type ObjectContextMenuState = {
  edgeIds: string[]
  nodeIds: string[]
  x: number
  y: number
}

type CanvasAppProps = {
  store: CanvasStore
  capabilities: CanvasAppCapabilities
}

export function CanvasApp({ store, capabilities }: CanvasAppProps) {
  const currentDocument = useStore(store, selectCanvasDocument)
  const deleteSelection = useStore(store, (state) => state.deleteSelection)
  const openDroppedDocument = useStore(store, (state) => state.openDroppedDocument)
  const setDropActive = useStore(store, (state) => state.setDropActive)
  const setDropError = useStore(store, (state) => state.setDropError)
  const setPanShortcutActive = useStore(store, (state) => state.setPanShortcutActive)
  const isDropActive = useStore(store, selectCanvasIsDropActive)
  const editingState = useStore(store, selectCanvasEditingState)
  const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
  const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
  const nodes = useStore(store, (state) => state.nodes)
  const startNoteEditing = useStore(store, (state) => state.startNoteEditing)
  const startShapeEditing = useStore(store, (state) => state.startShapeEditing)
  const startEdgeEditing = useStore(store, (state) => state.startEdgeEditing)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(globalThis.document?.fullscreenElement))
  const [objectContextMenu, setObjectContextMenu] = useState<ObjectContextMenuState | null>(null)

  useEffect(() => {
    if (!currentDocument) {
      void store.getState().hydrateTemplate()
    }
  }, [currentDocument, store])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(globalThis.document.fullscreenElement))
    }

    globalThis.document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => globalThis.document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

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

  useEffect(() => {
    if (!objectContextMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (target instanceof HTMLElement && target.closest('[role="menu"]')) {
        return
      }

      setObjectContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setObjectContextMenu(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [objectContextMenu])

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

  const onToggleFullscreen = useMemo(
    () => async () => {
      if (globalThis.document.fullscreenElement) {
        await globalThis.document.exitFullscreen()
        return
      }

      await globalThis.document.documentElement.requestFullscreen()
    },
    []
  )

  const selectionLabel = readSelectionLabel(selectedNodeIds.length, selectedEdgeIds.length)
  const canEditSelection = selectedNodeIds.length + selectedEdgeIds.length === 1
  const alignedObjectContextMenu =
    objectContextMenu
      ? {
          ...objectContextMenu,
          x: Math.min(objectContextMenu.x, window.innerWidth - 248),
          y: Math.min(objectContextMenu.y, window.innerHeight - 320)
        }
      : null

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
          onObjectContextMenu={(input) => setObjectContextMenu(input)}
          onPaneContextMenu={() => setObjectContextMenu(null)}
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
            <ToolMenu
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => void onToggleFullscreen()}
              store={store}
            />
          </div>

          <div className="pointer-events-auto absolute bottom-5 right-5">
            <ZoomControls store={store} />
          </div>

          {alignedObjectContextMenu ? (
            <div className="pointer-events-auto absolute inset-0 z-30">
              <ObjectContextMenu
                canEdit={canEditSelection}
                onDelete={() => {
                  setObjectContextMenu(null)
                  void deleteSelection()
                }}
                onEdit={() => {
                  setObjectContextMenu(null)

                  if (selectedNodeIds[0]) {
                    const selectedNode = nodes.find((node) => node.id === selectedNodeIds[0])

                    if (selectedNode?.type === 'shape') {
                      startShapeEditing(selectedNode.id)
                      return
                    }

                    startNoteEditing(selectedNodeIds[0])
                    return
                  }

                  if (selectedEdgeIds[0]) {
                    startEdgeEditing(selectedEdgeIds[0])
                  }
                }}
                selectionLabel={selectionLabel}
                x={alignedObjectContextMenu.x}
                y={alignedObjectContextMenu.y}
              />
            </div>
          ) : null}
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

function readSelectionLabel(selectedNodeCount: number, selectedEdgeCount: number) {
  const totalSelected = selectedNodeCount + selectedEdgeCount

  if (totalSelected <= 1) {
    if (selectedEdgeCount === 1) {
      return 'connector'
    }

    return 'object'
  }

  return `${totalSelected} items`
}
