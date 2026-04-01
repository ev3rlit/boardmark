import { useStore } from 'zustand'
import { Button } from './button'
import { FloatingPanel } from './floating-panel'
import type { ViewerShellCapabilities } from './viewer-shell'
import type { ViewerStore } from './viewer-store'

type FileMenuProps = {
  store: ViewerStore
  capabilities: ViewerShellCapabilities
}

export function FileMenu({ store, capabilities }: FileMenuProps) {
  const { openDocument, saveCurrentDocument, saveState } = useStore(store)

  return (
    <FloatingPanel className="flex items-center gap-2">
      {capabilities.canOpen ? (
        <Button onClick={() => void openDocument()}>Open File</Button>
      ) : null}
      {capabilities.canSave ? (
        <Button
          emphasis="primary"
          onClick={() => void saveCurrentDocument()}
        >
          {saveState.status === 'saving' ? 'Saving...' : 'Save'}
        </Button>
      ) : null}
    </FloatingPanel>
  )
}
