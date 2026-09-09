import type { CanvasSourceRange } from '@boardmark/canvas-domain'
import type { CanvasDocumentRecord, CanvasDocumentRepository } from '@boardmark/canvas-repository'
import type { CanvasEditAnchor, CanvasEditObjectKind, CanvasEditPhase, CanvasEditUnit, ResolvedCanvasEditTransaction, TransactionApplyError } from './edit-transaction'
type TransactionApplyFailure = { error: TransactionApplyError; source: string }
type TransactionApplySuccess = { dirty: boolean; source: string }
export function applyResolvedTransaction(input: {
  documentRepository: CanvasDocumentRepository
  record: CanvasDocumentRecord
  resolved: ResolvedCanvasEditTransaction
  source: string
}): TransactionApplyFailure | TransactionApplySuccess {
  let currentRecord = input.record
  let currentSource = input.source
  let dirty = false
  let recordFresh = true

  for (let phaseIndex = 0; phaseIndex < input.resolved.phases.length; phaseIndex += 1) {
    const phase = input.resolved.phases[phaseIndex]

    if (phase.requiresReparseBefore && !recordFresh) {
      const reparseResult = reparseSource(input.documentRepository, currentRecord, currentSource, phaseIndex, 'before')

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
      const reparseResult = reparseSource(input.documentRepository, currentRecord, currentSource, phaseIndex, 'after')

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

function reparseSource(
  documentRepository: CanvasDocumentRepository,
  record: CanvasDocumentRecord,
  source: string,
  phaseIndex: number,
  boundary: 'after' | 'before'
):
  | { error: TransactionApplyError; source: string }
  | { record: CanvasDocumentRecord }
 {
  const result = documentRepository.readSource({
    locator: record.locator,
    source,
    isTemplate: record.isTemplate
  })

  if (result.isErr()) {
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
