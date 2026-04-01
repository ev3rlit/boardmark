import { readFile, writeFile } from 'node:fs/promises'
import { errAsync, fromPromise, okAsync, type ResultAsync } from 'neverthrow'
import { dialog, type BrowserWindow } from 'electron'
import {
  createCanvasMarkdownDocumentRepository,
  toAsyncResult,
  type AsyncResult,
  type CanvasFileDocumentLocator,
  type CanvasDocumentLocator,
  type CanvasDocumentPickerError,
  type CanvasDocumentRecord,
  type CanvasDocumentRepositoryError,
  type CanvasDocumentSaveInput,
  type CanvasDocumentSourceInput
} from '../../../../packages/canvas-repository/src/index'

const DEFAULT_FILE_NAME = 'untitled.canvas.md'

const documentRepository = createCanvasMarkdownDocumentRepository({
  readFile(path) {
    return fromPromise(readFile(path, 'utf8'), (error) =>
      toRepositoryError('read-failed', error, `Could not read "${path}".`)
    )
  },
  writeFile(path, source) {
    return fromPromise(writeFile(path, source, 'utf8'), (error) =>
      toRepositoryError('write-failed', error, `Could not write "${path}".`)
    )
  }
})

export type DocumentService = {
  pickOpenLocator: (
    window: BrowserWindow
  ) => Promise<AsyncResult<CanvasDocumentLocator, CanvasDocumentPickerError>>
  pickSaveLocator: (
    window: BrowserWindow,
    defaultName?: string
  ) => Promise<AsyncResult<CanvasFileDocumentLocator, CanvasDocumentPickerError>>
  readDocument: (
    locator: CanvasDocumentLocator
  ) => Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
  readDocumentSource: (
    input: CanvasDocumentSourceInput
  ) => Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
  saveDocument: (
    input: CanvasDocumentSaveInput
  ) => Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
}

export function createDocumentService(): DocumentService {
  return {
    async pickOpenLocator(window) {
      const result = await chooseOpenLocator(window)
      return result.match(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      )
    },

    async pickSaveLocator(window, defaultName) {
      const result = await chooseSaveLocator(window, defaultName)
      return result.match(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      )
    },

    async readDocument(locator) {
      const result = await documentRepository.read(locator)
      return result.match(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      )
    },

    async readDocumentSource(input) {
      return toAsyncResult(documentRepository.readSource(input))
    },

    async saveDocument(input) {
      const result = await documentRepository.save(input)
      return result.match(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      )
    }
  }
}

function chooseSaveLocator(
  _window: BrowserWindow,
  defaultName = DEFAULT_FILE_NAME
): ResultAsync<CanvasFileDocumentLocator, CanvasDocumentPickerError> {
  return fromPromise(
    dialog.showSaveDialog({
      title: 'Save Boardmark Canvas',
      defaultPath: defaultName,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
      filters: [{ name: 'Canvas Markdown', extensions: ['md'] }]
    }),
    (error) => toPickerError('save-failed', error, 'Save dialog could not open.')
  ).andThen((result) => {
    if (result.canceled || !result.filePath) {
      return errAsync(cancelledError())
    }

    return okAsync({
      kind: 'file' as const,
      path: ensureCanvasExtension(result.filePath)
    })
  })
}

function chooseOpenLocator(
  window: BrowserWindow
): ResultAsync<CanvasFileDocumentLocator, CanvasDocumentPickerError> {
  return fromPromise(
    dialog.showOpenDialog(window, {
      title: 'Open Boardmark Canvas',
      properties: ['openFile'],
      filters: [{ name: 'Canvas Markdown', extensions: ['md'] }]
    }),
    (error) => toPickerError('open-failed', error, 'Open dialog could not open.')
  ).andThen((result) => {
    const filePath = result.filePaths[0]

    if (result.canceled || !filePath) {
      return errAsync(cancelledError())
    }

    return okAsync({
      kind: 'file' as const,
      path: filePath
    })
  })
}

function ensureCanvasExtension(path: string): string {
  return path.endsWith('.canvas.md') || path.endsWith('.md') ? path : `${path}.canvas.md`
}

function cancelledError(): CanvasDocumentPickerError {
  return {
    code: 'cancelled',
    message: 'The dialog was cancelled.'
  }
}

function toPickerError(
  code: Exclude<CanvasDocumentPickerError['code'], 'cancelled'>,
  error: unknown,
  fallback: string
): CanvasDocumentPickerError {
  return {
    code,
    message: error instanceof Error ? error.message : fallback
  }
}

function toRepositoryError(
  kind: CanvasDocumentRepositoryError['kind'],
  error: unknown,
  fallback: string
): CanvasDocumentRepositoryError {
  return {
    kind,
    message: error instanceof Error ? error.message : fallback
  }
}
