import { Redo2, Undo2 } from 'lucide-react'
import { useStore } from 'zustand'
import { readCanvasAppShortcutLabel } from '@canvas-app/app/canvas-app-keymap'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type HistoryControlsProps = {
  store: CanvasStore
}

export function HistoryControls({ store }: HistoryControlsProps) {
  const editingState = useStore(store, (state) => state.editingState)
  const history = useStore(store, (state) => state.history)
  const redo = useStore(store, (state) => state.redo)
  const undo = useStore(store, (state) => state.undo)
  const isEditing = editingState.status !== 'idle'
  const canUndo = !isEditing && history.past.length > 0
  const canRedo = !isEditing && history.future.length > 0
  const undoShortcut = readCanvasAppShortcutLabel('undo')
  const redoShortcut = readCanvasAppShortcutLabel('redo')

  return (
    <div
      aria-label="History controls"
      className="viewer-control-group"
      role="toolbar"
    >
      <button
        aria-label="Undo"
        className="viewer-control-button"
        disabled={!canUndo}
        onClick={() => void undo()}
        title={undoShortcut ? `Undo (${undoShortcut})` : 'Undo'}
        type="button"
      >
        <Undo2
          aria-hidden="true"
          className="viewer-control-icon"
        />
        <span className="sr-only">Undo</span>
      </button>
      <button
        aria-label="Redo"
        className="viewer-control-button"
        disabled={!canRedo}
        onClick={() => void redo()}
        title={redoShortcut ? `Redo (${redoShortcut})` : 'Redo'}
        type="button"
      >
        <Redo2
          aria-hidden="true"
          className="viewer-control-icon"
        />
        <span className="sr-only">Redo</span>
      </button>
    </div>
  )
}
