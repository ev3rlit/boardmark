import type { CanvasSourceRange } from '@boardmark/canvas-domain'
import type { CanvasDocumentEditIntent } from '@canvas-app/services/edit-intents'

export type CanvasEditObjectKind = 'edge' | 'group' | 'node'

export type CanvasEditLineDeltaBehavior = 'change' | 'preserve'

export type CanvasEditStructuralImpact = 'none' | 'structure'

export type CanvasEditAnchor =
  | {
      kind: 'after-object'
      objectId: string
      objectKind: CanvasEditObjectKind
    }
  | {
      kind: 'body'
      objectId: string
      objectKind: Extract<CanvasEditObjectKind, 'edge' | 'group' | 'node'>
    }
  | { kind: 'document-end' }
  | {
      kind: 'header-line'
      objectId: string
      objectKind: CanvasEditObjectKind
    }
  | {
      kind: 'object'
      objectId: string
      objectKind: CanvasEditObjectKind
    }

export type CanvasEditUnit = {
  anchor: CanvasEditAnchor
  expectedSource: string
  lineDeltaBehavior: CanvasEditLineDeltaBehavior
  range: CanvasSourceRange
  replacement: string
  structuralImpact: CanvasEditStructuralImpact
}

export type CanvasEditTransaction = {
  edits: CanvasEditUnit[]
  intentKind: CanvasDocumentEditIntent['kind']
  label: string
}

export type CanvasEditPhase = {
  edits: CanvasEditUnit[]
  requiresReparseAfter: boolean
  requiresReparseBefore: boolean
}

export type ResolvedCanvasEditTransaction = {
  phases: CanvasEditPhase[]
  transaction: CanvasEditTransaction
}

export type TransactionResolveError = {
  kind: 'invalid-phase' | 'overlap'
  message: string
}

export type TransactionApplyError = {
  kind: 'invalid-phase-output' | 'reparse-failed' | 'stale-anchor'
  message: string
}

export type TransactionResolver = {
  resolve: (
    transaction: CanvasEditTransaction
  ) => import('neverthrow').Result<ResolvedCanvasEditTransaction, TransactionResolveError>
}
