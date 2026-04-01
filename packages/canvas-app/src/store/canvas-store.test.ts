import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@canvas-app/document/canvas-document-persistence'
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

::: edge #open-next from=open to=ghost kind=curve
broken flow
:::`

describe('viewer store', () => {
  it('hydrates the bundled template as an unsaved draft session', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()

    expect(store.getState().document?.isTemplate).toBe(true)
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().persistedSnapshotSource).toBeNull()
    expect(store.getState().isDirty).toBe(true)
    expect(store.getState().nodes).toHaveLength(2)
  })

  it('opens a persisted browser document through the persistence bridge', async () => {
    const persistenceBridge = createPersistenceBridge()
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentPersistenceBridge: persistenceBridge,
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().openDocument()

    expect(persistenceBridge.openDocument).toHaveBeenCalled()
    expect(store.getState().document?.name).toBe('open.canvas.md')
    expect(store.getState().documentState?.isPersisted).toBe(true)
    expect(store.getState().documentState?.fileHandle?.name).toBe('open.canvas.md')
    expect(store.getState().isDirty).toBe(false)
    expect(store.getState().parseIssues).toHaveLength(1)
  })

  it('saves an unsaved draft through the save service and clears dirty state', async () => {
    const persistenceBridge = createPersistenceBridge()
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentPersistenceBridge: persistenceBridge,
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().saveCurrentDocument()

    expect(persistenceBridge.saveDocumentAs).toHaveBeenCalled()
    expect(store.getState().documentState?.isPersisted).toBe(true)
    expect(store.getState().documentState?.fileHandle?.name).toBe('saved.canvas.md')
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
    const store = createCanvasStore({
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
    const store = createCanvasStore({
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

  it('supports single and multi-selection actions in the store', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()

    store.getState().setPrimarySelectedNode('welcome')
    expect(store.getState().selectedNodeIds).toEqual(['welcome'])

    store.getState().toggleSelectedNode('overview')
    expect(store.getState().selectedNodeIds).toEqual(['welcome', 'overview'])

    store.getState().replaceSelectedNodes(['overview'])
    expect(store.getState().selectedNodeIds).toEqual(['overview'])

    store.getState().clearSelectedNodes()
    expect(store.getState().selectedNodeIds).toEqual([])
  })

  it('replaces the current document with a dropped unsaved draft', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().openDroppedDocument({
      name: 'dropped.canvas.md',
      source: openedSource
    })

    expect(store.getState().document?.name).toBe('dropped.canvas.md')
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().isDirty).toBe(true)
    expect(store.getState().dropState).toEqual({
      status: 'opened',
      name: 'dropped.canvas.md'
    })
  })

  it('commits geometry edits through repository reparsing and keeps draft dirty state', async () => {
    const repository = createRepository()
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: repository,
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().commitNodeMove('welcome', 140, 160)

    expect(repository.readSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.stringContaining('::: note #welcome x=140 y=160')
      })
    )
    expect(store.getState().draftSource).toContain('::: note #welcome x=140 y=160')
    expect(store.getState().isDirty).toBe(true)
  })

  it('creates frame presets as round-rect shape nodes', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().createFrameAtViewport()

    expect(store.getState().draftSource).toContain(
      '::: shape #shape-1 x=300 y=240 w=420 h=280 renderer=boardmark.shape.roundRect palette=neutral tone=soft'
    )
    expect(store.getState().nodes.some((node) => node.type === 'shape')).toBe(true)
  })

  it('switches to conflict state when external source changes arrive over a dirty draft', async () => {
    const externalChangeRef: { current: null | ((source: string) => void) } = {
      current: null
    }
    const persistenceBridge = createPersistenceBridge({
      subscribeExternalChanges: async ({ onExternalChange }) => {
        externalChangeRef.current = onExternalChange
        return () => {
          externalChangeRef.current = null
        }
      }
    })
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentPersistenceBridge: persistenceBridge,
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().openDocument()
    await store.getState().commitNodeMove('open', 180, 220)
    if (externalChangeRef.current) {
      externalChangeRef.current(openedSource.replace('Opened Board', 'Disk Changed'))
    }
    await Promise.resolve()
    await Promise.resolve()

    expect(store.getState().conflictState.status).toBe('conflict')
  })

  it('keeps the last parsed document when a patch produces invalid source', async () => {
    const repository = createRepository({
      failOnSource: 'x=NaN'
    })
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: repository,
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().commitNodeMove('welcome', Number.NaN, 120)

    expect(store.getState().invalidState.status).toBe('invalid')
    expect(store.getState().lastParsedDocument?.ast.nodes[0]?.id).toBe('welcome')
    expect(store.getState().nodes[0]?.id).toBe('welcome')
  })

  it('preserves the current viewport across local edit commits', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().setViewport({
      x: 320,
      y: 240,
      zoom: 1.35
    })
    await store.getState().commitNodeMove('welcome', 140, 160)

    expect(store.getState().viewport).toEqual({
      x: 320,
      y: 240,
      zoom: 1.35
    })
  })

  it('autosaves persisted drafts after edit commits', async () => {
    vi.useFakeTimers()

    try {
      const persistenceBridge = createPersistenceBridge()
      const store = createCanvasStore({
        documentPicker: createPicker(),
        documentPersistenceBridge: persistenceBridge,
        documentRepository: createRepository(),
        templateSource
      })

      await store.getState().openDocument()
      await store.getState().commitNodeMove('open', 180, 220)

      expect(store.getState().saveState.status).toBe('saving')

      await vi.advanceTimersByTimeAsync(650)

      expect(persistenceBridge.saveDocument).toHaveBeenCalled()
      expect(store.getState().isDirty).toBe(false)
      expect(store.getState().saveState.status).toBe('saved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not autosave unsaved drafts before a file is attached', async () => {
    vi.useFakeTimers()

    try {
      const persistenceBridge = createPersistenceBridge()
      const store = createCanvasStore({
        documentPicker: createPicker(),
        documentPersistenceBridge: persistenceBridge,
        documentRepository: createRepository(),
        templateSource
      })

      await store.getState().hydrateTemplate()
      await store.getState().commitNodeMove('welcome', 140, 160)
      await vi.advanceTimersByTimeAsync(650)

      expect(persistenceBridge.saveDocument).not.toHaveBeenCalled()
      expect(persistenceBridge.saveDocumentAs).not.toHaveBeenCalled()
      expect(store.getState().isDirty).toBe(true)
    } finally {
      vi.useRealTimers()
    }
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
  saveDocumentAsResult?: Awaited<ReturnType<CanvasDocumentPersistenceBridge['saveDocumentAs']>>
  subscribeExternalChanges?: CanvasDocumentPersistenceBridge['subscribeExternalChanges']
}): CanvasDocumentPersistenceBridge {
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
      ),
    subscribeExternalChanges:
      options?.subscribeExternalChanges ?? vi.fn(async () => () => {})
  }
}

function createRepository(options?: { failOnSource?: string }): CanvasDocumentRepositoryGateway {
  const repository = createCanvasMarkdownDocumentRepository()

  return {
    readSource: vi.fn(async ({ locator, source, isTemplate }) => {
      if (options?.failOnSource && source.includes(options.failOnSource)) {
        return {
          ok: false as const,
          error: {
            kind: 'parse-failed' as const,
            message: 'Canvas repository could not parse "broken.canvas.md": invalid geometry'
          }
        }
      }

      const recordResult = repository.readSource({
        locator,
        source,
        isTemplate
      })

      if (recordResult.isErr()) {
        return {
          ok: false as const,
          error: recordResult.error
        }
      }

      return {
        ok: true as const,
        value: recordResult.value
      }
    }),
    read: vi.fn(async (locator) => ({
      ...(function () {
        const recordResult = repository.readSource({
          locator,
          source: openedSource,
          isTemplate: false
        })

        if (recordResult.isErr()) {
          return {
            ok: false as const,
            error: recordResult.error
          }
        }

        return {
          ok: true as const,
          value: recordResult.value
        }
      })()
    })),
    save: vi.fn(async ({ locator, source, isTemplate }) => ({
      ...(function () {
        const recordResult = repository.readSource({
          locator,
          source,
          isTemplate
        })

        if (recordResult.isErr()) {
          return {
            ok: false as const,
            error: recordResult.error
          }
        }

        return {
          ok: true as const,
          value: recordResult.value
        }
      })()
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
