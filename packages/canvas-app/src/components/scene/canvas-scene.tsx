import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
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
  useInternalNode,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
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
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  resolveCanvasObjectBackgroundColor,
  resolveCanvasObjectStrokeColor,
  type BuiltInComponentKey,
  type CanvasGroup,
  type CanvasNode
} from '@boardmark/canvas-domain'
import { MarkdownContent, StickyNoteCard } from '@boardmark/ui'
import { BodyEditorHost } from '@canvas-app/components/editor/body-editor-host'
import { readMarkdownLayoutStyle } from '@canvas-app/components/markdown-layout-style'
import { SelectionToolbar } from '@canvas-app/components/scene/selection-toolbar'
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
  filterSelectionChanges,
  readEdgeSelectionChangeResult,
  readNodeSelectionChangeResult
} from '@canvas-app/components/scene/flow/flow-selection-changes'
import {
  readEdgeAnchorPath,
  type EdgeAnchorBounds,
  type EdgeAnchorPath
} from '@canvas-app/components/scene/edges/edge-anchor-geometry'
import {
  readActiveEdgeEditingSession,
  readActiveNodeEditingSession,
  readEdgeEditingInteractionBlock,
  readNodeEditingInteractionBlock
} from '@canvas-app/store/canvas-editing-session'
import { isNodeLocked } from '@canvas-app/store/canvas-object-selection'
import { readCanvasGestureInput } from '@canvas-app/input/canvas-gesture-input'
import { readCanvasWheelInput } from '@canvas-app/input/canvas-wheel-input'
import { readZoomDirectionFromWheelEvent } from '@canvas-app/keyboard/key-event-matchers'
import type {
  CanvasMatchedInput,
  CanvasPointerCapabilities
} from '@canvas-app/input/canvas-input-types'
import { readActiveToolMode, type CanvasStore } from '@canvas-app/store/canvas-store'

type CanvasSceneProps = {
  dispatchCanvasInput: (
    input: CanvasMatchedInput,
    options?: { viewportBounds?: { left: number; top: number } }
  ) => boolean
  dispatchCanvasInputAsync: (
    input: CanvasMatchedInput,
    options?: { viewportBounds?: { left: number; top: number } }
  ) => Promise<boolean>
  onObjectContextMenu?: (input: {
    x: number
    y: number
  }) => void
  onPaneContextMenu?: (input: {
    x: number
    y: number
  }) => void
  pointerCapabilities: CanvasPointerCapabilities
  exportRootRef?: MutableRefObject<HTMLDivElement | null>
  store: CanvasStore
  supportsMultiSelect?: boolean
}

type ResizeCallbacks = {
  onResizeCommit: (nodeId: string, geometry: CanvasNodeGeometryDraft) => Promise<void>
  onResizePreview: (nodeId: string, geometry: CanvasNodeGeometryDraft) => void
}

type GestureZoomDomEvent = Event & {
  clientX: number
  clientY: number
  scale: number
}

const DEFAULT_POINTER_CAPABILITIES: CanvasPointerCapabilities = {
  edgesReconnectable: false,
  elementsSelectable: false,
  nodesConnectable: false,
  nodesDraggable: false,
  panOnDrag: false,
  selectionOnDrag: false
}

export function CanvasScene({
  dispatchCanvasInput = () => false,
  dispatchCanvasInputAsync = async () => false,
  pointerCapabilities = DEFAULT_POINTER_CAPABILITIES,
  exportRootRef,
  store,
  supportsMultiSelect = false
}: CanvasSceneProps) {
  const groups = useStore(store, (state) => state.groups)
  const nodes = useStore(store, (state) => state.nodes)
  const edges = useStore(store, (state) => state.edges)
  const viewport = useStore(store, (state) => state.viewport)
  const defaultStyle = useStore(store, (state) => state.document?.ast.frontmatter.defaultStyle)
  const selectedGroupIds = useStore(store, (state) => state.selectedGroupIds)
  const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
  const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
  const activeToolMode = useStore(store, readActiveToolMode)
  const pointerInteractionState = useStore(store, (state) => state.pointerInteractionState)
  const editingState = useStore(store, (state) => state.editingState)
  const resolveImageSource = useStore(store, (state) => state.resolveImageSource)
  const setLastCanvasPointer = useStore(store, (state) => state.setLastCanvasPointer)
  const setViewportSize = useStore(store, (state) => state.setViewportSize)
  const replaceSelection = useStore(store, (state) => state.replaceSelection)
  const createEdgeFromConnection = useStore(store, (state) => state.createEdgeFromConnection)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const gestureScaleRef = useRef(1)
  const panePanLifecycleActiveRef = useRef(false)

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
  const selectionToolbarNodeIds = useMemo(
    () => selectedNodeIds.filter((nodeId) => nodes.some((node) => node.id === nodeId)),
    [nodes, selectedNodeIds]
  )
  const selectionToolbarAnchorNode = useMemo(
    () => (selectionToolbarNodeIds[0]
      ? nodes.find((node) => node.id === selectionToolbarNodeIds[0]) ?? null
      : null),
    [nodes, selectionToolbarNodeIds]
  )
  const selectionToolbarAllLocked = useMemo(
    () => selectionToolbarNodeIds.length > 0 && selectionToolbarNodeIds
      .every((nodeId) => isNodeLocked({ groups, nodes }, nodeId)),
    [groups, nodes, selectionToolbarNodeIds]
  )
  const selectionToolbarIsEditing = useMemo(
    () => editingState.status === 'active' &&
      editingState.target.kind === 'object-body' &&
      selectionToolbarNodeIds.includes(editingState.target.objectId),
    [editingState, selectionToolbarNodeIds]
  )
  const selectionToolbarAutoHeight = selectionToolbarNodeIds.length === 1 &&
    selectionToolbarAnchorNode?.at.h === undefined
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
          await dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-node-resize-commit',
              nodeId,
              geometry
            },
            preventDefault: false
          })
        } finally {
          setResizeDrafts({})
          syncFlowNodesFromStore({})
        }
      }
    }),
    [dispatchCanvasInputAsync, store]
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

  useEffect(() => {
    const element = viewportRef.current

    if (!element) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Node) || !element.contains(event.target)) {
        return
      }

      if (event.defaultPrevented) {
        return
      }

      const input = readCanvasWheelInput(event)

      if (!input) {
        return
      }

      if (dispatchCanvasInput(input, { viewportBounds: element.getBoundingClientRect() }) && input.preventDefault) {
        event.preventDefault()
      }
    }

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as GestureZoomDomEvent
      gestureScaleRef.current = Number.isFinite(gestureEvent.scale) ? gestureEvent.scale : 1
      gestureEvent.preventDefault()
    }

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as GestureZoomDomEvent

      if (gestureEvent.defaultPrevented) {
        return
      }

      const input = readCanvasGestureInput({
        event: gestureEvent,
        previousScale: gestureScaleRef.current
      })
      gestureScaleRef.current = gestureEvent.scale

      if (!input) {
        return
      }

      if (dispatchCanvasInput(input, { viewportBounds: element.getBoundingClientRect() }) && input.preventDefault) {
        gestureEvent.preventDefault()
      }
    }

    const handleGestureEnd = () => {
      gestureScaleRef.current = 1
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    element.addEventListener('gesturestart', handleGestureStart as EventListener, { passive: false })
    element.addEventListener('gesturechange', handleGestureChange as EventListener, { passive: false })
    element.addEventListener('gestureend', handleGestureEnd as EventListener)
    return () => {
      window.removeEventListener('wheel', handleWheel)
      element.removeEventListener('gesturestart', handleGestureStart as EventListener)
      element.removeEventListener('gesturechange', handleGestureChange as EventListener)
      element.removeEventListener('gestureend', handleGestureEnd as EventListener)
    }
  }, [dispatchCanvasInput])

  return (
    <div
      className="h-full w-full"
      ref={(element) => {
        viewportRef.current = element

        if (exportRootRef) {
          exportRootRef.current = element
        }
      }}
    >
      <ReactFlow<Node<CanvasFlowNodeData>, Edge<CanvasFlowEdgeData>>
        className={[
          'boardmark-flow',
          activeToolMode === 'pan' || pointerInteractionState.status === 'pane-pan'
            ? 'boardmark-flow--pan'
            : ''
        ].join(' ').trim()}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={pointerCapabilities.nodesDraggable}
        nodesConnectable={pointerCapabilities.nodesConnectable}
        edgesReconnectable={pointerCapabilities.edgesReconnectable}
        elementsSelectable={pointerCapabilities.elementsSelectable}
        panOnDrag={pointerCapabilities.panOnDrag}
        selectionOnDrag={pointerCapabilities.selectionOnDrag}
        selectionMode={SelectionMode.Partial}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        minZoom={MIN_CANVAS_ZOOM}
        maxZoom={MAX_CANVAS_ZOOM}
        defaultViewport={viewport}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-pane-click'
            },
            preventDefault: false
          })
        }}
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
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-pane-context-menu',
              x: event.clientX,
              y: event.clientY
            },
            preventDefault: false
          })
        }}
        multiSelectionKeyCode={supportsMultiSelect ? undefined : null}
        onSelectionStart={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-selection-box-start'
            },
            preventDefault: false
          })
        }}
        onSelectionDragStart={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-selection-box-drag-start'
            },
            preventDefault: false
          })
        }}
        onSelectionDragStop={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-selection-box-end'
            },
            preventDefault: false
          })
        }}
        onSelectionEnd={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-selection-box-end'
            },
            preventDefault: false
          })
        }}
        onNodesChange={(changes) => {
          const flowChanges = filterSelectionChanges(changes, pointerCapabilities.elementsSelectable)
          const storeChanges = filterSelectionChanges(changes, false)
          const selectionChanges = readNodeSelectionChangeResult(changes)

          setFlowNodes((currentFlowNodes) => applyNodeChanges(flowChanges, currentFlowNodes))

          if (selectionChanges.length > 0) {
            void dispatchCanvasInputAsync({
              allowEditableTarget: true,
              intent: {
                kind: 'pointer-node-selection-change',
                changes: selectionChanges
              },
              preventDefault: false
            })
          }

          if (storeChanges.length > 0) {
            applyNodeChangesToStore({
              changes: storeChanges,
              groups,
              replaceSelection,
              selectedEdgeIds,
              selectedNodeIds
            })
          }
        }}
        onEdgesChange={(changes) => {
          const storeChanges = filterSelectionChanges(changes, false)
          const selectionChanges = readEdgeSelectionChangeResult(changes)

          if (selectionChanges.length > 0) {
            void dispatchCanvasInputAsync({
              allowEditableTarget: true,
              intent: {
                kind: 'pointer-edge-selection-change',
                changes: selectionChanges
              },
              preventDefault: false
            })
          }

          if (storeChanges.length > 0) {
            applyEdgeChangesToStore({
              changes: storeChanges,
              replaceSelection,
              selectedGroupIds,
              selectedNodeIds,
              selectedEdgeIds
            })
          }
        }}
        onNodeClick={(event, node) => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-node-click',
              additive: event.shiftKey,
              nodeId: node.id
            },
            preventDefault: false
          })
        }}
        onEdgeClick={(event, edge) => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-edge-click',
              additive: event.shiftKey,
              edgeId: edge.id
            },
            preventDefault: false
          })
        }}
        onNodeDragStart={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-node-drag-start'
            },
            preventDefault: false
          })
        }}
        onNodeDragStop={(_event, node) => {
          void (async () => {
            try {
              await dispatchCanvasInputAsync({
                allowEditableTarget: true,
                intent: {
                  kind: 'pointer-node-drag-end'
                },
                preventDefault: false
              })
              await dispatchCanvasInputAsync({
                allowEditableTarget: true,
                intent: {
                  kind: 'pointer-node-move-commit',
                  nodeId: node.id,
                  position: node.position
                },
                preventDefault: false
              })
            } finally {
              syncFlowNodesFromStore({})
            }
          })()
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-node-context-menu',
              additive: event.shiftKey,
              nodeId: node.id,
              x: event.clientX,
              y: event.clientY
            },
            preventDefault: false
          })
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-edge-context-menu',
              additive: event.shiftKey,
              edgeId: edge.id,
              x: event.clientX,
              y: event.clientY
            },
            preventDefault: false
          })
        }}
        onConnect={(connection) => {
          void handleConnection(connection, createEdgeFromConnection)
        }}
        onReconnect={(oldEdge, connection) => {
          if (!connection.source || !connection.target) {
            return
          }

          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-edge-reconnect-commit',
              edgeId: oldEdge.id,
              from: connection.source,
              to: connection.target
            },
            preventDefault: false
          })
        }}
        onReconnectStart={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-edge-reconnect-start'
            },
            preventDefault: false
          })
        }}
        onReconnectEnd={() => {
          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-edge-reconnect-end'
            },
            preventDefault: false
          })
        }}
        onMoveStart={(event) => {
          if (!shouldDispatchPointerPanePanLifecycle(event, pointerCapabilities.panOnDrag)) {
            return
          }

          panePanLifecycleActiveRef.current = true

          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-pane-pan-start'
            },
            preventDefault: false
          }).then((handled) => {
            if (!handled) {
              panePanLifecycleActiveRef.current = false
            }
          })
        }}
        onMoveEnd={() => {
          if (!panePanLifecycleActiveRef.current) {
            return
          }

          panePanLifecycleActiveRef.current = false

          void dispatchCanvasInputAsync({
            allowEditableTarget: true,
            intent: {
              kind: 'pointer-pane-pan-end'
            },
            preventDefault: false
          })
        }}
      >
        <CanvasFlowViewportSync
          store={store}
          viewport={viewport}
        />
        <Background
          color="rgba(43, 52, 55, 0.28)"
          gap={24}
          size={1.35}
          variant={BackgroundVariant.Dots}
        />
        <Background
          color="rgba(43, 52, 55, 0.14)"
          gap={120}
          size={1.1}
          variant={BackgroundVariant.Lines}
        />
        {selectionToolbarAnchorNode ? (
          <SelectionToolbar
            anchorNodeId={selectionToolbarAnchorNode.id}
            nodeIds={selectionToolbarNodeIds}
            isEditing={selectionToolbarIsEditing}
            allLocked={selectionToolbarAllLocked}
            autoHeight={selectionToolbarAutoHeight}
            store={store}
          />
        ) : null}
      </ReactFlow>
    </div>
  )
}

export function shouldDispatchPointerPanePanLifecycle(
  event: MouseEvent | TouchEvent | null | undefined,
  panOnDrag: boolean
) {
  if (!panOnDrag || !event) {
    return false
  }

  if (typeof WheelEvent !== 'undefined' && event instanceof WheelEvent) {
    return false
  }

  return (
    event.type.startsWith('mouse') ||
    event.type.startsWith('pointer') ||
    event.type.startsWith('touch')
  )
}

export function shouldKeepCanvasWheelEventLocal(event: WheelEvent) {
  return readZoomDirectionFromWheelEvent(event) === null
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
  const internalNode = useInternalNode(id)
  const activeSession = useStore(store, (state) => readActiveNodeEditingSession(state.editingState, id))
  const blocksEditingInteractions = useStore(
    store,
    (state) => readNodeEditingInteractionBlock(state.editingState, id)
  )
  const resolveImageSource = useStore(store, (state) => state.resolveImageSource)
  const startObjectEditing = useStore(store, (state) => state.startObjectEditing)
  const updateEditingDocument = useStore(store, (state) => state.updateEditingDocument)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const setEditingBlockMode = useStore(store, (state) => state.setEditingBlockMode)
  const setEditingInteraction = useStore(store, (state) => state.setEditingInteraction)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const cancelInlineEditing = useStore(store, (state) => state.cancelInlineEditing)
  const isEditing = activeSession !== null
  const noteStroke = resolveCanvasObjectStrokeColor('note', data.style)

  return (
    <div
      className={data.autoHeight ? 'w-full max-w-none' : 'h-full w-full max-w-none'}
      ref={hostAnchorRef}
      onDoubleClick={() => {
        if (!data.locked && !blocksEditingInteractions) {
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
              height: resize.height,
              preserveAutoHeight: shouldPreserveAutoHeightResize(
                data.autoHeight ?? false,
                resize.height,
                internalNode?.measured?.height ?? internalNode?.height
              )
            })
          }
        }}
        onResizeEnd={(_event, resize) => {
          if (!data.locked) {
            void onResizeCommit(id, {
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height,
              preserveAutoHeight: shouldPreserveAutoHeightResize(
                data.autoHeight ?? false,
                resize.height,
                internalNode?.measured?.height ?? internalNode?.height
              )
            })
          }
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={!blocksEditingInteractions && !data.locked}
        className="boardmark-flow__handle"
      />
      <StickyNoteCard
        className={data.autoHeight
          ? 'flex w-full flex-col'
          : 'flex h-full w-full min-h-0 flex-col overflow-hidden'}
        color="default"
        selected={selected}
        style={{
          background: resolveCanvasObjectBackgroundColor('note', data.style),
          boxShadow: noteStroke
            ? `0 18px 40px rgba(43, 52, 55, 0.09), inset 0 0 0 1.5px ${noteStroke}`
            : '0 18px 40px rgba(43, 52, 55, 0.09)'
        }}
      >
        {activeSession ? (
          <BodyEditorHost
            ariaLabel={`Edit ${id}`}
            autoFocus
            editable={!data.locked}
            markdownLayoutStyle={readMarkdownLayoutStyle({
              autoHeight: data.autoHeight ?? false,
              height: data.height,
              width: data.width
            })}
            onBlockModeChange={setEditingBlockMode}
            onCancel={cancelInlineEditing}
            onCommit={() => commitInlineEditing()}
            onDocumentChange={updateEditingDocument}
            onInteractionChange={setEditingInteraction}
            onMarkdownChange={updateEditingMarkdown}
            session={activeSession}
            toolbarAnchorRef={hostAnchorRef}
          />
        ) : (
          <div
            className={data.autoHeight ? 'nowheel' : 'min-h-0 flex-1 overflow-auto nowheel'}
            onWheelCapture={(event) => {
              if (shouldKeepCanvasWheelEventLocal(event.nativeEvent)) {
                event.stopPropagation()
              }
            }}
          >
            <MarkdownContent
              className="markdown-content note-markdown"
              content={data.body ?? ''}
              imageResolver={resolveImageSource}
              style={readMarkdownLayoutStyle({
                autoHeight: data.autoHeight ?? false,
                height: data.height,
                width: data.width
              })}
            />
          </div>
        )}
      </StickyNoteCard>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!blocksEditingInteractions && !data.locked}
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
  const activeSession = useStore(store, (state) => readActiveNodeEditingSession(state.editingState, id))
  const blocksEditingInteractions = useStore(
    store,
    (state) => readNodeEditingInteractionBlock(state.editingState, id)
  )
  const startObjectEditing = useStore(store, (state) => state.startObjectEditing)
  const updateEditingDocument = useStore(store, (state) => state.updateEditingDocument)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const setEditingBlockMode = useStore(store, (state) => state.setEditingBlockMode)
  const setEditingInteraction = useStore(store, (state) => state.setEditingInteraction)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const cancelInlineEditing = useStore(store, (state) => state.cancelInlineEditing)
  const isImageNode = data.component === 'image'
  const isEditing = !isImageNode && activeSession !== null

  const Renderer = readBuiltInRenderer(data.component)

  return (
    <div
      className="max-w-none"
      ref={hostAnchorRef}
      onDoubleClick={() => {
        if (!isImageNode && !data.locked && !blocksEditingInteractions) {
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
        isConnectable={!blocksEditingInteractions && !data.locked}
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
              onDocumentChange={updateEditingDocument}
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
        isConnectable={!blocksEditingInteractions && !data.locked}
        className="boardmark-flow__handle"
      />
    </div>
  )
}

export function CanvasMarkdownEdge({
  id,
  source,
  sourceX,
  sourceY,
  sourcePosition,
  target,
  targetX,
  targetY,
  targetPosition,
  data,
  store
}: EdgeProps<Edge<CanvasFlowEdgeData>> & { store: CanvasStore }) {
  const hostAnchorRef = useRef<HTMLDivElement | null>(null)
  const sourceNode = useInternalNode<Node<CanvasFlowNodeData>>(source)
  const targetNode = useInternalNode<Node<CanvasFlowNodeData>>(target)
  const edgeData = (data ?? {}) as CanvasFlowEdgeData
  const activeSession = useStore(store, (state) => readActiveEdgeEditingSession(state.editingState, id))
  const blocksEditingInteractions = useStore(
    store,
    (state) => readEdgeEditingInteractionBlock(state.editingState, id)
  )
  const resolveImageSource = useStore(store, (state) => state.resolveImageSource)
  const startEdgeEditing = useStore(store, (state) => state.startEdgeEditing)
  const updateEditingDocument = useStore(store, (state) => state.updateEditingDocument)
  const updateEditingMarkdown = useStore(store, (state) => state.updateEditingMarkdown)
  const setEditingBlockMode = useStore(store, (state) => state.setEditingBlockMode)
  const setEditingInteraction = useStore(store, (state) => state.setEditingInteraction)
  const commitInlineEditing = useStore(store, (state) => state.commitInlineEditing)
  const cancelInlineEditing = useStore(store, (state) => state.cancelInlineEditing)
  const edgeAnchorPath = readEdgeAnchorPath({
    fallback: {
      sourcePosition,
      sourceX,
      sourceY,
      targetPosition,
      targetX,
      targetY
    },
    sourceBounds: readInternalNodeBounds(sourceNode),
    targetBounds: readInternalNodeBounds(targetNode)
  })
  const [edgePath, labelX, labelY] = getBezierPath(edgeAnchorPath)

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
              if (!edgeData.locked && !blocksEditingInteractions) {
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
                onDocumentChange={updateEditingDocument}
                onInteractionChange={setEditingInteraction}
                onMarkdownChange={updateEditingMarkdown}
                session={activeSession}
                toolbarAnchorRef={hostAnchorRef}
              />
            ) : edgeData.body ? (
              <div
                className="nowheel"
                onWheelCapture={(event) => {
                  if (shouldKeepCanvasWheelEventLocal(event.nativeEvent)) {
                    event.stopPropagation()
                  }
                }}
              >
                <MarkdownContent
                  className="markdown-content edge-markdown"
                  content={edgeData.body}
                  imageResolver={resolveImageSource}
                />
              </div>
            ) : (
              <span className="text-xs text-[var(--color-on-surface-variant)]">Double-click to label</span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

function readInternalNodeBounds(internalNode: InternalNode<Node<CanvasFlowNodeData>> | undefined): EdgeAnchorBounds | undefined {
  if (!internalNode) {
    return undefined
  }

  const width = internalNode.measured.width ?? internalNode.width ?? internalNode.initialWidth
  const height = internalNode.measured.height ?? internalNode.height ?? internalNode.initialHeight

  if (typeof width !== 'number' || typeof height !== 'number') {
    return undefined
  }

  return {
    x: internalNode.internals.positionAbsolute.x,
    y: internalNode.internals.positionAbsolute.y,
    width,
    height
  }
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

function FallbackComponentNode({
  component,
  body,
  style
}: {
  component: string
  body?: string
  style?: CanvasFlowNodeData['style']
}) {
  const stroke = resolveCanvasObjectStrokeColor(component, style)

  return (
    <div
      className="flex min-h-full min-w-full flex-col justify-between rounded-[1.2rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_96%,white)] px-4 py-3 shadow-[0_20px_40px_rgba(43,52,55,0.08)]"
      style={{
        background: resolveCanvasObjectBackgroundColor(component, style),
        boxShadow: stroke
          ? `0 20px 40px rgba(43, 52, 55, 0.08), inset 0 0 0 1.5px ${stroke}`
          : '0 20px 40px rgba(43, 52, 55, 0.08)',
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
        {component}
      </div>
      <div className="mt-3 text-sm text-[inherit]">{body ?? 'Custom component placeholder'}</div>
    </div>
  )
}

function shouldPreserveAutoHeightResize(
  autoHeight: boolean,
  nextHeight: number,
  currentHeight: number | undefined
) {
  if (!autoHeight || currentHeight === undefined) {
    return false
  }

  return Math.round(nextHeight) === Math.round(currentHeight)
}

export {
  applyFlowNodeGeometryDrafts,
  mergeFlowNodes,
  readFlowNodes
} from '@canvas-app/components/scene/flow/flow-node-adapters'
export { applyNodeChangesToStore } from '@canvas-app/components/scene/flow/flow-selection-changes'
