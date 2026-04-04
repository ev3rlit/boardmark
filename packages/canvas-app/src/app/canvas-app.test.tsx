import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
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

describe('CanvasApp', () => {
  it('renders the shared shell', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: EMPTY_CANVAS_SOURCE
    })

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: false,
          canPersist: false,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

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
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument()
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

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

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

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')

    const application = screen.getByRole('application')
    const selectButton = screen.getByRole('button', { name: 'Select' })
    const panButton = screen.getByRole('button', { name: 'Pan' })

    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    expect(panButton).toHaveAttribute('aria-pressed', 'false')
    expect(application).not.toHaveClass('boardmark-flow--pan')

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })

    expect(selectButton).toHaveAttribute('aria-pressed', 'false')
    expect(panButton).toHaveAttribute('aria-pressed', 'true')
    expect(application).toHaveClass('boardmark-flow--pan')

    fireEvent.keyUp(window, { code: 'Space', key: ' ' })

    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    expect(panButton).toHaveAttribute('aria-pressed', 'false')
    expect(application).not.toHaveClass('boardmark-flow--pan')
  })

  it('does not select objects while pan mode is active', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    const noteText = await screen.findByText('Boardmark Viewer')

    fireEvent.click(screen.getByRole('button', { name: 'Pan' }))
    fireEvent.click(noteText)

    expect(store.getState().selectedNodeIds).toEqual([])
    expect(store.getState().selectedEdgeIds).toEqual([])
  })

  it('opens the object context menu on node right-click', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    const noteText = await screen.findByText('Boardmark Viewer')

    fireEvent.contextMenu(noteText)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit object' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete object' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Cut' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Group' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Ungroup' })).toBeDisabled()
  })

  it('opens the shape menu and dispatches the selected shape preset', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const createShapeSpy = vi.spyOn(store.getState(), 'createShapeAtViewport')

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')

    fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Triangle' }))

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

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')

    fireEvent.click(screen.getByRole('button', { name: 'Frame' }))

    expect(createFrameSpy).toHaveBeenCalled()
  })

  it('keeps markdown object editing active on Enter, then commits on blur', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const commitInlineEditingSpy = vi.spyOn(store.getState(), 'commitInlineEditing')

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    const noteText = await screen.findByText('Boardmark Viewer')

    fireEvent.doubleClick(noteText)

    const editor = (await screen.findByRole('textbox', { name: 'Edit welcome' })) as HTMLTextAreaElement

    fireEvent.change(editor, { target: { value: 'Line 1' } })
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })
    fireEvent.change(editor, { target: { value: 'Line 1\nLine 2' } })

    expect(editor).toHaveValue('Line 1\nLine 2')
    expect(editor).toHaveClass('nodrag')
    expect(editor).toHaveClass('nopan')
    expect(store.getState().editingState.status).toBe('note')
    expect(commitInlineEditingSpy).not.toHaveBeenCalled()
    expect(store.getState().draftSource).not.toContain('Line 1\nLine 2')

    fireEvent.blur(editor)

    await waitFor(() => {
      expect(commitInlineEditingSpy).toHaveBeenCalledTimes(1)
      expect(store.getState().editingState.status).toBe('idle')
    })
    expect(store.getState().draftSource).toContain('Line 1\nLine 2')
    expect(screen.queryByRole('textbox', { name: 'Edit welcome' })).not.toBeInTheDocument()
  })

  it('reflects history availability in the shared controls', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

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

  it('dispatches undo and redo shortcuts only when the canvas is idle', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })
    const undoSpy = vi.spyOn(store.getState(), 'undo')
    const redoSpy = vi.spyOn(store.getState(), 'redo')

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

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

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')

    fireEvent.keyDown(window, { key: '=', metaKey: true })
    fireEvent.keyDown(window, { key: '-', metaKey: true })
    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    fireEvent.keyDown(window, { key: 'c', metaKey: true })
    fireEvent.keyDown(window, { key: 'x', metaKey: true })
    fireEvent.keyDown(window, { key: 'v', metaKey: true })
    fireEvent.keyDown(window, { key: 'V', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })

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

  it('does not intercept undo shortcuts while inline editing is active', async () => {
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

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: true,
          canPersist: true,
          canDropDocumentImport: true,
          canDropImageInsertion: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    const noteText = await screen.findByText('Boardmark Viewer')

    fireEvent.doubleClick(noteText)

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })

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

    expect(undoSpy).not.toHaveBeenCalled()
    expect(selectAllSpy).not.toHaveBeenCalled()
    expect(copySpy).not.toHaveBeenCalled()
    expect(cutSpy).not.toHaveBeenCalled()
    expect(duplicateSpy).not.toHaveBeenCalled()
    expect(nudgeSpy).not.toHaveBeenCalled()
    expect(pasteSpy).not.toHaveBeenCalled()
    expect(pasteInPlaceSpy).not.toHaveBeenCalled()
    expect(store.getState().viewport.zoom).toBe(0.92)
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
