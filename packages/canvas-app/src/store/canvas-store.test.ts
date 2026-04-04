import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@canvas-app/document/canvas-document-persistence'
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

const openedSource = `---
type: canvas
version: 2
viewport:
  x: 40
  y: 18
  zoom: 1.2
---

::: note { id: open, at: { x: 24, y: 24, w: 320, h: 220 } }
Opened Board
:::

::: note { id: next, at: { x: 360, y: 24, w: 320, h: 220 } }
Next
:::

::: edge { id: open-next, from: open, to: ghost }
broken flow
:::`

describe('viewer store', () => {
  it('hydrates the empty startup canvas as an unsaved draft session', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: EMPTY_CANVAS_SOURCE
    })

    await store.getState().hydrateTemplate()

    expect(store.getState().document?.isTemplate).toBe(true)
    expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME)
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().persistedSnapshotSource).toBeNull()
    expect(store.getState().isDirty).toBe(true)
    expect(store.getState().nodes).toHaveLength(0)
    expect(store.getState().edges).toHaveLength(0)
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
    expect(picker.pickSaveLocator).toHaveBeenCalledWith(EMPTY_CANVAS_DOCUMENT_NAME)
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

  it('selects all top-level objects without expanding groups', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().selectAllObjects()

    expect(store.getState().selectedGroupIds).toEqual([])
    expect(store.getState().selectedNodeIds).toEqual(['welcome', 'overview'])
    expect(store.getState().selectedEdgeIds).toEqual(['welcome-overview'])
  })

  it('creates a group and resolves first-click selection to the top-level group before drilldown', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().groupSelection()

    expect(store.getState().draftSource).toContain(
      '::: group { id: group-1, z: 1 }'
    )
    expect(store.getState().draftSource).toContain(
      '~~~yaml members\nnodes:\n  - welcome\n  - overview\n~~~'
    )
    expect(store.getState().selectedGroupIds).toEqual(['group-1'])
    expect(store.getState().groupSelectionState).toEqual({
      status: 'group-selected',
      groupId: 'group-1'
    })

    store.getState().clearSelection()
    store.getState().selectNodeFromCanvas('welcome', false)

    expect(store.getState().selectedGroupIds).toEqual(['group-1'])
    expect(store.getState().selectedNodeIds).toEqual([])
    expect(store.getState().groupSelectionState).toEqual({
      status: 'group-selected',
      groupId: 'group-1'
    })

    store.getState().selectNodeFromCanvas('welcome', false)

    expect(store.getState().selectedGroupIds).toEqual([])
    expect(store.getState().selectedNodeIds).toEqual(['welcome'])
    expect(store.getState().groupSelectionState).toEqual({
      status: 'drilldown',
      groupId: 'group-1',
      nodeId: 'welcome'
    })
  })

  it('ungroups selected groups without deleting member nodes', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().groupSelection()
    await store.getState().ungroupSelection()

    expect(store.getState().draftSource).not.toContain('::: group { id: group-1')
    expect(store.getState().nodes.map((node) => node.id)).toEqual(['welcome', 'overview'])
    expect(store.getState().selectedGroupIds).toEqual([])
    expect(store.getState().selectedNodeIds).toEqual(['welcome', 'overview'])
  })

  it('copies grouped selections into clipboard payloads with member nodes and eligible edges', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().groupSelection()
    await store.getState().copySelection()

    expect(store.getState().clipboardState).toEqual({
      status: 'ready',
      payload: expect.objectContaining({
        groups: [
          expect.objectContaining({
            id: 'group-1',
            members: {
              nodeIds: ['welcome', 'overview']
            }
          })
        ],
        nodes: [
          expect.objectContaining({ id: 'welcome' }),
          expect.objectContaining({ id: 'overview' })
        ],
        edges: [
          expect.objectContaining({ id: 'welcome-overview' })
        ],
        origin: { x: 80, y: 72 }
      })
    })
  })

  it('cuts the current selection into clipboard payload and records a single undo step', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().cutSelection()

    expect(store.getState().clipboardState).toEqual({
      status: 'ready',
      payload: expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: 'welcome' }),
          expect.objectContaining({ id: 'overview' })
        ],
        edges: [
          expect.objectContaining({ id: 'welcome-overview' })
        ]
      })
    })
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().nodes).toHaveLength(0)
    expect(store.getState().edges).toHaveLength(0)
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
        source: expect.stringContaining(
          '::: note { id: welcome, at: { x: 140, y: 160, w: 320, h: 220 } }'
        )
      })
    )
    expect(store.getState().draftSource).toContain(
      '::: note { id: welcome, at: { x: 140, y: 160, w: 320, h: 220 } }'
    )
    expect(store.getState().isDirty).toBe(true)
  })

  it('records document edits in history and restores them through undo/redo', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome'])
    await store.getState().commitNodeMove('welcome', 140, 160)

    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().history.future).toHaveLength(0)
    expect(store.getState().draftSource).toContain(
      '::: note { id: welcome, at: { x: 140, y: 160, w: 320, h: 220 } }'
    )

    await store.getState().undo()

    expect(store.getState().draftSource).toContain(
      '::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }'
    )
    expect(store.getState().selectedNodeIds).toEqual(['welcome'])
    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().history.future).toHaveLength(1)

    await store.getState().redo()

    expect(store.getState().draftSource).toContain(
      '::: note { id: welcome, at: { x: 140, y: 160, w: 320, h: 220 } }'
    )
    expect(store.getState().selectedNodeIds).toEqual(['welcome'])
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().history.future).toHaveLength(0)
  })

  it('clears redo history when a new edit is committed after undo', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().commitNodeMove('welcome', 140, 160)
    await store.getState().undo()
    await store.getState().commitNodeMove('welcome', 220, 260)

    expect(store.getState().draftSource).toContain(
      '::: note { id: welcome, at: { x: 220, y: 260, w: 320, h: 220 } }'
    )
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().history.future).toHaveLength(0)
  })

  it('creates frame presets as round-rect shape nodes', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().setViewportSize({
      width: 1280,
      height: 720
    })
    await store.getState().createFrameAtViewport()

    expect(store.getState().draftSource).toContain(
      '::: boardmark.shape.roundRect { id: shape-1, at: { x: 681, y: 382, w: 420, h: 280 } }'
    )
    expect(store.getState().draftSource).toContain('```yaml props\npalette: neutral\ntone: soft\n```')
    expect(
      store.getState().nodes.some((node) => node.component === 'boardmark.shape.roundRect')
    ).toBe(true)
  })

  it('creates notes at the center of the current viewport when nothing is selected', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().setViewportSize({
      width: 1280,
      height: 720
    })
    await store.getState().createNoteAtViewport()

    expect(store.getState().draftSource).toContain(
      '::: note { id: note-1, at: { x: 731, y: 412, w: 320, h: 220 } }'
    )
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
      failOnSource: 'x: NaN'
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

  it('preserves history across save flows and autosave', async () => {
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

      expect(store.getState().history.past).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(650)

      expect(store.getState().history.past).toHaveLength(1)
      expect(store.getState().history.future).toHaveLength(0)

      await store.getState().saveCurrentDocument()

      expect(store.getState().history.past).toHaveLength(1)
      expect(store.getState().history.future).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets history when a document session is reopened or reloaded from disk', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().commitNodeMove('welcome', 140, 160)
    expect(store.getState().history.past).toHaveLength(1)

    await store.getState().openDocument()
    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().history.future).toHaveLength(0)

    await store.getState().commitNodeMove('open', 180, 220)
    store.setState({
      conflictState: {
        status: 'conflict',
        diskSource: openedSource.replace('Opened Board', 'Reloaded Board')
      }
    })

    await store.getState().reloadFromDisk()

    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().history.future).toHaveLength(0)
    expect(store.getState().draftSource).toContain('Reloaded Board')
  })

  it('records multi-object deletion as a single undo step', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().deleteSelection()

    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().nodes).toHaveLength(0)
    expect(store.getState().edges).toHaveLength(0)

    await store.getState().undo()

    expect(store.getState().nodes).toHaveLength(2)
    expect(store.getState().edges).toHaveLength(1)
  })

  it('duplicates the current selection with offset, derived edges, and a single undo step', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().duplicateSelection()

    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().draftSource).toContain(
      '::: note { id: note-1, at: { x: 96, y: 88, w: 320, h: 220 }, z: 1 }'
    )
    expect(store.getState().draftSource).toContain(
      '::: note { id: note-2, at: { x: 396, y: 88, w: 320, h: 220 }, z: 2 }'
    )
    expect(store.getState().draftSource).toContain(
      '::: edge { id: edge-1, from: note-1, to: note-2, z: 3 }'
    )
    expect(store.getState().selectedNodeIds).toEqual(['note-1', 'note-2'])
    expect(store.getState().selectedEdgeIds).toEqual(['edge-1'])

    await store.getState().undo()

    expect(store.getState().draftSource).not.toContain('::: note { id: note-1')
    expect(store.getState().draftSource).not.toContain('::: edge { id: edge-1')
  })

  it('pastes grouped clipboard payloads with regenerated ids and remapped selection', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().groupSelection()
    await store.getState().copySelection()
    store.getState().setLastCanvasPointer({ x: 600, y: 400 })
    await store.getState().pasteClipboard()

    expect(store.getState().draftSource).toContain(
      '::: group { id: group-2, z: 2 }'
    )
    expect(store.getState().draftSource).toContain(
      '~~~yaml members\nnodes:\n  - note-1\n  - note-2\n~~~'
    )
    expect(store.getState().draftSource).toContain(
      '::: note { id: note-1, at: { x: 600, y: 400, w: 320, h: 220 }, z: 3 }'
    )
    expect(store.getState().draftSource).toContain(
      '::: edge { id: edge-1, from: note-1, to: note-2, z: 5 }'
    )
    expect(store.getState().selectedGroupIds).toEqual(['group-2'])
    expect(store.getState().selectedNodeIds).toEqual(['note-1', 'note-2'])
    expect(store.getState().selectedEdgeIds).toEqual(['edge-1'])
  })

  it('pastes clipboard payloads in place without changing origin coordinates', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome', 'overview'])
    await store.getState().copySelection()
    await store.getState().pasteClipboardInPlace()

    expect(store.getState().draftSource).toContain(
      '::: note { id: note-1, at: { x: 80, y: 72, w: 320, h: 220 }, z: 1 }'
    )
    expect(store.getState().draftSource).toContain(
      '::: note { id: note-2, at: { x: 380, y: 72, w: 320, h: 220 }, z: 2 }'
    )
  })

  it('nudges selected nodes and ignores direct edge-only selections', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    store.getState().replaceSelectedNodes(['welcome'])
    await store.getState().nudgeSelection(1, 0)
    await store.getState().nudgeSelection(10, 0)

    expect(store.getState().draftSource).toContain(
      '::: note { id: welcome, at: { x: 91, y: 72, w: 320, h: 220 } }'
    )

    store.getState().replaceSelectedEdges(['welcome-overview'])
    const sourceBeforeEdgeNudge = store.getState().draftSource
    await store.getState().nudgeSelection(1, 0)

    expect(store.getState().draftSource).toBe(sourceBeforeEdgeNudge)
  })

  it('blocks undo and redo while conflict or invalid states are active', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().hydrateTemplate()
    await store.getState().commitNodeMove('welcome', 140, 160)
    const movedSource = store.getState().draftSource

    store.setState({
      conflictState: {
        status: 'conflict',
        diskSource: openedSource
      }
    })
    await store.getState().undo()

    expect(store.getState().draftSource).toBe(movedSource)
    expect(store.getState().operationError).toContain('Resolve the external-change conflict')

    store.setState({
      conflictState: { status: 'idle' },
      invalidState: {
        status: 'invalid',
        message: 'Invalid draft.'
      },
      history: {
        past: [],
        future: [
          {
            label: 'Move node',
            source: templateSource,
            selectedGroupIds: [],
            selectedNodeIds: [],
            selectedEdgeIds: []
          }
        ]
      }
    })
    await store.getState().redo()

    expect(store.getState().draftSource).toBe(movedSource)
    expect(store.getState().operationError).toBe('Invalid draft.')
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

  it('surfaces persisted autosave permission failures instead of swallowing them', async () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const persistenceBridge = createPersistenceBridge({
        saveDocumentResult: {
          ok: false,
          error: {
            code: 'cancelled',
            message: 'The permission request was cancelled.'
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
      await vi.advanceTimersByTimeAsync(650)

      expect(store.getState().saveState).toEqual({
        status: 'error',
        message: 'The browser did not grant write access to the opened file.'
      })
      expect(store.getState().isDirty).toBe(true)
      expect(consoleError).toHaveBeenCalledWith(
        '[boardmark] Canvas persistence bridge failed to save the current source.',
        expect.objectContaining({
          code: 'cancelled',
          locator: 'browser-file-0/open.canvas.md'
        })
      )
    } finally {
      consoleError.mockRestore()
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
  saveDocumentResult?: Awaited<ReturnType<CanvasDocumentPersistenceBridge['saveDocument']>>
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
    saveDocument: vi.fn(async (input) =>
      options?.saveDocumentResult ?? {
        ok: true as const,
        value: {
          locator: {
            kind: 'file' as const,
            path: 'browser-file-0/open.canvas.md'
          },
          fileHandle: input.fileHandle,
          source: input.source
        }
      }
    ),
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
