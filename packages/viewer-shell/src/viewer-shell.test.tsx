import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { ViewerShell } from './viewer-shell'
import { createViewerStore } from './viewer-store'

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

describe('ViewerShell', () => {
  it('renders the shared shell and hides save when capabilities do not support it', async () => {
    const store = createViewerStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    render(
      <ViewerShell
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

    expect(screen.getByRole('button', { name: 'Open File' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New File' })).toBeInTheDocument()
    expect(screen.getByText(/Reset to the bundled sample board/)).toBeInTheDocument()
    expect(store.getState().edges[0]?.content).toBe('main thread')
    expect(screen.getByRole('application')).toBeInTheDocument()
    expect(screen.getByText(/Drag a markdown canvas into the shell/)).toBeInTheDocument()
  })

  it('shows conflict actions in the status banner', async () => {
    const store = createViewerStore({
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
      <ViewerShell
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
