import { useStore } from 'zustand'
import { Button } from '../../components/button'
import { FloatingPanel } from '../../components/floating-panel'
import type { ViewerStore } from '../../store/viewer-store'

type FileMenuProps = {
  store: ViewerStore
}

export function FileMenu({ store }: FileMenuProps) {
  const { openDocumentFromDisk, saveCurrentDocument, saveState } = useStore(store)

  return (
    <FloatingPanel className="flex items-center gap-2">
      <Button onClick={() => void openDocumentFromDisk()}>Open File</Button>
      <Button
        emphasis="primary"
        onClick={() => void saveCurrentDocument()}
      >
        {saveState.status === 'saving' ? 'Saving...' : 'Save'}
      </Button>
    </FloatingPanel>
  )
}
