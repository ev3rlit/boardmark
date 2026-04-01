import { useEffect, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  SelectionMode,
  getBezierPath,
  useOnViewportChange,
  useReactFlow,
  type EdgeProps,
  type EdgeTypes,
  type NodeProps,
  type NodeTypes
} from '@xyflow/react'
import { useStore } from 'zustand'
import {
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdgeData,
  type CanvasFlowNodeData
} from '@boardmark/canvas-renderer'
import type { CanvasNode } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import type { ViewerStore } from './viewer-store'

type CanvasSceneProps = {
  store: ViewerStore
  supportsMultiSelect?: boolean
}

const nodeTypes: NodeTypes = {
  'canvas-note': CanvasNoteNode
}

const edgeTypes: EdgeTypes = {
  'canvas-edge': CanvasMarkdownEdge
}

export function CanvasScene({ store, supportsMultiSelect = false }: CanvasSceneProps) {
  const nodes = useStore(store, (state) => state.nodes)
  const edges = useStore(store, (state) => state.edges)
  const viewport = useStore(store, (state) => state.viewport)
  const toolMode = useStore(store, (state) => state.toolMode)
  const clearSelectedNodes = useStore(store, (state) => state.clearSelectedNodes)
  const replaceSelectedNodes = useStore(store, (state) => state.replaceSelectedNodes)

  const flowNodes = useMemo(
    () => readFlowNodes(nodes),
    [nodes]
  )
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges])

  return (
    <div className="h-full w-full">
      <ReactFlow
        className="boardmark-flow"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={toolMode === 'select'}
        panOnDrag={toolMode === 'pan'}
        selectionOnDrag={supportsMultiSelect && toolMode === 'select'}
        selectionMode={SelectionMode.Partial}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        defaultViewport={viewport}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => clearSelectedNodes()}
        multiSelectionKeyCode={supportsMultiSelect ? undefined : null}
        onSelectionChange={({ nodes: selectedNodes }) => {
          replaceSelectedNodes(selectedNodes.map((node) => node.id))
        }}
      >
        <CanvasFlowViewportSync
          store={store}
          viewport={viewport}
        />
        <Background
          color="rgba(43, 52, 55, 0.06)"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Background
          color="rgba(96, 66, 214, 0.12)"
          gap={120}
          size={1.2}
          variant={BackgroundVariant.Lines}
        />
      </ReactFlow>
    </div>
  )
}

export function readFlowNodes(nodes: CanvasNode[]) {
  return nodes.map(toFlowNode)
}

type CanvasFlowViewportSyncProps = {
  store: ViewerStore
  viewport: { x: number; y: number; zoom: number }
}

function CanvasFlowViewportSync({ store, viewport }: CanvasFlowViewportSyncProps) {
  const reactFlow = useReactFlow()
  const setViewport = useStore(store, (state) => state.setViewport)

  useOnViewportChange({
    onEnd: (nextViewport) => {
      setViewport(nextViewport)
    }
  })

  useEffect(() => {
    const currentViewport = reactFlow.getViewport()
    const sameViewport =
      Math.abs(currentViewport.x - viewport.x) < 0.5 &&
      Math.abs(currentViewport.y - viewport.y) < 0.5 &&
      Math.abs(currentViewport.zoom - viewport.zoom) < 0.01

    if (!sameViewport) {
      void reactFlow.setViewport(viewport, { duration: 0 })
    }
  }, [reactFlow, viewport])

  return null
}

function CanvasNoteNode({ data, selected }: NodeProps) {
  const noteData = data as CanvasFlowNodeData

  return (
    <div className="max-w-none">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="boardmark-flow__handle"
      />
      <StickyNoteCard
        color={noteData.color}
        selected={selected}
      >
        <MarkdownContent
          className="markdown-content note-markdown"
          content={noteData.content}
        />
      </StickyNoteCard>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="boardmark-flow__handle"
      />
    </div>
  )
}

function CanvasMarkdownEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}: EdgeProps) {
  const edgeData = (data ?? {}) as CanvasFlowEdgeData
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: 'rgba(96, 66, 214, 0.72)',
          strokeWidth: 2.5
        }}
      />
      {edgeData.content ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute max-w-64 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_90%,transparent)] px-4 py-2 text-sm text-[var(--color-on-surface)] shadow-[0_16px_32px_rgba(43,52,55,0.08)]"
            style={{
              left: labelX,
              top: labelY
            }}
          >
            <MarkdownContent
              className="markdown-content edge-markdown"
              content={edgeData.content}
            />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
