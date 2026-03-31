import { readFile, writeFile } from 'node:fs/promises'
import { errAsync, fromPromise, okAsync, type ResultAsync } from 'neverthrow'
import { dialog, type BrowserWindow } from 'electron'
import type {
  AsyncResult,
  DocumentFile,
  DocumentGatewayError,
  SaveDocumentInput
} from '@boardmark/canvas-domain'

const DEFAULT_FILE_NAME = 'untitled.canvas.md'

export type DocumentService = {
  newFileFromTemplate: (
    window: BrowserWindow
  ) => Promise<AsyncResult<DocumentFile, DocumentGatewayError>>
  openFile: (window: BrowserWindow) => Promise<AsyncResult<DocumentFile, DocumentGatewayError>>
  saveFile: (
    window: BrowserWindow,
    input: SaveDocumentInput
  ) => Promise<AsyncResult<DocumentFile, DocumentGatewayError>>
}

export function createDocumentService(templateSource: string): DocumentService {
  return {
    async newFileFromTemplate(window) {
      const pathResult = await chooseSavePath(window)

      if (pathResult.isErr()) {
        return toErr(pathResult.error)
      }

      const writeResult = await writeDocument(pathResult.value, templateSource)
      return writeResult.match(toOk, toErr)
    },

    async openFile(window) {
      const pathResult = await chooseOpenPath(window)

      if (pathResult.isErr()) {
        return toErr(pathResult.error)
      }

      const readResult = await readDocument(pathResult.value)
      return readResult.match(toOk, toErr)
    },

    async saveFile(window, input) {
      const pathResult = input.path ? await okAsync(input.path) : await chooseSavePath(window)

      if (pathResult.isErr()) {
        return toErr(pathResult.error)
      }

      const writeResult = await writeDocument(pathResult.value, input.content)
      return writeResult.match(toOk, toErr)
    }
  }
}

function chooseSavePath(
  _window: BrowserWindow
): ResultAsync<string, DocumentGatewayError> {
  return fromPromise(
    dialog.showSaveDialog({
      title: 'Save Boardmark Canvas',
      defaultPath: DEFAULT_FILE_NAME,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
      filters: [{ name: 'Canvas Markdown', extensions: ['md'] }]
    }),
    (error) => toGatewayError('save-failed', error, 'Save dialog could not open.')
  ).andThen((result) => {
    if (result.canceled || !result.filePath) {
      return errAsync(cancelledError())
    }

    return okAsync(ensureCanvasExtension(result.filePath))
  })
}

function chooseOpenPath(
  window: BrowserWindow
): ResultAsync<string, DocumentGatewayError> {
  return fromPromise(
    dialog.showOpenDialog(window, {
      title: 'Open Boardmark Canvas',
      properties: ['openFile'],
      filters: [{ name: 'Canvas Markdown', extensions: ['md'] }]
    }),
    (error) => toGatewayError('open-failed', error, 'Open dialog could not open.')
  ).andThen((result) => {
    const filePath = result.filePaths[0]

    if (result.canceled || !filePath) {
      return errAsync(cancelledError())
    }

    return okAsync(filePath)
  })
}

function readDocument(path: string): ResultAsync<DocumentFile, DocumentGatewayError> {
  return fromPromise(readFile(path, 'utf8'), (error) =>
    toGatewayError('open-failed', error, `Could not read "${path}".`)
  ).map((source) => ({
    path,
    source
  }))
}

function writeDocument(
  path: string,
  source: string
): ResultAsync<DocumentFile, DocumentGatewayError> {
  return fromPromise(writeFile(path, source, 'utf8'), (error) =>
    toGatewayError('save-failed', error, `Could not write "${path}".`)
  ).map(() => ({
    path,
    source
  }))
}

function ensureCanvasExtension(path: string): string {
  return path.endsWith('.canvas.md') || path.endsWith('.md') ? path : `${path}.canvas.md`
}

function toOk(value: DocumentFile): AsyncResult<DocumentFile, DocumentGatewayError> {
  return { ok: true, value }
}

function toErr(error: DocumentGatewayError): AsyncResult<DocumentFile, DocumentGatewayError> {
  return { ok: false, error }
}

function cancelledError(): DocumentGatewayError {
  return {
    code: 'cancelled',
    message: 'The dialog was cancelled.'
  }
}

function toGatewayError(
  code: Exclude<DocumentGatewayError['code'], 'cancelled'>,
  error: unknown,
  fallback: string
): DocumentGatewayError {
  return {
    code,
    message: error instanceof Error ? error.message : fallback
  }
}
