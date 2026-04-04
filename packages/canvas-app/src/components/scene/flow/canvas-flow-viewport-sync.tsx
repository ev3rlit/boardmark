import { useEffect } from 'react'
import { useOnViewportChange, useReactFlow } from '@xyflow/react'
import { useStore } from 'zustand'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type CanvasFlowViewportSyncProps = {
  store: CanvasStore
  viewport: { x: number; y: number; zoom: number }
}

export function CanvasFlowViewportSync({ store, viewport }: CanvasFlowViewportSyncProps) {
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
