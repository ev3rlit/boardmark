import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Position, type Edge, type InternalNode, type Node } from '@xyflow/react'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import { toFlowEdge, toFlowNode, type CanvasFlowEdgeData, type CanvasFlowNodeData } from '@boardmark/canvas-renderer'
import { CanvasMarkdownEdge } from '@canvas-app/components/scene/canvas-scene'
import { createCanvasStore, type CanvasStore } from '@canvas-app/store/canvas-store'
import { useStore } from 'zustand'
import type { CanvasNode } from '@boardmark/canvas-domain'

const internalNodes = new Map<string, InternalNode<Node<CanvasFlowNodeData>>>()

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')

  return {
    ...actual,
    BaseEdge({
      id,
      path
    }: {
      id?: string
      path: string
    }) {
      return (
        <path
          d={path}
          data-testid={id ? `edge-path-${id}` : 'edge-path'}
        />
      )
    },
    EdgeLabelRenderer({ children }: { children: ReactNode }) {
      return <>{children}</>
    },
    useInternalNode(id: string) {
      return internalNodes.get(id)
    }
  }
})

describe('CanvasMarkdownEdge', () => {
  afterEach(() => {
    internalNodes.clear()
  })

  it('anchors vertical edges on the outer top and bottom bounds instead of fixed side handles', async () => {
    const store = await createHydratedStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: source, at: { x: 80, y: 72, w: 320, h: 220 } }
Source
:::

::: note { id: target, at: { x: 120, y: 420, w: 320, h: 220 } }
Target
:::

::: edge { id: source-target, from: source, to: target }
Vertical
:::`)

    seedInternalNodes(store.getState().nodes)
    const { container } = render(<EdgeHarness store={store} />)
    const { source, target } = readRenderedEdgeEndpoints(container, 'source-target')

    expect(source.x).toBeCloseTo(252.643678, 4)
    expect(source.y).toBeCloseTo(292, 4)
    expect(target.x).toBeCloseTo(267.356322, 4)
    expect(target.y).toBeCloseTo(420, 4)
  })

  it('anchors diagonal edges from the natural left and right perimeter sides', async () => {
    const store = await createHydratedStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: source, at: { x: 440, y: 72, w: 320, h: 220 } }
Source
:::

::: note { id: target, at: { x: 80, y: 360, w: 320, h: 220 } }
Target
:::

::: edge { id: source-target, from: source, to: target }
Diagonal
:::`)

    seedInternalNodes(store.getState().nodes)
    const { container } = render(<EdgeHarness store={store} />)
    const { source, target } = readRenderedEdgeEndpoints(container, 'source-target')

    expect(source.x).toBeCloseTo(462.5, 4)
    expect(source.y).toBeCloseTo(292, 4)
    expect(target.x).toBeCloseTo(377.5, 4)
    expect(target.y).toBeCloseTo(360, 4)
  })

  it('renders an edge created through the existing store pipeline using computed anchors', async () => {
    const store = await createHydratedStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: source, at: { x: 80, y: 72, w: 320, h: 220 } }
Source
:::

::: note { id: target, at: { x: 120, y: 420, w: 320, h: 220 } }
Target
:::`)

    seedInternalNodes(store.getState().nodes)
    const { container } = render(<EdgeHarness store={store} />)

    expect(container.querySelector('[data-testid^="edge-path-"]')).toBeNull()

    await act(async () => {
      await store.getState().createEdgeFromConnection('source', 'target')
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid^="edge-path-"]')).not.toBeNull()
    })

    const { source, target } = readRenderedEdgeEndpoints(container, store.getState().edges[0]!.id)

    expect(source.y).toBeCloseTo(292, 4)
    expect(target.y).toBeCloseTo(420, 4)
  })

  it('re-renders reconnected edges using the recalculated anchor policy', async () => {
    const store = await createHydratedStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: source, at: { x: 80, y: 72, w: 320, h: 220 } }
Source
:::

::: note { id: horizontal, at: { x: 520, y: 72, w: 320, h: 220 } }
Horizontal
:::

::: note { id: vertical, at: { x: 120, y: 420, w: 320, h: 220 } }
Vertical
:::

::: edge { id: source-target, from: source, to: horizontal }
Reconnect me
:::`)

    seedInternalNodes(store.getState().nodes)
    const { container } = render(<EdgeHarness store={store} />)
    const initialEndpoints = readRenderedEdgeEndpoints(container, 'source-target')

    expect(initialEndpoints.source.x).toBeCloseTo(400, 4)
    expect(initialEndpoints.target.x).toBeCloseTo(520, 4)

    await act(async () => {
      await store.getState().reconnectEdge('source-target', 'source', 'vertical')
    })

    await waitFor(() => {
      const nextEndpoints = readRenderedEdgeEndpoints(container, 'source-target')
      expect(nextEndpoints.source.y).toBeCloseTo(292, 4)
      expect(nextEndpoints.target.y).toBeCloseTo(420, 4)
    })
  })

  it('keeps edge label editing available on the updated edge path', async () => {
    const store = await createHydratedStore(`---
type: canvas
version: 2
viewport:
  x: 0
  y: 0
  zoom: 1
---

::: note { id: source, at: { x: 80, y: 72, w: 320, h: 220 } }
Source
:::

::: note { id: target, at: { x: 120, y: 420, w: 320, h: 220 } }
Target
:::

::: edge { id: source-target, from: source, to: target }
Editable label
:::`)

    seedInternalNodes(store.getState().nodes)
    render(<EdgeHarness store={store} />)

    fireEvent.doubleClick(await screen.findByText('Editable label'))

    await screen.findByLabelText('Edit source-target')
  })
})

function EdgeHarness({ store }: { store: CanvasStore }) {
  const nodes = useStore(store, (state) => state.nodes)
  const edge = useStore(store, (state) => state.edges[0] ?? null)

  if (!edge) {
    return null
  }

  const flowEdge = toFlowEdge(edge)
  const fallback = readLegacyFallback(nodes, flowEdge)

  return (
    <svg>
      <CanvasMarkdownEdge
        animated={flowEdge.animated}
        data={flowEdge.data}
        deletable={flowEdge.deletable}
        id={flowEdge.id}
        selected={false}
        source={flowEdge.source}
        sourcePosition={fallback.sourcePosition}
        sourceX={fallback.sourceX}
        sourceY={fallback.sourceY}
        store={store}
        style={flowEdge.style}
        target={flowEdge.target}
        targetPosition={fallback.targetPosition}
        targetX={fallback.targetX}
        targetY={fallback.targetY}
      />
    </svg>
  )
}

async function createHydratedStore(templateSource: string) {
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

function seedInternalNodes(nodes: CanvasNode[]) {
  for (const node of nodes) {
    const flowNode = toFlowNode(node)
    const width = flowNode.width ?? 0
    const height = flowNode.height ?? 0

    internalNodes.set(node.id, {
      ...flowNode,
      measured: {
        width,
        height
      },
      internals: {
        positionAbsolute: {
          x: flowNode.position.x,
          y: flowNode.position.y
        },
        z: flowNode.zIndex ?? 0,
        userNode: flowNode
      }
    } as InternalNode<Node<CanvasFlowNodeData>>)
  }
}

function readLegacyFallback(nodes: CanvasNode[], edge: Edge<CanvasFlowEdgeData>) {
  const sourceNode = nodes.find((node) => node.id === edge.source)
  const targetNode = nodes.find((node) => node.id === edge.target)

  if (!sourceNode || !targetNode) {
    throw new Error(`Expected both edge endpoints to exist for ${edge.id}.`)
  }

  const sourceWidth = sourceNode.at.w ?? 320
  const sourceHeight = sourceNode.at.h ?? 220
  const targetHeight = targetNode.at.h ?? 220

  return {
    sourcePosition: Position.Right,
    sourceX: sourceNode.at.x + sourceWidth,
    sourceY: sourceNode.at.y + sourceHeight / 2,
    targetPosition: Position.Left,
    targetX: targetNode.at.x,
    targetY: targetNode.at.y + targetHeight / 2
  }
}

function readRenderedEdgeEndpoints(container: HTMLElement, edgeId: string) {
  const pathElement = container.querySelector(`[data-testid="edge-path-${edgeId}"]`)

  if (!(pathElement instanceof Element) || pathElement.tagName.toLowerCase() !== 'path') {
    throw new Error(`Expected a rendered edge path for ${edgeId}.`)
  }

  const pathData = pathElement.getAttribute('d')

  if (!pathData) {
    throw new Error(`Expected ${edgeId} to include SVG path data.`)
  }

  const coordinates = pathData.match(/-?\d*\.?\d+/g)?.map((value) => Number.parseFloat(value))

  if (!coordinates || coordinates.length < 8) {
    throw new Error(`Expected a cubic bezier path, received: ${pathData}`)
  }

  return {
    source: {
      x: coordinates[0]!,
      y: coordinates[1]!
    },
    target: {
      x: coordinates[coordinates.length - 2]!,
      y: coordinates[coordinates.length - 1]!
    }
  }
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
