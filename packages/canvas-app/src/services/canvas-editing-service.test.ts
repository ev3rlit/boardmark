import { describe, expect, it, vi } from 'vitest'
import { ok } from 'neverthrow'
import type { CanvasDocumentRecord, CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import { createCanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import { createCanvasEditingService } from '@canvas-app/services/canvas-editing-service'
import type { CanvasDocumentEditService } from '@canvas-app/services/edit-service'
import type { CanvasEditTransaction } from '@canvas-app/services/edit-transaction'

const source = `---
type: canvas
version: 2
---

::: group { id: ideation-group, z: 1 }
~~~yaml members
nodes:
  - welcome
~~~
:::

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, z: 2 }
Boardmark Viewer
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 }, z: 3 }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview, z: 4 }
main thread
:::`

describe('canvas editing service', () => {
  it('routes nudge, arrange, lock, and delete through compile resolve apply reparse', async () => {
    const repository = createRepository()
    const editingService = createCanvasEditingService({
      documentRepository: repository
    })

    let context = createContext(source)

    let outcome = await editingService.applyIntent(context, {
      kind: 'nudge-objects',
      nodeIds: ['welcome', 'overview'],
      dx: 10,
      dy: 0
    })
    expect(outcome.status).toBe('updated')
    context = updateContext(context, outcome)
    expect(context.draftSource).toContain('::: note { id: welcome, at: { x: 90, y: 72, w: 320, h: 220 }, z: 2 }')

    outcome = await editingService.applyIntent(context, {
      kind: 'arrange-objects',
      groupIds: ['ideation-group'],
      nodeIds: [],
      edgeIds: ['welcome-overview'],
      mode: 'bring-to-front'
    })
    expect(outcome.status).toBe('updated')
    context = updateContext(context, outcome)
    expect(context.draftSource).toContain('::: group { id: ideation-group, z: 5 }')
    expect(context.draftSource).toContain('::: edge { id: welcome-overview, from: welcome, to: overview, z: 6 }')

    outcome = await editingService.applyIntent(context, {
      kind: 'set-objects-locked',
      groupIds: ['ideation-group'],
      nodeIds: ['welcome'],
      edgeIds: ['welcome-overview'],
      locked: true
    })
    expect(outcome.status).toBe('updated')
    context = updateContext(context, outcome)
    expect(context.draftSource).toContain('locked: true')

    outcome = await editingService.applyIntent(context, {
      kind: 'delete-objects',
      groupIds: ['ideation-group'],
      nodeIds: [],
      edgeIds: []
    })
    expect(outcome.status).toBe('updated')

    if (outcome.status !== 'updated') {
      return
    }

    expect(outcome.record.ast.groups).toHaveLength(0)
    expect(outcome.record.ast.nodes.map((node) => node.id)).toEqual(['overview'])
    expect(outcome.record.ast.edges).toHaveLength(0)
  })

  it('reparses between phases when a line-changing edit is followed by a dependent phase', async () => {
    const repository = createRepository()
    const record = readRecord(source)
    const welcome = record.ast.nodes.find((node) => node.id === 'welcome')

    if (!welcome) {
      throw new Error('Missing welcome node.')
    }

    const editingService = createCanvasEditingService({
      documentRepository: repository,
      editService: createStubEditService({
        edits: [
          {
            anchor: {
              kind: 'body',
              objectId: 'welcome',
              objectKind: 'node'
            },
            expectedSource: 'Boardmark Viewer\n',
            lineDeltaBehavior: 'change',
            range: welcome.sourceMap.bodyRange,
            replacement: 'Alpha\nBeta\nGamma\n',
            structuralImpact: 'none'
          },
          {
            anchor: {
              kind: 'header-line',
              objectId: 'welcome',
              objectKind: 'node'
            },
            expectedSource: source.slice(
              welcome.sourceMap.headerLineRange.start.offset,
              welcome.sourceMap.headerLineRange.end.offset
            ),
            lineDeltaBehavior: 'preserve',
            range: welcome.sourceMap.headerLineRange,
            replacement: '::: note { id: welcome, at: { x: 160, y: 72, w: 320, h: 220 }, z: 2 }',
            structuralImpact: 'none'
          }
        ],
        intentKind: 'replace-object-body',
        label: 'Edit object'
      })
    })

    const outcome = await editingService.applyIntent(createContext(source), {
      kind: 'replace-object-body',
      objectId: 'welcome',
      markdown: 'ignored by stub'
    })

    expect(outcome.status).toBe('updated')
    expect(repository.readSource).toHaveBeenCalledTimes(2)

    if (outcome.status !== 'updated') {
      return
    }

    expect(outcome.record.source).toContain('Alpha\nBeta\nGamma\n:::')
    expect(outcome.record.source).toContain('x: 160')
  })

  it('blocks stale-anchor transactions before partial source is committed', async () => {
    const repository = createRepository()
    const record = readRecord(source)
    const welcome = record.ast.nodes.find((node) => node.id === 'welcome')

    if (!welcome) {
      throw new Error('Missing welcome node.')
    }

    const editingService = createCanvasEditingService({
      documentRepository: repository,
      editService: createStubEditService({
        edits: [
          {
            anchor: {
              kind: 'header-line',
              objectId: 'welcome',
              objectKind: 'node'
            },
            expectedSource: 'not-the-current-header',
            lineDeltaBehavior: 'preserve',
            range: welcome.sourceMap.headerLineRange,
            replacement: '::: note { id: welcome, at: { x: 100, y: 72, w: 320, h: 220 }, z: 2 }',
            structuralImpact: 'none'
          }
        ],
        intentKind: 'move-node',
        label: 'Move node'
      })
    })

    const outcome = await editingService.applyIntent(createContext(source), {
      kind: 'move-node',
      nodeId: 'welcome',
      x: 100,
      y: 72
    })

    expect(outcome).toEqual({
      status: 'blocked',
      message: 'Transaction anchor drift detected for node:welcome in phase 1.'
    })
    expect(repository.readSource).not.toHaveBeenCalled()
  })

  it('returns invalid when repository reparsing fails after apply', async () => {
    const repository = createRepository({ failOnSource: 'BROKEN-PAYLOAD' })
    const editingService = createCanvasEditingService({
      documentRepository: repository
    })

    const outcome = await editingService.applyIntent(createContext(source), {
      kind: 'replace-object-body',
      objectId: 'welcome',
      markdown: 'BROKEN-PAYLOAD'
    })

    expect(outcome.status).toBe('invalid')

    if (outcome.status !== 'invalid') {
      return
    }

    expect(outcome.documentState.currentSource).toContain('BROKEN-PAYLOAD')
  })
})

function createContext(inputSource: string) {
  const record = readRecord(inputSource)
  const documentState = createCanvasDocumentState({
    record,
    assetDirectoryHandle: null,
    fileHandle: null,
    isPersisted: false,
    persistedSnapshotSource: null,
    currentSource: inputSource
  })

  return {
    conflictState: { status: 'idle' } as const,
    document: record,
    documentState,
    draftSource: inputSource,
    invalidState: { status: 'valid' } as const
  }
}

function updateContext(
  context: ReturnType<typeof createContext>,
  outcome: Awaited<ReturnType<ReturnType<typeof createCanvasEditingService>['applyIntent']>>
) {
  if (outcome.status !== 'updated') {
    throw new Error('Expected updated outcome.')
  }

  return {
    ...context,
    document: outcome.record,
    documentState: outcome.documentState,
    draftSource: outcome.documentState.currentSource
  }
}

function createStubEditService(transaction: CanvasEditTransaction): CanvasDocumentEditService {
  return {
    compileTransaction() {
      return ok(transaction)
    }
  }
}

function createRepository(options?: { failOnSource?: string }): CanvasDocumentRepositoryGateway & {
  readSource: ReturnType<typeof vi.fn>
} {
  const repository = createCanvasMarkdownDocumentRepository()

  return {
    read: vi.fn(async () => {
      throw new Error('read was not expected in this test')
    }),
    readSource: vi.fn(async ({ locator, source, isTemplate }) => {
      if (options?.failOnSource && source.includes(options.failOnSource)) {
        return {
          ok: false as const,
          error: {
            kind: 'parse-failed' as const,
            message: 'Canvas repository could not parse "broken.canvas.md": invalid geometry'
          }
        }
      }

      const result = repository.readSource({
        locator,
        source,
        isTemplate
      })

      if (result.isErr()) {
        return {
          ok: false as const,
          error: result.error
        }
      }

      return {
        ok: true as const,
        value: result.value
      }
    }),
    save: vi.fn(async () => {
      throw new Error('save was not expected in this test')
    })
  }
}

function readRecord(inputSource: string): CanvasDocumentRecord {
  const repository = createCanvasMarkdownDocumentRepository()
  const result = repository.readSource({
    locator: {
      kind: 'memory',
      key: 'editing-test',
      name: 'editing.canvas.md'
    },
    source: inputSource,
    isTemplate: false
  })

  if (result.isErr()) {
    throw new Error(result.error.message)
  }

  return result.value
}
