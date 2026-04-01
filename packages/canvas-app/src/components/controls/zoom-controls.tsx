import { Minus, Plus } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useStore } from 'zustand'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type ZoomControlsProps = {
  store: CanvasStore
}

export function ZoomControls({ store }: ZoomControlsProps) {
  const setViewport = useStore(store, (state) => state.setViewport)
  const viewport = useStore(store, (state) => state.viewport)
  const reactFlow = useReactFlow()

  return (
    <div className="viewer-control-group">
      <button
        aria-label="Zoom out"
        className="viewer-control-button"
        onClick={async () => {
          await reactFlow.zoomOut({ duration: 160 })
          setViewport(reactFlow.getViewport())
        }}
        type="button"
      >
        <Minus
          aria-hidden="true"
          className="viewer-control-icon viewer-control-icon--zoom"
        />
        <span className="sr-only">Zoom out</span>
      </button>
      <div className="viewer-control-readout">
        {Math.round(viewport.zoom * 100)}%
      </div>
      <button
        aria-label="Zoom in"
        className="viewer-control-button"
        onClick={async () => {
          await reactFlow.zoomIn({ duration: 160 })
          setViewport(reactFlow.getViewport())
        }}
        type="button"
      >
        <Plus
          aria-hidden="true"
          className="viewer-control-icon viewer-control-icon--zoom"
        />
        <span className="sr-only">Zoom in</span>
      </button>
    </div>
  )
}
