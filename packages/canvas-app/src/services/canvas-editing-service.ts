import type { CanvasDocumentRecord, CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import {
  createCanvasDocumentEditService,
  type CanvasDocumentEditIntent,
  type CanvasDocumentEditService
} from '@canvas-app/services/edit-service'
import { logCanvasDiagnostic } from '@canvas-app/diagnostics/canvas-diagnostics'
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
      logCanvasDiagnostic('debug', 'Applying canvas edit intent.', {
        intentKind: intent.kind,
        locator: context.document?.locator.kind === 'file'
          ? context.document.locator.path
          : context.document?.locator.key,
        isPersisted: context.documentState?.isPersisted ?? false
      })

      if (!context.document || !context.documentState || !context.draftSource) {
        logCanvasDiagnostic('warn', 'Canvas edit intent blocked because no editable document is loaded.', {
          intentKind: intent.kind
        })
        return {
          status: 'blocked',
          message: 'No editable document is loaded.'
        }
      }

      if (context.invalidState.status === 'invalid') {
        logCanvasDiagnostic('warn', 'Canvas edit intent blocked because the draft is invalid.', {
          intentKind: intent.kind,
          message: context.invalidState.message
        })
        return {
          status: 'blocked',
          message: context.invalidState.message
        }
      }

      if (context.conflictState.status === 'conflict') {
        logCanvasDiagnostic('warn', 'Canvas edit intent blocked by an external-change conflict.', {
          intentKind: intent.kind
        })
        return {
          status: 'blocked',
          message: 'Resolve the external-change conflict before editing again.'
        }
      }

      const editResult = editService.apply(context.draftSource, context.document, intent)

      if (editResult.isErr()) {
        logCanvasDiagnostic('error', 'Canvas edit service could not apply an intent.', {
          intentKind: intent.kind,
          message: editResult.error.message
        })
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
        logCanvasDiagnostic('error', 'Canvas edit produced source that failed repository reparsing.', {
          intentKind: intent.kind,
          locator: context.document.locator.kind === 'file'
            ? context.document.locator.path
            : context.document.locator.key,
          message: readResult.error.message
        })
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
