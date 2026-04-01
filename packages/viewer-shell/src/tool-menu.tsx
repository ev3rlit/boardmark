import { useStore } from 'zustand'
import { Button } from './button'
import { FloatingPanel } from './floating-panel'
import type { ViewerStore } from './viewer-store'

type ToolMenuProps = {
  store: ViewerStore
}

export function ToolMenu({ store }: ToolMenuProps) {
  const { createNoteAtViewport, editingState, toolMode, setToolMode } = useStore(store)

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
      <Button
        disabled={editingState.status !== 'idle'}
        onClick={() => void createNoteAtViewport()}
      >
        New Note
      </Button>
    </FloatingPanel>
  )
}
