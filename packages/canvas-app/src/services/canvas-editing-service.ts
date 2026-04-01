import type { CanvasDocumentRecord, CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import {
  createCanvasDocumentEditService,
  type CanvasDocumentEditIntent,
  type CanvasDocumentEditService
} from '@canvas-app/services/edit-service'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import type { CanvasConflictState, CanvasInvalidState } from '@canvas-app/store/canvas-store-types'

export type CanvasEditingContext = {
  conflictState: CanvasConflictState
  document: CanvasDocumentRecord | null
  documentState: CanvasDocumentState | null
  draftSource: string | null
  invalidState: CanvasInvalidState
}

export type CanvasEditingOutcome =
  | { status: 'blocked'; message: string }
  | { status: 'invalid'; documentState: CanvasDocumentState; message: string }
  | {
      status: 'updated'
      documentState: CanvasDocumentState
      record: CanvasDocumentRecord
    }

type CanvasEditingServiceOptions = {
  documentRepository: CanvasDocumentRepositoryGateway
  editService?: CanvasDocumentEditService
}

export type CanvasEditingService = {
  applyIntent: (
    context: CanvasEditingContext,
    intent: CanvasDocumentEditIntent
  ) => Promise<CanvasEditingOutcome>
}

export function createCanvasEditingService({
  documentRepository,
  editService = createCanvasDocumentEditService()
}: CanvasEditingServiceOptions): CanvasEditingService {
  return {
    async applyIntent(context, intent) {
      if (!context.document || !context.documentState || !context.draftSource) {
        return {
          status: 'blocked',
          message: 'No editable document is loaded.'
        }
      }

      if (context.invalidState.status === 'invalid') {
        return {
          status: 'blocked',
          message: context.invalidState.message
        }
      }

      if (context.conflictState.status === 'conflict') {
        return {
          status: 'blocked',
          message: 'Resolve the external-change conflict before editing again.'
        }
      }

      const editResult = editService.apply(context.draftSource, context.document, intent)

      if (editResult.isErr()) {
        return {
          status: 'blocked',
          message: editResult.error.message
        }
      }

      const nextDocumentState = createCanvasDocumentState({
        record: context.document,
        fileHandle: context.documentState.fileHandle,
        isPersisted: context.documentState.isPersisted,
        persistedSnapshotSource: context.documentState.persistedSnapshotSource,
        currentSource: editResult.value.source
      })

      const readResult = await documentRepository.readSource({
        locator: context.document.locator,
        source: editResult.value.source,
        isTemplate: context.document.isTemplate
      })

      if (!readResult.ok) {
        return {
          status: 'invalid',
          documentState: nextDocumentState,
          message: readResult.error.message
        }
      }

      return {
        status: 'updated',
        record: readResult.value,
        documentState: createCanvasDocumentState({
          record: readResult.value,
          fileHandle: context.documentState.fileHandle,
          isPersisted: context.documentState.isPersisted,
          persistedSnapshotSource: context.documentState.persistedSnapshotSource,
          currentSource: editResult.value.source
        })
      }
    }
  }
}
