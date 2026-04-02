import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  SelectionMode,
  applyNodeChanges,
  getBezierPath,
  useOnViewportChange,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type NodeChange,
  type Node,
  type NodeProps,
  type NodeTypes
} from '@xyflow/react'
import { useStore } from 'zustand'
import {
  BUILT_IN_RENDERER_COMPONENTS,
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdgeData,
  type CanvasFlowNodeData
} from '@boardmark/canvas-renderer'
import type { BuiltInComponentKey, CanvasNode } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import { readActiveToolMode, type CanvasStore, type CanvasStoreState } from '@canvas-app/store/canvas-store'

type CanvasSceneProps = {
  onObjectContextMenu?: (input: {
    edgeIds: string[]
    nodeIds: string[]
    x: number
    y: number
  }) => void
  onPaneContextMenu?: () => void
  store: CanvasStore
  supportsMultiSelect?: boolean
}

export function CanvasScene({
  onObjectContextMenu,
  onPaneContextMenu,
  store,
  supportsMultiSelect = false
}: CanvasSceneProps) {
  const nodes = useStore(store, (state) => state.nodes)
  const edges = useStore(store, (state) => state.edges)
  const viewport = useStore(store, (state) => state.viewport)
  const defaultStyle = useStore(store, (state) => state.document?.ast.frontmatter.defaultStyle)
  const activeToolMode = useStore(store, readActiveToolMode)
  const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
  const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
  const interactionOverrides = useStore(store, (state) => state.interactionOverrides)
  const clearSelection = useStore(store, (state) => state.clearSelection)
  const replaceSelectedNodes = useStore(store, (state) => state.replaceSelectedNodes)
  const replaceSelectedEdges = useStore(store, (state) => state.replaceSelectedEdges)
  const previewNodeMove = useStore(store, (state) => state.previewNodeMove)
  const commitNodeMove = useStore(store, (state) => state.commitNodeMove)
  const previewNodeResize = useStore(store, (state) => state.previewNodeResize)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const reconnectEdge = useStore(store, (state) => state.reconnectEdge)
  const createEdgeFromConnection = useStore(store, (state) => state.createEdgeFromConnection)
  const editingState = useStore(store, (state) => state.editingState)
  const isPanMode = activeToolMode === 'pan'

  const baseFlowNodes = useMemo(
    () => readFlowNodes(nodes, interactionOverrides, selectedNodeIds, defaultStyle),
    [nodes, interactionOverrides, selectedNodeIds, defaultStyle]
  )
  const [flowNodes, setFlowNodes] = useState<Node<CanvasFlowNodeData>[]>(baseFlowNodes)
  const flowEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...toFlowEdge(edge),
        selected: selectedEdgeIds.includes(edge.id)
      })),
    [edges, selectedEdgeIds]
  )
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      'canvas-note': (props) => (
        <CanvasNoteNode
          {...props}
          store={store}
        />
      ),
      'canvas-component': (props) => (
        <CanvasComponentNode
          {...props}
          store={store}
        />
      )
    }),
    [store]
  )
  const edgeTypes = useMemo<EdgeTypes>(
    () => ({
      'canvas-edge': (props) => (
        <CanvasMarkdownEdge
          {...props}
          store={store}
        />
      )
    }),
    [store]
  )

  useEffect(() => {
    setFlowNodes((currentFlowNodes) => mergeFlowNodes(baseFlowNodes, currentFlowNodes))
  }, [baseFlowNodes])

  return (
    <div className="h-full w-full">
      <ReactFlow<Node<CanvasFlowNodeData>, Edge<CanvasFlowEdgeData>>
        className={[
          'boardmark-flow',
          isPanMode ? 'boardmark-flow--pan' : ''
        ].join(' ').trim()}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={activeToolMode === 'select' && editingState.status === 'idle'}
        nodesConnectable={activeToolMode === 'select' && editingState.status === 'idle'}
        edgesReconnectable={activeToolMode === 'select' && editingState.status === 'idle'}
        elementsSelectable={activeToolMode === 'select'}
        panOnDrag={isPanMode}
        selectionOnDrag={supportsMultiSelect && activeToolMode === 'select'}
        selectionMode={SelectionMode.Partial}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        defaultViewport={viewport}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => clearSelection()}
        onPaneContextMenu={() => onPaneContextMenu?.()}
        multiSelectionKeyCode={supportsMultiSelect ? undefined : null}
        onNodesChange={(changes) => {
          setFlowNodes((currentFlowNodes) => applyNodeChanges(changes, currentFlowNodes))
          applyNodeChangesToStore({
            changes,
            previewNodeMove,
            replaceSelectedNodes,
            selectedNodeIds
          })
        }}
        onEdgesChange={(changes) => {
          applyEdgeChangesToStore({
            changes,
            replaceSelectedEdges,
            selectedEdgeIds
          })
        }}
        onNodeDragStop={(_event, node) => {
          void commitNodeMove(node.id, node.position.x, node.position.y)
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()

          const nextNodeIds = selectedNodeIds.includes(node.id) ? selectedNodeIds : [node.id]
          replaceSelectedNodes(nextNodeIds)
          replaceSelectedEdges([])
          onObjectContextMenu?.({
            edgeIds: [],
            nodeIds: nextNodeIds,
            x: event.clientX,
            y: event.clientY
          })
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()

          const nextEdgeIds = selectedEdgeIds.includes(edge.id) ? selectedEdgeIds : [edge.id]
          replaceSelectedNodes([])
          replaceSelectedEdges(nextEdgeIds)
          onObjectContextMenu?.({
            edgeIds: nextEdgeIds,
            nodeIds: [],
            x: event.clientX,
            y: event.clientY
          })
        }}
        onConnect={(connection) => {
          void handleConnection(connection, createEdgeFromConnection)
        }}
        onReconnect={(oldEdge, connection) => {
          if (!connection.source || !connection.target) {
            return
          }

          void reconnectEdge(oldEdge.id, connection.source, connection.target)
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

export function readFlowNodes(
  nodes: CanvasNode[],
  interactionOverrides: CanvasStoreState['interactionOverrides'] = {},
  selectedNodeIds: string[] = [],
  defaultStyle?: string
) {
  return nodes.map((node) => {
    const override = interactionOverrides[node.id]
    const patchedNode = {
      ...node,
      at: {
        ...node.at,
        x: override?.x ?? node.at.x,
        y: override?.y ?? node.at.y,
        w: override?.w ?? node.at.w,
        h: override?.h ?? node.at.h
      }
    }

    return {
      ...toFlowNode(patchedNode, defaultStyle),
      selected: selectedNodeIds.includes(node.id)
    }
  })
}

export function mergeFlowNodes(
  nextFlowNodes: Node<CanvasFlowNodeData>[],
  currentFlowNodes: Node<CanvasFlowNodeData>[]
) {
  const currentFlowNodesById = new Map(currentFlowNodes.map((node) => [node.id, node]))

  return nextFlowNodes.map((nextFlowNode) => {
    const currentFlowNode = currentFlowNodesById.get(nextFlowNode.id)

    if (!currentFlowNode) {
      return nextFlowNode
    }

    return {
      ...nextFlowNode,
      dragging: currentFlowNode.dragging,
      height: currentFlowNode.height,
      measured: currentFlowNode.measured,
      resizing: currentFlowNode.resizing,
      width: currentFlowNode.width
    }
  })
}

type CanvasFlowViewportSyncProps = {
  store: CanvasStore
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

function CanvasNoteNode({ id, data, selected, store }: NodeProps<Node<CanvasFlowNodeData>> & { store: CanvasStore }) {
  const editingState = useStore(store, (state) => state.editingState)
  const previewNodeResize = useStore(store, (state) => state.previewNodeResize)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const startNoteEditing = useStore(store, (state) => state.startNoteEditing)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const isEditing = editingState.status === 'note' && editingState.objectId === id
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!isEditing || !textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    textareaRef.current.select()
  }, [isEditing])

  return (
    <div
      className="h-full w-full max-w-none"
      onDoubleClick={() => startNoteEditing(id)}
    >
      <NodeResizer
        isVisible={selected && !isEditing}
        minWidth={160}
        minHeight={140}
        color="rgba(96, 66, 214, 0.72)"
        handleClassName="boardmark-flow__resize-handle"
        lineClassName="boardmark-flow__resize-line"
        onResize={(_event, resize) => {
          previewNodeResize(id, {
            x: resize.x,
            y: resize.y,
            width: resize.width,
            height: resize.height
          })
        }}
        onResizeEnd={(_event, resize) => {
          void commitNodeResize(id, {
            x: resize.x,
            y: resize.y,
            width: resize.width,
            height: resize.height
          })
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!isEditing}
        className="boardmark-flow__handle"
      />
      <StickyNoteCard
        className="flex h-full w-full min-h-0 flex-col overflow-hidden"
        color="default"
        selected={selected}
      >
        {isEditing ? (
          <div className="min-h-0 flex-1">
            <textarea
              ref={textareaRef}
              aria-label={`Edit ${id}`}
              className="h-full min-h-0 w-full resize-none rounded-xl border border-[color:color-mix(in_oklab,var(--color-primary)_20%,transparent)] bg-transparent p-1 text-sm text-[var(--color-on-surface)] outline-none"
              value={editingState.markdown}
              onChange={(event) => updateEditingMarkdown(event.target.value)}
              onBlur={() => void commitInlineEditing()}
              onKeyDown={(event) => {
                handleInlineEditorKeyDown(event, commitInlineEditing)
              }}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <MarkdownContent
              className="markdown-content note-markdown"
              content={data.body ?? ''}
            />
          </div>
        )}
      </StickyNoteCard>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!isEditing}
        className="boardmark-flow__handle"
      />
    </div>
  )
}

function CanvasComponentNode({ id, data, selected, store }: NodeProps<Node<CanvasFlowNodeData>> & { store: CanvasStore }) {
  const editingState = useStore(store, (state) => state.editingState)
  const previewNodeResize = useStore(store, (state) => state.previewNodeResize)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const startShapeEditing = useStore(store, (state) => state.startShapeEditing)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const isEditing = editingState.status === 'shape' && editingState.objectId === id
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!isEditing || !textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    textareaRef.current.select()
  }, [isEditing])

  const Renderer = readBuiltInRenderer(data.component)

  return (
    <div
      className="max-w-none"
      onDoubleClick={() => startShapeEditing(id)}
    >
      <NodeResizer
        isVisible={selected && !isEditing}
        minWidth={120}
        minHeight={120}
        color="rgba(96, 66, 214, 0.72)"
        handleClassName="boardmark-flow__resize-handle"
        lineClassName="boardmark-flow__resize-line"
        onResize={(_event, resize) => {
          previewNodeResize(id, {
            x: resize.x,
            y: resize.y,
            width: resize.width,
            height: resize.height
          })
        }}
        onResizeEnd={(_event, resize) => {
          void commitNodeResize(id, {
            x: resize.x,
            y: resize.y,
            width: resize.width,
            height: resize.height
          })
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!isEditing}
        className="boardmark-flow__handle"
      />
      {isEditing ? (
        <div className="rounded-[1rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] p-3 shadow-[0_16px_32px_rgba(43,52,55,0.08)]">
          <textarea
            ref={textareaRef}
            aria-label={`Edit ${id}`}
            className="min-h-18 w-full resize-none rounded-xl border border-[color:color-mix(in_oklab,var(--color-primary)_20%,transparent)] bg-transparent p-1 text-sm text-[var(--color-on-surface)] outline-none"
            value={editingState.markdown}
            onChange={(event) => updateEditingMarkdown(event.target.value)}
            onBlur={() => void commitInlineEditing()}
            onKeyDown={(event) => {
              handleInlineEditorKeyDown(event, commitInlineEditing)
            }}
          />
        </div>
      ) : Renderer ? (
        <Renderer
          component={data.component as BuiltInComponentKey}
          body={data.body}
          height={data.height}
          nodeId={id}
          resolvedThemeRef={data.resolvedThemeRef}
          selected={selected}
          style={data.style}
          width={typeof data.width === 'number' ? data.width : undefined}
        />
      ) : (
        <FallbackComponentNode
          component={data.component}
          body={data.body}
          style={data.style}
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!isEditing}
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
  data,
  store
}: EdgeProps<Edge<CanvasFlowEdgeData>> & { store: CanvasStore }) {
  const edgeData = (data ?? {}) as CanvasFlowEdgeData
  const editingState = useStore(store, (state) => state.editingState)
  const startEdgeEditing = useStore(store, (state) => state.startEdgeEditing)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const isEditing = editingState.status === 'edge' && editingState.edgeId === id
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  })

  useEffect(() => {
    if (!isEditing || !textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    textareaRef.current.select()
  }, [isEditing])

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
      <EdgeLabelRenderer>
        <div
          className="absolute max-w-64 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: labelX,
            top: labelY
          }}
        >
          <div
            className="rounded-2xl bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_90%,transparent)] px-4 py-2 text-sm text-[var(--color-on-surface)] shadow-[0_16px_32px_rgba(43,52,55,0.08)]"
            onDoubleClick={() => startEdgeEditing(id)}
          >
            {isEditing ? (
              <textarea
                ref={textareaRef}
                aria-label={`Edit ${id}`}
                className="min-h-12 w-48 resize-none bg-transparent outline-none"
                value={editingState.markdown}
                onChange={(event) => updateEditingMarkdown(event.target.value)}
                onBlur={() => void commitInlineEditing()}
                onKeyDown={(event) => {
                  handleInlineEditorKeyDown(event, commitInlineEditing)
                }}
              />
            ) : edgeData.body ? (
              <MarkdownContent
                className="markdown-content edge-markdown"
                content={edgeData.body}
              />
            ) : (
              <span className="text-xs text-[var(--color-on-surface-variant)]">Double-click to label</span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

async function handleConnection(
  connection: Connection,
  createEdgeFromConnection: (from: string, to: string) => Promise<void>
) {
  if (!connection.source || !connection.target) {
    return
  }

  await createEdgeFromConnection(connection.source, connection.target)
}

function readBuiltInRenderer(component: string) {
  if (!(component in BUILT_IN_RENDERER_COMPONENTS)) {
    return null
  }

  return BUILT_IN_RENDERER_COMPONENTS[component as BuiltInComponentKey]
}

function handleInlineEditorKeyDown(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  commitInlineEditing: () => Promise<void>
) {
  if (event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  void commitInlineEditing()
}

function FallbackComponentNode({
  component,
  body,
  style
}: {
  component: string
  body?: string
  style?: CanvasFlowNodeData['style']
}) {
  return (
    <div
      className="flex min-h-full min-w-full flex-col justify-between rounded-[1.2rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_96%,white)] px-4 py-3 shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={{
        background: style?.overrides?.fill,
        boxShadow: style?.overrides?.stroke
          ? `inset 0 0 0 1.5px ${style.overrides.stroke}`
          : undefined,
        color: style?.overrides?.text
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
        {component}
      </div>
      <div className="mt-3 text-sm text-[inherit]">{body ?? 'Custom component placeholder'}</div>
    </div>
  )
}

export function applyNodeChangesToStore({
  changes,
  previewNodeMove,
  replaceSelectedNodes,
  selectedNodeIds
}: {
  changes: NodeChange<Node<CanvasFlowNodeData>>[]
  previewNodeMove: (nodeId: string, x: number, y: number) => void
  replaceSelectedNodes: (nodeIds: string[]) => void
  selectedNodeIds: string[]
}) {
  const nextSelectedNodeIds = new Set(selectedNodeIds)
  let selectionChanged = false

  for (const change of changes) {
    if (change.type === 'position' && change.dragging && change.position) {
      previewNodeMove(change.id, change.position.x, change.position.y)
      continue
    }

    if (change.type === 'select') {
      selectionChanged = true

      if (change.selected) {
        nextSelectedNodeIds.add(change.id)
      } else {
        nextSelectedNodeIds.delete(change.id)
      }
    }
  }

  if (selectionChanged) {
    replaceSelectedNodes([...nextSelectedNodeIds])
  }
}

function applyEdgeChangesToStore({
  changes,
  replaceSelectedEdges,
  selectedEdgeIds
}: {
  changes: EdgeChange<Edge<CanvasFlowEdgeData>>[]
  replaceSelectedEdges: (edgeIds: string[]) => void
  selectedEdgeIds: string[]
}) {
  const nextSelectedEdgeIds = new Set(selectedEdgeIds)
  let selectionChanged = false

  for (const change of changes) {
    if (change.type !== 'select') {
      continue
    }

    selectionChanged = true

    if (change.selected) {
      nextSelectedEdgeIds.add(change.id)
    } else {
      nextSelectedEdgeIds.delete(change.id)
    }
  }

  if (selectionChanged) {
    replaceSelectedEdges([...nextSelectedEdgeIds])
  }
}
