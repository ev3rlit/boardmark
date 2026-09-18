import { editBoard } from '../../../canvas-edit/src/board-edit'
import { serializeBoard } from '../../../canvas-domain/src/board-file'
import { readBoardScene } from '../../../canvas-repository/src/board-scene'
import { createCanvasDocumentState } from '../document/canvas-document-state'
import type { CanvasEditingService } from './canvas-editing-service'

export function createBoardEditingService(): CanvasEditingService {
  return {
    async applyIntent(context, intent) {
      if (!context.document?.boardFile || !context.documentState)
        return { status: 'blocked', message: '먼저 보드 파일을 여세요.' }
      const edited = editBoard(context.document.boardFile, intent)
      if (!edited.ok) return { status: 'blocked', message: edited.error.message }
      const serialized = serializeBoard(edited.value)
      if (!serialized.ok) return { status: 'blocked', message: serialized.error.message }
      const scene = readBoardScene({
        locator: context.document.locator,
        source: serialized.value,
        isTemplate: false
      })
      if (!scene.ok) return { status: 'blocked', message: scene.error.message }
      return {
        status: 'updated',
        record: scene.value,
        documentState: createCanvasDocumentState({
          record: scene.value,
          isPersisted: context.documentState.isPersisted,
          persistedSnapshotSource: context.documentState.persistedSnapshotSource,
          currentSource: serialized.value
        })
      }
    }
  }
}
