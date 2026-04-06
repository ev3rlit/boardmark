import type { CanvasSourceRange } from '@boardmark/canvas-domain'
import type { CanvasDocumentRecord, CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import {
  createCanvasDocumentEditService,
  type CanvasDocumentEditIntent,
  type CanvasDocumentEditService
} from '@canvas-app/services/edit-service'
import {
  createCanvasEditTransactionResolver,
  type TransactionResolver
} from '@canvas-app/services/edit-transaction-resolver'
import type {
  CanvasEditAnchor,
  CanvasEditObjectKind,
  CanvasEditPhase,
  CanvasEditUnit,
  ResolvedCanvasEditTransaction,
  TransactionApplyError
} from '@canvas-app/services/edit-transaction'
import { logCanvasDiagnostic } from '@canvas-app/diagnostics/canvas-diagnostics'
import { createCanvasDocumentState, type CanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import type { CanvasConflictState, CanvasInvalidState } from '@canvas-app/store/canvas-store-types'

export type CanvasEditingContext = {
  conflictState: CanvasConflictState
  document: CanvasDocumentRecord | null
  documentState: CanvasDocumentState | null
  draftSource: string | null
  invalidState: CanvasInvalidState
}

export type CanvasEditingOutcome =
  | { status: 'blocked'; message: string }
  | { status: 'invalid'; documentState: CanvasDocumentState; message: string }
  | {
      status: 'updated'
      documentState: CanvasDocumentState
      record: CanvasDocumentRecord
    }

type CanvasEditingServiceOptions = {
  documentRepository: CanvasDocumentRepositoryGateway
  editService?: CanvasDocumentEditService
  transactionResolver?: TransactionResolver
}

type TransactionApplyFailure = {
  error: TransactionApplyError
  source: string
}

type TransactionApplySuccess = {
  dirty: boolean
  source: string
}

export type CanvasEditingService = {
  applyIntent: (
    context: CanvasEditingContext,
    intent: CanvasDocumentEditIntent
  ) => Promise<CanvasEditingOutcome>
}

export function createCanvasEditingService({
  documentRepository,
  editService = createCanvasDocumentEditService(),
  transactionResolver = createCanvasEditTransactionResolver()
}: CanvasEditingServiceOptions): CanvasEditingService {
  return {
    async applyIntent(context, intent) {
      logCanvasDiagnostic('debug', 'Applying canvas edit intent.', {
        intentKind: intent.kind,
        locator: context.document?.locator.kind === 'file'
          ? context.document.locator.path
          : context.document?.locator.key,
        isPersisted: context.documentState?.isPersisted ?? false
      })

      if (!context.document || !context.documentState || !context.draftSource) {
        logCanvasDiagnostic('warn', 'Canvas edit intent blocked because no editable document is loaded.', {
          intentKind: intent.kind
        })
        return {
          status: 'blocked',
          message: 'No editable document is loaded.'
        }
      }

      if (context.invalidState.status === 'invalid') {
        logCanvasDiagnostic('warn', 'Canvas edit intent blocked because the draft is invalid.', {
          intentKind: intent.kind,
          message: context.invalidState.message
        })
        return {
          status: 'blocked',
          message: context.invalidState.message
        }
      }

      if (context.conflictState.status === 'conflict') {
        logCanvasDiagnostic('warn', 'Canvas edit intent blocked by an external-change conflict.', {
          intentKind: intent.kind
        })
        return {
          status: 'blocked',
          message: 'Resolve the external-change conflict before editing again.'
        }
      }

      const compileResult = editService.compileTransaction(context.draftSource, context.document, intent)

      if (compileResult.isErr()) {
        logCanvasDiagnostic('error', 'Canvas edit service could not compile an intent.', {
          intentKind: intent.kind,
          message: compileResult.error.message
        })
        return {
          status: 'blocked',
          message: compileResult.error.message
        }
      }

      const resolveResult = transactionResolver.resolve(compileResult.value)

      if (resolveResult.isErr()) {
        logCanvasDiagnostic('error', 'Canvas transaction resolver rejected an edit transaction.', {
          intentKind: intent.kind,
          message: resolveResult.error.message
        })
        return {
          status: 'blocked',
          message: resolveResult.error.message
        }
      }

      const applyResult = await applyResolvedTransaction({
        documentRepository,
        record: context.document,
        resolved: resolveResult.value,
        source: context.draftSource
      })

      if ('error' in applyResult) {
        logCanvasDiagnostic(
          applyResult.error.kind === 'stale-anchor' ? 'warn' : 'error',
          'Canvas transaction apply failed.',
          {
            intentKind: intent.kind,
            message: applyResult.error.message,
            kind: applyResult.error.kind
          }
        )

        if (applyResult.error.kind === 'stale-anchor') {
          return {
            status: 'blocked',
            message: applyResult.error.message
          }
        }

        return {
          status: 'invalid',
          documentState: buildNextDocumentState(context.documentState, context.document, applyResult.source),
          message: applyResult.error.message
        }
      }

      const finalReadResult = await documentRepository.readSource({
        locator: context.document.locator,
        source: applyResult.source,
        isTemplate: context.document.isTemplate
      })

      if (!finalReadResult.ok) {
        logCanvasDiagnostic('error', 'Canvas edit produced source that failed repository reparsing.', {
          intentKind: intent.kind,
          locator: context.document.locator.kind === 'file'
            ? context.document.locator.path
            : context.document.locator.key,
          message: finalReadResult.error.message
        })
        return {
          status: 'invalid',
          documentState: buildNextDocumentState(context.documentState, context.document, applyResult.source),
          message: finalReadResult.error.message
        }
      }

      return {
        status: 'updated',
        record: finalReadResult.value,
        documentState: createCanvasDocumentState({
          record: finalReadResult.value,
          assetDirectoryHandle: context.documentState.assetDirectoryHandle,
          fileHandle: context.documentState.fileHandle,
          isPersisted: context.documentState.isPersisted,
          persistedSnapshotSource: context.documentState.persistedSnapshotSource,
          currentSource: applyResult.source
        })
      }
    }
  }
}

async function applyResolvedTransaction(input: {
  documentRepository: CanvasDocumentRepositoryGateway
  record: CanvasDocumentRecord
  resolved: ResolvedCanvasEditTransaction
  source: string
}): Promise<TransactionApplyFailure | TransactionApplySuccess> {
  let currentRecord = input.record
  let currentSource = input.source
  let dirty = false
  let recordFresh = true

  for (let phaseIndex = 0; phaseIndex < input.resolved.phases.length; phaseIndex += 1) {
    const phase = input.resolved.phases[phaseIndex]

    if (phase.requiresReparseBefore && !recordFresh) {
      const reparseResult = await reparseSource(input.documentRepository, currentRecord, currentSource, phaseIndex, 'before')

      if ('error' in reparseResult) {
        return reparseResult
      }

      currentRecord = reparseResult.record
      recordFresh = true
    }

    const phaseResult = applyPhase(currentSource, currentRecord, phase, phaseIndex)

    if ('error' in phaseResult) {
      return phaseResult
    }

    currentSource = phaseResult.source
    dirty = dirty || phaseResult.dirty
    recordFresh = false

    if (phase.requiresReparseAfter) {
      const reparseResult = await reparseSource(input.documentRepository, currentRecord, currentSource, phaseIndex, 'after')

      if ('error' in reparseResult) {
        return reparseResult
      }

      currentRecord = reparseResult.record
      recordFresh = true
    }
  }

  return {
    dirty,
    source: currentSource
  }
}

function applyPhase(
  source: string,
  record: CanvasDocumentRecord,
  phase: CanvasEditPhase,
  phaseIndex: number
): TransactionApplyFailure | TransactionApplySuccess {
  let currentSource = source
  let dirty = false

  for (const edit of phase.edits) {
    const rangeResult = resolveAnchorRange(record, currentSource, edit.anchor)

    if ('error' in rangeResult) {
      return {
        error: {
          kind: 'invalid-phase-output',
          message: `${rangeResult.error.message} (phase ${phaseIndex + 1}).`
        },
        source: currentSource
      }
    }

    const currentSlice = currentSource.slice(rangeResult.range.start.offset, rangeResult.range.end.offset)

    if (currentSlice !== edit.expectedSource) {
      return {
        error: {
          kind: 'stale-anchor',
          message: `Transaction anchor drift detected for ${describeAnchor(edit.anchor)} in phase ${phaseIndex + 1}.`
        },
        source: currentSource
      }
    }

    currentSource = applyEdit(currentSource, rangeResult.range, edit)
    dirty = dirty || currentSource !== source
  }

  return {
    dirty,
    source: currentSource
  }
}

async function reparseSource(
  documentRepository: CanvasDocumentRepositoryGateway,
  record: CanvasDocumentRecord,
  source: string,
  phaseIndex: number,
  boundary: 'after' | 'before'
): Promise<
  | { error: TransactionApplyError; source: string }
  | { record: CanvasDocumentRecord }
> {
  const result = await documentRepository.readSource({
    locator: record.locator,
    source,
    isTemplate: record.isTemplate
  })

  if (!result.ok) {
    return {
      error: {
        kind: 'reparse-failed',
        message: `Canvas repository could not reparse phase ${phaseIndex + 1} ${boundary} apply: ${result.error.message}`
      },
      source
    }
  }

  return {
    record: result.value
  }
}

function resolveAnchorRange(
  record: CanvasDocumentRecord,
  source: string,
  anchor: CanvasEditAnchor
): { range: CanvasSourceRange } | { error: { message: string } } {
  if (anchor.kind === 'document-end') {
    return {
      range: readDocumentEndRange(source)
    }
  }

  const object = findObject(record, anchor.objectKind, anchor.objectId)

  if (!object) {
    return {
      error: {
        message: `Transaction target "${anchor.objectKind}:${anchor.objectId}" no longer exists.`
      }
    }
  }

  if (anchor.kind === 'header-line') {
    return {
      range: object.sourceMap.headerLineRange
    }
  }

  if (anchor.kind === 'body') {
    return {
      range: object.sourceMap.bodyRange
    }
  }

  return {
    range: object.sourceMap.objectRange
  }
}

function findObject(
  record: CanvasDocumentRecord,
  objectKind: CanvasEditObjectKind,
  objectId: string
) {
  if (objectKind === 'group') {
    return record.ast.groups.find((group) => group.id === objectId)
  }

  if (objectKind === 'node') {
    return record.ast.nodes.find((node) => node.id === objectId)
  }

  return record.ast.edges.find((edge) => edge.id === objectId)
}

function applyEdit(source: string, range: CanvasSourceRange, edit: CanvasEditUnit) {
  if (edit.anchor.kind === 'document-end') {
    return insertObjectBlock(source, edit.replacement)
  }

  if (edit.anchor.kind === 'after-object') {
    return insertObjectBlock(source, edit.replacement, range.end.offset)
  }

  if (edit.anchor.kind === 'object' && edit.replacement.length === 0) {
    return removeObjectRange(source, range)
  }

  return replaceRange(source, range, edit.replacement)
}

function insertObjectBlock(source: string, block: string, anchorOffset?: number) {
  if (source.trim().length === 0) {
    return block
  }

  if (anchorOffset !== undefined) {
    const prefix = source.slice(0, anchorOffset).replace(/\n*$/g, '')
    const suffix = source.slice(anchorOffset).replace(/^\n*/g, '')
    return `${prefix}\n\n${block}${suffix.length > 0 ? `\n\n${suffix}` : ''}`
  }

  const trimmedSource = source.replace(/\n*$/g, '')
  return `${trimmedSource}\n\n${block}`
}

function removeObjectRange(source: string, range: CanvasSourceRange) {
  const expandedRange = expandRemovalRange(source, range)
  return (source.slice(0, expandedRange.start) + source.slice(expandedRange.end)).replace(/^\n+/, '')
}

function expandRemovalRange(source: string, range: CanvasSourceRange) {
  let start = range.start.offset
  let end = range.end.offset

  if (source[end] === '\n') {
    end += 1

    if (source[end] === '\n' && (start === 0 || source[start - 1] === '\n')) {
      end += 1
    }
  } else if (start > 0 && source[start - 1] === '\n') {
    start -= 1
  }

  return { end, start }
}

function replaceRange(source: string, range: CanvasSourceRange, replacement: string) {
  return `${source.slice(0, range.start.offset)}${replacement}${source.slice(range.end.offset)}`
}

function readDocumentEndRange(source: string): CanvasSourceRange {
  const line = source.length === 0 ? 1 : source.split('\n').length

  return {
    start: {
      line,
      offset: source.length
    },
    end: {
      line,
      offset: source.length
    }
  }
}

function describeAnchor(anchor: CanvasEditAnchor) {
  if (anchor.kind === 'document-end') {
    return anchor.kind
  }

  return `${anchor.objectKind}:${anchor.objectId}`
}

function buildNextDocumentState(
  documentState: CanvasDocumentState,
  record: CanvasDocumentRecord,
  currentSource: string
) {
  return createCanvasDocumentState({
    record,
    assetDirectoryHandle: documentState.assetDirectoryHandle,
    fileHandle: documentState.fileHandle,
    isPersisted: documentState.isPersisted,
    persistedSnapshotSource: documentState.persistedSnapshotSource,
    currentSource
  })
}
