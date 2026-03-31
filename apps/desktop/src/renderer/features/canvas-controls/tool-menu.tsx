import { useStore } from 'zustand'
import { Button } from '../../components/button'
import { FloatingPanel } from '../../components/floating-panel'
import type { ViewerStore } from '../../store/viewer-store'

type ToolMenuProps = {
  store: ViewerStore
}

export function ToolMenu({ store }: ToolMenuProps) {
  const { toolMode, setToolMode } = useStore(store)

  return (
    <FloatingPanel className="flex items-center gap-2">
      <Button
        active={toolMode === 'select'}
        onClick={() => setToolMode('select')}
      >
        Select
      </Button>
      <Button
        active={toolMode === 'pan'}
        onClick={() => setToolMode('pan')}
      >
        Pan
      </Button>
    </FloatingPanel>
  )
}
