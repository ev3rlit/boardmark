import {
  createCanvasMarkdownDocumentRepository,
  toAsyncResult,
  type BoardmarkDocumentBridge,
  type CanvasDocumentSaveInput,
  type CanvasDocumentLocator,
  type CanvasDocumentPickerError,
  type CanvasDocumentRecord,
  type CanvasDocumentRepository,
  type CanvasDocumentRepositoryError,
  type CanvasFileDocumentLocator,
  type CanvasMemoryDocumentLocator
} from '@boardmark/canvas-repository'
import type { CanvasDocumentPersistenceBridge } from '@boardmark/canvas-app'

type BrowserDocumentBridgeOptions = {
  rootDocument?: Document
  rootWindow?: Window
  documentRepository?: CanvasDocumentRepository
  readFileText?: (file: File) => Promise<string>
}

type MemoryDocumentSource = {
  name: string
  source: string
}

type PersistedDocumentSource = {
  fileHandle: FileSystemFileHandle
  locator: CanvasFileDocumentLocator
  source: string
}

type BrowserDocumentBridge = BoardmarkDocumentBridge & {
  persistence: CanvasDocumentPersistenceBridge
}

export function createBrowserDocumentBridge(
  options: BrowserDocumentBridgeOptions = {}
): BrowserDocumentBridge {
  const rootDocument = options.rootDocument ?? document
  const rootWindow = options.rootWindow ?? window
  const documentRepository =
    options.documentRepository ?? createCanvasMarkdownDocumentRepository()
  const readFileText = options.readFileText ?? defaultReadFileText
  const memorySources = new Map<string, MemoryDocumentSource>()
  let openSequence = 0
  let fileSequence = 0
  const fileSources = new Map<string, PersistedDocumentSource>()
  const persistence: CanvasDocumentPersistenceBridge = {
    async openDocument() {
      if (!rootWindow.showOpenFilePicker) {
        return unsupportedPickerResult('open-failed', 'File System Access API is not available.')
      }

      const handlesResult = await runPicker(
        rootWindow.showOpenFilePicker({
          excludeAcceptAllOption: true,
          multiple: false,
          types: [canvasFilePickerType()]
        }),
        'open-failed',
        'Could not open the file picker.'
      )

      if (!handlesResult.ok) {
        return handlesResult
      }

      const fileHandle = handlesResult.value[0]

      if (!fileHandle) {
        return {
          ok: false,
          error: cancelledPickerError()
        }
      }

      const fileResult = await readHandleSource({
        fileHandle,
        fallbackMessage: `Could not read "${fileHandle.name}".`,
        readFileText
      })

      if (!fileResult.ok) {
        return fileResult
      }

      const locator = createFileLocator(fileHandle.name, fileSequence)

      fileSequence += 1
      fileSources.set(locator.path, {
        fileHandle,
        locator,
        source: fileResult.value
      })

      return {
        ok: true,
        value: {
          locator,
          fileHandle,
          source: fileResult.value
        }
      }
    },

    async saveDocument(input) {
      if (!input.fileHandle) {
        return unsupportedPickerResult('save-failed', 'No writable file handle is attached.')
      }

      const writeResult = await writeHandleSource({
        fileHandle: input.fileHandle,
        source: input.source,
        fallbackMessage: `Could not write "${input.fileHandle.name}".`
      })

      if (!writeResult.ok) {
        return writeResult
      }

      const locator =
        input.locator.kind === 'file'
          ? input.locator
          : createFileLocator(input.fileHandle.name, fileSequence++)

      fileSources.set(locator.path, {
        fileHandle: input.fileHandle,
        locator,
        source: input.source
      })

      return {
        ok: true,
        value: {
          locator,
          fileHandle: input.fileHandle,
          source: input.source
        }
      }
    },

    async saveDocumentAs(input) {
      if (!rootWindow.showSaveFilePicker) {
        return unsupportedPickerResult('save-failed', 'File System Access API is not available.')
      }

      const handleResult = await runPicker(
        rootWindow.showSaveFilePicker({
          excludeAcceptAllOption: true,
          suggestedName: input.defaultName,
          types: [canvasFilePickerType()]
        }),
        'save-failed',
        'Could not open the save picker.'
      )

      if (!handleResult.ok) {
        return handleResult
      }

      const fileHandle = handleResult.value
      const writeResult = await writeHandleSource({
        fileHandle,
        source: input.source,
        fallbackMessage: `Could not write "${fileHandle.name}".`
      })

      if (!writeResult.ok) {
        return writeResult
      }

      const locator = createFileLocator(fileHandle.name, fileSequence)

      fileSequence += 1
      fileSources.set(locator.path, {
        fileHandle,
        locator,
        source: input.source
      })

      return {
        ok: true,
        value: {
          locator,
          fileHandle,
          source: input.source
        }
      }
    },

    subscribeExternalChanges({ locator, fileHandle, onExternalChange }) {
      if (locator.kind !== 'file' || !fileHandle) {
        return () => {}
      }

      const handleFocus = async () => {
        const sourceResult = await readHandleSource({
          fileHandle,
          fallbackMessage: `Could not read "${fileHandle.name}".`,
          readFileText
        })

        if (!sourceResult.ok) {
          return
        }

        const persisted = fileSources.get(locator.path)

        if (persisted?.source === sourceResult.value) {
          return
        }

        fileSources.set(locator.path, {
          fileHandle,
          locator,
          source: sourceResult.value
        })
        onExternalChange(sourceResult.value)
      }

      rootWindow.addEventListener('focus', handleFocus)

      return () => {
        rootWindow.removeEventListener('focus', handleFocus)
      }
    }
  }

  return {
    persistence,

    picker: {
      async pickOpenLocator() {
        if (!rootDocument.body) {
          return unsupportedPickerResult('open-failed', 'Browser document body is not available.')
        }

        const input = createHiddenFileInput(rootDocument)
        input.value = ''

        const locatorResult = await new Promise<
          | { ok: true; value: CanvasMemoryDocumentLocator }
          | { ok: false; error: CanvasDocumentPickerError }
        >((resolve) => {
          let settled = false

          const finish = (
            result:
              | { ok: true; value: CanvasMemoryDocumentLocator }
              | { ok: false; error: CanvasDocumentPickerError }
          ) => {
            if (settled) {
              return
            }

            settled = true
            input.removeEventListener('change', handleChange)
            rootWindow.removeEventListener('focus', handleFocus)
            input.remove()
            resolve(result)
          }

          const handleFocus = () => {
            rootWindow.setTimeout(() => {
              if (!settled && !input.files?.[0]) {
                finish({
                  ok: false,
                  error: cancelledPickerError()
                })
              }
            }, 0)
          }

          const handleChange = async () => {
            const file = input.files?.[0]

            if (!file) {
              finish({
                ok: false,
                error: cancelledPickerError()
              })
              return
            }

            const sourceResult = await readFileSource(file, readFileText)

            if (!sourceResult.ok) {
              finish(sourceResult)
              return
            }

            const locator = createMemoryLocator(file.name, openSequence)

            openSequence += 1
            memorySources.set(locator.key, {
              name: locator.name,
              source: sourceResult.value
            })

            finish({
              ok: true,
              value: locator
            })
          }

          input.addEventListener('change', handleChange)
          rootWindow.addEventListener('focus', handleFocus, { once: true })
          input.click()
        })

        return locatorResult
      },

      async pickSaveLocator(defaultName) {
        const result = await persistence.saveDocumentAs({
          defaultName: defaultName ?? 'untitled.canvas.md',
          locator: createMemoryLocator(defaultName ?? 'untitled.canvas.md', openSequence),
          source: ''
        })

        if (!result.ok) {
          return result
        }

        if (result.value.locator.kind !== 'file') {
          return unsupportedPickerResult('save-failed', 'Save did not return a file locator.')
        }

        return {
          ok: true,
          value: result.value.locator
        }
      }
    },

    repository: {
      async read(locator) {
        if (locator.kind === 'memory') {
          const stored = memorySources.get(locator.key)

          if (!stored) {
            return {
              ok: false,
              error: {
                kind: 'read-failed',
                message: `Browser bridge could not reopen "${locator.name}".`
              }
            }
          }

          return toAsyncResult(
            documentRepository.readSource({
              locator,
              source: stored.source,
              isTemplate: false
            })
          )
        }

        const stored = fileSources.get(locator.path)

        if (!stored) {
          return {
            ok: false,
            error: {
              kind: 'read-failed',
              message: `Browser bridge could not reopen "${locator.path}".`
            }
          }
        }

        return toAsyncResult(
          documentRepository.readSource({
            locator,
            source: stored.source,
            isTemplate: false
          })
        )
      },

      async readSource(input) {
        return toAsyncResult(documentRepository.readSource(input))
      },

      async save(input) {
        if (input.locator.kind !== 'file') {
          return {
            ok: false,
            error: unsupportedSave(input.locator)
          }
        }

        const stored = fileSources.get(input.locator.path)

        if (!stored) {
          return {
            ok: false,
            error: unsupportedSave(input.locator)
          }
        }

        const writeResult = await writeCanvasFile({
          documentRepository,
          fileHandle: stored.fileHandle,
          input
        })

        if (!writeResult.ok) {
          return writeResult
        }

        fileSources.set(input.locator.path, {
          ...stored,
          source: input.source
        })

        return writeResult
      }
    }
  }
}

function createHiddenFileInput(rootDocument: Document) {
  const input = rootDocument.createElement('input')
  input.type = 'file'
  input.accept = '.canvas.md,.md,text/markdown'
  input.hidden = true
  rootDocument.body.appendChild(input)
  return input
}

function createFileLocator(name: string, sequence: number): CanvasFileDocumentLocator {
  return {
    kind: 'file',
    path: `browser-file-${sequence}/${name}`
  }
}

function createMemoryLocator(name: string, sequence: number): CanvasMemoryDocumentLocator {
  return {
    kind: 'memory',
    key: `browser-open-${sequence}`,
    name
  }
}

function cancelledPickerError(): CanvasDocumentPickerError {
  return {
    code: 'cancelled',
    message: 'The dialog was cancelled.'
  }
}

function unsupportedRead(locator: CanvasDocumentLocator): CanvasDocumentRepositoryError {
  return {
    kind: 'unsupported-source',
    message: `Canvas repository does not support persistence for "${describeLocator(locator)}".`
  }
}

function unsupportedSave(locator: CanvasDocumentLocator): CanvasDocumentRepositoryError {
  return {
    kind: 'unsupported-source',
    message: `Canvas repository does not support persistence for "${describeLocator(locator)}" in the browser shell.`
  }
}

function describeLocator(locator: CanvasDocumentLocator) {
  if (locator.kind === 'file') {
    return locator.path
  }

  return locator.name
}

async function defaultReadFileText(file: File) {
  return file.text()
}

function canvasFilePickerType(): FilePickerAcceptType {
  return {
    description: 'Canvas Markdown',
    accept: {
      'text/markdown': ['.canvas.md', '.md']
    }
  }
}

async function runPicker<T>(
  pickerPromise: Promise<T>,
  code: Exclude<CanvasDocumentPickerError['code'], 'cancelled'>,
  fallbackMessage: string
): Promise<{ ok: true; value: T } | { ok: false; error: CanvasDocumentPickerError }> {
  return pickerPromise.then(
    (value) => ({
      ok: true,
      value
    }),
    (error: unknown) => {
      const pickerError = toPickerError(code, error, fallbackMessage)

      return {
        ok: false,
        error: pickerError.message === 'The user aborted a request.'
          ? cancelledPickerError()
          : pickerError
      }
    }
  )
}

async function readFileSource(
  file: File,
  readFileText: (file: File) => Promise<string>
): Promise<
  { ok: true; value: string } | { ok: false; error: CanvasDocumentPickerError }
> {
  return readFileText(file).then(
    (source) => ({
      ok: true,
      value: source
    }),
    (error: unknown) => ({
      ok: false,
      error: toPickerError('open-failed', error, 'Could not read the selected file.')
    })
  )
}

async function readHandleSource({
  fileHandle,
  fallbackMessage,
  readFileText
}: {
  fileHandle: FileSystemFileHandle
  fallbackMessage: string
  readFileText: (file: File) => Promise<string>
}): Promise<
  { ok: true; value: string } | { ok: false; error: CanvasDocumentPickerError }
> {
  return fileHandle.getFile().then(
    (file) => readFileSource(file, readFileText),
    (error: unknown) => ({
      ok: false,
      error: toPickerError('open-failed', error, fallbackMessage)
    })
  )
}

async function writeHandleSource({
  fileHandle,
  source,
  fallbackMessage
}: {
  fileHandle: FileSystemFileHandle
  source: string
  fallbackMessage: string
}): Promise<{ ok: true } | { ok: false; error: CanvasDocumentPickerError }> {
  return fileHandle.createWritable().then(
    async (stream) => {
      await stream.write(source)
      await stream.close()
      return { ok: true as const }
    },
    (error: unknown) => ({
      ok: false as const,
      error: toPickerError('save-failed', error, fallbackMessage)
    })
  )
}

async function writeCanvasFile({
  documentRepository,
  fileHandle,
  input
}: {
  documentRepository: CanvasDocumentRepository
  fileHandle: FileSystemFileHandle
  input: CanvasDocumentSaveInput
}): Promise<
  | { ok: true; value: CanvasDocumentRecord }
  | { ok: false; error: CanvasDocumentRepositoryError }
> {
  const writeResult = await writeHandleSource({
    fileHandle,
    source: input.source,
    fallbackMessage: `Could not write "${fileHandle.name}".`
  })

  if (!writeResult.ok) {
    return {
      ok: false,
      error: {
        kind: 'write-failed',
        message: writeResult.error.message
      }
    }
  }

  return toAsyncResult(documentRepository.readSource(input))
}

function unsupportedPickerResult(
  code: Exclude<CanvasDocumentPickerError['code'], 'cancelled'>,
  message: string
) {
  return {
    ok: false as const,
    error: {
      code,
      message
    }
  }
}

function toPickerError(
  code: Exclude<CanvasDocumentPickerError['code'], 'cancelled'>,
  error: unknown,
  fallbackMessage: string
): CanvasDocumentPickerError {
  return {
    code,
    message: error instanceof Error ? error.message : fallbackMessage
  }
}
