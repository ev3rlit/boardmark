import PQueue from 'p-queue'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import {
  createDocumentSession,
  type ViewerDocumentPersistenceBridge,
  type ViewerDocumentSession
} from './document-session'

export type CanvasDocumentSaveMode = 'explicit' | 'debounced' | 'batched'

export type CanvasDocumentSaveResult =
  | { status: 'cancelled' }
  | {
      status: 'saved'
      document: CanvasDocumentRecord
      documentSession: ViewerDocumentSession
      path: string
      savedAt: number
    }
  | {
      status: 'error'
      message: string
    }

type CanvasDocumentSaveServiceOptions = {
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: ViewerDocumentPersistenceBridge
}

export type CanvasDocumentSaveService = {
  save: (
    document: CanvasDocumentRecord,
    documentSession: ViewerDocumentSession,
    mode: CanvasDocumentSaveMode
  ) => Promise<CanvasDocumentSaveResult>
  flush: () => Promise<void>
}

export function createCanvasDocumentSaveService({
  documentPicker,
  documentRepository,
  documentPersistenceBridge
}: CanvasDocumentSaveServiceOptions): CanvasDocumentSaveService {
  const queue = new PQueue({ concurrency: 1 })
  let pendingKey: string | null = null
  let pendingSave: Promise<CanvasDocumentSaveResult> | null = null

  return {
    save(document, documentSession, mode) {
      const saveKey = readSaveKey(documentSession, mode)

      if (pendingSave && pendingKey === saveKey) {
        return pendingSave
      }

      const nextSave = queue
        .add(async () =>
          runSave({
            document,
            documentPicker,
            documentRepository,
            documentPersistenceBridge,
            documentSession,
            mode
          })
        )
        .then((result: void | CanvasDocumentSaveResult) => {
          if (result) {
            return result
          }

          return {
            status: 'error' as const,
            message: 'Save queue returned no result.'
          }
        })

      pendingKey = saveKey
      pendingSave = nextSave
      void nextSave.finally(() => {
        if (pendingSave === nextSave) {
          pendingKey = null
          pendingSave = null
        }
      })

      return nextSave
    },

    async flush() {
      await queue.onIdle()
    }
  }
}

async function runSave({
  document,
  documentPicker,
  documentRepository,
  documentPersistenceBridge,
  documentSession
}: {
  document: CanvasDocumentRecord
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: ViewerDocumentPersistenceBridge
  documentSession: ViewerDocumentSession
  mode: CanvasDocumentSaveMode
}): Promise<CanvasDocumentSaveResult> {
  if (documentPersistenceBridge) {
    const persistResult = documentSession.isPersisted
      ? await documentPersistenceBridge.saveDocument({
          defaultName: document.name,
          locator: documentSession.locator,
          fileHandle: documentSession.fileHandle,
          source: documentSession.currentSource
        })
      : await documentPersistenceBridge.saveDocumentAs({
          defaultName: document.name,
          locator: documentSession.locator,
          source: documentSession.currentSource
        })

    if (!persistResult.ok) {
      if (persistResult.error.code === 'cancelled') {
        return { status: 'cancelled' }
      }

      return {
        status: 'error',
        message: persistResult.error.message
      }
    }

    const recordResult = await documentRepository.readSource({
      locator: persistResult.value.locator,
      source: persistResult.value.source,
      isTemplate: false
    })

    if (!recordResult.ok) {
      return {
        status: 'error',
        message: recordResult.error.message
      }
    }

    return {
      status: 'saved',
      document: recordResult.value,
      documentSession: createDocumentSession({
        record: recordResult.value,
        fileHandle: persistResult.value.fileHandle,
        isPersisted: true,
        persistedSnapshotSource: persistResult.value.source
      }),
      path: recordResult.value.name,
      savedAt: Date.now()
    }
  }

  const locatorResult =
    documentSession.isPersisted && documentSession.locator.kind === 'file'
      ? {
          ok: true as const,
          value: documentSession.locator
        }
      : await documentPicker.pickSaveLocator(document.name)

  if (!locatorResult.ok) {
    if (locatorResult.error.code === 'cancelled') {
      return { status: 'cancelled' }
    }

    return {
      status: 'error',
      message: locatorResult.error.message
    }
  }

  const saveResult = await documentRepository.save({
    locator: locatorResult.value,
    source: documentSession.currentSource,
    isTemplate: false
  })

  if (!saveResult.ok) {
    return {
      status: 'error',
      message: saveResult.error.message
    }
  }

  return {
    status: 'saved',
    document: saveResult.value,
    documentSession: createDocumentSession({
      record: saveResult.value,
      isPersisted: true,
      persistedSnapshotSource: documentSession.currentSource
    }),
    path: saveResult.value.name,
    savedAt: Date.now()
  }
}

function readSaveKey(documentSession: ViewerDocumentSession, mode: CanvasDocumentSaveMode) {
  return [
    mode,
    documentSession.locator.kind,
    describeLocator(documentSession.locator),
    documentSession.fileHandle?.name ?? 'no-handle',
    documentSession.currentSource
  ].join('::')
}

function describeLocator(locator: ViewerDocumentSession['locator']) {
  if (locator.kind === 'file') {
    return locator.path
  }

  return locator.key
}
