import {
  createCanvasMarkdownDocumentRepository,
  toAsyncResult,
  type BoardmarkDocumentBridge,
  type CanvasDocumentLocator,
  type CanvasDocumentPickerError,
  type CanvasDocumentRepository,
  type CanvasDocumentRepositoryError,
  type CanvasMemoryDocumentLocator
} from '@boardmark/canvas-repository'

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

export function createBrowserDocumentBridge(
  options: BrowserDocumentBridgeOptions = {}
): BoardmarkDocumentBridge {
  const rootDocument = options.rootDocument ?? document
  const rootWindow = options.rootWindow ?? window
  const documentRepository =
    options.documentRepository ?? createCanvasMarkdownDocumentRepository()
  const readFileText = options.readFileText ?? defaultReadFileText
  const memorySources = new Map<string, MemoryDocumentSource>()
  const input = createHiddenFileInput(rootDocument)
  let openSequence = 0

  return {
    picker: {
      async pickOpenLocator() {
        input.value = ''

        return new Promise((resolve) => {
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

            try {
              const source = await readFileText(file)
              const locator = createMemoryLocator(file.name, openSequence)

              openSequence += 1
              memorySources.set(locator.key, {
                name: locator.name,
                source
              })

              finish({
                ok: true,
                value: locator
              })
            } catch (error) {
              finish({
                ok: false,
                error: {
                  code: 'open-failed',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Could not read the selected file.'
                }
              })
            }
          }

          input.addEventListener('change', handleChange)
          rootWindow.addEventListener('focus', handleFocus, { once: true })
          input.click()
        })
      },

      async pickSaveLocator() {
        return {
          ok: false,
          error: {
            code: 'save-failed',
            message: 'Save is not supported in the browser shell.'
          }
        }
      }
    },

    repository: {
      async read(locator) {
        if (locator.kind !== 'memory') {
          return {
            ok: false,
            error: unsupportedRead(locator)
          }
        }

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
      },

      async readSource(input) {
        return toAsyncResult(documentRepository.readSource(input))
      },

      async save(input) {
        return {
          ok: false,
          error: unsupportedSave(input.locator)
        }
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
