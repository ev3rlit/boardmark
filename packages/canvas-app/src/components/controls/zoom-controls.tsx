import { Minus, Plus } from 'lucide-react'
import { useStore } from 'zustand'
import type { CanvasMatchedInput } from '@canvas-app/input/canvas-input-types'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type ZoomControlsProps = {
  dispatchCanvasInput: (input: CanvasMatchedInput) => boolean
  store: CanvasStore
}

export function ZoomControls({ dispatchCanvasInput, store }: ZoomControlsProps) {
  const viewport = useStore(store, (state) => state.viewport)

  return (
    <div className="viewer-control-group">
      <button
        aria-label="Zoom out"
        className="viewer-control-button"
        onClick={() => {
          dispatchCanvasInput({
            allowEditableTarget: true,
            intent: {
              kind: 'viewport-zoom',
              source: 'keyboard',
              mode: 'step',
              direction: 'out',
              target: null
            },
            preventDefault: false
          })
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
        onClick={() => {
          dispatchCanvasInput({
            allowEditableTarget: true,
            intent: {
              kind: 'viewport-zoom',
              source: 'keyboard',
              mode: 'step',
              direction: 'in',
              target: null
            },
            preventDefault: false
          })
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
