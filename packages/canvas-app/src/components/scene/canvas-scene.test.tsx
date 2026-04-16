import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider, applyNodeChanges, type Node } from '@xyflow/react'
import type { CanvasGroup, CanvasNode } from '@boardmark/canvas-domain'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import {
  createCanvasAppCommandContext,
  createCanvasObjectCommandContext
} from '@canvas-app/app/context/canvas-command-context'
import {
  CanvasScene,
  applyFlowNodeGeometryDrafts,
  applyNodeChangesToStore,
  mergeFlowNodes,
  readFlowNodes,
  shouldDispatchPointerPanePanLifecycle,
  shouldKeepCanvasWheelEventLocal
} from '@canvas-app/components/scene/canvas-scene'
import {
  normalizeTopLevelNodeSelection,
  readCommittedNodeMovesFromDraggedNodes
} from '@canvas-app/components/scene/flow/flow-selection-changes'
import { createCanvasInputContext } from '@canvas-app/input/canvas-input-context'
import {
  dispatchCanvasResolvedInput,
  readViewportAfterCanvasZoom
} from '@canvas-app/input/canvas-input-dispatcher'
import {
  readCanvasPointerCapabilities,
  readPointerNodeMoveResolution,
  resolveCanvasInput
} from '@canvas-app/input/canvas-input-resolver'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'
import type { CanvasFlowNodeData } from '@boardmark/canvas-renderer'
import {
  canCanvasMutateSelection,
  readActiveEdgeEditingSession,
  readActiveNodeEditingSession,
  readEdgeEditingInteractionBlock,
  readNodeEditingInteractionBlock
} from '@canvas-app/store/canvas-editing-session'
import { createCanvasStore, type CanvasStore } from '@canvas-app/store/canvas-store'
import { createCanvasDocumentRecordPatch } from '@canvas-app/store/canvas-store-projection'
import { useStore } from 'zustand'

const sourceMap = {
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

describe('CanvasScene', () => {
  it('maps canvas nodes into react flow nodes without mutating selection state', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        id: 'overview',
        component: 'boardmark.calender',
        at: { x: 380, y: 72, w: 320, h: 220 },
        body: 'Overview\n',
        position: {
          start: { line: 5, offset: 0 },
          end: { line: 7, offset: 12 }
        },
        sourceMap: {
          ...sourceMap,
          objectRange: {
            start: { line: 5, offset: 0 },
            end: { line: 7, offset: 12 }
          }
        }
      }
    ]

    const flowNodes = readFlowNodes(nodes)

    expect(flowNodes[0]?.id).toBe('welcome')
    expect(flowNodes[1]?.id).toBe('overview')
    expect(flowNodes[0]?.selected).toBe(false)
    expect(flowNodes[1]?.type).toBe('canvas-component')
  })

  it('applies runtime interaction overrides only to preview nodes', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    const flowNodes = readFlowNodes(nodes, {
      welcome: {
        x: 140,
        y: 164,
        w: 420,
        h: 280
      }
    })

    expect(flowNodes[0]?.position).toEqual({ x: 140, y: 164 })
    expect(flowNodes[0]?.style?.width).toBe(420)
    expect(flowNodes[0]?.style?.height).toBe(280)
  })

  it('projects selected node ids back into controlled flow nodes', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    const flowNodes = readFlowNodes(nodes, {}, ['welcome'])

    expect(flowNodes[0]?.selected).toBe(true)
  })

  it('keeps drag preview position changes out of store selection writes', () => {
    const replaceSelection = vi.fn()

    applyNodeChangesToStore({
      changes: [
        {
          id: 'welcome',
          type: 'position',
          position: { x: 144, y: 168 },
          dragging: true
        }
      ],
      groups: [],
      replaceSelection,
      selectedEdgeIds: [],
      selectedNodeIds: []
    })

    expect(replaceSelection).not.toHaveBeenCalled()
  })

  it('preserves react flow runtime node state across source-driven updates', () => {
    const nextFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 144, y: 168, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const currentFlowNodes: Node<CanvasFlowNodeData>[] = [
      {
        ...nextFlowNodes[0]!,
        dragging: true,
        height: 160,
        measured: {
          width: 320,
          height: 160
        },
        width: 320
      }
    ]

    const mergedFlowNodes = mergeFlowNodes(nextFlowNodes, currentFlowNodes)

    expect(mergedFlowNodes[0]?.position).toEqual({ x: 144, y: 168 })
    expect(mergedFlowNodes[0]?.measured).toEqual({ width: 320, height: 160 })
    expect(mergedFlowNodes[0]?.dragging).toBe(true)
    expect(mergedFlowNodes[0]?.width).toBe(320)
    expect(mergedFlowNodes[0]?.height).toBe(160)
  })

  it('preserves flow node data and style references across selection-only updates', () => {
    const baseNodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 144, y: 168, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        style: {
          bg: {
            color: '#FFF9D8'
          },
          stroke: {
            color: '#6042D6CC'
          }
        },
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]
    const currentFlowNodes = readFlowNodes(baseNodes)
    const nextFlowNodes = readFlowNodes(
      baseNodes.map((node) => ({
        ...node,
        style: node.style
          ? {
              bg: node.style.bg ? { ...node.style.bg } : undefined,
              stroke: node.style.stroke ? { ...node.style.stroke } : undefined
            }
          : undefined
      })),
      {},
      ['welcome']
    )

    const mergedFlowNodes = mergeFlowNodes(nextFlowNodes, currentFlowNodes)

    expect(mergedFlowNodes[0]?.selected).toBe(true)
    expect(mergedFlowNodes[0]?.data).toBe(currentFlowNodes[0]?.data)
    expect(mergedFlowNodes[0]?.data.style).toBe(currentFlowNodes[0]?.data.style)
  })

  it('replaces flow node data when business body changes', () => {
    const currentFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 144, y: 168, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const nextFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 144, y: 168, w: 320, h: 220 },
        body: 'Updated body\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])

    const mergedFlowNodes = mergeFlowNodes(nextFlowNodes, currentFlowNodes)

    expect(mergedFlowNodes[0]?.data).not.toBe(currentFlowNodes[0]?.data)
    expect(mergedFlowNodes[0]?.data.body).toBe('Updated body\n')
  })

  it('replaces flow node data when image source changes', () => {
    const currentFlowNodes = readFlowNodes([
      {
        id: 'hero',
        component: 'image',
        at: { x: 144, y: 168, w: 320, h: 220 },
        src: '/hero-before.png',
        alt: 'Hero',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const nextFlowNodes = readFlowNodes([
      {
        id: 'hero',
        component: 'image',
        at: { x: 144, y: 168, w: 320, h: 220 },
        src: '/hero-after.png',
        alt: 'Hero',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])

    const mergedFlowNodes = mergeFlowNodes(nextFlowNodes, currentFlowNodes)

    expect(mergedFlowNodes[0]?.data).not.toBe(currentFlowNodes[0]?.data)
    expect(mergedFlowNodes[0]?.data.src).toBe('/hero-after.png')
  })

  it('applies local resize drafts without regenerating unrelated flow nodes', () => {
    const flowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
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
          ...sourceMap,
          objectRange: {
            start: { line: 5, offset: 0 },
            end: { line: 7, offset: 12 }
          }
        }
      }
    ])

    const resizedFlowNodes = applyFlowNodeGeometryDrafts(flowNodes, {
      welcome: {
        x: 144,
        y: 168,
        width: 420,
        height: 280
      }
    })

    expect(resizedFlowNodes[0]?.position).toEqual({ x: 144, y: 168 })
    expect(resizedFlowNodes[0]?.width).toBe(420)
    expect(resizedFlowNodes[0]?.data.width).toBe(420)
    expect(resizedFlowNodes[0]?.style?.height).toBe(280)
    expect(resizedFlowNodes[1]).toBe(flowNodes[1])
  })

  it('keeps auto-height note previews auto-sized when the resize draft only changes width', () => {
    const flowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])

    const resizedFlowNodes = applyFlowNodeGeometryDrafts(flowNodes, {
      welcome: {
        x: 144,
        y: 168,
        width: 420,
        height: 220,
        preserveAutoHeight: true
      }
    })

    expect(resizedFlowNodes[0]?.data.autoHeight).toBe(true)
    expect(resizedFlowNodes[0]?.data.height).toBeUndefined()
    expect(resizedFlowNodes[0]?.style?.height).toBeUndefined()
    expect(resizedFlowNodes[0]?.height).toBeUndefined()
  })

  it('reconciles local drag preview nodes back to store-backed geometry', () => {
    const storeBackedFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const localPreviewFlowNodes = applyNodeChanges(
      [
        {
          id: 'welcome',
          type: 'position',
          position: { x: 144, y: 168 },
          dragging: true
        }
      ],
      storeBackedFlowNodes
    )

    const mergedFlowNodes = mergeFlowNodes(storeBackedFlowNodes, localPreviewFlowNodes)

    expect(mergedFlowNodes[0]?.position).toEqual({ x: 80, y: 72 })
    expect(mergedFlowNodes[0]?.dragging).toBe(true)
  })

  it('reconciles local resize preview geometry back to store-backed geometry', () => {
    const storeBackedFlowNodes = readFlowNodes([
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ])
    const localPreviewFlowNodes = applyFlowNodeGeometryDrafts(storeBackedFlowNodes, {
      welcome: {
        x: 144,
        y: 168,
        width: 420,
        height: 280
      }
    })

    const mergedFlowNodes = mergeFlowNodes(storeBackedFlowNodes, localPreviewFlowNodes)

    expect(mergedFlowNodes[0]?.position).toEqual({ x: 80, y: 72 })
    expect(mergedFlowNodes[0]?.width).toBe(320)
    expect(mergedFlowNodes[0]?.height).toBe(220)
  })

  it('maps component nodes into generic flow nodes with width, height, and raw body', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'frame-a',
        component: 'boardmark.shape.roundRect',
        at: { x: 120, y: 140, w: 420, h: 280 },
        body: 'Frame\n\n```yaml props\npalette: neutral\ntone: soft\n```',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    const flowNodes = readFlowNodes(nodes, {}, [], {
      defaultStyle: 'boardmark.editorial.soft'
    })

    expect(flowNodes[0]?.type).toBe('canvas-component')
    expect(flowNodes[0]?.data.component).toBe('boardmark.shape.roundRect')
    expect(flowNodes[0]?.data.body).toContain('palette: neutral')
    expect(flowNodes[0]?.data.resolvedThemeRef).toBe('boardmark.editorial.soft')
    expect(flowNodes[0]?.style?.height).toBe(280)
  })

  it('keeps the cursor-anchored flow point stable while wheel zooming', () => {
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

    const localX = 400
    const localY = 300
    const beforeFlowPoint = {
      x: Number(((localX - viewport.x) / viewport.zoom).toFixed(6)),
      y: Number(((localY - viewport.y) / viewport.zoom).toFixed(6))
    }
    const afterFlowPoint = {
      x: Number(((localX - nextViewport.x) / nextViewport.zoom).toFixed(6)),
      y: Number(((localY - nextViewport.y) / nextViewport.zoom).toFixed(6))
    }

    expect(nextViewport.zoom).toBe(1.02)
    expect(afterFlowPoint.x).toBeCloseTo(beforeFlowPoint.x, 2)
    expect(afterFlowPoint.y).toBeCloseTo(beforeFlowPoint.y, 2)
  })

  it('does not update the store viewport on cmd+wheel input', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    const view = render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )
    const sceneRoot = view.container.firstElementChild as HTMLDivElement | null

    if (!sceneRoot) {
      throw new Error('Expected CanvasScene to render a root element.')
    }

    vi.spyOn(sceneRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON() {
        return {}
      }
    })

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.wheel(sceneRoot, {
        metaKey: true,
        clientX: 600,
        clientY: 400,
        deltaY: -120
      })
    })

    expect(store.getState().viewport.zoom).toBe(0.92)
  })

  it('updates the store viewport on ctrl+wheel input with the same zoom step as keyboard commands', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    const view = render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )
    const sceneRoot = view.container.firstElementChild as HTMLDivElement | null

    if (!sceneRoot) {
      throw new Error('Expected CanvasScene to render a root element.')
    }

    vi.spyOn(sceneRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON() {
        return {}
      }
    })

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.wheel(sceneRoot, {
        ctrlKey: true,
        clientX: 600,
        clientY: 400,
        deltaY: -120
      })
    })

    expect(store.getState().viewport.zoom).toBe(1.02)
  })

  it('keeps plain wheel local while letting zoom-qualified wheel escape note content', () => {
    expect(shouldKeepCanvasWheelEventLocal(new WheelEvent('wheel'))).toBe(true)
    expect(shouldKeepCanvasWheelEventLocal(new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -120
    }))).toBe(false)
  })

  it('accepts only pointer-originated pane pan lifecycle events', () => {
    expect(shouldDispatchPointerPanePanLifecycle(new MouseEvent('mousedown'), true)).toBe(true)
    expect(shouldDispatchPointerPanePanLifecycle(new WheelEvent('wheel'), true)).toBe(false)
    expect(shouldDispatchPointerPanePanLifecycle(null, true)).toBe(false)
    expect(shouldDispatchPointerPanePanLifecycle(new MouseEvent('mousedown'), false)).toBe(false)
  })

  it('updates the store viewport on gesture pinch input', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    const view = render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )
    const sceneRoot = view.container.firstElementChild as HTMLDivElement | null

    if (!sceneRoot) {
      throw new Error('Expected CanvasScene to render a root element.')
    }

    vi.spyOn(sceneRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON() {
        return {}
      }
    })

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      const gestureStart = Object.assign(new Event('gesturestart', { bubbles: true, cancelable: true }), {
        clientX: 600,
        clientY: 400,
        scale: 1
      })
      const gestureChange = Object.assign(new Event('gesturechange', { bubbles: true, cancelable: true }), {
        clientX: 600,
        clientY: 400,
        scale: 1.08
      })

      sceneRoot.dispatchEvent(gestureStart)
      sceneRoot.dispatchEvent(gestureChange)
    })

    expect(store.getState().viewport.zoom).toBe(1.02)
  })

  it('enters note editing without remounting the flow renderer into a loop', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    const note = await screen.findByText('Boardmark Viewer')

    await act(async () => {
      fireEvent.doubleClick(note)
    })

    expect(await screen.findByRole('textbox', { name: 'Edit welcome' })).toBeInTheDocument()
  })

  it('shows the color toolbar action for supported selections and applies swatch colors', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    store.getState().replaceSelectedNodes(['welcome'])

    render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Background color' }))
    })

    expect(await screen.findByRole('dialog', { name: 'Background colors' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Background #D7E8FF' }))
    })

    expect(await screen.findByRole('dialog', { name: 'Background colors' })).toBeInTheDocument()
    expect(store.getState().draftSource).toContain(
      'style: { bg: { color: "#D7E8FF" } }'
    )

    const noteSurface = (await screen.findByText('Boardmark Viewer')).closest('[data-note-surface="sticky"]') as HTMLDivElement | null

    expect(noteSurface).not.toBeNull()
    expect(noteSurface?.style.background).toContain('215, 232, 255')
  })

  it('keeps the open color popover across source-driven document patches', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    store.getState().replaceSelectedNodes(['welcome'])

    render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Background color' }))
    })

    expect(await screen.findByRole('dialog', { name: 'Background colors' })).toBeInTheDocument()

    const source = store.getState().draftSource

    if (!source) {
      throw new Error('Expected hydrated canvas store to provide a draft source.')
    }

    const recordResult = createCanvasMarkdownDocumentRepository().readSource({
      isTemplate: true,
      locator: {
        kind: 'memory',
        key: 'selection-toolbar-reconcile',
        name: 'selection-toolbar-reconcile.canvas.md'
      },
      source: source.replace('Boardmark Viewer', 'Boardmark Viewer updated')
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    await act(async () => {
      const state = store.getState()

      store.setState(createCanvasDocumentRecordPatch(recordResult.value, {
        selectedGroupIds: state.selectedGroupIds,
        selectedNodeIds: state.selectedNodeIds,
        selectedEdgeIds: state.selectedEdgeIds,
        viewport: state.viewport
      }))
    })

    expect(await screen.findByRole('dialog', { name: 'Background colors' })).toBeInTheDocument()
  })

  it('shows the current non-preset color on the custom swatch and opens the custom picker', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, style: { bg: { color: "#123456" } } }
Boardmark Viewer
:::`)

    store.getState().replaceSelectedNodes(['welcome'])

    render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Background color' }))
    })

    const customSwatch = await screen.findByRole('button', { name: 'Background custom color' })
    const customChip = customSwatch.querySelector('.selection-color-swatch__chip') as HTMLSpanElement | null

    expect(customChip).not.toBeNull()
    expect(customChip?.style.background).toContain('18, 52, 86')

    await act(async () => {
      fireEvent.click(customSwatch)
    })

    expect(document.querySelector('.selection-color-custom-picker__area')).not.toBeNull()
  })

  it('disables the color action when the current selection is image-only', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: image { id: hero, src: "/hero.png", alt: Hero, lockAspectRatio: true, at: { x: 80, y: 72, w: 320, h: 220 } }
:::`)

    store.getState().replaceSelectedNodes(['hero'])

    render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    expect(await screen.findByRole('button', { name: 'Background color' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: 'Outline color' })).toBeDisabled()
  })

  it('renders fallback custom nodes with the shared default background and stroke colors', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: boardmark.custom { id: custom-1, at: { x: 80, y: 72, w: 320, h: 220 } }
Custom
:::`)

    render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    const customLabel = await screen.findByText('boardmark.custom')
    const fallbackSurface = customLabel.closest('div[style]') as HTMLDivElement | null

    expect(fallbackSurface).not.toBeNull()
    expect(fallbackSurface?.style.background).toContain('255, 255, 255')
    expect(fallbackSurface?.style.boxShadow).toContain('#6042D6')
  })

  it('keeps visible line breaks after committing note edits back into preview rendering', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::`)

    const { container } = render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    const note = await screen.findByText('Boardmark Viewer')

    await act(async () => {
      fireEvent.doubleClick(note)
    })

    expect(await screen.findByRole('textbox', { name: 'Edit welcome' })).toBeInTheDocument()

    await act(async () => {
      store.getState().updateEditingMarkdown('Line 1<br>\nLine 2')
      await store.getState().commitInlineEditing()
    })

    const previewParagraph = container.querySelector('.note-markdown p')

    expect(previewParagraph).not.toBeNull()
    expect(previewParagraph?.querySelector('br')).not.toBeNull()
    expect(previewParagraph?.textContent).toBe('Line 1\nLine 2')
  })

  it('writes note size driven markdown scale variables onto the preview host', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: scaled, at: { x: 80, y: 72, w: 640, h: 440 } }
Scaled note
:::`)

    const { container } = render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    await screen.findByText('Scaled note')

    const markdownHost = container.querySelector('.note-markdown') as HTMLDivElement | null

    expect(markdownHost).not.toBeNull()
    expect(markdownHost?.style.getPropertyValue('--markdown-body-width')).toBe('600px')
    expect(markdownHost?.style.getPropertyValue('--markdown-body-height')).toBe('408px')
    expect(Number(markdownHost?.style.getPropertyValue('--markdown-scale'))).toBeCloseTo(600 / 280)
  })

  it('uses width-only scaling for auto-height notes and removes the block height ceiling', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: auto-scaled, at: { x: 80, y: 72, w: 640 } }
Auto height note
:::`)

    const { container } = render(
      <ReactFlowProvider>
        <CanvasScene
          {...createSceneInputProps(store)}
          store={store}
        />
      </ReactFlowProvider>
    )

    await screen.findByText('Auto height note')

    const markdownHost = container.querySelector('.note-markdown') as HTMLDivElement | null

    expect(markdownHost).not.toBeNull()
    expect(markdownHost?.style.getPropertyValue('--markdown-body-width')).toBe('600px')
    expect(markdownHost?.style.getPropertyValue('--markdown-block-max-height')).toBe('none')
    expect(Number(markdownHost?.style.getPropertyValue('--markdown-scale'))).toBeCloseTo(600 / 280)
  })

  it('rerenders only the edited node selectors while node editing state changes', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Welcome
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 } }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview }
Link
:::`)
    const renderCounts = {
      edge: 0,
      overview: 0,
      root: 0,
      welcome: 0
    }

    render(<EditingSelectorProbeHarness renderCounts={renderCounts} store={store} />)

    expect(renderCounts).toEqual({
      edge: 1,
      overview: 1,
      root: 1,
      welcome: 1
    })

    await act(async () => {
      store.getState().startObjectEditing('welcome')
    })

    expect(renderCounts.welcome).toBe(2)
    expect(renderCounts.overview).toBe(1)
    expect(renderCounts.edge).toBe(1)
    expect(renderCounts.root).toBe(2)

    await act(async () => {
      store.getState().updateEditingMarkdown('Welcome, edited')
    })

    expect(renderCounts.welcome).toBe(3)
    expect(renderCounts.overview).toBe(1)
    expect(renderCounts.edge).toBe(1)
    expect(renderCounts.root).toBe(2)

    await act(async () => {
      store.getState().cancelInlineEditing()
    })

    expect(renderCounts.welcome).toBe(4)
    expect(renderCounts.overview).toBe(1)
    expect(renderCounts.edge).toBe(1)
    expect(renderCounts.root).toBe(3)
  })

  it('rerenders only the edited edge selectors while edge editing state changes', async () => {
    const store = await createHydratedCanvasStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Welcome
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 } }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview }
Link
:::`)
    const renderCounts = {
      edge: 0,
      overview: 0,
      root: 0,
      welcome: 0
    }

    render(<EditingSelectorProbeHarness renderCounts={renderCounts} store={store} />)

    expect(renderCounts).toEqual({
      edge: 1,
      overview: 1,
      root: 1,
      welcome: 1
    })

    await act(async () => {
      store.getState().startEdgeEditing('welcome-overview')
    })

    expect(renderCounts.edge).toBe(2)
    expect(renderCounts.welcome).toBe(1)
    expect(renderCounts.overview).toBe(1)
    expect(renderCounts.root).toBe(2)

    await act(async () => {
      store.getState().updateEditingMarkdown('Link, edited')
    })

    expect(renderCounts.edge).toBe(3)
    expect(renderCounts.welcome).toBe(1)
    expect(renderCounts.overview).toBe(1)
    expect(renderCounts.root).toBe(2)

    await act(async () => {
      store.getState().cancelInlineEditing()
    })

    expect(renderCounts.edge).toBe(4)
    expect(renderCounts.welcome).toBe(1)
    expect(renderCounts.overview).toBe(1)
    expect(renderCounts.root).toBe(3)
  })

  it('normalizes grouped member node ids to top-level group ids', () => {
    const groups: CanvasGroup[] = [
      {
        id: 'ideation-group',
        z: 10,
        members: {
          nodeIds: ['welcome', 'overview']
        },
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 5, offset: 0 }
        },
        sourceMap
      }
    ]

    expect(normalizeTopLevelNodeSelection(['welcome', 'overview', 'solo'], groups)).toEqual({
      groupIds: ['ideation-group'],
      nodeIds: ['solo']
    })
  })

  it('reads a single-node drag as a direct move commit', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    expect(readPointerNodeMoveResolution({
      draggedNodeId: 'welcome',
      draggedPosition: {
        x: 144.2,
        y: 168.7
      },
      nodes,
      unlockedSelectionNodeIds: ['welcome']
    })).toEqual({
      kind: 'commit-node-move',
      nodeId: 'welcome',
      x: 144,
      y: 169
    })
  })

  it('reads a multi-selection drag as a selection nudge', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
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
          ...sourceMap,
          objectRange: {
            start: { line: 5, offset: 0 },
            end: { line: 7, offset: 12 }
          }
        }
      }
    ]

    expect(readPointerNodeMoveResolution({
      draggedNodeId: 'welcome',
      draggedPosition: {
        x: 120.4,
        y: 82.2
      },
      nodes,
      unlockedSelectionNodeIds: ['welcome', 'overview']
    })).toEqual({
      kind: 'commit-selection-nudge',
      dx: 40,
      dy: 10
    })
  })

  it('skips drag commits when the rounded position does not change', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      }
    ]

    expect(readPointerNodeMoveResolution({
      draggedNodeId: 'welcome',
      draggedPosition: {
        x: 80.4,
        y: 72.4
      },
      nodes,
      unlockedSelectionNodeIds: ['welcome']
    })).toBeNull()
  })

  it('falls back to a single-node commit when the dragged node is outside the unlocked selection', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
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
          ...sourceMap,
          objectRange: {
            start: { line: 5, offset: 0 },
            end: { line: 7, offset: 12 }
          }
        }
      }
    ]

    expect(readPointerNodeMoveResolution({
      draggedNodeId: 'welcome',
      draggedPosition: {
        x: 110.1,
        y: 90.2
      },
      nodes,
      unlockedSelectionNodeIds: ['overview', 'solo']
    })).toEqual({
      kind: 'commit-node-move',
      nodeId: 'welcome',
      x: 110,
      y: 90
    })
  })

  it('normalizes dragged nodes into commit moves using top-level, drilldown, and lock rules', () => {
    const groups: CanvasGroup[] = [
      {
        id: 'ideation-group',
        z: 10,
        members: {
          nodeIds: ['welcome', 'overview']
        },
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 5, offset: 0 }
        },
        sourceMap
      }
    ]
    const nodes: CanvasNode[] = [
      {
        id: 'welcome',
        component: 'note',
        at: { x: 80, y: 72, w: 320, h: 220 },
        body: 'Boardmark Viewer\n',
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        },
        sourceMap
      },
      {
        id: 'overview',
        component: 'note',
        at: { x: 380, y: 72, w: 320, h: 220 },
        body: 'Overview\n',
        locked: true,
        position: {
          start: { line: 5, offset: 0 },
          end: { line: 7, offset: 12 }
        },
        sourceMap: {
          ...sourceMap,
          objectRange: {
            start: { line: 5, offset: 0 },
            end: { line: 7, offset: 12 }
          }
        }
      },
      {
        id: 'solo',
        component: 'note',
        at: { x: 760, y: 72, w: 320, h: 220 },
        body: 'Solo\n',
        position: {
          start: { line: 9, offset: 0 },
          end: { line: 11, offset: 12 }
        },
        sourceMap: {
          ...sourceMap,
          objectRange: {
            start: { line: 9, offset: 0 },
            end: { line: 11, offset: 12 }
          }
        }
      }
    ]
    const draggedNodes = readFlowNodes(nodes)

    expect(readCommittedNodeMovesFromDraggedNodes({
      draggedNodes: [
        {
          ...draggedNodes[0]!,
          position: { x: 111.6, y: 155.2 }
        },
        {
          ...draggedNodes[1]!,
          position: { x: 420, y: 180 }
        },
        {
          ...draggedNodes[2]!,
          position: { x: 810.4, y: 166.8 }
        }
      ],
      groupSelectionState: {
        status: 'group-selected',
        groupId: 'ideation-group'
      },
      groups,
      nodes
    })).toEqual([
      {
        nodeId: 'solo',
        x: 810,
        y: 167
      }
    ])

    expect(readCommittedNodeMovesFromDraggedNodes({
      draggedNodes: [
        {
          ...draggedNodes[0]!,
          position: { x: 112.2, y: 156.8 }
        }
      ],
      groupSelectionState: {
        status: 'drilldown',
        groupId: 'ideation-group',
        nodeId: 'welcome'
      },
      groups,
      nodes
    })).toEqual([
      {
        nodeId: 'welcome',
        x: 112,
        y: 157
      }
    ])
  })
})

function EditingSelectorProbeHarness({
  renderCounts,
  store
}: {
  renderCounts: Record<'edge' | 'overview' | 'root' | 'welcome', number>
  store: CanvasStore
}) {
  return (
    <>
      <CanvasMutationProbe
        renderCounts={renderCounts}
        store={store}
      />
      <NodeEditingProbe
        nodeId="welcome"
        renderCounts={renderCounts}
        store={store}
      />
      <NodeEditingProbe
        nodeId="overview"
        renderCounts={renderCounts}
        store={store}
      />
      <EdgeEditingProbe
        edgeId="welcome-overview"
        renderCounts={renderCounts}
        store={store}
      />
    </>
  )
}

function CanvasMutationProbe({
  renderCounts,
  store
}: {
  renderCounts: Record<'edge' | 'overview' | 'root' | 'welcome', number>
  store: CanvasStore
}) {
  renderCounts.root += 1
  useStore(store, (state) => canCanvasMutateSelection(state.editingState))
  return null
}

function NodeEditingProbe({
  nodeId,
  renderCounts,
  store
}: {
  nodeId: 'overview' | 'welcome'
  renderCounts: Record<'edge' | 'overview' | 'root' | 'welcome', number>
  store: CanvasStore
}) {
  renderCounts[nodeId] += 1
  useStore(store, (state) => readActiveNodeEditingSession(state.editingState, nodeId))
  useStore(store, (state) => readNodeEditingInteractionBlock(state.editingState, nodeId))
  return null
}

function EdgeEditingProbe({
  edgeId,
  renderCounts,
  store
}: {
  edgeId: 'welcome-overview'
  renderCounts: Record<'edge' | 'overview' | 'root' | 'welcome', number>
  store: CanvasStore
}) {
  renderCounts.edge += 1
  useStore(store, (state) => readActiveEdgeEditingSession(state.editingState, edgeId))
  useStore(store, (state) => readEdgeEditingInteractionBlock(state.editingState, edgeId))
  return null
}

function createSceneInputProps(store: CanvasStore, supportsMultiSelect = false) {
  const dispatchCanvasInput = (
    input: CanvasMatchedInput,
    options?: { viewportBounds?: { left: number; top: number } }
  ) => {
    const resolved = resolveCanvasInput(
      input,
      readSceneInputContext(
        store,
        'target' in input.intent ? input.intent.target : null,
        supportsMultiSelect
      )
    )

    if (!resolved) {
      return false
    }

    void dispatchCanvasResolvedInput(resolved, {
      ...readSceneDispatchContext(store),
      viewportBounds: options?.viewportBounds
    })
    return true
  }

  const dispatchCanvasInputAsync = async (
    input: CanvasMatchedInput,
    options?: { viewportBounds?: { left: number; top: number } }
  ) => {
    const resolved = resolveCanvasInput(
      input,
      readSceneInputContext(
        store,
        'target' in input.intent ? input.intent.target : null,
        supportsMultiSelect
      )
    )

    if (!resolved) {
      return false
    }

    await Promise.resolve(dispatchCanvasResolvedInput(resolved, {
      ...readSceneDispatchContext(store),
      viewportBounds: options?.viewportBounds
    }))
    return true
  }

  return {
    dispatchCanvasInput,
    dispatchCanvasInputAsync,
    pointerCapabilities: readCanvasPointerCapabilities(
      readSceneInputContext(store, null, supportsMultiSelect)
    )
  }
}

async function createHydratedCanvasStore(templateSource: string) {
  const store = createCanvasStore({
    documentPicker: createPicker(),
    documentRepository: toGateway(createCanvasMarkdownDocumentRepository()),
    templateSource
  })

  await act(async () => {
    await store.getState().hydrateTemplate()
  })

  return store
}

function readSceneAppCommandContext(store: CanvasStore) {
  const state = store.getState()

  return createCanvasAppCommandContext({
    deleteSelection: state.deleteSelection,
    editingState: state.editingState,
    edges: state.edges,
    groupSelectionState: state.groupSelectionState,
    groups: state.groups,
    nodes: state.nodes,
    objectContextMenuOpen: false,
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
      viewport: state.viewport
  })
}

function readSceneObjectCommandContext(store: CanvasStore) {
  const state = store.getState()

  return createCanvasObjectCommandContext({
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
    nudgeSelection: state.nudgeSelection,
    nodes: state.nodes,
    pasteClipboard: state.pasteClipboard,
    pasteClipboardInPlace: state.pasteClipboardInPlace,
    selectAllObjects: state.selectAllObjects,
    selectedEdgeIds: state.selectedEdgeIds,
    selectedGroupIds: state.selectedGroupIds,
    selectedNodeIds: state.selectedNodeIds,
    setSelectionLocked: state.setSelectionLocked,
    ungroupSelection: state.ungroupSelection
  })
}

function readSceneDispatchContext(store: CanvasStore) {
  const state = store.getState()

  return {
    appCommandContext: readSceneAppCommandContext(store),
    clearSelection: state.clearSelection,
    commitNodeMove: state.commitNodeMove,
    commitNodeResize: state.commitNodeResize,
    nudgeSelection: state.nudgeSelection,
    openObjectContextMenu: () => undefined,
    openPaneContextMenu: () => undefined,
    objectCommandContext: readSceneObjectCommandContext(store),
    replaceSelection: state.replaceSelection,
    reconnectEdge: state.reconnectEdge,
    selectEdgeFromCanvas: state.selectEdgeFromCanvas,
    selectNodeFromCanvas: state.selectNodeFromCanvas,
    setPointerInteractionState: state.setPointerInteractionState,
    setTemporaryPanState: state.setTemporaryPanState
  }
}

function readSceneInputContext(
  store: CanvasStore,
  eventTarget: EventTarget | null,
  supportsMultiSelect: boolean
) {
  const state = store.getState()

  return createCanvasInputContext({
    appCommandContext: readSceneAppCommandContext(store),
    eventTarget,
    objectCommandContext: readSceneObjectCommandContext(store),
    temporaryPanState: state.temporaryPanState,
    supportsMultiSelect,
    toolMode: state.toolMode
  })
}

function createPicker(): CanvasDocumentPicker {
  return {
    pickOpenLocator: vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'cancelled' as const,
        message: 'Cancelled by test.',
        kind: 'cancelled' as const
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
