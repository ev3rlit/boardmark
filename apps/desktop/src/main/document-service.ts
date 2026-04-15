import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { errAsync, fromPromise, okAsync, type ResultAsync } from 'neverthrow'
import { dialog, shell, type BrowserWindow } from 'electron'
import { pathToFileURL } from 'node:url'
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

const DEFAULT_FILE_NAME = 'untitled.md'

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
  saveExportedImage: (
    window: BrowserWindow,
    input: {
      bytes: Uint8Array
      fileName: string
      mimeType: 'image/jpeg' | 'image/png'
    }
  ) => Promise<AsyncResult<void, { code: string; message: string }>>
  importImageAsset: (input: {
    documentPath: string
    bytes: Uint8Array
    fileName: string
  }) => Promise<AsyncResult<{ src: string }, { code: string; message: string }>>
  resolveImageSource: (input: {
    documentPath: string
    src: string
  }) => Promise<AsyncResult<{ src: string }, { code: string; message: string }>>
  openImageSource: (input: {
    documentPath: string
    src: string
  }) => Promise<AsyncResult<void, { code: string; message: string }>>
  revealImageSource: (input: {
    documentPath: string
    src: string
  }) => Promise<AsyncResult<void, { code: string; message: string }>>
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
    },

    async saveExportedImage(window, input) {
      const targetPathResult = await chooseImageSavePath(window, input.fileName, input.mimeType)

      if (!targetPathResult.ok) {
        return {
          ok: false,
          error: targetPathResult.error
        }
      }

      try {
        await writeFile(targetPathResult.value, Buffer.from(input.bytes))

        return {
          ok: true,
          value: undefined
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'save-failed',
            message: error instanceof Error ? error.message : 'Could not save the exported image.'
          }
        }
      }
    },

    async importImageAsset(input) {
      try {
        const assetDirectory = readAssetDirectoryPath(input.documentPath)
        await mkdir(assetDirectory, { recursive: true })
        const targetPath = await readNextAvailableAssetPath(assetDirectory, input.fileName)
        await writeFile(targetPath, Buffer.from(input.bytes))

        return {
          ok: true,
          value: {
            src: toDocumentRelativeAssetPath(input.documentPath, targetPath)
          }
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'import-failed',
            message: error instanceof Error ? error.message : 'Could not import the image asset.'
          }
        }
      }
    },

    async resolveImageSource(input) {
      try {
        if (isRemoteImageSource(input.src)) {
          return {
            ok: true,
            value: {
              src: input.src
            }
          }
        }

        return {
          ok: true,
          value: {
            src: toFileUrl(resolveImagePath(input.documentPath, input.src))
          }
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'resolve-failed',
            message: error instanceof Error ? error.message : 'Could not resolve the image source.'
          }
        }
      }
    },

    async openImageSource(input) {
      try {
        if (isRemoteImageSource(input.src)) {
          await shell.openExternal(input.src)
        } else {
          await shell.openPath(resolveImagePath(input.documentPath, input.src))
        }

        return {
          ok: true,
          value: undefined
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'open-failed',
            message: error instanceof Error ? error.message : 'Could not open the image source.'
          }
        }
      }
    },

    async revealImageSource(input) {
      if (isRemoteImageSource(input.src)) {
        return {
          ok: false,
          error: {
            code: 'reveal-failed',
            message: 'Remote images cannot be revealed in the desktop shell.'
          }
        }
      }

      try {
        shell.showItemInFolder(resolveImagePath(input.documentPath, input.src))
        return {
          ok: true,
          value: undefined
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'reveal-failed',
            message: error instanceof Error ? error.message : 'Could not reveal the image source.'
          }
        }
      }
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

async function chooseImageSavePath(
  window: BrowserWindow,
  defaultName: string,
  mimeType: 'image/jpeg' | 'image/png'
): Promise<AsyncResult<string, { code: string; message: string }>> {
  try {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Boardmark Image',
      defaultPath: ensureImageExtension(defaultName, mimeType),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
      filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png'] }]
    })

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        error: {
          code: 'cancelled',
          message: 'The dialog was cancelled.'
        }
      }
    }

    return {
      ok: true,
      value: ensureImageExtension(result.filePath, mimeType)
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'save-failed',
        message: error instanceof Error ? error.message : 'Image save dialog could not open.'
      }
    }
  }
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
  return path.endsWith('.canvas.md') || path.endsWith('.md') ? path : `${path}.md`
}

function ensureImageExtension(path: string, mimeType: 'image/jpeg' | 'image/png') {
  if (/\.(jpg|jpeg|png)$/i.test(path)) {
    return path
  }

  return mimeType === 'image/jpeg' ? `${path}.jpg` : `${path}.png`
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

function readAssetDirectoryPath(documentPath: string) {
  const documentDirectory = dirname(documentPath)
  const documentName = basename(documentPath).replace(/(?:\.canvas)?\.md$/i, '')

  return join(documentDirectory, `${documentName}.assets`)
}

async function readNextAvailableAssetPath(directory: string, fileName: string) {
  const extension = extname(fileName)
  const baseName = basename(fileName, extension)
  let index = 0

  while (true) {
    const candidate = join(
      directory,
      `${baseName}${index === 0 ? '' : `-${index}`}${extension}`
    )

    try {
      await readFile(candidate)
      index += 1
    } catch {
      return candidate
    }
  }
}

function toDocumentRelativeAssetPath(documentPath: string, targetPath: string) {
  const relativePath = relative(dirname(documentPath), targetPath).replace(/\\/g, '/')
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function resolveImagePath(documentPath: string, src: string) {
  if (isRemoteImageSource(src)) {
    return src
  }

  if (isAbsolute(src)) {
    return src
  }

  return resolve(dirname(documentPath), src)
}

function isRemoteImageSource(src: string) {
  return /^https?:\/\//.test(src)
}

function toFileUrl(path: string) {
  return pathToFileURL(path).href
}
