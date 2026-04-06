import { err, ok, type Result } from 'neverthrow'
import type {
  CanvasEditPhase,
  CanvasEditTransaction,
  CanvasEditUnit,
  ResolvedCanvasEditTransaction,
  TransactionResolveError,
  TransactionResolver
} from '@canvas-app/services/edit-transaction'

export function createCanvasEditTransactionResolver(): TransactionResolver {
  return {
    resolve(transaction) {
      return resolveTransaction(transaction)
    }
  }
}

export type CanvasEditTransactionResolver = ReturnType<typeof createCanvasEditTransactionResolver>
export type { TransactionResolver }

function resolveTransaction(
  transaction: CanvasEditTransaction
): Result<ResolvedCanvasEditTransaction, TransactionResolveError> {
  const phases: CanvasEditPhase[] = []
  let currentSafeEdits: CanvasEditUnit[] = []
  let currentStructuralEdits: CanvasEditUnit[] = []
  let previousPhaseRequiresReparse = false

  const pushPhase = (edits: CanvasEditUnit[], requiresReparseAfter: boolean) => {
    if (edits.length === 0) {
      return
    }

    const sortedEdits = [...edits].sort((left, right) => right.range.start.offset - left.range.start.offset)
    const overlapResult = validatePhase(sortedEdits)

    if (overlapResult.isErr()) {
      return overlapResult
    }

    phases.push({
      edits: sortedEdits,
      requiresReparseAfter,
      requiresReparseBefore: previousPhaseRequiresReparse
    })
    previousPhaseRequiresReparse = requiresReparseAfter
    return ok(undefined)
  }

  for (const edit of transaction.edits) {
    if (isStructuralEdit(edit)) {
      if (currentSafeEdits.length > 0) {
        const phaseResult = pushPhase(currentSafeEdits, false)

        if (phaseResult?.isErr()) {
          return err(phaseResult.error)
        }

        currentSafeEdits = []
      }

      currentStructuralEdits.push(edit)
      continue
    }

    if (currentStructuralEdits.length > 0) {
      const phaseResult = pushPhase(currentStructuralEdits, true)

      if (phaseResult?.isErr()) {
        return err(phaseResult.error)
      }

      currentStructuralEdits = []
    }

    if (isLineChangingEdit(edit)) {
      if (currentSafeEdits.length > 0) {
        const safePhaseResult = pushPhase(currentSafeEdits, false)

        if (safePhaseResult?.isErr()) {
          return err(safePhaseResult.error)
        }

        currentSafeEdits = []
      }

      const phaseResult = pushPhase([edit], true)

      if (phaseResult?.isErr()) {
        return err(phaseResult.error)
      }

      continue
    }

    currentSafeEdits.push(edit)
  }

  if (currentStructuralEdits.length > 0) {
    const phaseResult = pushPhase(currentStructuralEdits, true)

    if (phaseResult?.isErr()) {
      return err(phaseResult.error)
    }
  }

  if (currentSafeEdits.length > 0) {
    const phaseResult = pushPhase(currentSafeEdits, false)

    if (phaseResult?.isErr()) {
      return err(phaseResult.error)
    }
  }

  return ok({
    phases,
    transaction
  })
}

function validatePhase(edits: CanvasEditUnit[]): Result<void, TransactionResolveError> {
  for (const edit of edits) {
    if (edit.range.start.offset > edit.range.end.offset) {
      return err({
        kind: 'invalid-phase',
        message: `Transaction phase contains an invalid range for ${describeEdit(edit)}.`
      })
    }
  }

  for (let index = 0; index < edits.length - 1; index += 1) {
    const current = edits[index]
    const next = edits[index + 1]

    if (rangesOverlap(current.range.start.offset, current.range.end.offset, next.range.start.offset, next.range.end.offset)) {
      return err({
        kind: 'overlap',
        message: `Transaction phase contains overlapping edits for ${describeEdit(current)} and ${describeEdit(next)}.`
      })
    }
  }

  return ok(undefined)
}

function describeEdit(edit: CanvasEditUnit) {
  if (edit.anchor.kind === 'document-end') {
    return 'document-end'
  }

  return `${edit.anchor.objectKind}:${edit.anchor.objectId}`
}

function isLineChangingEdit(edit: CanvasEditUnit) {
  return edit.lineDeltaBehavior !== 'preserve'
}

function isStructuralEdit(edit: CanvasEditUnit) {
  return edit.structuralImpact !== 'none'
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
) {
  return leftStart < rightEnd && rightStart < leftEnd
}
