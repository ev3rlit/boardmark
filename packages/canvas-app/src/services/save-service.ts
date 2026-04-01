import PQueue from 'p-queue'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@canvas-app/document/canvas-document-persistence'
import {
  createCanvasDocumentState,
  type CanvasDocumentState
} from '@canvas-app/document/canvas-document-state'

export type CanvasDocumentSaveMode = 'explicit' | 'debounced' | 'batched'

export type CanvasDocumentSaveResult =
  | { status: 'cancelled' }
  | {
      status: 'saved'
      document: CanvasDocumentRecord
      documentState: CanvasDocumentState
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
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
}

export type CanvasDocumentSaveService = {
  save: (
    document: CanvasDocumentRecord,
    documentState: CanvasDocumentState,
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
    save(document, documentState, mode) {
      const saveKey = readSaveKey(documentState, mode)

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
            documentState,
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
  documentState
}: {
  document: CanvasDocumentRecord
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
  documentState: CanvasDocumentState
  mode: CanvasDocumentSaveMode
}): Promise<CanvasDocumentSaveResult> {
  if (documentPersistenceBridge) {
    const persistResult = documentState.isPersisted
      ? await documentPersistenceBridge.saveDocument({
          defaultName: document.name,
          locator: documentState.locator,
          fileHandle: documentState.fileHandle,
          source: documentState.currentSource
        })
      : await documentPersistenceBridge.saveDocumentAs({
          defaultName: document.name,
          locator: documentState.locator,
          source: documentState.currentSource
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
      documentState: createCanvasDocumentState({
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
    documentState.isPersisted && documentState.locator.kind === 'file'
      ? {
          ok: true as const,
          value: documentState.locator
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
    source: documentState.currentSource,
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
    documentState: createCanvasDocumentState({
      record: saveResult.value,
      isPersisted: true,
      persistedSnapshotSource: documentState.currentSource
    }),
    path: saveResult.value.name,
    savedAt: Date.now()
  }
}

function readSaveKey(documentState: CanvasDocumentState, mode: CanvasDocumentSaveMode) {
  return [
    mode,
    documentState.locator.kind,
    describeLocator(documentState.locator),
    documentState.fileHandle?.name ?? 'no-handle',
    documentState.currentSource
  ].join('::')
}

function describeLocator(locator: CanvasDocumentState['locator']) {
  if (locator.kind === 'file') {
    return locator.path
  }

  return locator.key
}
