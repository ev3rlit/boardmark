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
      kind: 'set-pan-shortcut-active',
      active: false,
      preventDefault: false
    })
  })

  it('derives pointer capabilities from effective tool mode and editing state', async () => {
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

    store.getState().setPanShortcutActive(true)

    expect(readCanvasPointerCapabilities(readInputContext(store, null))).toEqual({
      edgesReconnectable: false,
      elementsSelectable: false,
      nodesConnectable: false,
      nodesDraggable: false,
      panOnDrag: true,
      selectionOnDrag: false
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

  it('dispatches pointer-side effects through the shared dispatcher context', async () => {
    const setViewport = vi.fn()
    const setPanShortcutActive = vi.fn()
    const commitNodeResize = vi.fn(async () => undefined)
    const reconnectEdge = vi.fn(async () => undefined)
    const nudgeSelection = vi.fn(async () => undefined)
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
      setPanShortcutActive,
      setViewport
    })
    const objectCommandContext = createCanvasObjectCommandContext(store.getState())

    dispatchCanvasResolvedInput({
      kind: 'set-pan-shortcut-active',
      active: true,
      preventDefault: true
    }, {
      appCommandContext,
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      objectCommandContext,
      reconnectEdge
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
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      objectCommandContext,
      reconnectEdge
    }))

    await Promise.resolve(dispatchCanvasResolvedInput({
      kind: 'commit-edge-reconnect',
      edgeId: 'edge-1',
      from: 'welcome',
      to: 'overview'
    }, {
      appCommandContext,
      commitNodeMove: vi.fn(async () => undefined),
      commitNodeResize,
      nudgeSelection,
      objectCommandContext,
      reconnectEdge
    }))

    expect(setPanShortcutActive).toHaveBeenCalledWith(true)
    expect(commitNodeResize).toHaveBeenCalledWith('welcome', {
      x: 80,
      y: 72,
      width: 400,
      height: 240
    })
    expect(reconnectEdge).toHaveBeenCalledWith('edge-1', 'welcome', 'overview')
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
      setObjectContextMenu: () => undefined
    }),
    eventTarget: input && 'target' in input.intent ? input.intent.target : null,
    objectCommandContext: createCanvasObjectCommandContext(state),
    panShortcutActive: state.panShortcutActive,
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
