import { describe, expect, it, vi } from 'vitest'
import {
  createCanvasMarkdownDocumentRepository,
  type CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasAppCommandContext, createCanvasObjectCommandContext } from '@canvas-app/app/context/canvas-command-context'
import { createCanvasInputContext } from '@canvas-app/input/canvas-input-context'
import {
  dispatchCanvasResolvedInput,
  readViewportAfterCanvasZoom
} from '@canvas-app/input/canvas-input-dispatcher'
import {
  readCanvasPointerCapabilities,
  resolveCanvasInput
} from '@canvas-app/input/canvas-input-resolver'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'
import { createCanvasStore } from '@canvas-app/store/canvas-store'

const TEMPLATE_SOURCE = `---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`

describe('canvas-input-resolver', () => {
  it('blocks keyboard commands on editable targets but still resolves viewport zoom', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: TEMPLATE_SOURCE
    })

    await store.getState().hydrateTemplate()

    const undoInput: CanvasMatchedInput = {
      allowEditableTarget: false,
      intent: {
        kind: 'app-command',
        commandId: 'undo',
        eventType: 'keydown',
        target: document.createElement('textarea')
      },
      preventDefault: true
    }
    const zoomInput: CanvasMatchedInput = {
      allowEditableTarget: true,
      intent: {
        kind: 'viewport-zoom',
        source: 'keyboard',
        mode: 'step',
        direction: 'in',
        target: document.createElement('textarea')
      },
      preventDefault: true
    }

    expect(resolveCanvasInput(undoInput, readInputContext(store, undoInput))).toBeNull()
    expect(resolveCanvasInput(zoomInput, readInputContext(store, zoomInput))).toEqual({
      kind: 'apply-viewport-zoom',
      mode: 'step',
      direction: 'in',
      deltaScale: undefined,
      anchorClientX: undefined,
      anchorClientY: undefined
    })
  })

  it('keeps temporary pan start blocked during editing but always allows end', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: TEMPLATE_SOURCE
    })

    await store.getState().hydrateTemplate()
    store.getState().startObjectEditing('welcome')

    const startInput: CanvasMatchedInput = {
      allowEditableTarget: false,
      intent: {
        kind: 'temporary-pan',
        state: 'start',
        target: null
      },
      preventDefault: true
    }
    const endInput: CanvasMatchedInput = {
      allowEditableTarget: true,
      intent: {
        kind: 'temporary-pan',
        state: 'end',
        target: null
      },
      preventDefault: false
    }

    expect(resolveCanvasInput(startInput, readInputContext(store, startInput))).toBeNull()
    expect(resolveCanvasInput(endInput, readInputContext(store, endInput))).toEqual({
      kind: 'update-interaction-machine-state',
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'inactive'
    })
  })

  it('derives pointer capabilities from deferred temporary pan without switching the active tool', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: TEMPLATE_SOURCE
    })

    await store.getState().hydrateTemplate()

    expect(readCanvasPointerCapabilities(readInputContext(store, null))).toEqual({
      edgesReconnectable: true,
      elementsSelectable: true,
      nodesConnectable: true,
      nodesDraggable: true,
      panOnDrag: false,
      selectionOnDrag: true
    })

    store.getState().setTemporaryPanState('deferred')

    expect(readCanvasPointerCapabilities(readInputContext(store, null))).toEqual({
      edgesReconnectable: false,
      elementsSelectable: true,
      nodesConnectable: false,
      nodesDraggable: false,
      panOnDrag: true,
      selectionOnDrag: false
    })
  })

  it('consumes deferred temporary pan on the next pane pan start', async () => {
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: TEMPLATE_SOURCE
    })

    await store.getState().hydrateTemplate()
    store.getState().setTemporaryPanState('deferred')

    expect(resolveCanvasInput({
      allowEditableTarget: true,
      intent: {
        kind: 'pointer-pane-pan-start'
      },
      preventDefault: false
    }, readInputContext(store, null))).toEqual({
      kind: 'update-interaction-machine-state',
      pointerInteractionState: {
        status: 'pane-pan',
        source: 'temporary-pan'
      },
      temporaryPanState: 'active'
    })
  })
})

describe('canvas-input-dispatcher', () => {
  it('applies anchored viewport zoom through the shared zoom helper', () => {
    const viewport = {
      x: -180,
      y: -120,
      zoom: 0.92
    }

    const nextViewport = readViewportAfterCanvasZoom({
      anchorClientX: 410,
      anchorClientY: 320,
      direction: 'in',
      mode: 'step',
      viewport,
      viewportBounds: {
        left: 10,
        top: 20
      }
    })

    expect(nextViewport.zoom).toBe(1.02)
    expect(nextViewport.x).not.toBe(viewport.x)
    expect(nextViewport.y).not.toBe(viewport.y)
  })

  it('keeps the visible viewport center stable for step zoom without an explicit anchor', () => {
    const viewport = {
      x: -180,
      y: -120,
      zoom: 0.92
    }
    const viewportSize = {
      width: 800,
      height: 600
    }

    const nextViewport = readViewportAfterCanvasZoom({
      direction: 'in',
      mode: 'step',
      viewport,
      viewportSize
    })

    const centerX = viewportSize.width / 2
    const centerY = viewportSize.height / 2
    const beforeFlowPoint = {
      x: Number(((centerX - viewport.x) / viewport.zoom).toFixed(6)),
      y: Number(((centerY - viewport.y) / viewport.zoom).toFixed(6))
    }
    const afterFlowPoint = {
      x: Number(((centerX - nextViewport.x) / nextViewport.zoom).toFixed(6)),
      y: Number(((centerY - nextViewport.y) / nextViewport.zoom).toFixed(6))
    }

    expect(nextViewport.zoom).toBe(1.02)
    expect(afterFlowPoint.x).toBeCloseTo(beforeFlowPoint.x, 2)
    expect(afterFlowPoint.y).toBeCloseTo(beforeFlowPoint.y, 2)
  })

  it('dispatches pointer-side effects through the shared dispatcher context', async () => {
    const setViewport = vi.fn()
    const setTemporaryPanState = vi.fn()
    const commitNodeResize = vi.fn(async () => undefined)
    const reconnectEdge = vi.fn(async () => undefined)
    const nudgeSelection = vi.fn(async () => undefined)
    const clearSelection = vi.fn()
    const openObjectContextMenu = vi.fn()
    const openPaneContextMenu = vi.fn()
    const replaceSelection = vi.fn()
    const selectEdgeFromCanvas = vi.fn()
    const selectNodeFromCanvas = vi.fn()
    const setPointerInteractionState = vi.fn()
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: TEMPLATE_SOURCE
    })

    await store.getState().hydrateTemplate()

    const appCommandContext = createCanvasAppCommandContext({
      ...store.getState(),
      objectContextMenuOpen: false,
      setObjectContextMenu: () => undefined,
      setTemporaryPanState,
      temporaryPanState: store.getState().temporaryPanState,
      setViewport
    })
    const objectCommandContext = createCanvasObjectCommandContext(store.getState())

    dispatchCanvasResolvedInput({
      kind: 'update-interaction-machine-state',
      pointerInteractionState: { status: 'idle' },
      temporaryPanState: 'active'
    }, {
      appCommandContext,
      clearSelection,
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      openObjectContextMenu,
      openPaneContextMenu,
      objectCommandContext,
      replaceSelection,
      reconnectEdge,
      selectEdgeFromCanvas,
      selectNodeFromCanvas,
      setPointerInteractionState,
      setTemporaryPanState
    })

    await Promise.resolve(dispatchCanvasResolvedInput({
      kind: 'commit-node-resize',
      nodeId: 'welcome',
      geometry: {
        x: 80,
        y: 72,
        width: 400,
        height: 240
      }
    }, {
      appCommandContext,
      clearSelection,
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      openObjectContextMenu,
      openPaneContextMenu,
      objectCommandContext,
      replaceSelection,
      reconnectEdge,
      selectEdgeFromCanvas,
      selectNodeFromCanvas,
      setPointerInteractionState,
      setTemporaryPanState
    }))

    await Promise.resolve(dispatchCanvasResolvedInput({
      kind: 'commit-edge-reconnect',
      edgeId: 'edge-1',
      from: 'welcome',
      to: 'overview'
    }, {
      appCommandContext,
      clearSelection,
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      openObjectContextMenu,
      openPaneContextMenu,
      objectCommandContext,
      replaceSelection,
      reconnectEdge,
      selectEdgeFromCanvas,
      selectNodeFromCanvas,
      setPointerInteractionState,
      setTemporaryPanState
    }))

    dispatchCanvasResolvedInput({
      kind: 'open-node-context-menu',
      additive: false,
      nodeId: 'welcome',
      x: 120,
      y: 180
    }, {
      appCommandContext,
      clearSelection,
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      openObjectContextMenu,
      openPaneContextMenu,
      objectCommandContext,
      replaceSelection,
      reconnectEdge,
      selectEdgeFromCanvas,
      selectNodeFromCanvas,
      setPointerInteractionState,
      setTemporaryPanState
    })

    expect(setTemporaryPanState).toHaveBeenCalledWith('active')
    expect(commitNodeResize).toHaveBeenCalledWith('welcome', {
      x: 80,
      y: 72,
      width: 400,
      height: 240
    })
    expect(reconnectEdge).toHaveBeenCalledWith('edge-1', 'welcome', 'overview')
    expect(selectNodeFromCanvas).toHaveBeenCalledWith('welcome', false)
    expect(openObjectContextMenu).toHaveBeenCalledWith({
      x: 120,
      y: 180
    })
  })

  it('routes pane context menus to the selection menu while a selection is active', async () => {
    const openObjectContextMenu = vi.fn()
    const openPaneContextMenu = vi.fn()
    const store = createCanvasStore({
      documentPicker: createPicker(),
      documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
      templateSource: TEMPLATE_SOURCE
    })

    await store.getState().hydrateTemplate()

    const baseDispatchContext = {
      clearSelection: vi.fn(),
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize: vi.fn(async () => undefined),
      nudgeSelection: vi.fn(async () => undefined),
      openObjectContextMenu,
      openPaneContextMenu,
      objectCommandContext: createCanvasObjectCommandContext(store.getState()),
      replaceSelection: vi.fn(),
      reconnectEdge: vi.fn(async () => undefined),
      selectEdgeFromCanvas: vi.fn(),
      selectNodeFromCanvas: vi.fn(),
      setPointerInteractionState: vi.fn(),
      setTemporaryPanState: vi.fn()
    }

    dispatchCanvasResolvedInput({
      kind: 'open-pane-context-menu',
      x: 48,
      y: 64
    }, {
      ...baseDispatchContext,
      appCommandContext: createCanvasAppCommandContext({
        ...store.getState(),
        objectContextMenuOpen: false,
        setObjectContextMenu: () => undefined,
        setTemporaryPanState: baseDispatchContext.setTemporaryPanState,
        setViewport: vi.fn()
      })
    })

    expect(openPaneContextMenu).toHaveBeenCalledWith({ x: 48, y: 64 })
    expect(openObjectContextMenu).not.toHaveBeenCalled()

    store.getState().replaceSelectedNodes(['welcome', 'overview'])

    dispatchCanvasResolvedInput({
      kind: 'open-pane-context-menu',
      x: 72,
      y: 96
    }, {
      ...baseDispatchContext,
      appCommandContext: createCanvasAppCommandContext({
        ...store.getState(),
        objectContextMenuOpen: false,
        setObjectContextMenu: () => undefined,
        setTemporaryPanState: baseDispatchContext.setTemporaryPanState,
        setViewport: vi.fn()
      })
    })

    expect(openObjectContextMenu).toHaveBeenCalledWith({ x: 72, y: 96 })
  })
})

function createPicker() {
  return {
    pickOpenLocator: vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'cancelled' as const,
        kind: 'cancelled' as const,
        message: 'Cancelled by test.'
      }
    })),
    pickSaveLocator: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'file' as const,
        path: '/tmp/test.canvas.md'
      }
    }))
  }
}

function readInputContext(store: ReturnType<typeof createCanvasStore>, input: CanvasMatchedInput | null) {
  const state = store.getState()

  return createCanvasInputContext({
    appCommandContext: createCanvasAppCommandContext({
      ...state,
      objectContextMenuOpen: false,
      setObjectContextMenu: () => undefined,
      setTemporaryPanState: state.setTemporaryPanState,
      temporaryPanState: state.temporaryPanState
    }),
    eventTarget: input && 'target' in input.intent ? input.intent.target : null,
    objectCommandContext: createCanvasObjectCommandContext(state),
    temporaryPanState: state.temporaryPanState,
    supportsMultiSelect: true,
    toolMode: state.toolMode
  })
}

function toGateway(
  repository: ReturnType<typeof createCanvasMarkdownDocumentRepository>
): CanvasDocumentRepositoryGateway {
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
