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
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes
} from '@xyflow/react'
import { useStore } from 'zustand'
import {
  BUILT_IN_RENDERER_COMPONENTS,
  type CanvasFlowEdgeData,
  type CanvasFlowNodeData
} from '@boardmark/canvas-renderer'
import type { BuiltInComponentKey, CanvasGroup, CanvasNode } from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import { BodyEditorHost } from '@canvas-app/components/editor/body-editor-host'
import { CanvasFlowViewportSync } from '@canvas-app/components/scene/flow/canvas-flow-viewport-sync'
import {
  applyFlowNodeGeometryDrafts,
  type CanvasNodeGeometryDraft,
  mergeFlowNodes,
  readFlowEdges,
  readFlowNodes
} from '@canvas-app/components/scene/flow/flow-node-adapters'
import {
  applyEdgeChangesToStore,
  applyNodeChangesToStore,
  filterSelectionChanges
} from '@canvas-app/components/scene/flow/flow-selection-changes'
import {
  canCanvasMutateSelection,
  isEditingEdgeLabel,
  isEditingNodeBody
} from '@canvas-app/store/canvas-editing-session'
import { readUnlockedNodeSelection } from '@canvas-app/store/canvas-object-selection'
import { readActiveToolMode, type CanvasStore } from '@canvas-app/store/canvas-store'

type CanvasSceneProps = {
  onObjectContextMenu?: (input: {
    x: number
    y: number
  }) => void
  onPaneContextMenu?: (input: {
    x: number
    y: number
  }) => void
  store: CanvasStore
  supportsMultiSelect?: boolean
}

type ResizeCallbacks = {
  onResizeCommit: (nodeId: string, geometry: CanvasNodeGeometryDraft) => Promise<void>
  onResizePreview: (nodeId: string, geometry: CanvasNodeGeometryDraft) => void
}

type DragCommitAction =
  | { kind: 'none' }
  | { kind: 'selection-nudge'; dx: number; dy: number }
  | { kind: 'single-move'; nodeId: string; x: number; y: number }

export function readDragCommitAction(input: {
  draggedNodeId: string
  draggedPosition: {
    x: number
    y: number
  }
  nodes: CanvasNode[]
  unlockedSelectionNodeIds: string[]
}): DragCommitAction {
  const draggedNode = input.nodes.find((node) => node.id === input.draggedNodeId)

  if (!draggedNode) {
    return { kind: 'none' }
  }

  const x = Math.round(input.draggedPosition.x)
  const y = Math.round(input.draggedPosition.y)
  const dx = x - draggedNode.at.x
  const dy = y - draggedNode.at.y

  if (dx === 0 && dy === 0) {
    return { kind: 'none' }
  }

  if (
    input.unlockedSelectionNodeIds.length > 1 &&
    input.unlockedSelectionNodeIds.includes(input.draggedNodeId)
  ) {
    return {
      kind: 'selection-nudge',
      dx,
      dy
    }
  }

  return {
    kind: 'single-move',
    nodeId: input.draggedNodeId,
    x,
    y
  }
}

export function CanvasScene({
  onObjectContextMenu,
  onPaneContextMenu,
  store,
  supportsMultiSelect = false
}: CanvasSceneProps) {
  const groups = useStore(store, (state) => state.groups)
  const nodes = useStore(store, (state) => state.nodes)
  const edges = useStore(store, (state) => state.edges)
  const viewport = useStore(store, (state) => state.viewport)
  const defaultStyle = useStore(store, (state) => state.document?.ast.frontmatter.defaultStyle)
  const activeToolMode = useStore(store, readActiveToolMode)
  const selectedGroupIds = useStore(store, (state) => state.selectedGroupIds)
  const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
  const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
  const resolveImageSource = useStore(store, (state) => state.resolveImageSource)
  const setLastCanvasPointer = useStore(store, (state) => state.setLastCanvasPointer)
  const setViewportSize = useStore(store, (state) => state.setViewportSize)
  const clearSelection = useStore(store, (state) => state.clearSelection)
  const replaceSelection = useStore(store, (state) => state.replaceSelection)
  const selectNodeFromCanvas = useStore(store, (state) => state.selectNodeFromCanvas)
  const selectEdgeFromCanvas = useStore(store, (state) => state.selectEdgeFromCanvas)
  const commitNodeMove = useStore(store, (state) => state.commitNodeMove)
  const nudgeSelection = useStore(store, (state) => state.nudgeSelection)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const reconnectEdge = useStore(store, (state) => state.reconnectEdge)
  const createEdgeFromConnection = useStore(store, (state) => state.createEdgeFromConnection)
  const editingState = useStore(store, (state) => state.editingState)
  const canManipulateCanvas = canCanvasMutateSelection(editingState)
  const isPanMode = activeToolMode === 'pan'
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const reactFlow = useReactFlow<Node<CanvasFlowNodeData>, Edge<CanvasFlowEdgeData>>()
  const baseFlowNodes = useMemo(
    () =>
      readFlowNodes(nodes, undefined, selectedNodeIds, {
        defaultStyle,
        imageResolver: resolveImageSource
      }),
    [nodes, selectedNodeIds, defaultStyle, resolveImageSource]
  )
  const [flowNodes, setFlowNodes] = useState<Node<CanvasFlowNodeData>[]>(baseFlowNodes)
  const [resizeDrafts, setResizeDrafts] = useState<Record<string, CanvasNodeGeometryDraft>>({})
  const flowEdges = useMemo(() => readFlowEdges(edges, selectedEdgeIds), [edges, selectedEdgeIds])
  const syncFlowNodesFromStore = (drafts: Record<string, CanvasNodeGeometryDraft> = resizeDrafts) => {
    const state = store.getState()
    const nextFlowNodes = applyFlowNodeGeometryDrafts(
      readFlowNodes(state.nodes, undefined, state.selectedNodeIds, {
        defaultStyle: state.document?.ast.frontmatter.defaultStyle,
        imageResolver: state.resolveImageSource
      }),
      drafts
    )

    setFlowNodes((currentFlowNodes) => mergeFlowNodes(nextFlowNodes, currentFlowNodes))
  }
  const resizeCallbacks = useMemo<ResizeCallbacks>(
    () => ({
      onResizePreview(nodeId, geometry) {
        const nextDraft = {
          x: Math.round(geometry.x),
          y: Math.round(geometry.y),
          width: Math.round(geometry.width),
          height: Math.round(geometry.height)
        }

        setResizeDrafts((currentDrafts) => ({
          ...currentDrafts,
          [nodeId]: nextDraft
        }))
        setFlowNodes((currentFlowNodes) => applyFlowNodeGeometryDrafts(currentFlowNodes, {
          [nodeId]: nextDraft
        }))
      },
      async onResizeCommit(nodeId, geometry) {
        try {
          await commitNodeResize(nodeId, geometry)
        } finally {
          setResizeDrafts({})
          syncFlowNodesFromStore({})
        }
      }
    }),
    [commitNodeResize, store]
  )
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      'canvas-note': (props) => (
        <CanvasNoteNode
          {...props}
          onResizeCommit={resizeCallbacks.onResizeCommit}
          onResizePreview={resizeCallbacks.onResizePreview}
          store={store}
        />
      ),
      'canvas-component': (props) => (
        <CanvasComponentNode
          {...props}
          onResizeCommit={resizeCallbacks.onResizeCommit}
          onResizePreview={resizeCallbacks.onResizePreview}
          store={store}
        />
      )
    }),
    [resizeCallbacks, store]
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
    setFlowNodes((currentFlowNodes) => applyFlowNodeGeometryDrafts(
      mergeFlowNodes(baseFlowNodes, currentFlowNodes),
      resizeDrafts
    ))
  }, [baseFlowNodes, resizeDrafts])

  useEffect(() => {
    const element = viewportRef.current

    if (!element) {
      return
    }

    const updateViewportSize = (width: number, height: number) => {
      setViewportSize({
        width,
        height
      })
    }

    const syncViewportSize = () => {
      const rect = element.getBoundingClientRect()
      updateViewportSize(rect.width, rect.height)
    }

    syncViewportSize()

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]

        if (!entry) {
          return
        }

        updateViewportSize(entry.contentRect.width, entry.contentRect.height)
      })

      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', syncViewportSize)
    return () => window.removeEventListener('resize', syncViewportSize)
  }, [setViewportSize])

  return (
    <div
      className="h-full w-full"
      ref={viewportRef}
    >
      <ReactFlow<Node<CanvasFlowNodeData>, Edge<CanvasFlowEdgeData>>
        className={[
          'boardmark-flow',
          isPanMode ? 'boardmark-flow--pan' : ''
        ].join(' ').trim()}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={activeToolMode === 'select' && canManipulateCanvas}
        nodesConnectable={activeToolMode === 'select' && canManipulateCanvas}
        edgesReconnectable={activeToolMode === 'select' && canManipulateCanvas}
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
        onPaneMouseMove={(event) => {
          setLastCanvasPointer(
            reactFlow.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY
            })
          )
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          onPaneContextMenu?.({
            x: event.clientX,
            y: event.clientY
          })
        }}
        multiSelectionKeyCode={supportsMultiSelect ? undefined : null}
        onNodesChange={(changes) => {
          const nextChanges = filterSelectionChanges(changes, activeToolMode === 'select')

          setFlowNodes((currentFlowNodes) => applyNodeChanges(nextChanges, currentFlowNodes))
          applyNodeChangesToStore({
            changes: nextChanges,
            groups,
            replaceSelection,
            selectedEdgeIds,
            selectedNodeIds
          })
        }}
        onEdgesChange={(changes) => {
          applyEdgeChangesToStore({
            changes: filterSelectionChanges(changes, activeToolMode === 'select'),
            replaceSelection,
            selectedGroupIds,
            selectedNodeIds,
            selectedEdgeIds
          })
        }}
        onNodeClick={(event, node) => {
          if (activeToolMode !== 'select') {
            return
          }

          selectNodeFromCanvas(node.id, event.shiftKey)
        }}
        onEdgeClick={(event, edge) => {
          if (activeToolMode !== 'select') {
            return
          }

          selectEdgeFromCanvas(edge.id, event.shiftKey)
        }}
        onNodeDragStop={(_event, node) => {
          void (async () => {
            const state = store.getState()
            const action = readDragCommitAction({
              draggedNodeId: node.id,
              draggedPosition: node.position,
              nodes: state.nodes,
              unlockedSelectionNodeIds: readUnlockedNodeSelection(state)
            })

            try {
              if (action.kind === 'selection-nudge') {
                await nudgeSelection(action.dx, action.dy)
              } else if (action.kind === 'single-move') {
                await commitNodeMove(action.nodeId, action.x, action.y)
              }
            } finally {
              syncFlowNodesFromStore({})
            }
          })()
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()

          if (!isNodeIncludedInCurrentSelection(groups, selectedGroupIds, selectedNodeIds, node.id)) {
            selectNodeFromCanvas(node.id, event.shiftKey)
          }

          onObjectContextMenu?.({
            x: event.clientX,
            y: event.clientY
          })
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()

          if (!selectedEdgeIds.includes(edge.id)) {
            selectEdgeFromCanvas(edge.id, event.shiftKey)
          }

          onObjectContextMenu?.({
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

function CanvasNoteNode({
  id,
  data,
  selected,
  store,
  onResizeCommit,
  onResizePreview
}: NodeProps<Node<CanvasFlowNodeData>> & { store: CanvasStore } & ResizeCallbacks) {
  const hostAnchorRef = useRef<HTMLDivElement | null>(null)
  const editingState = useStore(store, (state) => state.editingState)
  const resolveImageSource = useStore(store, (state) => state.resolveImageSource)
  const startObjectEditing = useStore(store, (state) => state.startObjectEditing)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const setEditingBlockMode = useStore(store, (state) => state.setEditingBlockMode)
  const setEditingInteraction = useStore(store, (state) => state.setEditingInteraction)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const cancelInlineEditing = useStore(store, (state) => state.cancelInlineEditing)
  const isEditing = isEditingNodeBody(editingState, id)
  const activeSession = isEditing && editingState.status === 'active' ? editingState : null

  return (
    <div
      className="h-full w-full max-w-none"
      ref={hostAnchorRef}
      onDoubleClick={() => {
        if (!data.locked) {
          startObjectEditing(id)
        }
      }}
    >
      <NodeResizer
        isVisible={selected && !isEditing && !data.locked}
        minWidth={160}
        minHeight={140}
        color="rgba(96, 66, 214, 0.72)"
        handleClassName="boardmark-flow__resize-handle"
        lineClassName="boardmark-flow__resize-line"
        onResize={(_event, resize) => {
          if (!data.locked) {
            onResizePreview(id, {
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height
            })
          }
        }}
        onResizeEnd={(_event, resize) => {
          if (!data.locked) {
            void onResizeCommit(id, {
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height
            })
          }
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!isEditing && !data.locked}
        className="boardmark-flow__handle"
      />
      <StickyNoteCard
        className="flex h-full w-full min-h-0 flex-col overflow-hidden"
        color="default"
        selected={selected}
      >
        {activeSession ? (
          <BodyEditorHost
            ariaLabel={`Edit ${id}`}
            autoFocus
            editable={!data.locked}
            onBlockModeChange={setEditingBlockMode}
            onCancel={cancelInlineEditing}
            onCommit={() => commitInlineEditing()}
            onInteractionChange={setEditingInteraction}
            onMarkdownChange={updateEditingMarkdown}
            session={activeSession}
            toolbarAnchorRef={hostAnchorRef}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <MarkdownContent
              className="markdown-content note-markdown"
              content={data.body ?? ''}
              imageResolver={resolveImageSource}
            />
          </div>
        )}
      </StickyNoteCard>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!isEditing && !data.locked}
        className="boardmark-flow__handle"
      />
    </div>
  )
}

function CanvasComponentNode({
  id,
  data,
  selected,
  store,
  onResizeCommit,
  onResizePreview
}: NodeProps<Node<CanvasFlowNodeData>> & { store: CanvasStore } & ResizeCallbacks) {
  const hostAnchorRef = useRef<HTMLDivElement | null>(null)
  const editingState = useStore(store, (state) => state.editingState)
  const startObjectEditing = useStore(store, (state) => state.startObjectEditing)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const setEditingBlockMode = useStore(store, (state) => state.setEditingBlockMode)
  const setEditingInteraction = useStore(store, (state) => state.setEditingInteraction)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const cancelInlineEditing = useStore(store, (state) => state.cancelInlineEditing)
  const isImageNode = data.component === 'image'
  const isEditing = !isImageNode && isEditingNodeBody(editingState, id)
  const activeSession = isEditing && editingState.status === 'active' ? editingState : null

  const Renderer = readBuiltInRenderer(data.component)

  return (
    <div
      className="max-w-none"
      ref={hostAnchorRef}
      onDoubleClick={() => {
        if (!isImageNode && !data.locked) {
          startObjectEditing(id)
        }
      }}
    >
      <NodeResizer
        isVisible={selected && !isEditing && !data.locked}
        minWidth={isImageNode ? 96 : 120}
        minHeight={isImageNode ? 96 : 120}
        color="rgba(96, 66, 214, 0.72)"
        handleClassName="boardmark-flow__resize-handle"
        lineClassName="boardmark-flow__resize-line"
        onResize={(_event, resize) => {
          if (!data.locked) {
            onResizePreview(id, {
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height
            })
          }
        }}
        onResizeEnd={(_event, resize) => {
          if (!data.locked) {
            void onResizeCommit(id, {
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height
            })
          }
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!isEditing && !data.locked}
        className="boardmark-flow__handle"
      />
      {isEditing ? (
        <div
          className="rounded-[1rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_92%,white)] p-3 shadow-[0_16px_32px_rgba(43,52,55,0.08)]"
        >
          {activeSession ? (
            <BodyEditorHost
              ariaLabel={`Edit ${id}`}
              autoFocus
              editable={!data.locked}
              onBlockModeChange={setEditingBlockMode}
              onCancel={cancelInlineEditing}
              onCommit={() => commitInlineEditing()}
              onInteractionChange={setEditingInteraction}
              onMarkdownChange={updateEditingMarkdown}
              session={activeSession}
              toolbarAnchorRef={hostAnchorRef}
            />
          ) : null}
        </div>
      ) : Renderer ? (
        <Renderer
          component={data.component as BuiltInComponentKey}
          alt={data.alt}
          body={data.body}
          height={data.height}
          imageResolver={data.imageResolver}
          lockAspectRatio={data.lockAspectRatio}
          nodeId={id}
          resolvedThemeRef={data.resolvedThemeRef}
          selected={selected}
          src={data.src}
          style={data.style}
          title={data.title}
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
        isConnectable={!isEditing && !data.locked}
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
  const hostAnchorRef = useRef<HTMLDivElement | null>(null)
  const edgeData = (data ?? {}) as CanvasFlowEdgeData
  const editingState = useStore(store, (state) => state.editingState)
  const resolveImageSource = useStore(store, (state) => state.resolveImageSource)
  const startEdgeEditing = useStore(store, (state) => state.startEdgeEditing)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const setEditingBlockMode = useStore(store, (state) => state.setEditingBlockMode)
  const setEditingInteraction = useStore(store, (state) => state.setEditingInteraction)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const cancelInlineEditing = useStore(store, (state) => state.cancelInlineEditing)
  const isEditing = isEditingEdgeLabel(editingState, id)
  const activeSession = isEditing && editingState.status === 'active' ? editingState : null
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
      <EdgeLabelRenderer>
        <div
          className="absolute max-w-64 -translate-x-1/2 -translate-y-1/2"
          ref={hostAnchorRef}
          style={{
            left: labelX,
            top: labelY
          }}
        >
          <div
            className="rounded-2xl bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_90%,transparent)] px-4 py-2 text-sm text-[var(--color-on-surface)] shadow-[0_16px_32px_rgba(43,52,55,0.08)]"
            onDoubleClick={() => {
              if (!edgeData.locked) {
                startEdgeEditing(id)
              }
            }}
          >
            {activeSession ? (
              <BodyEditorHost
                ariaLabel={`Edit ${id}`}
                autoFocus
                editable={!edgeData.locked}
                onBlockModeChange={setEditingBlockMode}
                onCancel={cancelInlineEditing}
                onCommit={() => commitInlineEditing()}
                onInteractionChange={setEditingInteraction}
                onMarkdownChange={updateEditingMarkdown}
                session={activeSession}
                toolbarAnchorRef={hostAnchorRef}
              />
            ) : edgeData.body ? (
              <MarkdownContent
                className="markdown-content edge-markdown"
                content={edgeData.body}
                imageResolver={resolveImageSource}
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

function isNodeIncludedInCurrentSelection(
  groups: CanvasGroup[],
  selectedGroupIds: string[],
  selectedNodeIds: string[],
  nodeId: string
) {
  if (selectedNodeIds.includes(nodeId)) {
    return true
  }

  const containingGroup = groups.find((group) => group.members.nodeIds.includes(nodeId))

  return containingGroup ? selectedGroupIds.includes(containingGroup.id) : false
}

function readBuiltInRenderer(component: string) {
  if (!(component in BUILT_IN_RENDERER_COMPONENTS)) {
    return null
  }

  return BUILT_IN_RENDERER_COMPONENTS[component as BuiltInComponentKey]
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

export {
  applyFlowNodeGeometryDrafts,
  mergeFlowNodes,
  readFlowNodes
} from '@canvas-app/components/scene/flow/flow-node-adapters'
export { applyNodeChangesToStore } from '@canvas-app/components/scene/flow/flow-selection-changes'
