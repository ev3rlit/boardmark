import PQueue from 'p-queue'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@canvas-app/document/canvas-document-persistence'
import { logCanvasDiagnostic } from '@canvas-app/diagnostics/canvas-diagnostics'
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

type DebouncedSaveInput = {
  document: CanvasDocumentRecord
  documentState: CanvasDocumentState
}

type DebouncedSaveState = {
  getTimer: () => ReturnType<typeof setTimeout> | null
  setTimer: (value: ReturnType<typeof setTimeout> | null) => void
  getSave: () => Promise<CanvasDocumentSaveResult> | null
  setSave: (value: Promise<CanvasDocumentSaveResult> | null) => void
  getInput: () => DebouncedSaveInput | null
  setInput: (value: DebouncedSaveInput | null) => void
  getResolve: () => ((result: CanvasDocumentSaveResult) => void) | null
  setResolve: (value: ((result: CanvasDocumentSaveResult) => void) | null) => void
}

export function createCanvasDocumentSaveService({
  documentPicker,
  documentRepository,
  documentPersistenceBridge
}: CanvasDocumentSaveServiceOptions): CanvasDocumentSaveService {
  const queue = new PQueue({ concurrency: 1 })
  let pendingKey: string | null = null
  let pendingSave: Promise<CanvasDocumentSaveResult> | null = null
  let debouncedTimer: ReturnType<typeof setTimeout> | null = null
  let debouncedSave: Promise<CanvasDocumentSaveResult> | null = null
  let debouncedInput:
    | {
        document: CanvasDocumentRecord
        documentState: CanvasDocumentState
      }
    | null = null
  let resolveDebouncedSave: ((result: CanvasDocumentSaveResult) => void) | null = null

  return {
    save(document, documentState, mode) {
      if (mode === 'debounced') {
        return scheduleDebouncedSave({
          document,
          documentPicker,
          documentRepository,
          documentPersistenceBridge,
          documentState,
          queue,
          setPending(value) {
            pendingKey = value.key
            pendingSave = value.promise
          },
          clearPending(promise) {
            if (pendingSave === promise) {
              pendingKey = null
              pendingSave = null
            }
          },
          debouncedState: createDebouncedSaveState({
            getTimer: () => debouncedTimer,
            setTimer(value) {
              debouncedTimer = value
            },
            getSave: () => debouncedSave,
            setSave(value) {
              debouncedSave = value
            },
            getInput: () => debouncedInput,
            setInput(value) {
              debouncedInput = value
            },
            getResolve: () => resolveDebouncedSave,
            setResolve(value) {
              resolveDebouncedSave = value
            }
          })
        })
      }

      clearDebouncedSave({
        debouncedState: createDebouncedSaveState({
          getTimer: () => debouncedTimer,
          setTimer(value) {
            debouncedTimer = value
          },
          getSave: () => debouncedSave,
          setSave(value) {
            debouncedSave = value
          },
          getInput: () => debouncedInput,
          setInput(value) {
            debouncedInput = value
          },
          getResolve: () => resolveDebouncedSave,
          setResolve(value) {
            resolveDebouncedSave = value
          }
        })
      })

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
      if (debouncedTimer) {
        clearTimeout(debouncedTimer)
        debouncedTimer = null
        const inflight = debouncedSave

        if (debouncedInput && resolveDebouncedSave) {
          void enqueueSave({
            document: debouncedInput.document,
            documentPicker,
            documentRepository,
            documentPersistenceBridge,
            documentState: debouncedInput.documentState,
            mode: 'debounced',
            queue,
            setPending(value) {
              pendingKey = value.key
              pendingSave = value.promise
            },
            clearPending(promise) {
              if (pendingSave === promise) {
                pendingKey = null
                pendingSave = null
              }
            }
          }).then((result) => {
            resolveDebouncedSave?.(result)
            clearDebouncedSave({
              debouncedState: createDebouncedSaveState({
                getTimer: () => debouncedTimer,
                setTimer(value) {
                  debouncedTimer = value
                },
                getSave: () => debouncedSave,
                setSave(value) {
                  debouncedSave = value
                },
                getInput: () => debouncedInput,
                setInput(value) {
                  debouncedInput = value
                },
                getResolve: () => resolveDebouncedSave,
                setResolve(value) {
                  resolveDebouncedSave = value
                }
              })
            })
          })
        }

        if (inflight) {
          await inflight
        }
      }

      await queue.onIdle()
    }
  }
}

function scheduleDebouncedSave({
  document,
  documentPicker,
  documentRepository,
  documentPersistenceBridge,
  documentState,
  queue,
  setPending,
  clearPending,
  debouncedState
}: {
  document: CanvasDocumentRecord
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
  documentState: CanvasDocumentState
  queue: PQueue
  setPending: (value: { key: string; promise: Promise<CanvasDocumentSaveResult> }) => void
  clearPending: (promise: Promise<CanvasDocumentSaveResult>) => void
  debouncedState: DebouncedSaveState
}) {
  debouncedState.setInput({
    document,
    documentState
  })

  const currentTimer = debouncedState.getTimer()

  if (currentTimer) {
    clearTimeout(currentTimer)
  }

  if (!debouncedState.getSave()) {
    debouncedState.setSave(new Promise<CanvasDocumentSaveResult>((resolve) => {
      debouncedState.setResolve(resolve)
    }))
  }

  debouncedState.setTimer(setTimeout(() => {
    const nextInput = debouncedState.getInput()
    const resolve = debouncedState.getResolve()

    if (!nextInput || !resolve) {
      clearDebouncedSave({ debouncedState })
      return
    }

    void enqueueSave({
      document: nextInput.document,
      documentPicker,
      documentRepository,
      documentPersistenceBridge,
      documentState: nextInput.documentState,
      mode: 'debounced',
      queue,
      setPending,
      clearPending
    }).then((result) => {
      resolve(result)
      clearDebouncedSave({ debouncedState })
    })
  }, 600))

  return debouncedState.getSave() as Promise<CanvasDocumentSaveResult>
}

function clearDebouncedSave({
  debouncedState
}: {
  debouncedState: DebouncedSaveState
}) {
  const timer = debouncedState.getTimer()

  if (timer) {
    clearTimeout(timer)
  }

  debouncedState.setTimer(null)
  debouncedState.setSave(null)
  debouncedState.setInput(null)
  debouncedState.setResolve(null)
}

function enqueueSave({
  document,
  documentPicker,
  documentRepository,
  documentPersistenceBridge,
  documentState,
  mode,
  queue,
  setPending,
  clearPending
}: {
  document: CanvasDocumentRecord
  documentPicker: CanvasDocumentPicker
  documentRepository: CanvasDocumentRepositoryGateway
  documentPersistenceBridge?: CanvasDocumentPersistenceBridge
  documentState: CanvasDocumentState
  mode: CanvasDocumentSaveMode
  queue: PQueue
  setPending: (value: { key: string; promise: Promise<CanvasDocumentSaveResult> }) => void
  clearPending: (promise: Promise<CanvasDocumentSaveResult>) => void
}) {
  const saveKey = readSaveKey(documentState, mode)
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

  setPending({
    key: saveKey,
    promise: nextSave
  })
  void nextSave.finally(() => clearPending(nextSave))

  return nextSave
}

function createDebouncedSaveState(state: DebouncedSaveState): DebouncedSaveState {
  return state
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
  logCanvasDiagnostic('debug', 'Starting canvas document save.', {
    locator: describeLocator(documentState.locator),
    isPersisted: documentState.isPersisted,
    hasFileHandle: Boolean(documentState.fileHandle),
    sourceLength: documentState.currentSource.length
  })

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
      logCanvasDiagnostic('error', 'Canvas persistence bridge failed to save the current source.', {
        locator: describeLocator(documentState.locator),
        isPersisted: documentState.isPersisted,
        code: persistResult.error.code,
        message: persistResult.error.message
      })

      if (persistResult.error.code === 'cancelled' && !documentState.isPersisted) {
        return { status: 'cancelled' }
      }

      return {
        status: 'error',
        message:
          persistResult.error.code === 'cancelled'
            ? 'The browser did not grant write access to the opened file.'
            : persistResult.error.message
      }
    }

    const recordResult = await documentRepository.readSource({
      locator: persistResult.value.locator,
      source: persistResult.value.source,
      isTemplate: false
    })

    if (!recordResult.ok) {
      logCanvasDiagnostic('error', 'Canvas repository could not reparse a just-saved source.', {
        locator: describeLocator(persistResult.value.locator),
        message: recordResult.error.message
      })
      return {
        status: 'error',
        message: recordResult.error.message
      }
    }

    logCanvasDiagnostic('debug', 'Canvas document save completed through persistence bridge.', {
      locator: describeLocator(recordResult.value.locator),
      path: recordResult.value.name
    })

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
    logCanvasDiagnostic('error', 'Canvas save could not resolve a writable locator.', {
      locator: describeLocator(documentState.locator),
      code: locatorResult.error.code,
      message: locatorResult.error.message
    })

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
    logCanvasDiagnostic('error', 'Canvas repository save failed.', {
      locator: describeLocator(locatorResult.value),
      message: saveResult.error.message
    })
    return {
      status: 'error',
      message: saveResult.error.message
    }
  }

  logCanvasDiagnostic('debug', 'Canvas document save completed through repository save.', {
    locator: describeLocator(saveResult.value.locator),
    path: saveResult.value.name
  })

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
