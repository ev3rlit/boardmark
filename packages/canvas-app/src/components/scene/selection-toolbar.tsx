import { NodeToolbar, Position, useInternalNode } from '@xyflow/react'
import { Maximize2 } from 'lucide-react'
import { useStore } from 'zustand'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type SelectionToolbarProps = {
  nodeId: string
  selected: boolean
  isEditing: boolean
  locked: boolean
  autoHeight: boolean
  store: CanvasStore
}

export function SelectionToolbar({
  nodeId,
  selected,
  isEditing,
  locked,
  autoHeight,
  store
}: SelectionToolbarProps) {
  const resetNodeHeight = useStore(store, (state) => state.resetNodeHeight)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const internalNode = useInternalNode(nodeId)

  const handleToggle = () => {
    if (autoHeight) {
      // auto → fixed: freeze at current measured height
      if (!internalNode) return
      const height = internalNode.measured?.height ?? internalNode.height
      if (height === undefined) return
      void commitNodeResize(nodeId, {
        x: internalNode.position.x,
        y: internalNode.position.y,
        width: internalNode.measured?.width ?? internalNode.width ?? 200,
        height
      })
    } else {
      // fixed → auto: remove explicit h
      void resetNodeHeight(nodeId)
    }
  }

  return (
    <NodeToolbar
      isVisible={selected && !isEditing && !locked}
      position={Position.Top}
      offset={8}
    >
      <div
        aria-label="Object actions"
        className="viewer-control-group nodrag nopan"
        role="toolbar"
      >
        <button
          aria-label="Auto height"
          aria-pressed={autoHeight}
          className={[
            'viewer-control-button',
            autoHeight ? 'viewer-control-button--active' : ''
          ].join(' ').trim()}
          onClick={handleToggle}
          title="Auto height"
          type="button"
        >
          <Maximize2
            aria-hidden="true"
            className="viewer-control-icon"
          />
        </button>
      </div>
    </NodeToolbar>
  )
}
