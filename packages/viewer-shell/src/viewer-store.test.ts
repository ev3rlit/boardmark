import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import type { CanvasAST } from '@boardmark/canvas-domain'
import type { ViewerDocumentPersistenceBridge } from './document-session'
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

const openedSource = `---
type: canvas
version: 1
viewport:
  x: 40
  y: 18
  zoom: 1.2
---

::: note #open x=24 y=24
Opened Board
:::

::: note #next x=360 y=24
Next
:::

::: edge #open-next from=open to=next kind=curve
broken flow
:::`

describe('viewer store', () => {
  it('hydrates the bundled template as an unsaved draft session', async () => {
    const store = createViewerStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()

    expect(store.getState().document?.isTemplate).toBe(true)
    expect(store.getState().documentSession?.isPersisted).toBe(false)
    expect(store.getState().persistedSnapshotSource).toBeNull()
    expect(store.getState().isDirty).toBe(true)
    expect(store.getState().nodes).toHaveLength(2)
  })

  it('opens a persisted browser document through the persistence bridge', async () => {
    const persistenceBridge = createPersistenceBridge()
    const store = createViewerStore({
      documentPicker: createPicker(),
      documentPersistenceBridge: persistenceBridge,
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().openDocument()

    expect(persistenceBridge.openDocument).toHaveBeenCalled()
    expect(store.getState().document?.name).toBe('open.canvas.md')
    expect(store.getState().documentSession?.isPersisted).toBe(true)
    expect(store.getState().documentSession?.fileHandle?.name).toBe('open.canvas.md')
    expect(store.getState().isDirty).toBe(false)
    expect(store.getState().parseIssues).toHaveLength(1)
  })

  it('saves an unsaved draft through the save service and clears dirty state', async () => {
    const persistenceBridge = createPersistenceBridge()
    const store = createViewerStore({
      documentPicker: createPicker(),
      documentPersistenceBridge: persistenceBridge,
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().saveCurrentDocument()

    expect(persistenceBridge.saveDocumentAs).toHaveBeenCalled()
    expect(store.getState().documentSession?.isPersisted).toBe(true)
    expect(store.getState().documentSession?.fileHandle?.name).toBe('saved.canvas.md')
    expect(store.getState().persistedSnapshotSource).toBe(templateSource)
    expect(store.getState().isDirty).toBe(false)
    expect(store.getState().saveState.status).toBe('saved')
    expect(store.getState().lastSavedAt).not.toBeNull()
  })

  it('surfaces save failures without silent fallback', async () => {
    const persistenceBridge = createPersistenceBridge({
      saveDocumentAsResult: {
        ok: false,
        error: {
          code: 'save-failed',
          message: 'Browser save failed.'
        }
      }
    })
    const store = createViewerStore({
      documentPicker: createPicker(),
      documentPersistenceBridge: persistenceBridge,
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().saveCurrentDocument()

    expect(store.getState().saveState).toEqual({
      status: 'error',
      message: 'Browser save failed.'
    })
    expect(store.getState().isDirty).toBe(true)
  })

  it('keeps the desktop fallback open and save flow working', async () => {
    const picker = createPicker()
    const repository = createRepository()
    const store = createViewerStore({
      documentPicker: picker,
      documentRepository: repository,
      templateSource
    })

    await store.getState().createNewDocument()
    expect(picker.pickSaveLocator).toHaveBeenCalledWith('bundled-template.canvas.md')
    expect(repository.save).toHaveBeenCalledWith({
      locator: {
        kind: 'file',
        path: '/tmp/saved.canvas.md'
      },
      source: templateSource,
      isTemplate: false
    })

    await store.getState().openDocument()
    expect(repository.read).toHaveBeenCalledWith({
      kind: 'file',
      path: '/tmp/open.canvas.md'
    })
  })
})

function createPicker(): CanvasDocumentPicker {
  return {
    pickOpenLocator: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'file' as const,
        path: '/tmp/open.canvas.md'
      }
    })),
    pickSaveLocator: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'file' as const,
        path: '/tmp/saved.canvas.md'
      }
    }))
  }
}

function createPersistenceBridge(options?: {
  saveDocumentAsResult?: Awaited<ReturnType<ViewerDocumentPersistenceBridge['saveDocumentAs']>>
}): ViewerDocumentPersistenceBridge {
  return {
    openDocument: vi.fn(async () => ({
      ok: true as const,
      value: {
        locator: {
          kind: 'file' as const,
          path: 'browser-file-0/open.canvas.md'
        },
        fileHandle: createFileHandle('open.canvas.md'),
        source: openedSource
      }
    })),
    saveDocument: vi.fn(async (input) => ({
      ok: true as const,
      value: {
        locator: {
          kind: 'file' as const,
          path: 'browser-file-0/open.canvas.md'
        },
        fileHandle: input.fileHandle,
        source: input.source
      }
    })),
    saveDocumentAs:
      vi.fn(async (input) =>
        options?.saveDocumentAsResult ?? {
          ok: true as const,
          value: {
            locator: {
              kind: 'file' as const,
              path: 'browser-file-1/saved.canvas.md'
            },
            fileHandle: createFileHandle('saved.canvas.md'),
            source: input.source
          }
        }
      )
  }
}

function createRepository(): CanvasDocumentRepositoryGateway {
  return {
    readSource: vi.fn(async ({ locator, source, isTemplate }) => ({
      ok: true as const,
      value: {
        locator,
        name: locator.kind === 'file' ? locator.path.split('/').at(-1) ?? 'saved.canvas.md' : locator.name,
        source,
        ast: readAst(source.includes('Opened Board') ? 'Opened Board' : 'Boardmark Viewer'),
        issues: source.includes('Opened Board')
          ? [
              {
                level: 'warning' as const,
                kind: 'invalid-edge' as const,
                message: 'Broken edge skipped.',
                line: 17
              }
            ]
          : [],
        isTemplate
      }
    })),
    read: vi.fn(async (locator) => ({
      ok: true as const,
      value: {
        locator,
        name: 'open.canvas.md',
        source: openedSource,
        ast: readAst('Opened Board', {
          x: 40,
          y: 18,
          zoom: 1.2
        }),
        issues: [
          {
            level: 'warning' as const,
            kind: 'invalid-edge' as const,
            message: 'Broken edge skipped.',
            line: 17
          }
        ],
        isTemplate: false
      }
    })),
    save: vi.fn(async ({ locator, source, isTemplate }) => ({
      ok: true as const,
      value: {
        locator,
        name: locator.kind === 'file' ? locator.path.split('/').at(-1) ?? 'saved.canvas.md' : locator.name,
        source,
        ast: readAst(source.includes('Opened Board') ? 'Opened Board' : 'Boardmark Viewer'),
        issues: [],
        isTemplate
      }
    }))
  }
}

function createFileHandle(name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    async createWritable() {
      return {
        async close() {},
        async write() {}
      } as unknown as FileSystemWritableFileStream
    },
    async getFile() {
      return new File([''], name, { type: 'text/markdown' })
    }
  } as unknown as FileSystemFileHandle
}

function readAst(
  title: string,
  viewport = {
    x: -180,
    y: -120,
    zoom: 0.92
  }
): CanvasAST {
  return {
    frontmatter: {
      type: 'canvas',
      version: 1,
      viewport
    },
    nodes: [
      {
        id: title === 'Opened Board' ? 'open' : 'welcome',
        type: 'note',
        x: 80,
        y: 72,
        content: title,
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        }
      },
      {
        id: 'overview',
        type: 'note',
        x: 380,
        y: 72,
        content: 'Overview',
        position: {
          start: { line: 5, offset: 0 },
          end: { line: 7, offset: 12 }
        }
      }
    ],
    edges: [
      {
        id: title === 'Opened Board' ? 'open-next' : 'welcome-overview',
        from: title === 'Opened Board' ? 'open' : 'welcome',
        to: 'overview',
        kind: 'curve',
        content: title === 'Opened Board' ? 'broken flow' : 'main thread',
        position: {
          start: { line: 9, offset: 0 },
          end: { line: 11, offset: 12 }
        }
      }
    ]
  }
}
