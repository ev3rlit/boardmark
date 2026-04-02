import type {
  CanvasDocumentPicker,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import {
  createCanvasDocumentSaveService,
  type CanvasDocumentSaveMode,
  type CanvasDocumentSaveService
} from '@canvas-app/services/save-service'
import { EMPTY_CANVAS_DOCUMENT_NAME } from '@canvas-app/document/empty-canvas'
import type { CanvasDocumentPersistenceBridge } from '@canvas-app/document/canvas-document-persistence'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'

export type CanvasDocumentCommandResult =
  | {
      status: 'loaded'
      record: CanvasDocumentRecord
      documentState: CanvasDocumentState
    }
  | {
      status: 'saved'
      record: CanvasDocumentRecord
      documentState: CanvasDocumentState
      path: string
      savedAt: number
    }
  | {
      status: 'cancelled'
      phase: 'load' | 'save'
    }
  | {
      status: 'error'
      phase: 'load' | 'save'
      message: string
    }

type CanvasDocumentServiceOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
  saveService?: CanvasDocumentSaveService
  templateSource: string
}

export type CanvasDocumentService = {
  hydrateTemplate: () => Promise<CanvasDocumentCommandResult>
  openDocument: () => Promise<CanvasDocumentCommandResult>
  openDroppedDocument: (input: {
    name: string
    sequence: number
    source: string
  }) => Promise<CanvasDocumentCommandResult>
  saveCurrentDocument: (input: {
    document: CanvasDocumentRecord | null
    documentState: CanvasDocumentState | null
    invalidMessage: string | null
    mode?: CanvasDocumentSaveMode
  }) => Promise<CanvasDocumentCommandResult>
  subscribeExternalChanges: (input: {
    document: CanvasDocumentRecord | null
    documentState: CanvasDocumentState | null
    onExternalChange: (source: string) => void
  }) => Promise<() => void>
}

export function createCanvasDocumentService({
  documentPicker,
  documentRepository,
  documentPersistenceBridge,
  saveService = createCanvasDocumentSaveService({
    documentPicker,
    documentRepository,
    documentPersistenceBridge
  }),
  templateSource
}: CanvasDocumentServiceOptions): CanvasDocumentService {
  return {
    async hydrateTemplate() {
      const result = await documentRepository.readSource({
        locator: {
          kind: 'memory',
          key: 'startup-template',
          name: EMPTY_CANVAS_DOCUMENT_NAME
        },
        source: templateSource,
        isTemplate: true
      })

      if (!result.ok) {
        return {
          status: 'error',
          phase: 'load',
          message: result.error.message
        }
      }

      return {
        status: 'loaded',
        record: result.value,
        documentState: createCanvasDocumentState({
          record: result.value,
          isPersisted: false,
          persistedSnapshotSource: null
        })
      }
    },

    async openDocument() {
      if (documentPersistenceBridge) {
        const openResult = await documentPersistenceBridge.openDocument()

        if (!openResult.ok) {
          return openResult.error.code === 'cancelled'
            ? { status: 'cancelled', phase: 'load' as const }
            : {
                status: 'error',
                phase: 'load',
                message: openResult.error.message
              }
        }

        const readResult = await documentRepository.readSource({
          locator: openResult.value.locator,
          source: openResult.value.source,
          isTemplate: false
        })

        if (!readResult.ok) {
          return {
            status: 'error',
            phase: 'load',
            message: readResult.error.message
          }
        }

        return {
          status: 'loaded',
          record: readResult.value,
          documentState: createCanvasDocumentState({
            record: readResult.value,
            assetDirectoryHandle: openResult.value.assetDirectoryHandle ?? null,
            fileHandle: openResult.value.fileHandle,
            isPersisted: true,
            persistedSnapshotSource: openResult.value.source
          })
        }
      }

      const locatorResult = await documentPicker.pickOpenLocator()

      if (!locatorResult.ok) {
        return locatorResult.error.code === 'cancelled'
          ? { status: 'cancelled', phase: 'load' as const }
          : {
              status: 'error',
              phase: 'load',
              message: locatorResult.error.message
            }
      }

      const readResult = await documentRepository.read(locatorResult.value)

      if (!readResult.ok) {
        return {
          status: 'error',
          phase: 'load',
          message: readResult.error.message
        }
      }

      return {
        status: 'loaded',
        record: readResult.value,
        documentState: createCanvasDocumentState({
          record: readResult.value,
          isPersisted: readResult.value.locator.kind === 'file',
          persistedSnapshotSource:
            readResult.value.locator.kind === 'file' ? readResult.value.source : null
        })
      }
    },

    async openDroppedDocument({ name, sequence, source }) {
      const result = await documentRepository.readSource({
        locator: {
          kind: 'memory',
          key: `dropped-document-${sequence}`,
          name
        },
        source,
        isTemplate: false
      })

      if (!result.ok) {
        return {
          status: 'error',
          phase: 'load',
          message: result.error.message
        }
      }

      return {
        status: 'loaded',
        record: result.value,
        documentState: createCanvasDocumentState({
          record: result.value,
          isPersisted: false,
          persistedSnapshotSource: null
        })
      }
    },

    async saveCurrentDocument({ document, documentState, invalidMessage, mode = 'explicit' }) {
      if (!document || !documentState) {
        return {
          status: 'error',
          phase: 'save',
          message: invalidMessage ?? 'No editable document is loaded.'
        }
      }

      if (invalidMessage) {
        return {
          status: 'error',
          phase: 'save',
          message: invalidMessage
        }
      }

      const saveResult = await saveService.save(document, documentState, mode)

      if (saveResult.status === 'cancelled') {
        return {
          status: 'cancelled',
          phase: 'save'
        }
      }

      if (saveResult.status === 'error') {
        return {
          status: 'error',
          phase: 'save',
          message: saveResult.message
        }
      }

      return {
        status: 'saved',
        record: saveResult.document,
        documentState: saveResult.documentState,
        path: saveResult.path,
        savedAt: saveResult.savedAt
      }
    },

    async subscribeExternalChanges({ document, documentState, onExternalChange }) {
      if (!documentPersistenceBridge?.subscribeExternalChanges) {
        return () => {}
      }

      if (!document || !documentState || !documentState.isPersisted) {
        return () => {}
      }

      const dispose = await documentPersistenceBridge.subscribeExternalChanges({
        locator: document.locator,
        fileHandle: documentState.fileHandle,
        onExternalChange
      })

      return dispose
    }
  }
}
