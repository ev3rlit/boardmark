import type { CanvasDocumentRecord, CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import type { CanvasConflictState } from '@canvas-app/store/canvas-store-types'

export type CanvasConflictReconcileInput = {
  document: CanvasDocumentRecord | null
  documentState: CanvasDocumentState | null
  isDirty: boolean
  persistedSnapshotSource: string | null
}

export type CanvasConflictReloadInput = {
  conflictState: CanvasConflictState
  document: CanvasDocumentRecord | null
  documentState: CanvasDocumentState | null
}

export type CanvasConflictOutcome =
  | { status: 'noop' }
  | { status: 'conflict'; diskSource: string }
  | { status: 'error'; message: string }
  | {
      status: 'updated'
      documentState: CanvasDocumentState
      record: CanvasDocumentRecord
    }

type CanvasConflictServiceOptions = {
  documentRepository: CanvasDocumentRepositoryGateway
}

export type CanvasConflictService = {
  reconcileExternalSource: (
    input: CanvasConflictReconcileInput,
    source: string
  ) => Promise<CanvasConflictOutcome>
  reloadFromConflict: (input: CanvasConflictReloadInput) => Promise<CanvasConflictOutcome>
}

export function createCanvasConflictService({
  documentRepository
}: CanvasConflictServiceOptions): CanvasConflictService {
  return {
    async reconcileExternalSource(input, source) {
      if (!input.document || !input.documentState || source === input.persistedSnapshotSource) {
        return { status: 'noop' }
      }

      if (input.isDirty) {
        return {
          status: 'conflict',
          diskSource: source
        }
      }

      const readResult = await documentRepository.readSource({
        locator: input.document.locator,
        source,
        isTemplate: input.document.isTemplate
      })

      if (!readResult.ok) {
        return {
          status: 'error',
          message: readResult.error.message
        }
      }

      return {
        status: 'updated',
        record: readResult.value,
        documentState: createCanvasDocumentState({
          record: readResult.value,
          fileHandle: input.documentState.fileHandle,
          isPersisted: input.documentState.isPersisted,
          persistedSnapshotSource: source,
          currentSource: source
        })
      }
    },

    async reloadFromConflict(input) {
      if (
        input.conflictState.status !== 'conflict' ||
        !input.document ||
        !input.documentState
      ) {
        return { status: 'noop' }
      }

      const readResult = await documentRepository.readSource({
        locator: input.document.locator,
        source: input.conflictState.diskSource,
        isTemplate: input.document.isTemplate
      })

      if (!readResult.ok) {
        return {
          status: 'error',
          message: readResult.error.message
        }
      }

      return {
        status: 'updated',
        record: readResult.value,
        documentState: createCanvasDocumentState({
          record: readResult.value,
          fileHandle: input.documentState.fileHandle,
          isPersisted: input.documentState.isPersisted,
          persistedSnapshotSource: input.conflictState.diskSource
        })
      }
    }
  }
}
