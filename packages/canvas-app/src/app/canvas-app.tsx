import { useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useDropzone } from 'react-dropzone'
import { useStore } from 'zustand'
import {
  canExecuteCanvasAppCommand
} from '@canvas-app/app/commands/canvas-app-commands'
import {
  canExecuteCanvasObjectCommand
} from '@canvas-app/app/commands/canvas-object-commands'
import { createCanvasAppCommandContext, createCanvasObjectCommandContext } from '@canvas-app/app/context/canvas-command-context'
import { useCanvasInputListeners } from '@canvas-app/app/hooks/use-canvas-input-listeners'
import { useCanvasPaste } from '@canvas-app/app/hooks/use-canvas-paste'
import {
  useObjectContextMenu
} from '@canvas-app/app/hooks/use-object-context-menu'
import {
  isCanvasMarkdownFile,
  pickImageFileFromDocument,
  readDroppedFileText,
  readSelectionLabel
} from '@canvas-app/app/utils/canvas-app-helpers'
import {
  selectCanvasDocument,
  selectCanvasEditingState,
  selectCanvasIsDropActive
} from '@canvas-app/store/canvas-selectors'
import { canCanvasMutateSelection } from '@canvas-app/store/canvas-editing-session'
import {
  isEdgeLocked,
  isNodeLocked
} from '@canvas-app/store/canvas-object-selection'
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
  const setTemporaryPanState = useStore(store, (state) => state.setTemporaryPanState)
  const setViewport = useStore(store, (state) => state.setViewport)
  const clearSelection = useStore(store, (state) => state.clearSelection)
  const commitNodeMove = useStore(store, (state) => state.commitNodeMove)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const resetNodeHeight = useStore(store, (state) => state.resetNodeHeight)
  const toggleSelectedImageLockAspectRatio = useStore(store, (state) => state.toggleSelectedImageLockAspectRatio)
  const redo = useStore(store, (state) => state.redo)
  const copySelection = useStore(store, (state) => state.copySelection)
  const cutSelection = useStore(store, (state) => state.cutSelection)
  const pasteClipboard = useStore(store, (state) => state.pasteClipboard)
  const pasteClipboardInPlace = useStore(store, (state) => state.pasteClipboardInPlace)
  const selectAllObjects = useStore(store, (state) => state.selectAllObjects)
  const duplicateSelection = useStore(store, (state) => state.duplicateSelection)
  const arrangeSelection = useStore(store, (state) => state.arrangeSelection)
  const groupSelection = useStore(store, (state) => state.groupSelection)
  const replaceSelection = useStore(store, (state) => state.replaceSelection)
  const setSelectionLocked = useStore(store, (state) => state.setSelectionLocked)
  const ungroupSelection = useStore(store, (state) => state.ungroupSelection)
  const nudgeSelection = useStore(store, (state) => state.nudgeSelection)
  const reconnectEdge = useStore(store, (state) => state.reconnectEdge)
  const selectNodeFromCanvas = useStore(store, (state) => state.selectNodeFromCanvas)
  const selectEdgeFromCanvas = useStore(store, (state) => state.selectEdgeFromCanvas)
  const setPointerInteractionState = useStore(store, (state) => state.setPointerInteractionState)
  const undo = useStore(store, (state) => state.undo)
  const updateSelectedImageAltText = useStore(store, (state) => state.updateSelectedImageAltText)
  const isDropActive = useStore(store, selectCanvasIsDropActive)
  const editingState = useStore(store, selectCanvasEditingState)
  const groups = useStore(store, (state) => state.groups)
  const edges = useStore(store, (state) => state.edges)
  const selectedGroupIds = useStore(store, (state) => state.selectedGroupIds)
  const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
  const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
  const clipboardState = useStore(store, (state) => state.clipboardState)
  const groupSelectionState = useStore(store, (state) => state.groupSelectionState)
  const nodes = useStore(store, (state) => state.nodes)
  const temporaryPanState = useStore(store, (state) => state.temporaryPanState)
  const pointerInteractionState = useStore(store, (state) => state.pointerInteractionState)
  const toolMode = useStore(store, (state) => state.toolMode)
  const viewport = useStore(store, (state) => state.viewport)
  const startObjectEditing = useStore(store, (state) => state.startObjectEditing)
  const startEdgeEditing = useStore(store, (state) => state.startEdgeEditing)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(globalThis.document?.fullscreenElement))
  const {
    alignedObjectContextMenu,
    objectContextMenu,
    setObjectContextMenu
  } = useObjectContextMenu()
  const appCommandContext = useMemo(
    () => createCanvasAppCommandContext({
      deleteSelection,
      editingState,
      edges,
      groupSelectionState,
      groups,
      nodes,
      objectContextMenuOpen: objectContextMenu !== null,
      pointerInteractionState,
      redo,
      selectedEdgeIds,
      selectedGroupIds,
      selectedNodeIds,
      setObjectContextMenu,
      setTemporaryPanState,
      temporaryPanState,
      setViewport,
      undo,
      viewport
    }),
    [
      deleteSelection,
      edges,
      editingState,
      groupSelectionState,
      groups,
      nodes,
      objectContextMenu,
      pointerInteractionState,
      redo,
      selectedEdgeIds,
      selectedGroupIds,
      selectedNodeIds,
      setObjectContextMenu,
      setTemporaryPanState,
      temporaryPanState,
      setViewport,
      undo,
      viewport
    ]
  )
  const objectCommandContext = useMemo(
    () => createCanvasObjectCommandContext({
      clipboardState,
      copySelection,
      cutSelection,
      duplicateSelection,
      arrangeSelection,
      edges,
      editingState,
      groupSelection,
      groupSelectionState,
      groups,
      nudgeSelection,
      nodes,
      pasteClipboard,
      pasteClipboardInPlace,
      selectAllObjects,
      selectedEdgeIds,
      selectedGroupIds,
      selectedNodeIds,
      setSelectionLocked,
      ungroupSelection
    }),
    [
      arrangeSelection,
      clipboardState,
      copySelection,
      cutSelection,
      duplicateSelection,
      edges,
      editingState,
      groupSelection,
      groupSelectionState,
      groups,
      nudgeSelection,
      nodes,
      pasteClipboard,
      pasteClipboardInPlace,
      selectAllObjects,
      selectedEdgeIds,
      selectedGroupIds,
      selectedNodeIds,
      setSelectionLocked,
      ungroupSelection
    ]
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

  const {
    dispatchCanvasInput,
    dispatchCanvasInputAsync,
    pointerCapabilities
  } = useCanvasInputListeners({
    appCommandContext,
    clearSelection,
    commitNodeMove,
    commitNodeResize,
    nudgeSelection,
    openObjectContextMenu: (input) => setObjectContextMenu({
      kind: 'selection',
      ...input
    }),
    openPaneContextMenu: (input) => setObjectContextMenu({
      kind: 'canvas',
      ...input
    }),
    objectCommandContext,
    replaceSelection,
    reconnectEdge,
    selectEdgeFromCanvas,
    selectNodeFromCanvas,
    setPointerInteractionState,
    setTemporaryPanState,
    supportsMultiSelect: capabilities.supportsMultiSelect,
    temporaryPanState,
    toolMode
  })

  useCanvasPaste({
    clipboardReady: clipboardState.status === 'ready',
    createMarkdownImageAsset,
    editingState,
    insertImageFromClipboard,
    pasteClipboard
  })

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

  const selectionLabel = readSelectionLabel(
    selectedGroupIds.length,
    selectedNodeIds.length,
    selectedEdgeIds.length
  )
  const selectedNode = selectedNodeIds[0]
    ? nodes.find((node) => node.id === selectedNodeIds[0])
    : undefined
  const selectedEdge = selectedEdgeIds[0]
    ? edges.find((edge) => edge.id === selectedEdgeIds[0])
    : undefined
  const canEditSelection =
    canCanvasMutateSelection(editingState) &&
    selectedGroupIds.length === 0 &&
    selectedNodeIds.length + selectedEdgeIds.length === 1 &&
    (selectedNode
      ? !isNodeLocked({ groups, nodes }, selectedNode.id)
      : selectedEdge
        ? !isEdgeLocked({ edges, groups, nodes }, selectedEdge.id)
        : false)
  const canDeleteSelection = canExecuteCanvasAppCommand('delete-selection', appCommandContext)
  const canDuplicateSelection = canExecuteCanvasObjectCommand(
    'duplicate-selection',
    objectCommandContext
  )
  const canBringForward = canExecuteCanvasObjectCommand('bring-forward', objectCommandContext)
  const canBringToFront = canExecuteCanvasObjectCommand('bring-to-front', objectCommandContext)
  const canCopySelection = canExecuteCanvasObjectCommand('copy-selection', objectCommandContext)
  const canCutSelection = canExecuteCanvasObjectCommand('cut-selection', objectCommandContext)
  const canLockSelection = canExecuteCanvasObjectCommand('lock-selection', objectCommandContext)
  const canPasteSelection = canExecuteCanvasObjectCommand('paste-selection', objectCommandContext)
  const canSendBackward = canExecuteCanvasObjectCommand('send-backward', objectCommandContext)
  const canSendToBack = canExecuteCanvasObjectCommand('send-to-back', objectCommandContext)
  const canSelectAll = canExecuteCanvasObjectCommand('select-all', objectCommandContext)
  const canGroupSelection = canExecuteCanvasObjectCommand('group-selection', objectCommandContext)
  const canUngroupSelection = canExecuteCanvasObjectCommand('ungroup-selection', objectCommandContext)
  const canUnlockSelection = canExecuteCanvasObjectCommand('unlock-selection', objectCommandContext)
  const lockSelectionLabel = canUnlockSelection ? 'Unlock selection' : 'Lock selection'
  const canToggleSelectionLock = canUnlockSelection || canLockSelection
  const canResetNodeHeight =
    canCanvasMutateSelection(editingState) &&
    selectedNodeIds.length === 1 &&
    selectedEdgeIds.length === 0 &&
    selectedNode !== undefined &&
    !isNodeLocked({ groups, nodes }, selectedNode.id)

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
          dispatchCanvasInput={dispatchCanvasInput}
          dispatchCanvasInputAsync={dispatchCanvasInputAsync}
          onObjectContextMenu={(input) => setObjectContextMenu({
            kind: 'selection',
            ...input
          })}
          onPaneContextMenu={(input) => setObjectContextMenu({
            kind: 'canvas',
            ...input
          })}
          pointerCapabilities={pointerCapabilities}
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
            <ZoomControls
              dispatchCanvasInput={dispatchCanvasInput}
              store={store}
            />
          </div>

          {alignedObjectContextMenu ? (
            <div className="pointer-events-auto absolute inset-0 z-30">
              <ObjectContextMenu
                mode={alignedObjectContextMenu.kind}
                canEdit={canEditSelection}
                canCopy={canCopySelection}
                canCut={canCutSelection}
                canDelete={canDeleteSelection}
                canDuplicate={canDuplicateSelection}
                canGroup={canGroupSelection}
                canBringForward={canBringForward}
                canBringToFront={canBringToFront}
                canLock={canToggleSelectionLock}
                canPaste={canPasteSelection}
                canSendBackward={canSendBackward}
                canSendToBack={canSendToBack}
                canSelectAll={canSelectAll}
                canUngroup={canUngroupSelection}
                lockLabel={lockSelectionLabel}
                imageActions={
                  alignedObjectContextMenu.kind === 'selection' && selectedNode?.component === 'image'
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
                onCopy={() => {
                  setObjectContextMenu(null)
                  void copySelection()
                }}
                onCut={() => {
                  setObjectContextMenu(null)
                  void cutSelection()
                }}
                onDelete={() => {
                  setObjectContextMenu(null)
                  void deleteSelection()
                }}
                onDuplicate={() => {
                  setObjectContextMenu(null)
                  void duplicateSelection()
                }}
                onEdit={() => {
                  setObjectContextMenu(null)

                  if (selectedNodeIds[0]) {
                    if (selectedNode && selectedNode.component === 'image') {
                      return
                    }

                    startObjectEditing(selectedNodeIds[0])
                    return
                  }

                  if (selectedEdgeIds[0]) {
                    startEdgeEditing(selectedEdgeIds[0])
                  }
                }}
                onGroup={() => {
                  setObjectContextMenu(null)
                  void groupSelection()
                }}
                onBringForward={() => {
                  setObjectContextMenu(null)
                  void arrangeSelection('bring-forward')
                }}
                onBringToFront={() => {
                  setObjectContextMenu(null)
                  void arrangeSelection('bring-to-front')
                }}
                onLock={() => {
                  setObjectContextMenu(null)
                  void setSelectionLocked(!canUnlockSelection)
                }}
                onPaste={() => {
                  setObjectContextMenu(null)
                  void pasteClipboard()
                }}
                onPasteInPlace={() => {
                  setObjectContextMenu(null)
                  void pasteClipboardInPlace()
                }}
                onSendBackward={() => {
                  setObjectContextMenu(null)
                  void arrangeSelection('send-backward')
                }}
                onSendToBack={() => {
                  setObjectContextMenu(null)
                  void arrangeSelection('send-to-back')
                }}
                onSelectAll={() => {
                  setObjectContextMenu(null)
                  selectAllObjects()
                }}
                onUngroup={() => {
                  setObjectContextMenu(null)
                  void ungroupSelection()
                }}
                canResetHeight={canResetNodeHeight}
                onResetHeight={() => {
                  setObjectContextMenu(null)
                  if (selectedNodeIds[0]) void resetNodeHeight(selectedNodeIds[0])
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
