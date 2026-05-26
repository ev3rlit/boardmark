import {
  createCanvasMarkdownDocumentRepository,
  toAsyncResult,
  type AsyncResult,
  type BoardmarkDocumentBridge,
  type CanvasDocumentLocator,
  type CanvasDocumentPickerError,
  type CanvasDocumentRecord,
  type CanvasDocumentRepositoryError
} from '@boardmark/canvas-repository'
import type {
  CanvasDocumentPersistenceBridge,
  CanvasDocumentPersistencePayload,
  CanvasDocumentPersistenceSaveInput,
  CanvasImageAssetBridge,
  CanvasImageAssetError
} from '@boardmark/canvas-app'
import {
  isHostToWebviewMessage,
  type DocumentRevision,
  type HostRequestMethod,
  type HostToWebviewMessage,
  type RequestId,
  type WebviewToHostMessage
} from '../shared/protocol'
import { getVsCodeApi } from './vscode-api'

export type DocumentSnapshot = {
  readonly uri: string
  readonly source: string
  readonly revision: DocumentRevision
}

export type DocumentErrorSnapshot = {
  readonly message: string
  readonly uri: string
}

export type VsCodeDocumentBridge = BoardmarkDocumentBridge & {
  readonly imageAssets: CanvasImageAssetBridge
  readonly persistence: CanvasDocumentPersistenceBridge
}

export type HostBridge = {
  readonly documentBridge: VsCodeDocumentBridge
  readonly error: () => DocumentErrorSnapshot | null
  readonly notifyReady: () => void
  readonly requestSave: () => Promise<void>
  readonly snapshot: () => DocumentSnapshot | null
  readonly subscribe: (listener: (snapshot: DocumentSnapshot) => void) => () => void
  readonly subscribeErrors: (listener: (error: DocumentErrorSnapshot | null) => void) => () => void
}

type PendingResponse = {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
}

type HostRequestInput =
  | {
      readonly type: 'document/edit'
      readonly revision: DocumentRevision
      readonly nextSource: string
    }
  | {
      readonly type: 'document/save'
    }
  | {
      readonly type: 'request'
      readonly method: HostRequestMethod
      readonly payload?: unknown
    }

const repository = createCanvasMarkdownDocumentRepository()

export function createHostBridge(): HostBridge {
  const api = getVsCodeApi()
  let current: DocumentSnapshot | null = null
  let currentError: DocumentErrorSnapshot | null = null
  let nextRequestSequence = 1
  const snapshotListeners = new Set<(snapshot: DocumentSnapshot) => void>()
  const errorListeners = new Set<(error: DocumentErrorSnapshot | null) => void>()
  const externalChangeListeners = new Set<(source: string) => void>()
  const pendingResponses = new Map<RequestId, PendingResponse>()

  const post = (message: WebviewToHostMessage) => {
    api.postMessage(message)
  }

  const requestHost = (message: HostRequestInput) => {
    const id = createRequestId(nextRequestSequence)
    nextRequestSequence += 1

    return new Promise<unknown>((resolve, reject) => {
      pendingResponses.set(id, { reject, resolve })
      post({ ...message, id } as WebviewToHostMessage)
    })
  }

  const sendEdit = async (nextSource: string) => {
    if (!current) {
      return {
        ok: false,
        error: {
          code: 'save-failed',
          message: 'No VS Code TextDocument is attached to this canvas.'
        }
      } satisfies AsyncResult<CanvasDocumentPersistencePayload, CanvasDocumentPickerError>
    }

    try {
      await requestHost({
        type: 'document/edit',
        revision: current.revision,
        nextSource
      })
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'save-failed',
          message: readErrorMessage(error, 'VS Code did not accept the canvas edit.')
        }
      } satisfies AsyncResult<CanvasDocumentPersistencePayload, CanvasDocumentPickerError>
    }

    return {
      ok: true,
      value: {
        locator: createCurrentLocator(current),
        fileHandle: null,
        source: nextSource
      }
    } satisfies AsyncResult<CanvasDocumentPersistencePayload, CanvasDocumentPickerError>
  }

  const requestSave = async () => {
    await requestHost({ type: 'document/save' })
  }

  const documentBridge: VsCodeDocumentBridge = {
    picker: {
      async pickOpenLocator() {
        if (!current) {
          return pickerError('open-failed', 'No VS Code TextDocument is attached to this canvas.')
        }

        return {
          ok: true,
          value: createCurrentLocator(current)
        }
      },
      async pickSaveLocator() {
        if (!current) {
          return pickerError('save-failed', 'No VS Code TextDocument is attached to this canvas.')
        }

        return {
          ok: true,
          value: createCurrentLocator(current)
        }
      }
    },
    repository: {
      async read(locator) {
        if (!current || !isCurrentLocator(locator, current)) {
          return repositoryError(
            'unsupported-source',
            'The VS Code webview can only read its attached TextDocument.'
          )
        }

        return parseSource(locator, current.source)
      },
      async readSource(input) {
        return parseSource(input.locator, input.source, input.isTemplate)
      },
      async save(input) {
        const editResult = await sendEdit(input.source)

        if (!editResult.ok) {
          return repositoryError('write-failed', editResult.error.message)
        }

        return parseSource(input.locator, input.source, input.isTemplate)
      }
    },
    persistence: {
      async openDocument() {
        if (!current) {
          return pickerError('open-failed', 'No VS Code TextDocument is attached to this canvas.')
        }

        return {
          ok: true,
          value: {
            locator: createCurrentLocator(current),
            fileHandle: null,
            source: current.source
          }
        }
      },
      async saveDocument(input) {
        const editResult = await sendEdit(input.source)

        if (!editResult.ok) {
          return editResult
        }

        if (input.mode === 'explicit') {
          try {
            await requestSave()
          } catch (error) {
            return pickerError(
              'save-failed',
              readErrorMessage(error, 'VS Code did not save the current Boardmark document.')
            )
          }
        }

        return {
          ok: true,
          value: createPersistencePayload(input, input.source)
        }
      },
      async saveDocumentAs(input) {
        const editResult = await sendEdit(input.source)

        if (!editResult.ok) {
          return editResult
        }

        if (input.mode === 'explicit') {
          try {
            await requestSave()
          } catch (error) {
            return pickerError(
              'save-failed',
              readErrorMessage(error, 'VS Code did not save the current Boardmark document.')
            )
          }
        }

        return {
          ok: true,
          value: createPersistencePayload(input, input.source)
        }
      },
      subscribeExternalChanges({ onExternalChange }) {
        externalChangeListeners.add(onExternalChange)

        return () => {
          externalChangeListeners.delete(onExternalChange)
        }
      }
    },
    imageAssets: createUnsupportedImageAssetBridge()
  }

  const applyHostMessage = (message: HostToWebviewMessage) => {
    switch (message.type) {
      case 'document/sync': {
        const previousSource = current?.source
        current = {
          uri: message.uri,
          source: message.source,
          revision: message.revision
        }
        currentError = null

        for (const listener of snapshotListeners) {
          listener(current)
        }
        for (const listener of errorListeners) {
          listener(null)
        }
        if (previousSource !== undefined && previousSource !== message.source) {
          for (const listener of externalChangeListeners) {
            listener(message.source)
          }
        }
        return
      }
      case 'document/error': {
        currentError = {
          message: message.message,
          uri: message.uri
        }
        for (const listener of errorListeners) {
          listener(currentError)
        }
        return
      }
      case 'document/saved': {
        return
      }
      case 'response': {
        const pending = pendingResponses.get(message.id)

        if (!pending) {
          return
        }

        pendingResponses.delete(message.id)

        if (message.ok) {
          pending.resolve(message.value)
          return
        }

        pending.reject(new Error(message.error))
        return
      }
      case 'theme/changed': {
        return
      }
    }
  }

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isHostToWebviewMessage(event.data)) {
      return
    }

    applyHostMessage(event.data)
  })

  return {
    documentBridge,
    error: () => currentError,
    notifyReady: () => post({ type: 'document/ready' }),
    requestSave,
    snapshot: () => current,
    subscribe: (listener) => {
      snapshotListeners.add(listener)
      return () => {
        snapshotListeners.delete(listener)
      }
    },
    subscribeErrors: (listener) => {
      errorListeners.add(listener)
      return () => {
        errorListeners.delete(listener)
      }
    }
  }
}

function createRequestId(sequence: number): RequestId {
  return `webview-${sequence}`
}

function createCurrentLocator(snapshot: DocumentSnapshot) {
  return {
    kind: 'file' as const,
    path: snapshot.uri
  }
}

function isCurrentLocator(locator: CanvasDocumentLocator, snapshot: DocumentSnapshot) {
  return locator.kind === 'file' && locator.path === snapshot.uri
}

function parseSource(locator: CanvasDocumentLocator, source: string, isTemplate = false) {
  return toAsyncResult(repository.readSource({
    locator,
    source,
    isTemplate
  }))
}

function createPersistencePayload(
  input: Omit<CanvasDocumentPersistenceSaveInput, 'fileHandle'>,
  source: string
): CanvasDocumentPersistencePayload {
  return {
    assetDirectoryHandle: input.assetDirectoryHandle ?? null,
    locator: input.locator,
    fileHandle: null,
    source
  }
}

function pickerError(
  code: CanvasDocumentPickerError['code'],
  message: string
): AsyncResult<never, CanvasDocumentPickerError> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  }
}

function repositoryError(
  kind: CanvasDocumentRepositoryError['kind'],
  message: string
): AsyncResult<never, CanvasDocumentRepositoryError> {
  return {
    ok: false,
    error: {
      kind,
      message
    }
  }
}

function createUnsupportedImageAssetBridge(): CanvasImageAssetBridge {
  const unsupported = (action: string): AsyncResult<never, CanvasImageAssetError> => ({
    ok: false,
    error: {
      code: 'unsupported',
      message: `VS Code image bridge does not support ${action} yet.`
    }
  })

  return {
    async importImageAsset() {
      return unsupported('image import')
    },
    async resolveImageSource() {
      return unsupported('relative image resolution')
    },
    async openSource() {
      return unsupported('opening image sources')
    },
    async revealSource() {
      return unsupported('revealing image sources')
    }
  }
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
