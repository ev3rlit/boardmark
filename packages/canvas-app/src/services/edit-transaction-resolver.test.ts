import { describe, expect, it } from 'vitest'
import { createCanvasEditTransactionResolver } from '@canvas-app/services/edit-transaction-resolver'
import type { CanvasEditTransaction, CanvasEditUnit } from '@canvas-app/services/edit-transaction'

describe('canvas edit transaction resolver', () => {
  it('sorts non-overlapping edits by descending source offset inside a phase', () => {
    const resolver = createCanvasEditTransactionResolver()
    const result = resolver.resolve({
      edits: [
        createEdit({
          objectId: 'welcome',
          objectKind: 'node',
          start: 10,
          end: 20
        }),
        createEdit({
          objectId: 'overview',
          objectKind: 'node',
          start: 40,
          end: 50
        })
      ],
      intentKind: 'nudge-objects',
      label: 'Move node'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.phases).toHaveLength(1)
    expect(result.value.phases[0]?.edits.map((edit) => edit.anchor.kind === 'document-end' ? 'document-end' : edit.anchor.objectId)).toEqual([
      'overview',
      'welcome'
    ])
    expect(result.value.phases[0]?.requiresReparseAfter).toBe(false)
  })

  it('rejects overlapping edits in the same phase', () => {
    const resolver = createCanvasEditTransactionResolver()
    const result = resolver.resolve({
      edits: [
        createEdit({
          objectId: 'welcome',
          objectKind: 'node',
          start: 10,
          end: 30
        }),
        createEdit({
          objectId: 'overview',
          objectKind: 'node',
          start: 20,
          end: 40
        })
      ],
      intentKind: 'nudge-objects',
      label: 'Move node'
    })

    expect(result.isErr()).toBe(true)

    if (result.isOk()) {
      return
    }

    expect(result.error.kind).toBe('overlap')
  })

  it('marks line-changing edits as reparse barriers', () => {
    const resolver = createCanvasEditTransactionResolver()
    const result = resolver.resolve({
      edits: [
        createEdit({
          kind: 'body',
          lineDeltaBehavior: 'change',
          objectId: 'welcome',
          objectKind: 'node',
          start: 10,
          end: 20
        })
      ],
      intentKind: 'replace-object-body',
      label: 'Edit object'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.phases).toEqual([
      expect.objectContaining({
        requiresReparseAfter: true,
        requiresReparseBefore: false
      })
    ])
  })

  it('forces a fresh phase after structural edits', () => {
    const resolver = createCanvasEditTransactionResolver()
    const result = resolver.resolve({
      edits: [
        createEdit({
          kind: 'object',
          lineDeltaBehavior: 'change',
          objectId: 'welcome',
          objectKind: 'node',
          start: 10,
          end: 20,
          replacement: '',
          structuralImpact: 'structure'
        }),
        createEdit({
          objectId: 'overview',
          objectKind: 'node',
          start: 30,
          end: 40
        })
      ],
      intentKind: 'delete-objects',
      label: 'Delete selection'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.phases).toHaveLength(2)
    expect(result.value.phases[0]).toEqual(
      expect.objectContaining({
        requiresReparseAfter: true,
        requiresReparseBefore: false
      })
    )
    expect(result.value.phases[1]).toEqual(
      expect.objectContaining({
        requiresReparseAfter: false,
        requiresReparseBefore: true
      })
    )
  })
})

function createEdit(input: {
  end: number
  kind?: 'body' | 'header-line' | 'object'
  lineDeltaBehavior?: 'change' | 'preserve'
  objectId: string
  objectKind: 'edge' | 'group' | 'node'
  replacement?: string
  start: number
  structuralImpact?: 'none' | 'structure'
}): CanvasEditUnit {
  return {
    anchor: {
      kind: input.kind ?? 'header-line',
      objectId: input.objectId,
      objectKind: input.objectKind
    },
    expectedSource: 'old',
    lineDeltaBehavior: input.lineDeltaBehavior ?? 'preserve',
    range: {
      start: {
        line: 1,
        offset: input.start
      },
      end: {
        line: 1,
        offset: input.end
      }
    },
    replacement: input.replacement ?? 'new',
    structuralImpact: input.structuralImpact ?? 'none'
  }
}
