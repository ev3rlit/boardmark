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
import type {
  CanvasDocumentPersistenceBridge,
  CanvasImageAssetBridge,
  CanvasImageAssetError
} from '@boardmark/canvas-app'
import { logCanvasDiagnostic } from '@canvas-app/diagnostics/canvas-diagnostics'

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
  assetDirectoryHandle: FileSystemDirectoryHandle | null
  fileHandle: FileSystemFileHandle
  locator: CanvasFileDocumentLocator
  source: string
}

type BrowserDocumentBridge = BoardmarkDocumentBridge & {
  persistence: CanvasDocumentPersistenceBridge
  imageAssets: CanvasImageAssetBridge
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
        logCanvasDiagnostic('error', 'Browser bridge could not open a file because the File System Access API is unavailable.')
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
        logCanvasDiagnostic('error', 'Browser bridge openDocument failed before a file handle was resolved.', {
          code: handlesResult.error.code,
          message: handlesResult.error.message
        })
        return handlesResult
      }

      const fileHandle = handlesResult.value[0]

      if (!fileHandle) {
        return {
          ok: false,
          error: cancelledPickerError()
        }
      }

      const permissionResult = await ensureHandlePermission({
        fileHandle,
        mode: 'readwrite',
        fallbackMessage: `Could not access "${fileHandle.name}".`
      })

      if (!permissionResult.ok) {
        logCanvasDiagnostic('error', 'Browser bridge could not obtain file permissions for openDocument.', {
          fileName: fileHandle.name,
          code: permissionResult.error.code,
          message: permissionResult.error.message
        })
        return permissionResult
      }

      const fileResult = await readHandleSource({
        fileHandle,
        fallbackMessage: `Could not read "${fileHandle.name}".`,
        readFileText
      })

      if (!fileResult.ok) {
        logCanvasDiagnostic('error', 'Browser bridge could not read the selected file handle.', {
          fileName: fileHandle.name,
          code: fileResult.error.code,
          message: fileResult.error.message
        })
        return fileResult
      }

      const locator = createFileLocator(fileHandle.name, fileSequence)

      fileSequence += 1
      fileSources.set(locator.path, {
        assetDirectoryHandle: null,
        fileHandle,
        locator,
        source: fileResult.value
      })

      return {
        ok: true,
        value: {
          assetDirectoryHandle: null,
          locator,
          fileHandle,
          source: fileResult.value
        }
      }
    },

    async saveDocument(input) {
      if (!input.fileHandle) {
        logCanvasDiagnostic('error', 'Browser bridge could not save because no file handle is attached.', {
          locator: describeLocator(input.locator)
        })
        return unsupportedPickerResult('save-failed', 'No writable file handle is attached.')
      }

      const writeResult = await writeHandleSource({
        fileHandle: input.fileHandle,
        source: input.source,
        fallbackMessage: `Could not write "${input.fileHandle.name}".`
      })

      if (!writeResult.ok) {
        logCanvasDiagnostic('error', 'Browser bridge failed to write the current source to an existing file handle.', {
          fileName: input.fileHandle.name,
          code: writeResult.error.code,
          message: writeResult.error.message
        })
        return writeResult
      }

      const locator =
        input.locator.kind === 'file'
          ? input.locator
          : createFileLocator(input.fileHandle.name, fileSequence++)

      fileSources.set(locator.path, {
        assetDirectoryHandle: input.assetDirectoryHandle ?? fileSources.get(locator.path)?.assetDirectoryHandle ?? null,
        fileHandle: input.fileHandle,
        locator,
        source: input.source
      })

      return {
        ok: true,
        value: {
          assetDirectoryHandle:
            input.assetDirectoryHandle ??
            fileSources.get(locator.path)?.assetDirectoryHandle ??
            null,
          locator,
          fileHandle: input.fileHandle,
          source: input.source
        }
      }
    },

    async saveDocumentAs(input) {
      if (!rootWindow.showSaveFilePicker) {
        logCanvasDiagnostic('error', 'Browser bridge could not open saveDocumentAs because the File System Access API is unavailable.')
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
        logCanvasDiagnostic('error', 'Browser bridge saveDocumentAs failed before a writable file handle was resolved.', {
          code: handleResult.error.code,
          message: handleResult.error.message
        })
        return handleResult
      }

      const fileHandle = handleResult.value
      const permissionResult = await ensureHandlePermission({
        fileHandle,
        mode: 'readwrite',
        fallbackMessage: `Could not access "${fileHandle.name}".`
      })

      if (!permissionResult.ok) {
        logCanvasDiagnostic('error', 'Browser bridge could not obtain file permissions for saveDocumentAs.', {
          fileName: fileHandle.name,
          code: permissionResult.error.code,
          message: permissionResult.error.message
        })
        return permissionResult
      }

      const writeResult = await writeHandleSource({
        fileHandle,
        source: input.source,
        fallbackMessage: `Could not write "${fileHandle.name}".`
      })

      if (!writeResult.ok) {
        logCanvasDiagnostic('error', 'Browser bridge failed to write the current source during saveDocumentAs.', {
          fileName: fileHandle.name,
          code: writeResult.error.code,
          message: writeResult.error.message
        })
        return writeResult
      }

      const locator = createFileLocator(fileHandle.name, fileSequence)

      fileSequence += 1
      fileSources.set(locator.path, {
        assetDirectoryHandle: null,
        fileHandle,
        locator,
        source: input.source
      })

      return {
        ok: true,
        value: {
          assetDirectoryHandle: null,
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
          logCanvasDiagnostic('warn', 'Browser bridge could not refresh an opened file after window focus.', {
            locator: locator.path,
            fileName: fileHandle.name,
            code: sourceResult.error.code,
            message: sourceResult.error.message
          })
          return
        }

        const persisted = fileSources.get(locator.path)

        if (persisted?.source === sourceResult.value) {
          return
        }

        fileSources.set(locator.path, {
          assetDirectoryHandle: persisted?.assetDirectoryHandle ?? null,
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

  const ensureDocumentAssetAccess: CanvasImageAssetBridge['ensureDocumentAssetAccess'] = async ({
    document,
    documentState
  }) => {
    if (document.locator.kind !== 'file' || !documentState.fileHandle) {
      return {
        ok: false,
        error: {
          code: 'unsupported',
          message: 'Browser image asset access requires a persisted file.'
        }
      }
    }

    const storedDirectory = documentState.assetDirectoryHandle
      ?? fileSources.get(document.locator.path)?.assetDirectoryHandle

    if (storedDirectory) {
      return {
        ok: true,
        value: storedDirectory
      }
    }

    if (!rootWindow.showDirectoryPicker) {
      return {
        ok: false,
        error: {
          code: 'unsupported',
          message: 'File System Access directory picker is not available.'
        }
      }
    }

    const pickerResult = await runPicker(
      rootWindow.showDirectoryPicker({
        mode: 'readwrite'
      }),
      'open-failed',
      'Could not open the directory picker.'
    )

    if (!pickerResult.ok) {
      return {
        ok: false,
        error: toImageAssetError(pickerResult.error)
      }
    }

    const validationResult = await validateDocumentDirectoryHandle({
      directoryHandle: pickerResult.value,
      fileHandle: documentState.fileHandle
    })

    if (!validationResult.ok) {
      return validationResult
    }

    const persisted = fileSources.get(document.locator.path)

    if (persisted) {
      fileSources.set(document.locator.path, {
        ...persisted,
        assetDirectoryHandle: pickerResult.value
      })
    }

    return {
      ok: true,
      value: pickerResult.value
    }
  }

  const importImageAsset: CanvasImageAssetBridge['importImageAsset'] = async ({
    bytes,
    document,
    documentState,
    fileName
  }) => {
    const accessResult = await ensureDocumentAssetAccess?.({
      document,
      documentState
    })

    if (!accessResult || !accessResult.ok || !accessResult.value) {
      const accessError = accessResult && !accessResult.ok
        ? accessResult.error
        : {
            code: 'permission-denied' as const,
            message: 'Document directory access is required for image assets.'
          }

      return {
        ok: false,
        error: accessError
      }
    }

    const assetDirectoryHandle = await accessResult.value.getDirectoryHandle(
      readAssetDirectoryName(document.name),
      { create: true }
    )
    const assetFileName = await readNextAvailableAssetFileName(assetDirectoryHandle, fileName)
    const fileHandle = await assetDirectoryHandle.getFileHandle(assetFileName, { create: true })
    const writeResult = await writeHandleBytes({
      bytes,
      fallbackMessage: `Could not write "${assetFileName}".`,
      fileHandle
    })

    if (!writeResult.ok) {
      return {
        ok: false,
        error: {
          code: 'import-failed',
          message: writeResult.error.message
        }
      }
    }

    return {
      ok: true,
      value: {
        src: `./${readAssetDirectoryName(document.name)}/${assetFileName}`
      }
    }
  }

  const resolveImageSource: CanvasImageAssetBridge['resolveImageSource'] = async ({
    document,
    documentState,
    src
  }) => {
    if (isRemoteImageSource(src) || /^data:|^blob:/.test(src)) {
      return {
        ok: true,
        value: {
          src
        }
      }
    }

    if (/^\//.test(src)) {
      return {
        ok: false,
        error: {
          code: 'resolve-failed',
          message: 'Absolute local paths are not supported in the browser shell.'
        }
      }
    }

    if (!document || document.locator.kind !== 'file') {
      return {
        ok: false,
        error: {
          code: 'resolve-failed',
          message: 'A persisted document is required to resolve relative image paths.'
        }
      }
    }

    const accessResult = await ensureDocumentAssetAccess?.({
      document,
      documentState: documentState ?? {
        locator: document.locator,
        fileHandle: null,
        assetDirectoryHandle: null,
        isPersisted: true,
        currentSource: document.source,
        persistedSnapshotSource: document.source,
        isDirty: false
      }
    })

    if (!accessResult || !accessResult.ok || !accessResult.value) {
      const accessError = accessResult && !accessResult.ok
        ? accessResult.error
        : {
            code: 'permission-denied' as const,
            message: 'Document directory access is required to resolve this image.'
          }

      return {
        ok: false,
        error: accessError
      }
    }

    const fileHandleResult = await resolveRelativeFileHandle(accessResult.value, src)

    if (!fileHandleResult.ok) {
      return fileHandleResult
    }

    const file = await fileHandleResult.value.getFile()

    return {
      ok: true,
      value: {
        src: URL.createObjectURL(file)
      }
    }
  }

  const openImageSource: CanvasImageAssetBridge['openSource'] = async ({ src }) => {
    if (!isRemoteImageSource(src)) {
      return {
        ok: false,
        error: {
          code: 'unsupported',
          message: 'Opening local image sources is not supported in the browser shell.'
        }
      }
    }

    rootWindow.open(src, '_blank', 'noopener')

    return {
      ok: true,
      value: undefined
    }
  }

  return {
    persistence,
    imageAssets: {
      ensureDocumentAssetAccess,
      importImageAsset,
      resolveImageSource,
      openSource: openImageSource
    },

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
          defaultName: defaultName ?? 'untitled.md',
          locator: createMemoryLocator(defaultName ?? 'untitled.md', openSequence),
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
          logCanvasDiagnostic('error', 'Browser bridge repository.save received a non-file locator.', {
            locator: describeLocator(input.locator)
          })
          return {
            ok: false,
            error: unsupportedSave(input.locator)
          }
        }

        const stored = fileSources.get(input.locator.path)

        if (!stored) {
          logCanvasDiagnostic('error', 'Browser bridge repository.save could not find a persisted file source entry.', {
            locator: input.locator.path
          })
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
          logCanvasDiagnostic('error', 'Browser bridge repository.save failed to write a persisted file.', {
            locator: input.locator.path,
            message: writeResult.error.message
          })
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
  const permissionResult = await ensureHandlePermission({
    fileHandle,
    mode: 'readwrite',
    fallbackMessage
  })

  if (!permissionResult.ok) {
    return permissionResult
  }

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

async function writeHandleBytes({
  bytes,
  fileHandle,
  fallbackMessage
}: {
  bytes: Uint8Array
  fileHandle: FileSystemFileHandle
  fallbackMessage: string
}) {
  const permissionResult = await ensureHandlePermission({
    fileHandle,
    mode: 'readwrite',
    fallbackMessage
  })

  if (!permissionResult.ok) {
    return permissionResult
  }

  return fileHandle.createWritable().then(
    async (stream) => {
      await stream.write(Uint8Array.from(bytes))
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

async function ensureHandlePermission({
  fileHandle,
  mode,
  fallbackMessage
}: {
  fileHandle: FileSystemFileHandle | FileSystemDirectoryHandle
  mode: 'read' | 'readwrite'
  fallbackMessage: string
}): Promise<{ ok: true } | { ok: false; error: CanvasDocumentPickerError }> {
  const permissionHandle = fileHandle as FileSystemFileHandle & {
    queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  }

  if (
    typeof permissionHandle.queryPermission !== 'function' ||
    typeof permissionHandle.requestPermission !== 'function'
  ) {
    return { ok: true }
  }

  try {
    const queryState = await permissionHandle.queryPermission({ mode })

    if (queryState === 'granted') {
      return { ok: true }
    }

    const requestState = await permissionHandle.requestPermission({ mode })

    if (requestState === 'granted') {
      return { ok: true }
    }

    return {
      ok: false,
      error: {
        code: 'cancelled',
        message: 'The permission request was cancelled.'
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: toPickerError('save-failed', error, fallbackMessage)
    }
  }
}

function readAssetDirectoryName(documentName: string) {
  return `${documentName.replace(/(?:\.canvas)?\.md$/i, '')}.assets`
}

async function readNextAvailableAssetFileName(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
) {
  const match = /^(.*?)(\.[^.]+)?$/.exec(fileName)
  const baseName = match?.[1] ?? 'image'
  const extension = match?.[2] ?? '.png'
  let index = 0

  while (true) {
    const candidate = `${baseName}${index === 0 ? '' : `-${index}`}${extension}`

    try {
      await directoryHandle.getFileHandle(candidate)
      index += 1
    } catch {
      return candidate
    }
  }
}

async function validateDocumentDirectoryHandle({
  directoryHandle,
  fileHandle
}: {
  directoryHandle: FileSystemDirectoryHandle
  fileHandle: FileSystemFileHandle
}) {
  try {
    const siblingHandle = await directoryHandle.getFileHandle(fileHandle.name)

    if (
      typeof siblingHandle.isSameEntry === 'function' &&
      !(await siblingHandle.isSameEntry(fileHandle))
    ) {
      return {
        ok: false as const,
        error: {
          code: 'permission-denied' as const,
          message: `The selected directory does not contain "${fileHandle.name}".`
        }
      }
    }

    return {
      ok: true as const,
      value: undefined
    }
  } catch {
    return {
      ok: false as const,
      error: {
        code: 'permission-denied' as const,
        message: `The selected directory does not contain "${fileHandle.name}".`
      }
    }
  }
}

async function resolveRelativeFileHandle(
  directoryHandle: FileSystemDirectoryHandle,
  src: string
): Promise<
  | { ok: true; value: FileSystemFileHandle }
  | { ok: false; error: { code: 'resolve-failed'; message: string } }
> {
  const normalized = src.replace(/^\.\//, '').replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length === 0) {
    return {
      ok: false,
      error: {
        code: 'resolve-failed',
        message: 'The image source is empty.'
      }
    }
  }

  let currentDirectory = directoryHandle

  for (const segment of segments.slice(0, -1)) {
    try {
      currentDirectory = await currentDirectory.getDirectoryHandle(segment)
    } catch {
      return {
        ok: false,
        error: {
          code: 'resolve-failed',
          message: `Could not find "${src}".`
        }
      }
    }
  }

  try {
    return {
      ok: true,
      value: await currentDirectory.getFileHandle(segments[segments.length - 1] ?? normalized)
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'resolve-failed',
        message: `Could not find "${src}".`
      }
    }
  }
}

function isRemoteImageSource(src: string) {
  return /^https?:\/\//.test(src)
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

function toImageAssetError(
  error: CanvasDocumentPickerError
): CanvasImageAssetError {
  return {
    code: error.code === 'cancelled' ? 'cancelled' : 'permission-denied',
    message: error.message
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
