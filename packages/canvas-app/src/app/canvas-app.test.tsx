import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import {
  canExecuteCanvasObjectCommand
} from '@canvas-app/app/commands/canvas-object-commands'
import { createCanvasAppCommandContext, createCanvasObjectCommandContext } from '@canvas-app/app/context/canvas-command-context'
import { CanvasApp } from '@canvas-app/app/canvas-app'
import {
  EMPTY_CANVAS_DOCUMENT_NAME,
  EMPTY_CANVAS_SOURCE
} from '@canvas-app/document/empty-canvas'
import { createCanvasStore } from '@canvas-app/store/canvas-store'

const templateSource = `---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 } }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview }
main thread
:::`

const noteSourceMap = {
  objectRange: {
    start: { line: 1, offset: 0 },
    end: { line: 3, offset: 12 }
  },
  headerLineRange: {
    start: { line: 1, offset: 0 },
    end: { line: 1, offset: 10 }
  },
  metadataRange: {
    start: { line: 1, offset: 8 },
    end: { line: 1, offset: 10 }
  },
  bodyRange: {
    start: { line: 2, offset: 11 },
    end: { line: 3, offset: 12 }
  },
  closingLineRange: {
    start: { line: 3, offset: 9 },
    end: { line: 3, offset: 12 }
  }
} as const

const DEFAULT_CAPABILITIES = {
  canOpen: true,
  canSave: true,
  canPersist: true,
  canDropDocumentImport: true,
  canDropImageInsertion: true,
  supportsMultiSelect: true,
  newDocumentMode: 'reset-template' as const
}

vi.mock('@canvas-app/components/scene/canvas-scene', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const { useStore } = await vi.importActual<typeof import('zustand')>('zustand')
  const { readActiveToolMode } = await vi.importActual<typeof import('@canvas-app/store/canvas-store')>('@canvas-app/store/canvas-store')

  return {
    CanvasScene({
      onObjectContextMenu,
      onPaneContextMenu,
      store
    }: {
      onObjectContextMenu?: (input: { x: number; y: number }) => void
      onPaneContextMenu?: (input: { x: number; y: number }) => void
      store: ReturnType<typeof createCanvasStore>
    }) {
      const nodes = useStore(store, (state) => state.nodes)
      const edges = useStore(store, (state) => state.edges)
      const groups = useStore(store, (state) => state.groups)
      const editingState = useStore(store, (state) => state.editingState)
      const selectedGroupIds = useStore(store, (state) => state.selectedGroupIds)
      const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
      const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
      const selectNodeFromCanvas = useStore(store, (state) => state.selectNodeFromCanvas)
      const selectEdgeFromCanvas = useStore(store, (state) => state.selectEdgeFromCanvas)
      const startObjectEditing = useStore(store, (state) => state.startObjectEditing)
      const startEdgeEditing = useStore(store, (state) => state.startEdgeEditing)
      const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
      const activeToolMode = useStore(store, readActiveToolMode)

      return (
        <div
          className={activeToolMode === 'pan' ? 'boardmark-flow--pan' : ''}
          role="application"
        >
          <div
            className="react-flow__pane"
            onContextMenu={(event) => {
              event.preventDefault()
              const hasSelection =
                selectedGroupIds.length + selectedNodeIds.length + selectedEdgeIds.length > 0

              if (hasSelection) {
                onObjectContextMenu?.({
                  x: event.clientX,
                  y: event.clientY
                })
                return
              }

              onPaneContextMenu?.({
                x: event.clientX,
                y: event.clientY
              })
            }}
          />
          {nodes.map((node) => {
            const isEditing = editingState.status === 'active'
              && editingState.target.kind === 'object-body'
              && editingState.target.objectId === node.id

            return (
              <div
                key={node.id}
                onClick={(event) => {
                  if (activeToolMode === 'select') {
                    selectNodeFromCanvas(node.id, event.shiftKey)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  const isNodeIncludedInCurrentSelection = selectedNodeIds.includes(node.id)
                    || groups.some((group) =>
                      selectedGroupIds.includes(group.id) && group.members.nodeIds.includes(node.id)
                    )

                  if (!isNodeIncludedInCurrentSelection) {
                    selectNodeFromCanvas(node.id, event.shiftKey)
                  }
                  onObjectContextMenu?.({
                    x: event.clientX,
                    y: event.clientY
                  })
                }}
                onDoubleClick={() => {
                  if (!node.locked && node.component !== 'image') {
                    startObjectEditing(node.id)
                  }
                }}
              >
                {isEditing ? (
                  <div
                    aria-label={`Edit ${node.id}`}
                    className="nodrag nopan"
                    contentEditable
                    onBlur={() => {
                      void commitInlineEditing()
                    }}
                    role="textbox"
                    suppressContentEditableWarning
                  >
                    {editingState.draftMarkdown}
                  </div>
                ) : (
                  <span>{(node.body ?? '').trim() || node.component}</span>
                )}
              </div>
            )
          })}
          {edges.map((edge) => {
            const isEditing = editingState.status === 'active'
              && editingState.target.kind === 'edge-label'
              && editingState.target.edgeId === edge.id

            return (
              <div
                key={edge.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  if (!selectedEdgeIds.includes(edge.id)) {
                    selectEdgeFromCanvas(edge.id, event.shiftKey)
                  }
                  onObjectContextMenu?.({
                    x: event.clientX,
                    y: event.clientY
                  })
                }}
                onDoubleClick={() => {
                  if (!edge.locked) {
                    startEdgeEditing(edge.id)
                  }
                }}
              >
                {isEditing ? (
                  <div
                    aria-label={`Edit ${edge.id}`}
                    className="nodrag nopan"
                    contentEditable
                    onBlur={() => {
                      void commitInlineEditing()
                    }}
                    role="textbox"
                    suppressContentEditableWarning
                  >
                    {editingState.draftMarkdown}
                  </div>
                ) : (
                  <span>{(edge.body ?? '').trim()}</span>
                )}
              </div>
            )
          })}
        </div>
      )
    }
  }
})

describe('CanvasApp', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('renders the shared shell', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: EMPTY_CANVAS_SOURCE
    })

    await renderCanvasAppForTest({
      capabilities: {
        ...DEFAULT_CAPABILITIES,
        canSave: false,
        canPersist: false
      },
      store
    })

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    expect(store.getState().nodes).toHaveLength(0)
    expect(store.getState().edges).toHaveLength(0)
    expect(screen.getByRole('application')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Image' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit canvas' })).toBeInTheDocument()
  })

  it('shows conflict actions in the status banner', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.setState({
      conflictState: {
        status: 'conflict',
        diskSource: templateSource.replace('Boardmark Viewer', 'Disk Version')
      }
    })

    await renderCanvasAppForTest({ store })

    expect(screen.getByText(/The file changed on disk/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload from disk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep local draft' })).toBeInTheDocument()
  })

  it('reflects temporary spacebar pan mode in the toolbar and canvas cursor', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    const application = screen.getByRole('application')
    const selectButton = screen.getByRole('button', { name: 'Select' })
    const panButton = screen.getByRole('button', { name: 'Pan' })

    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    expect(panButton).toHaveAttribute('aria-pressed', 'false')
    expect(application).not.toHaveClass('boardmark-flow--pan')

    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    })

    expect(selectButton).toHaveAttribute('aria-pressed', 'false')
    expect(panButton).toHaveAttribute('aria-pressed', 'true')
    expect(application).toHaveClass('boardmark-flow--pan')

    await dispatchUiEvent(() => {
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    })

    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    expect(panButton).toHaveAttribute('aria-pressed', 'false')
    expect(application).not.toHaveClass('boardmark-flow--pan')
  })

  it('keeps deferred temporary pan out of the toolbar and cursor until pane pan becomes active', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    act(() => {
      store.setState({
        temporaryPanState: 'deferred',
        pointerInteractionState: { status: 'idle' }
      })
    })

    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pan' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('application')).not.toHaveClass('boardmark-flow--pan')

    act(() => {
      store.setState({
        temporaryPanState: 'active',
        pointerInteractionState: {
          status: 'pane-pan',
          source: 'temporary-pan'
        }
      })
    })

    expect(screen.getByRole('button', { name: 'Pan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('application')).toHaveClass('boardmark-flow--pan')
  })

  it('does not select objects while pan mode is active', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pan' }))
    })
    await dispatchUiEvent(() => {
      fireEvent.click(noteText)
    })

    expect(store.getState().selectedNodeIds).toEqual([])
    expect(store.getState().selectedEdgeIds).toEqual([])
  })

  it('opens the object context menu on node right-click', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(noteText)
    })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export…' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Edit object' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete object' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeEnabled()
    expect(screen.getByRole('group', { name: 'Copy as' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Raw copy' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Markdown content body copy' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Cut' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: 'Paste' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Group' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Ungroup' })).not.toBeInTheDocument()
  })

  it('opens the canvas context menu on empty canvas right-click', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: EMPTY_CANVAS_SOURCE
    })
    const { container } = await renderCanvasAppForTest({
      capabilities: {
        ...DEFAULT_CAPABILITIES,
        canSave: false,
        canPersist: false
      },
      store
    })

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    act(() => {
      store.setState({
        clipboardState: {
          status: 'ready',
          payload: {
            groups: [],
            nodes: [
              {
                id: 'note-clipboard',
                component: 'note',
                at: { x: 0, y: 0, w: 320, h: 220 }
              }
            ],
            edges: [],
            origin: { x: 0, y: 0 }
          }
        }
      })
    })

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(readFlowPane(container))
    })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Export…' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Paste in place' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Select all' })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: /Edit / })).not.toBeInTheDocument()
  })

  it('opens the export dialog from the selection context menu with selection scope preselected', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(noteText)
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Export…' }))
    })

    expect(screen.getByRole('dialog', { name: 'Export Canvas' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^PNG/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Selection only/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Whole board/ })).not.toBeChecked()
  })

  it('copies markdown content body from the object context menu', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const copyMarkdownSpy = vi.spyOn(store.getState(), 'copySelectionMarkdownContentBody')

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(noteText)
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown content body copy' }))
    })

    expect(copyMarkdownSpy).toHaveBeenCalledTimes(1)
  })

  it('allows switching export format and scope from the dialog', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(noteText)
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Export…' }))
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByText('JPG'))
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByText('Whole board'))
    })

    expect(screen.getByRole('radio', { name: /^JPG/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Whole board/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Selection only/ })).not.toBeChecked()
  })

  it('opens the export dialog from the canvas context menu with whole board preselected', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const { container } = await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(readFlowPane(container))
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Export…' }))
    })

    expect(screen.getByRole('dialog', { name: 'Export Canvas' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Whole board/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Selection only/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^JPG/ })).not.toBeChecked()
  })

  it('preserves multi-selection when opening the context menu from a selected object', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await act(async () => {
      await store.getState().hydrateTemplate()
    })
    act(() => {
      store.getState().replaceSelectedNodes(['welcome', 'overview'])
    })

    await renderCanvasAppForTest({ store })

    const welcome = await screen.findByText('Boardmark Viewer')
    await dispatchUiEvent(() => {
      fireEvent.contextMenu(welcome)
    })

    expect(store.getState().selectedNodeIds).toEqual(['welcome', 'overview'])
    expect(screen.getByRole('menuitem', { name: 'Delete 2 items' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Group' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Bring forward' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Send backward' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Bring to front' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Send to back' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Lock selection' })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: 'Align' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Color' })).not.toBeInTheDocument()
  })

  it('opens the selection context menu when right-clicking the pane with an active multi-selection', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await act(async () => {
      await store.getState().hydrateTemplate()
    })
    act(() => {
      store.getState().replaceSelectedNodes(['welcome', 'overview'])
    })

    const { container } = await renderCanvasAppForTest({ store })

    await dispatchUiEvent(() => {
      fireEvent.contextMenu(readFlowPane(container))
    })

    expect(screen.getByRole('menuitem', { name: 'Delete 2 items' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Group' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Select all' })).not.toBeInTheDocument()
  })

  it('shows only executable context menu items for locked selections', async () => {
    const lockedSource = `---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, locked: true }
Boardmark Viewer
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 } }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview }
main thread
:::`
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: lockedSource
    })

    await act(async () => {
      await store.getState().hydrateTemplate()
    })
    act(() => {
      store.getState().replaceSelectedNodes(['welcome'])
    })

    await renderCanvasAppForTest({ store })

    const welcome = await screen.findByText('Boardmark Viewer')
    await dispatchUiEvent(() => {
      fireEvent.contextMenu(welcome)
    })

    const state = store.getState()
    const appContext = createCanvasAppCommandContext({
      deleteSelection: state.deleteSelection,
      editingState: state.editingState,
      edges: state.edges,
      groupSelectionState: state.groupSelectionState,
      groups: state.groups,
      nodes: state.nodes,
      objectContextMenuOpen: true,
      pointerInteractionState: state.pointerInteractionState,
      redo: state.redo,
      selectedEdgeIds: state.selectedEdgeIds,
      selectedGroupIds: state.selectedGroupIds,
      selectedNodeIds: state.selectedNodeIds,
      setObjectContextMenu: () => undefined,
      setTemporaryPanState: state.setTemporaryPanState,
      temporaryPanState: state.temporaryPanState,
      setViewport: state.setViewport,
      undo: state.undo,
      viewport: state.viewport,
      viewportSize: state.viewportSize
    })
    const objectContext = createCanvasObjectCommandContext({
      arrangeSelection: state.arrangeSelection,
      clipboardState: state.clipboardState,
      copySelection: state.copySelection,
      cutSelection: state.cutSelection,
      duplicateSelection: state.duplicateSelection,
      edges: state.edges,
      editingState: state.editingState,
      groupSelection: state.groupSelection,
      groupSelectionState: state.groupSelectionState,
      groups: state.groups,
      nodes: state.nodes,
      nudgeSelection: state.nudgeSelection,
      pasteClipboard: state.pasteClipboard,
      pasteClipboardInPlace: state.pasteClipboardInPlace,
      selectAllObjects: state.selectAllObjects,
      selectedEdgeIds: state.selectedEdgeIds,
      selectedGroupIds: state.selectedGroupIds,
      selectedNodeIds: state.selectedNodeIds,
      setSelectionLocked: state.setSelectionLocked,
      ungroupSelection: state.ungroupSelection
    })

    expect(screen.queryByRole('menuitem', { name: 'Edit object' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete object' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Cut' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Bring forward' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Unlock selection' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toHaveProperty(
      'disabled',
      !canExecuteCanvasObjectCommand('copy-selection', objectContext)
    )
    expect(screen.getByRole('menuitem', { name: 'Unlock selection' })).toHaveProperty(
      'disabled',
      !canExecuteCanvasObjectCommand('unlock-selection', objectContext)
    )
  })

  it('opens the shape menu and dispatches the selected shape preset', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const createShapeSpy = vi.spyOn(store.getState(), 'createShapeAtViewport')

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Triangle' }))
    })

    expect(createShapeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Triangle'),
        component: 'boardmark.shape.triangle'
      })
    )
  })

  it('dispatches frame creation from the tool menu', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const createFrameSpy = vi.spyOn(store.getState(), 'createFrameAtViewport')

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Frame' }))
    })

    expect(createFrameSpy).toHaveBeenCalled()
  })

  it('opens note editing through the shared WYSIWYG host and commits on blur', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const commitInlineEditingSpy = vi.spyOn(store.getState(), 'commitInlineEditing')

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.doubleClick(noteText)
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })

    act(() => {
      store.getState().updateEditingMarkdown('Line 1\nLine 2')
    })

    expect(editor.tagName).not.toBe('TEXTAREA')
    expect(editor).toHaveClass('nodrag')
    expect(editor).toHaveClass('nopan')
    expect(store.getState().editingState).toMatchObject({
      status: 'active',
      surface: 'wysiwyg',
      target: {
        kind: 'object-body',
        component: 'note',
        objectId: 'welcome'
      }
    })
    expect(commitInlineEditingSpy).not.toHaveBeenCalled()
    expect(store.getState().draftSource).not.toContain('Line 1\nLine 2')

    await dispatchUiEvent(() => {
      fireEvent.blur(editor)
    })

    await waitFor(() => {
      expect(commitInlineEditingSpy).toHaveBeenCalledTimes(1)
      expect(store.getState().editingState.status).toBe('idle')
    })
    expect(store.getState().draftSource).toContain('Line 1 Line 2')
    expect(store.getState().draftSource).not.toContain('Line 1\nLine 2')
    expect(screen.queryByRole('textbox', { name: 'Edit welcome' })).not.toBeInTheDocument()
  })

  it('does not rewrite source when a WYSIWYG session only blurs without edits', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const commitInlineEditingSpy = vi.spyOn(store.getState(), 'commitInlineEditing')

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')
    const sourceBeforeEditing = store.getState().draftSource

    await dispatchUiEvent(() => {
      fireEvent.doubleClick(noteText)
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })

    await dispatchUiEvent(() => {
      fireEvent.blur(editor)
    })

    await waitFor(() => {
      expect(commitInlineEditingSpy).toHaveBeenCalledTimes(1)
      expect(store.getState().editingState.status).toBe('idle')
    })
    expect(store.getState().draftSource).toBe(sourceBeforeEditing)
  })

  it('flushes an active editor session before saving', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const saveSpy = vi.spyOn(store.getState(), 'saveCurrentDocument')

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.doubleClick(noteText)
    })
    act(() => {
      store.getState().updateEditingMarkdown('Saved from session')
    })

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    })

    await waitFor(() => {
      expect(store.getState().draftSource).toContain('Saved from session')
      expect(saveSpy).toHaveBeenCalled()
    })
  })

  it('reflects history availability in the shared controls', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    const undoButton = screen.getByRole('button', { name: 'Undo' })
    const redoButton = screen.getByRole('button', { name: 'Redo' })

    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()

    act(() => {
      store.setState({
        history: {
          past: [
            {
              label: 'Move node',
              source: templateSource,
              selectedGroupIds: [],
              selectedNodeIds: ['welcome'],
              selectedEdgeIds: []
            }
          ],
          future: [
            {
              label: 'Move node',
              source: templateSource,
              selectedGroupIds: [],
              selectedNodeIds: ['welcome'],
              selectedEdgeIds: []
            }
          ]
        }
      })
    })

    expect(undoButton).toBeEnabled()
    expect(redoButton).toBeEnabled()
  })

  it('routes zoom control buttons through the shared input pipeline', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')
    act(() => {
      store.getState().setViewportSize({
        width: 800,
        height: 600
      })
    })
    const initialViewport = store.getState().viewport

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    })

    expect(store.getState().viewport.zoom).toBe(1.02)
    expect(store.getState().viewport.x).not.toBe(initialViewport.x)
    expect(store.getState().viewport.y).not.toBe(initialViewport.y)

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    })

    expect(store.getState().viewport).toEqual(initialViewport)
  })

  it('toggles grid snapping from the zoom controls menu', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })
    await screen.findByText('Boardmark Viewer')

    expect(store.getState().smartGuides.gridSnappingEnabled).toBe(true)

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom options' }))
    })

    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Grid snap' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await dispatchUiEvent(() => {
      fireEvent.click(toggle)
    })

    expect(store.getState().smartGuides.gridSnappingEnabled).toBe(false)
  })

  it('opens the navigation panel and jumps to the selected search result', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')
    act(() => {
      store.getState().setViewportSize({
        width: 800,
        height: 600
      })
    })
    const initialViewport = store.getState().viewport

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    })

    const searchInput = screen.getByRole('textbox', { name: 'Search canvas' })
    expect(searchInput).toBeInTheDocument()

    await dispatchUiEvent(() => {
      fireEvent.change(searchInput, { target: { value: 'overview' } })
    })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: /Node overview Overview/i }))
    })

    expect(store.getState().selectedNodeIds).toEqual(['overview'])
    expect(store.getState().selectedEdgeIds).toEqual([])
    expect(store.getState().viewport).not.toEqual(initialViewport)
  })

  it('fits the canvas from the zoom controls and navigates between search results', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')
    act(() => {
      store.getState().setViewportSize({
        width: 800,
        height: 600
      })
    })
    const initialViewport = store.getState().viewport

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    })
    const searchInput = screen.getByRole('textbox', { name: 'Search canvas' })
    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Fit canvas' }))
    })

    const fittedCanvasViewport = store.getState().viewport
    expect(fittedCanvasViewport).not.toEqual(initialViewport)

    await dispatchUiEvent(() => {
      fireEvent.change(searchInput, { target: { value: 'o' } })
    })
    const selectionAfterSearch = [...store.getState().selectedNodeIds, ...store.getState().selectedEdgeIds]

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Next result' }))
    })
    const selectionAfterNext = [...store.getState().selectedNodeIds, ...store.getState().selectedEdgeIds]

    await dispatchUiEvent(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Previous result' }))
    })
    const selectionAfterPrevious = [...store.getState().selectedNodeIds, ...store.getState().selectedEdgeIds]

    expect(selectionAfterNext).not.toEqual(selectionAfterSearch)
    expect(selectionAfterPrevious).not.toEqual(selectionAfterNext)
  })

  it('opens canvas navigation with the find shortcut when the canvas is idle', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'f', metaKey: true })
    })

    expect(screen.getByRole('textbox', { name: 'Search canvas' })).toBeInTheDocument()
  })

  it('does not intercept the find shortcut while inline editing is active', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.doubleClick(noteText)
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })

    await dispatchUiEvent(() => {
      fireEvent.keyDown(editor, { key: 'f', metaKey: true })
    })

    expect(screen.queryByRole('textbox', { name: 'Search canvas' })).not.toBeInTheDocument()
  })

  it('dispatches undo and redo shortcuts only when the canvas is idle', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const undoSpy = vi.spyOn(store.getState(), 'undo')
    const redoSpy = vi.spyOn(store.getState(), 'redo')

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true })
      fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true })
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    })

    expect(undoSpy).toHaveBeenCalledTimes(1)
    expect(redoSpy).toHaveBeenCalledTimes(2)
  })

  it('dispatches zoom and object shortcuts only when the canvas is idle', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    store.setState({
      clipboardState: {
        status: 'ready',
        payload: {
          groups: [],
          nodes: [],
          edges: [],
          origin: null
        }
      }
    })
    const selectAllSpy = vi.spyOn(store.getState(), 'selectAllObjects')
    const copySpy = vi.spyOn(store.getState(), 'copySelection')
    const cutSpy = vi.spyOn(store.getState(), 'cutSelection')
    const duplicateSpy = vi.spyOn(store.getState(), 'duplicateSelection')
    const nudgeSpy = vi.spyOn(store.getState(), 'nudgeSelection')
    const pasteSpy = vi.spyOn(store.getState(), 'pasteClipboard')
    const pasteInPlaceSpy = vi.spyOn(store.getState(), 'pasteClipboardInPlace')

    await renderCanvasAppForTest({ store })

    await screen.findByText('Boardmark Viewer')

    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: '=', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: '-', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'a', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'c', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'x', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'v', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'V', metaKey: true, shiftKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'd', metaKey: true })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    await dispatchUiEvent(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    })

    expect(store.getState().viewport.zoom).toBe(0.92)
    expect(selectAllSpy).toHaveBeenCalledTimes(1)
    expect(copySpy).toHaveBeenCalledTimes(1)
    expect(cutSpy).toHaveBeenCalledTimes(1)
    expect(pasteSpy).toHaveBeenCalledTimes(1)
    expect(pasteInPlaceSpy).toHaveBeenCalledTimes(1)
    expect(duplicateSpy).toHaveBeenCalledTimes(1)
    expect(nudgeSpy).toHaveBeenNthCalledWith(1, 1, 0)
    expect(nudgeSpy).toHaveBeenNthCalledWith(2, 10, 0)
  })

  it('does not intercept undo and object shortcuts while inline editing is active, but still allows zoom', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const undoSpy = vi.spyOn(store.getState(), 'undo')
    const selectAllSpy = vi.spyOn(store.getState(), 'selectAllObjects')
    const copySpy = vi.spyOn(store.getState(), 'copySelection')
    const cutSpy = vi.spyOn(store.getState(), 'cutSelection')
    const duplicateSpy = vi.spyOn(store.getState(), 'duplicateSelection')
    const nudgeSpy = vi.spyOn(store.getState(), 'nudgeSelection')
    const pasteSpy = vi.spyOn(store.getState(), 'pasteClipboard')
    const pasteInPlaceSpy = vi.spyOn(store.getState(), 'pasteClipboardInPlace')

    await renderCanvasAppForTest({ store })

    const noteText = await screen.findByText('Boardmark Viewer')
    act(() => {
      store.getState().setViewportSize({
        width: 800,
        height: 600
      })
    })
    const initialViewport = store.getState().viewport

    await dispatchUiEvent(() => {
      fireEvent.doubleClick(noteText)
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })

    await dispatchUiEvent(() => {
      fireEvent.keyDown(editor, { key: 'z', metaKey: true })
      fireEvent.keyDown(editor, { key: 'y', ctrlKey: true })
      fireEvent.keyDown(editor, { key: '=', metaKey: true })
      fireEvent.keyDown(editor, { key: 'a', metaKey: true })
      fireEvent.keyDown(editor, { key: 'c', metaKey: true })
      fireEvent.keyDown(editor, { key: 'x', metaKey: true })
      fireEvent.keyDown(editor, { key: 'v', metaKey: true })
      fireEvent.keyDown(editor, { key: 'V', metaKey: true, shiftKey: true })
      fireEvent.keyDown(editor, { key: 'd', metaKey: true })
      fireEvent.keyDown(editor, { key: 'ArrowRight' })
    })

    expect(undoSpy).not.toHaveBeenCalled()
    expect(selectAllSpy).not.toHaveBeenCalled()
    expect(copySpy).not.toHaveBeenCalled()
    expect(cutSpy).not.toHaveBeenCalled()
    expect(duplicateSpy).not.toHaveBeenCalled()
    expect(nudgeSpy).not.toHaveBeenCalled()
    expect(pasteSpy).not.toHaveBeenCalled()
    expect(pasteInPlaceSpy).not.toHaveBeenCalled()
    expect(store.getState().viewport.zoom).toBe(1.02)
    expect(store.getState().viewport.x).not.toBe(initialViewport.x)
    expect(store.getState().viewport.y).not.toBe(initialViewport.y)
  })
})

function createPicker(): CanvasDocumentPicker {
  return {
    pickOpenLocator: async () => ({
      ok: true,
      value: {
        kind: 'file' as const,
        path: '/tmp/open.canvas.md'
      }
    }),
    pickSaveLocator: async () => ({
      ok: true,
      value: {
        kind: 'file' as const,
        path: '/tmp/saved.canvas.md'
      }
    })
  }
}

async function renderCanvasAppForTest({
  capabilities = DEFAULT_CAPABILITIES,
  store
}: {
  capabilities?: typeof DEFAULT_CAPABILITIES
  store: ReturnType<typeof createCanvasStore>
}) {
  if (!store.getState().document) {
    await act(async () => {
      await store.getState().hydrateTemplate()
    })
  }

  let view: ReturnType<typeof render> | null = null

  await act(async () => {
    view = render(
      <CanvasApp
        store={store}
        capabilities={capabilities}
      />
    )

    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })

  if (!view) {
    throw new Error('Expected CanvasApp test render to produce a view.')
  }

  return view
}

async function dispatchUiEvent(action: () => void) {
  await act(async () => {
    action()
    await waitForUiSettled()
  })
}

async function waitForUiSettled() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function createRepository(): CanvasDocumentRepositoryGateway {
  return {
    readSource: async ({ locator, source, isTemplate }) => ({
      ok: true,
      value: {
        locator,
        name: locator.kind === 'file' ? 'saved.canvas.md' : locator.name,
        source,
        ast: {
          frontmatter: {
            type: 'canvas' as const,
            version: 2,
            viewport: { x: -180, y: -120, zoom: 0.92 }
          },
          groups: [],
          nodes: [
            {
              id: 'welcome',
              component: 'note',
              at: { x: 80, y: 72, w: 320, h: 220 },
              body: 'Boardmark Viewer\n',
              position: {
                start: { line: 1, offset: 0 },
                end: { line: 3, offset: 12 }
              },
              sourceMap: noteSourceMap
            },
            {
              id: 'overview',
              component: 'note',
              at: { x: 380, y: 72, w: 320, h: 220 },
              body: 'Overview\n',
              position: {
                start: { line: 5, offset: 0 },
                end: { line: 7, offset: 12 }
              },
              sourceMap: {
                ...noteSourceMap,
                objectRange: {
                  start: { line: 5, offset: 0 },
                  end: { line: 7, offset: 12 }
                }
              }
            }
          ],
          edges: [
            {
              id: 'welcome-overview',
              from: 'welcome',
              to: 'overview',
              body: 'main thread\n',
              position: {
                start: { line: 9, offset: 0 },
                end: { line: 11, offset: 12 }
              },
              sourceMap: {
                ...noteSourceMap,
                objectRange: {
                  start: { line: 9, offset: 0 },
                  end: { line: 11, offset: 12 }
                }
              }
            }
          ]
        },
        issues: [],
        isTemplate
      }
    }),
    read: async () => ({
      ok: false,
      error: {
        kind: 'read-failed' as const,
        message: 'Not used in this test.'
      }
    }),
    save: async () => ({
      ok: false,
      error: {
        kind: 'write-failed' as const,
        message: 'Not used in this test.'
      }
    })
  }
}

function toGateway(repository: ReturnType<typeof createCanvasMarkdownDocumentRepository>): CanvasDocumentRepositoryGateway {
  return {
    read: async (locator) =>
      repository.read(locator).match(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error })
      ),
    readSource: async (input) => {
      const result = repository.readSource(input)

      if (result.isErr()) {
        return {
          ok: false as const,
          error: result.error
        }
      }

      return {
        ok: true as const,
        value: result.value
      }
    },
    save: async (input) =>
      repository.save(input).match(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error })
      )
  }
}

function readFlowPane(container: HTMLElement) {
  const pane = container.querySelector('.react-flow__pane')

  if (!(pane instanceof HTMLElement)) {
    throw new Error('React Flow pane not found.')
  }

  return pane
}
