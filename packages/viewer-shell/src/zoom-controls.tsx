import { useReactFlow } from '@xyflow/react'
import { useStore } from 'zustand'
import { Button } from './button'
import { FloatingPanel } from './floating-panel'
import type { ViewerStore } from './viewer-store'

type ZoomControlsProps = {
  store: ViewerStore
}

export function ZoomControls({ store }: ZoomControlsProps) {
  const { setViewport } = useStore(store)
  const reactFlow = useReactFlow()

  return (
    <FloatingPanel className="flex flex-col gap-2">
      <Button
        aria-label="Zoom in"
        onClick={async () => {
          await reactFlow.zoomIn({ duration: 160 })
          setViewport(reactFlow.getViewport())
        }}
      >
        +
      </Button>
      <Button
        aria-label="Zoom out"
        onClick={async () => {
          await reactFlow.zoomOut({ duration: 160 })
          setViewport(reactFlow.getViewport())
        }}
      >
        -
      </Button>
    </FloatingPanel>
  )
}
