import { useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useDropzone } from 'react-dropzone'
import { useStore } from 'zustand'
import {
  canExecuteCanvasAppCommand,
  executeCanvasAppCommand
} from '@canvas-app/app/canvas-app-commands'
import { readCanvasAppKeyBinding } from '@canvas-app/app/canvas-app-keymap'
import {
  selectCanvasDocument,
  selectCanvasEditingState,
  selectCanvasIsDropActive
} from '@canvas-app/store/canvas-selectors'
import { CanvasScene } from '@canvas-app/components/scene/canvas-scene'
import { FileMenu } from '@canvas-app/components/controls/file-menu'
import { HistoryControls } from '@canvas-app/components/controls/history-controls'
import { ObjectContextMenu } from '@canvas-app/components/context-menu/object-context-menu'
import { StatusPanels } from '@canvas-app/components/controls/status-panels'
import { ToolMenu } from '@canvas-app/components/controls/tool-menu'
import { ZoomControls } from '@canvas-app/components/controls/zoom-controls'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

export type CanvasAppCapabilities = {
  canOpen: boolean
  canSave: boolean
  canPersist: boolean
  canDropDocumentImport: boolean
  canDropImageInsertion: boolean
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
  const createMarkdownImageAsset = useStore(store, (state) => state.createMarkdownImageAsset)
  const deleteSelection = useStore(store, (state) => state.deleteSelection)
  const insertImageFromClipboard = useStore(store, (state) => state.insertImageFromClipboard)
  const insertImageFromDrop = useStore(store, (state) => state.insertImageFromDrop)
  const openDroppedDocument = useStore(store, (state) => state.openDroppedDocument)
  const openSelectedImageSource = useStore(store, (state) => state.openSelectedImageSource)
  const replaceSelectedImageFromFile = useStore(store, (state) => state.replaceSelectedImageFromFile)
  const revealSelectedImageSource = useStore(store, (state) => state.revealSelectedImageSource)
  const setDropActive = useStore(store, (state) => state.setDropActive)
  const setDropError = useStore(store, (state) => state.setDropError)
  const setPanShortcutActive = useStore(store, (state) => state.setPanShortcutActive)
  const toggleSelectedImageLockAspectRatio = useStore(store, (state) => state.toggleSelectedImageLockAspectRatio)
  const redo = useStore(store, (state) => state.redo)
  const undo = useStore(store, (state) => state.undo)
  const updateSelectedImageAltText = useStore(store, (state) => state.updateSelectedImageAltText)
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
  const commandContext = useMemo(
    () => ({
      deleteSelection,
      editingState,
      objectContextMenuOpen: objectContextMenu !== null,
      redo,
      setObjectContextMenu,
      setPanShortcutActive,
      undo
    }),
    [deleteSelection, editingState, objectContextMenu, redo, setPanShortcutActive, undo]
  )

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
    const dispatchKeyboardCommand = (
      eventType: 'keydown' | 'keyup',
      event: KeyboardEvent
    ) => {
      const binding = readCanvasAppKeyBinding(eventType, event)

      if (!binding) {
        return
      }

      if (!binding.allowEditableTarget && isEditableTarget(event.target)) {
        return
      }

      if (!canExecuteCanvasAppCommand(binding.commandId, commandContext)) {
        return
      }

      if (binding.preventDefault) {
        event.preventDefault()
      }

      executeCanvasAppCommand(binding.commandId, commandContext)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      dispatchKeyboardCommand('keydown', event)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      dispatchKeyboardCommand('keyup', event)
    }

    const handleWindowBlur = () => {
      executeCanvasAppCommand('deactivate-pan-shortcut', commandContext)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [commandContext])

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const imageFile = readClipboardImageFile(event)

      if (!imageFile) {
        return
      }

      if (editingState.status !== 'idle' && event.target instanceof HTMLTextAreaElement) {
        event.preventDefault()
        const markdown = await createMarkdownImageAsset(imageFile)

        if (!markdown) {
          return
        }

        insertTextAtSelection(event.target, markdown)
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      await insertImageFromClipboard(imageFile)
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [createMarkdownImageAsset, editingState.status, insertImageFromClipboard])

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

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [objectContextMenu])

  const onDropAccepted = useMemo(
    () => async (files: File[]) => {
      const file = files[0]

      if (!file) {
        return
      }

      if (isCanvasMarkdownFile(file)) {
        const source = await readDroppedFileText(file)
        await openDroppedDocument({
          name: file.name,
          source
        })
        return
      }

      if (file.type.startsWith('image/')) {
        await insertImageFromDrop(file)
      }
    },
    [insertImageFromDrop, openDroppedDocument]
  )

  const { getInputProps, getRootProps } = useDropzone({
    accept: {
      'text/markdown': ['.canvas.md', '.md'],
      'image/*': []
    },
    disabled: !capabilities.canDropDocumentImport && !capabilities.canDropImageInsertion,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDragEnter: () => setDropActive(true),
    onDragLeave: () => setDropActive(false),
    onDrop: () => setDropActive(false),
    onDropRejected: () => setDropError('Only canvas markdown documents or image files can be dropped.'),
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
  const selectedNode = selectedNodeIds[0]
    ? nodes.find((node) => node.id === selectedNodeIds[0])
    : undefined
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

        {(capabilities.canDropDocumentImport || capabilities.canDropImageInsertion) && isDropActive ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-[color:color-mix(in_oklab,var(--color-primary)_10%,transparent)]"
            data-testid="drop-overlay"
          >
            <div className="absolute inset-x-8 top-24 rounded-[1.4rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] px-6 py-5 text-sm text-[var(--color-on-surface)] shadow-[0_20px_40px_rgba(43,52,55,0.08)]">
              Drop a `.canvas.md` file to replace the board, or drop an image to insert it.
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

          <div className="pointer-events-auto absolute bottom-5 right-5 flex items-end gap-3">
            <HistoryControls store={store} />
            <ZoomControls store={store} />
          </div>

          {alignedObjectContextMenu ? (
            <div className="pointer-events-auto absolute inset-0 z-30">
              <ObjectContextMenu
                canEdit={canEditSelection}
                imageActions={
                  selectedNode?.component === 'image'
                    ? {
                        canReveal: !/^https?:\/\//.test(selectedNode.src ?? ''),
                        lockAspectRatioLabel:
                          selectedNode.lockAspectRatio
                            ? 'Unlock aspect ratio'
                            : 'Lock aspect ratio',
                        onEditAltText: () => {
                          const alt = window.prompt('Alt text', selectedNode.alt ?? '')

                          setObjectContextMenu(null)

                          if (alt !== null) {
                            void updateSelectedImageAltText(alt)
                          }
                        },
                        onOpenSource: () => {
                          setObjectContextMenu(null)
                          void openSelectedImageSource()
                        },
                        onReplaceImage: () => {
                          setObjectContextMenu(null)
                          void pickImageFileFromDocument(globalThis.document).then((file) => {
                            if (file) {
                              void replaceSelectedImageFromFile(file)
                            }
                          })
                        },
                        onRevealFile: () => {
                          setObjectContextMenu(null)
                          void revealSelectedImageSource()
                        },
                        onToggleLockAspectRatio: () => {
                          setObjectContextMenu(null)
                          void toggleSelectedImageLockAspectRatio()
                        }
                      }
                    : null
                }
                onDelete={() => {
                  setObjectContextMenu(null)
                  void deleteSelection()
                }}
                onEdit={() => {
                  setObjectContextMenu(null)

                  if (selectedNodeIds[0]) {
                    if (selectedNode && selectedNode.component === 'image') {
                      return
                    }

                    if (selectedNode && selectedNode.component !== 'note') {
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

function isCanvasMarkdownFile(file: File) {
  return /\.canvas\.md$|\.md$/i.test(file.name)
}

function readClipboardImageFile(event: ClipboardEvent) {
  const items = event.clipboardData?.items ?? []

  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()

      if (file) {
        return file
      }
    }
  }

  return null
}

function insertTextAtSelection(target: HTMLTextAreaElement, text: string) {
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`
  const nextCursor = start + text.length

  target.value = nextValue
  target.setSelectionRange(nextCursor, nextCursor)
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

async function pickImageFileFromDocument(rootDocument: Document) {
  if (!rootDocument.body) {
    return null
  }

  const input = rootDocument.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.hidden = true
  rootDocument.body.appendChild(input)

  return new Promise<File | null>((resolve) => {
    const finish = (file: File | null) => {
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null)
    }, { once: true })
    input.click()
  })
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
