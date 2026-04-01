import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { CanvasApp } from '@canvas-app/app/canvas-app'
import { createCanvasStore } from '@canvas-app/store/canvas-store'

const templateSource = `---
type: canvas
version: 1
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note #welcome x=80 y=72
Boardmark Viewer
:::

::: note #overview x=380 y=72
Overview
:::

::: edge #welcome-overview from=welcome to=overview kind=curve
main thread
:::`

const noteSourceMap = {
  objectRange: {
    start: { line: 1, offset: 0 },
    end: { line: 3, offset: 12 }
  },
  openingLineRange: {
    start: { line: 1, offset: 0 },
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
      documentRepository: createRepository(),
      templateSource
    })

    render(
      <CanvasApp
        store={store}
        capabilities={{
          canOpen: true,
          canSave: false,
          canPersist: false,
          canDropImport: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')
    expect(store.getState().edges[0]?.content).toBe('main thread')
    expect(screen.getByRole('application')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Image' })).toBeDisabled()
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
          canDropImport: true,
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
          canDropImport: true,
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
          canDropImport: true,
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
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeDisabled()
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
          canDropImport: true,
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
        label: 'Triangle',
        rendererKey: 'boardmark.shape.triangle'
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
          canDropImport: true,
          supportsMultiSelect: true,
          newDocumentMode: 'reset-template'
        }}
      />
    )

    await screen.findByText('Boardmark Viewer')

    fireEvent.click(screen.getByRole('button', { name: 'Frame' }))

    expect(createFrameSpy).toHaveBeenCalled()
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
            version: 1,
            viewport: { x: -180, y: -120, zoom: 0.92 }
          },
          nodes: [
            {
              id: 'welcome',
              type: 'note' as const,
              x: 80,
              y: 72,
              content: 'Boardmark Viewer',
              position: {
                start: { line: 1, offset: 0 },
                end: { line: 3, offset: 12 }
              },
              sourceMap: noteSourceMap
            },
            {
              id: 'overview',
              type: 'note' as const,
              x: 380,
              y: 72,
              content: 'Overview',
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
              kind: 'curve' as const,
              content: 'main thread',
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
