import { err, errAsync, ok, okAsync, type Result, type ResultAsync } from 'neverthrow'
import { parseCanvasDocument } from '../../canvas-parser/src/index'
import type {
  CanvasAST,
  CanvasParseIssue
} from '../../canvas-domain/src/index'

export type AsyncResult<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export type CanvasFileDocumentLocator = {
  kind: 'file'
  path: string
}

export type CanvasMemoryDocumentLocator = {
  kind: 'memory'
  key: string
  name: string
}

export type CanvasDocumentLocator =
  | CanvasFileDocumentLocator
  | CanvasMemoryDocumentLocator

export type CanvasDocumentRecord = {
  locator: CanvasDocumentLocator
  name: string
  source: string
  ast: CanvasAST
  issues: CanvasParseIssue[]
  isTemplate: boolean
}

export type CanvasDocumentSourceInput = {
  locator: CanvasDocumentLocator
  source: string
  isTemplate: boolean
}

export type CanvasDocumentSaveInput = CanvasDocumentSourceInput

export type CanvasDocumentRepositoryError = {
  kind: 'read-failed' | 'write-failed' | 'parse-failed' | 'unsupported-source'
  message: string
}

export type CanvasDocumentPickerError = {
  code: 'cancelled' | 'open-failed' | 'save-failed'
  message: string
}

export type CanvasDocumentRepository = {
  read: (
    locator: CanvasDocumentLocator
  ) => ResultAsync<CanvasDocumentRecord, CanvasDocumentRepositoryError>
  readSource: (
    input: CanvasDocumentSourceInput
  ) => Result<CanvasDocumentRecord, CanvasDocumentRepositoryError>
  save: (
    input: CanvasDocumentSaveInput
  ) => ResultAsync<CanvasDocumentRecord, CanvasDocumentRepositoryError>
}

export type CanvasDocumentRepositoryGateway = {
  read: (
    locator: CanvasDocumentLocator
  ) => Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
  readSource: (
    input: CanvasDocumentSourceInput
  ) => Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
  save: (
    input: CanvasDocumentSaveInput
  ) => Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
}

export type CanvasDocumentPicker = {
  pickOpenLocator: () => Promise<AsyncResult<CanvasDocumentLocator, CanvasDocumentPickerError>>
  pickSaveLocator: (
    defaultName?: string
  ) => Promise<AsyncResult<CanvasFileDocumentLocator, CanvasDocumentPickerError>>
}

export type BoardmarkDocumentBridge = {
  picker: CanvasDocumentPicker
  repository: CanvasDocumentRepositoryGateway
}

export type CanvasRepositoryFileAccess = {
  readFile: (
    path: string
  ) => ResultAsync<string, CanvasDocumentRepositoryError>
  writeFile: (
    path: string,
    source: string
  ) => ResultAsync<void, CanvasDocumentRepositoryError>
}

export function createCanvasMarkdownDocumentRepository(
  fileAccess?: CanvasRepositoryFileAccess
): CanvasDocumentRepository {
  return {
    read(locator) {
      if (locator.kind !== 'file') {
        return errAsync(unsupportedSource(locator))
      }

      if (!fileAccess) {
        return errAsync({
          kind: 'unsupported-source',
          message: `Canvas repository cannot read "${describeLocator(locator)}" in this environment.`
        })
      }

      return fileAccess
        .readFile(locator.path)
        .andThen((source) =>
          toAsync(buildRecord({
            locator,
            source,
            isTemplate: false
          }))
        )
    },

    readSource(input) {
      return buildRecord(input)
    },

    save(input) {
      if (input.locator.kind !== 'file') {
        return errAsync(unsupportedSource(input.locator))
      }

      if (!fileAccess) {
        return errAsync({
          kind: 'unsupported-source',
          message: `Canvas repository cannot save "${describeLocator(input.locator)}" in this environment.`
        })
      }

      const recordResult = buildRecord(input)

      if (recordResult.isErr()) {
        return errAsync(recordResult.error)
      }

      return fileAccess
        .writeFile(input.locator.path, input.source)
        .andThen(() => okAsync(recordResult.value))
    }
  }
}

export function toAsyncResult<T, E>(result: Result<T, E>): AsyncResult<T, E> {
  if (result.isErr()) {
    return {
      ok: false,
      error: result.error
    }
  }

  return {
    ok: true,
    value: result.value
  }
}

function buildRecord(
  input: CanvasDocumentSourceInput
): Result<CanvasDocumentRecord, CanvasDocumentRepositoryError> {
  const parseResult = parseCanvasDocument(input.source)

  if (parseResult.isErr()) {
    return err({
      kind: 'parse-failed',
      message: `Canvas repository could not parse "${describeLocator(input.locator)}": ${parseResult.error.message}`
    })
  }

  return ok({
    locator: input.locator,
    name: readDocumentName(input.locator),
    source: input.source,
    ast: parseResult.value.ast,
    issues: parseResult.value.issues,
    isTemplate: input.isTemplate
  })
}

function toAsync<T, E>(result: Result<T, E>): ResultAsync<T, E> {
  if (result.isErr()) {
    return errAsync(result.error)
  }

  return okAsync(result.value)
}

function unsupportedSource(locator: CanvasDocumentLocator): CanvasDocumentRepositoryError {
  return {
    kind: 'unsupported-source',
    message: `Canvas repository does not support persistence for "${describeLocator(locator)}".`
  }
}

function describeLocator(locator: CanvasDocumentLocator): string {
  if (locator.kind === 'file') {
    return locator.path
  }

  return locator.name
}

function readDocumentName(locator: CanvasDocumentLocator): string {
  if (locator.kind === 'memory') {
    return locator.name
  }

  const normalized = locator.path.replace(/\\/g, '/')
  const segments = normalized.split('/')
  const lastSegment = segments.at(-1)

  return lastSegment && lastSegment.length > 0 ? lastSegment : 'Untitled'
}
